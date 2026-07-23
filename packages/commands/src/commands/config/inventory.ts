// Read-only discovery of locally installed AI tooling, surfaced by `config ui`:
// - Agent skills installed under ~/.agents/skills (via `npx skills add`).
// - MCP servers declared in each coding agent's local config file.
// - Coding agent frameworks and whether the bailian-cli provider is wired in.
//
// Everything here only reads the filesystem; nothing is written. Missing files,
// unreadable dirs and malformed configs degrade to empty results rather than
// throwing, so a broken third-party config never takes down the UI.
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { inflateRawSync } from "node:zlib";
import yaml from "yaml";
import { parse as parseToml } from "smol-toml";

/**
 * Where an item comes from. Everything discovered on disk today is `local`;
 * `remote` is reserved for entries later loaded from an online URL.
 */
export type ItemOrigin = "local" | "remote";

/** A skill discovered in one or more agent skill directories. */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version?: string;
  fileCount: number;
  path: string;
  /** Agent modules this skill is installed in (e.g. global, claude-code, qwen-code). */
  sources: string[];
  /** local (on disk) or remote (loaded from a URL). */
  origin: ItemOrigin;
}

/** One MCP server entry pulled from an agent's local config. */
export interface McpServerInfo {
  name: string;
  source: string;
  transport: "stdio" | "http" | "sse" | "unknown";
  detail: string;
  scope: string;
  /** local (on disk) or remote (loaded from a URL). */
  origin: ItemOrigin;
  /** Raw config entry for this server, with secret-looking values masked. */
  config?: Record<string, unknown>;
  /** Whether this entry lives in a JSON config we can edit/write back here. */
  editable: boolean;
}

/** A coding agent framework and its local configuration state. */
export interface AgentInfo {
  id: string;
  label: string;
  installed: boolean;
  configured: boolean;
  model?: string;
  paths: string[];
  origin: ItemOrigin;
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

function readJsonSafe(path: string): Record<string, unknown> | undefined {
  const text = readText(path);
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// ---- Skills ----

/** Extract the leading `--- ... ---` YAML frontmatter block from a SKILL.md. */
function parseFrontmatter(md: string): Record<string, unknown> {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(md);
  if (!match) return {};
  try {
    return asRecord(yaml.parse(match[1])) ?? {};
  } catch {
    return {};
  }
}

function countFiles(dir: string, budget = 500): number {
  let total = 0;
  const walk = (current: string): void => {
    if (total >= budget) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (total >= budget) return;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += 1;
    }
  };
  walk(dir);
  return total;
}

/**
 * Skill directories to scan, keyed by the module that owns them. `npx skills
 * add --all` fans skills out into each installed agent, so the same skill can
 * live in several of these roots at once.
 */
function skillRoots(home: string): Array<{ source: string; dir: string }> {
  return [
    { source: "global", dir: join(home, ".agents", "skills") },
    { source: "claude-code", dir: join(home, ".claude", "skills") },
    { source: "cursor", dir: join(home, ".cursor", "skills") },
    { source: "qwen-code", dir: join(home, ".qwen", "skills") },
    { source: "codex", dir: join(home, ".codex", "skills") },
    { source: "opencode", dir: join(home, ".config", "opencode", "skills") },
    { source: "openclaw", dir: join(home, ".openclaw", "skills") },
    { source: "openclaw", dir: join(home, ".openclaw", "workspace", "skills") },
    { source: "hermes", dir: join(home, ".hermes", "skills") },
    { source: "gemini", dir: join(home, ".gemini", "skills") },
    { source: "antigravity", dir: join(home, ".gemini", "antigravity", "skills") },
    { source: "windsurf", dir: join(home, ".windsurf", "skills") },
    { source: "windsurf", dir: join(home, ".codeium", "windsurf", "skills") },
    { source: "qoderwork", dir: join(home, ".qoderwork", "skills") },
    { source: "workbuddy", dir: join(home, ".workbuddy", "skills") },
  ];
}

/**
 * List skills installed across every known agent skill directory, aggregated
 * by skill id. Each skill records the modules (`sources`) it is installed in;
 * metadata is taken from the first module found (roots are ordered global-first).
 */
export function listSkills(home: string = homedir()): SkillInfo[] {
  const byId = new Map<string, SkillInfo>();

  for (const { source, dir: root } of skillRoots(home)) {
    let entries: Dirent[];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      // Accept real dirs and symlinks: `skills add` fans skills into each agent
      // as symlinks back to ~/.agents/skills, and isDirectory() is false for those.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const dir = join(root, entry.name);
      const skillMd = join(dir, "SKILL.md");
      if (!existsSync(skillMd)) continue;

      const existing = byId.get(entry.name);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
        continue;
      }

      const fm = parseFrontmatter(readText(skillMd) ?? "");
      const meta = asRecord(fm.metadata);
      const description = typeof fm.description === "string" ? fm.description.trim() : "";
      const version =
        meta && typeof meta.version === "string"
          ? meta.version
          : typeof fm.version === "string"
            ? fm.version
            : undefined;

      byId.set(entry.name, {
        id: entry.name,
        name: typeof fm.name === "string" && fm.name ? fm.name : entry.name,
        description,
        version,
        fileCount: countFiles(dir),
        path: dir,
        sources: [source],
        origin: "local",
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A skill plus the raw text of its SKILL.md, for the detail drawer. */
export interface SkillDetail extends SkillInfo {
  content: string;
}

/**
 * Return full detail for one discovered skill (by id), including the raw
 * SKILL.md content. The id must match a skill found by `listSkills`, so the
 * read is confined to a known skill directory. Returns null when not found.
 */
export function getSkillDetail(id: string, home: string = homedir()): SkillDetail | null {
  const skill = listSkills(home).find((s) => s.id === id);
  if (!skill) return null;
  const content = readText(join(skill.path, "SKILL.md")) ?? "";
  return { ...skill, content };
}

// ---- Skill install (upload a .zip and unpack it into a skill root) ----

/** Allow-listed skill install targets: source id -> label + path segments. */
const SKILL_INSTALL_TARGETS: Array<{ source: string; label: string; sub: string[] }> = [
  { source: "global", label: "All agents (~/.agents/skills)", sub: [".agents", "skills"] },
  { source: "claude-code", label: "Claude Code", sub: [".claude", "skills"] },
  { source: "qwen-code", label: "Qwen Code", sub: [".qwen", "skills"] },
  { source: "codex", label: "Codex", sub: [".codex", "skills"] },
  { source: "opencode", label: "OpenCode", sub: [".config", "opencode", "skills"] },
  { source: "openclaw", label: "OpenClaw", sub: [".openclaw", "skills"] },
  { source: "qoderwork", label: "QoderWork", sub: [".qoderwork", "skills"] },
  { source: "windsurf", label: "Windsurf", sub: [".codeium", "windsurf", "skills"] },
  { source: "gemini", label: "Gemini", sub: [".gemini", "skills"] },
];

/** The list of install targets exposed to the UI (source + human label). */
export function skillInstallTargets(): Array<{ source: string; label: string }> {
  return SKILL_INSTALL_TARGETS.map((t) => ({ source: t.source, label: t.label }));
}

function skillInstallRoot(source: string, home: string): string | null {
  const t = SKILL_INSTALL_TARGETS.find((x) => x.source === source);
  return t ? join(home, ...t.sub) : null;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Minimal ZIP reader (no external deps). Walks the central directory for
 * correct sizes/offsets, then inflates each entry (stored or deflate). Zip64
 * and encryption are unsupported and will throw. Sufficient for skill packages.
 */
function parseZip(buf: Buffer): ZipEntry[] {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  const minStart = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .zip archive.");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let e = 0; e < count; e++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error("Unsupported compression in archive (entry: " + name + ").");
    entries.push({ name, data });
  }
  return entries;
}

/**
 * Install a skill from an uploaded .zip into the chosen agent's skills root.
 * The archive must contain a SKILL.md at its root or inside one top-level
 * folder. Entry paths are sanitized (no absolute paths, no `..`) and every
 * write is confined to the target skill directory (zip-slip safe).
 */
export function installSkillZip(
  source: string,
  zip: Buffer,
  nameHint: string,
  home: string = homedir(),
): { installed: string; files: number; dir: string } {
  const root = skillInstallRoot(source, home);
  if (!root) throw new Error("Unknown skill install target.");

  const norm = parseZip(zip)
    .map((e) => ({
      name: e.name.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, ""),
      data: e.data,
    }))
    .filter((e) => e.name && !e.name.endsWith("/") && !e.name.split("/").includes(".."));
  if (!norm.length) throw new Error("The archive contains no usable files.");

  const skillMd = norm.find((e) => e.name === "SKILL.md" || e.name.endsWith("/SKILL.md"));
  if (!skillMd) throw new Error("No SKILL.md found in the archive (root or a top-level folder).");

  const slash = skillMd.name.lastIndexOf("/");
  let skillName: string;
  let prefix: string;
  if (slash < 0) {
    skillName = (nameHint || "").trim();
    if (!skillName)
      throw new Error("SKILL.md is at the archive root \u2014 please provide a skill name.");
    prefix = "";
  } else {
    prefix = skillMd.name.slice(0, slash + 1);
    skillName = (nameHint || "").trim() || prefix.split("/")[0];
  }
  if (!/^[A-Za-z0-9._-]+$/.test(skillName)) throw new Error("Invalid skill name: " + skillName);

  const targetDir = join(root, skillName);
  const base = resolve(targetDir);
  let files = 0;
  for (const e of norm) {
    let rel = e.name;
    if (prefix) {
      if (!e.name.startsWith(prefix)) continue;
      rel = e.name.slice(prefix.length);
    }
    if (!rel) continue;
    const abs = resolve(join(targetDir, rel));
    if (abs !== base && !abs.startsWith(base + sep)) continue; // zip-slip guard
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, e.data);
    files++;
  }
  if (files === 0) throw new Error("Nothing was extracted from the archive.");
  return { installed: skillName, files, dir: targetDir };
}

// ---- MCP servers ----

function transportOf(entry: Record<string, unknown>): {
  transport: McpServerInfo["transport"];
  detail: string;
} {
  if (typeof entry.command === "string") {
    const args = Array.isArray(entry.args) ? entry.args.join(" ") : "";
    return { transport: "stdio", detail: `${entry.command} ${args}`.trim() };
  }
  const url = typeof entry.url === "string" ? entry.url : undefined;
  if (url) {
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
    return { transport: type === "sse" ? "sse" : "http", detail: url };
  }
  return { transport: "unknown", detail: "" };
}

function collectMcpMap(
  raw: unknown,
  source: string,
  scope: string,
  out: McpServerInfo[],
  editable: boolean,
): void {
  const map = asRecord(raw);
  if (!map) return;
  for (const [name, value] of Object.entries(map)) {
    const entry = asRecord(value) ?? {};
    const { transport, detail } = transportOf(entry);
    out.push({
      name,
      source,
      transport,
      detail,
      scope,
      origin: "local",
      config: maskConfigSecrets(entry) as Record<string, unknown>,
      editable,
    });
  }
}

/** Discover MCP servers declared across local agent config files. */
export function listMcpServers(home: string = homedir()): McpServerInfo[] {
  const out: McpServerInfo[] = [];

  // Claude Code: global mcpServers + per-project mcpServers in ~/.claude.json.
  const claude = readJsonSafe(join(home, ".claude.json"));
  if (claude) {
    collectMcpMap(claude.mcpServers, "claude-code", "global", out, true);
    const projects = asRecord(claude.projects);
    if (projects) {
      for (const [projectPath, projectValue] of Object.entries(projects)) {
        const project = asRecord(projectValue);
        if (project?.mcpServers)
          collectMcpMap(project.mcpServers, "claude-code", projectPath, out, true);
      }
    }
  }

  // Qwen Code.
  const qwen = readJsonSafe(join(home, ".qwen", "settings.json"));
  if (qwen) collectMcpMap(qwen.mcpServers, "qwen-code", "global", out, true);

  // OpenCode uses `mcp` rather than `mcpServers`.
  const opencode = readJsonSafe(join(home, ".config", "opencode", "opencode.json"));
  if (opencode) collectMcpMap(opencode.mcp, "opencode", "global", out, true);

  // Cursor, Windsurf, Gemini, QoderWork, OpenClaw, Claude Desktop: all JSON with
  // a top-level `mcpServers` map (Claude/Cursor convention).
  const cursor = readJsonSafe(join(home, ".cursor", "mcp.json"));
  if (cursor) collectMcpMap(cursor.mcpServers, "cursor", "global", out, true);

  const windsurf = readJsonSafe(join(home, ".codeium", "windsurf", "mcp_config.json"));
  if (windsurf) collectMcpMap(windsurf.mcpServers, "windsurf", "global", out, true);

  const gemini = readJsonSafe(join(home, ".gemini", "settings.json"));
  if (gemini) collectMcpMap(gemini.mcpServers, "gemini", "global", out, true);

  const qoder = readJsonSafe(join(home, ".qoderwork", "mcp.json"));
  if (qoder) collectMcpMap(qoder.mcpServers, "qoderwork", "global", out, true);

  const openclaw = readJsonSafe(join(home, ".openclaw", "openclaw.json"));
  if (openclaw) collectMcpMap(openclaw.mcpServers, "openclaw", "global", out, true);

  const claudeDesktop = readJsonSafe(claudeDesktopConfigPath(home));
  if (claudeDesktop) collectMcpMap(claudeDesktop.mcpServers, "claude-desktop", "global", out, true);

  // Codex declares servers as [mcp_servers.<name>] TOML tables.
  const codexToml = readText(join(home, ".codex", "config.toml"));
  if (codexToml) {
    try {
      const parsed = parseToml(codexToml) as Record<string, unknown>;
      collectMcpMap(parsed.mcp_servers, "codex", "global", out, false);
    } catch {
      /* ignore malformed toml */
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

// ---- MCP write-back (edit / add / delete) ----

const MCP_MASK_CHAR = "\u2022";

/** Platform-specific Claude Desktop config path. */
function claudeDesktopConfigPath(home: string): string {
  if (process.platform === "darwin")
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (process.platform === "win32")
    return join(
      process.env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

interface McpWriteTarget {
  file: string;
  mapKey: string;
  /** Claude stores project-scoped servers under projects[scope][mapKey]. */
  projectScoped: boolean;
}

/**
 * Map a (source, scope) pair to the JSON config file and map key to edit. Only
 * JSON-backed sources are writable; Codex (TOML) and unknown sources return
 * null so the UI keeps them read-only.
 */
function mcpWriteTarget(source: string, scope: string, home: string): McpWriteTarget | null {
  if (source === "claude-code")
    return {
      file: join(home, ".claude.json"),
      mapKey: "mcpServers",
      projectScoped: scope !== "global",
    };
  if (source === "qwen-code")
    return {
      file: join(home, ".qwen", "settings.json"),
      mapKey: "mcpServers",
      projectScoped: false,
    };
  if (source === "opencode")
    return {
      file: join(home, ".config", "opencode", "opencode.json"),
      mapKey: "mcp",
      projectScoped: false,
    };
  if (source === "cursor")
    return { file: join(home, ".cursor", "mcp.json"), mapKey: "mcpServers", projectScoped: false };
  if (source === "windsurf")
    return {
      file: join(home, ".codeium", "windsurf", "mcp_config.json"),
      mapKey: "mcpServers",
      projectScoped: false,
    };
  if (source === "gemini")
    return {
      file: join(home, ".gemini", "settings.json"),
      mapKey: "mcpServers",
      projectScoped: false,
    };
  if (source === "qoderwork")
    return {
      file: join(home, ".qoderwork", "mcp.json"),
      mapKey: "mcpServers",
      projectScoped: false,
    };
  if (source === "openclaw")
    return {
      file: join(home, ".openclaw", "openclaw.json"),
      mapKey: "mcpServers",
      projectScoped: false,
    };
  if (source === "claude-desktop")
    return { file: claudeDesktopConfigPath(home), mapKey: "mcpServers", projectScoped: false };
  return null;
}

/**
 * Merge a submitted config with the stored one: any string still carrying the
 * mask char is treated as unchanged and restored from `stored`. Throws if a
 * masked value has no stored counterpart, so bullet placeholders are never
 * persisted as a real secret.
 */
function unmaskMcpConfig(submitted: unknown, stored: unknown): unknown {
  if (typeof submitted === "string") {
    if (submitted.includes(MCP_MASK_CHAR)) {
      if (typeof stored === "string") return stored;
      throw new Error(
        "Replace masked values (\u2022\u2022\u2022) with the real value before saving.",
      );
    }
    return submitted;
  }
  if (Array.isArray(submitted)) {
    const arr = Array.isArray(stored) ? stored : [];
    return submitted.map((v, i) => unmaskMcpConfig(v, arr[i]));
  }
  const rec = asRecord(submitted);
  if (rec) {
    const storedRec = asRecord(stored) ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = unmaskMcpConfig(v, storedRec[k]);
    return out;
  }
  return submitted;
}

/** Create or update one MCP server entry, writing back to its source file. */
export function writeMcpServer(
  source: string,
  scope: string,
  name: string,
  config: unknown,
  home: string = homedir(),
): void {
  const target = mcpWriteTarget(source, scope, home);
  if (!target) throw new Error("This MCP source is read-only and cannot be edited here.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Server name is required.");
  const cfg = asRecord(config);
  if (!cfg) throw new Error("Config must be a JSON object.");

  const root = readJsonSafe(target.file) ?? {};
  let container: Record<string, unknown> = root;
  if (target.projectScoped) {
    const projects = asRecord(root.projects) ?? {};
    root.projects = projects;
    const proj = asRecord(projects[scope]) ?? {};
    projects[scope] = proj;
    container = proj;
  }
  const map = asRecord(container[target.mapKey]) ?? {};
  container[target.mapKey] = map;

  map[trimmed] = unmaskMcpConfig(cfg, asRecord(map[trimmed]));

  mkdirSync(dirname(target.file), { recursive: true });
  writeFileSync(target.file, JSON.stringify(root, null, 2) + "\n", "utf-8");
}

/** Remove one MCP server entry from its source file. */
export function deleteMcpServer(
  source: string,
  scope: string,
  name: string,
  home: string = homedir(),
): void {
  const target = mcpWriteTarget(source, scope, home);
  if (!target) throw new Error("This MCP source is read-only and cannot be edited here.");
  const root = readJsonSafe(target.file);
  if (!root) throw new Error("Config file not found.");
  let container: Record<string, unknown> | undefined = root;
  if (target.projectScoped) {
    const projects = asRecord(root.projects);
    container = projects ? asRecord(projects[scope]) : undefined;
  }
  const map = container ? asRecord(container[target.mapKey]) : undefined;
  if (!map || !(name in map)) throw new Error("Server not found: " + name);
  delete map[name];
  // Don't leave an empty map behind if this was the last server.
  if (container && Object.keys(map).length === 0) delete container[target.mapKey];
  writeFileSync(target.file, JSON.stringify(root, null, 2) + "\n", "utf-8");
}

// ---- Agent frameworks ----

interface AgentProbe {
  id: string;
  label: string;
  /** Config paths that mark the agent as installed (any existing → installed). */
  paths: (home: string) => string[];
  /** Inspect config to decide whether the bailian-cli provider is wired in. */
  detect: (home: string) => { configured: boolean; model?: string };
}

const AGENT_PROBES: AgentProbe[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    paths: (h) => [join(h, ".claude", "settings.json"), join(h, ".claude.json")],
    detect: (h) => {
      const env = asRecord(readJsonSafe(join(h, ".claude", "settings.json"))?.env);
      const baseUrl =
        env && typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : undefined;
      const model =
        env && typeof env.ANTHROPIC_MODEL === "string" ? env.ANTHROPIC_MODEL : undefined;
      return { configured: Boolean(baseUrl), model };
    },
  },
  {
    id: "qwen-code",
    label: "Qwen Code",
    paths: (h) => [join(h, ".qwen", "settings.json")],
    detect: (h) => {
      const settings = readJsonSafe(join(h, ".qwen", "settings.json"));
      const providers = asRecord(settings?.modelProviders);
      const hasBailian = providers
        ? Object.values(providers).some(
            (list) => Array.isArray(list) && list.some((e) => asRecord(e)?.name === "bailian-cli"),
          )
        : false;
      const model = asRecord(settings?.model);
      return {
        configured: hasBailian,
        model: model && typeof model.name === "string" ? model.name : undefined,
      };
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    paths: (h) => [join(h, ".config", "opencode", "opencode.json")],
    detect: (h) => {
      const provider = asRecord(
        readJsonSafe(join(h, ".config", "opencode", "opencode.json"))?.provider,
      );
      const bailian = asRecord(provider?.["bailian-cli"]);
      const models = asRecord(bailian?.models);
      return {
        configured: Boolean(bailian),
        model: models ? Object.keys(models)[0] : undefined,
      };
    },
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    paths: (h) => [join(h, ".openclaw", "openclaw.json")],
    detect: (h) => {
      const models = asRecord(readJsonSafe(join(h, ".openclaw", "openclaw.json"))?.models);
      const providers = asRecord(models?.providers);
      const bailian = asRecord(providers?.["bailian-cli"]);
      const list = Array.isArray(bailian?.models) ? bailian.models : [];
      const first = asRecord(list[0]);
      return {
        configured: Boolean(bailian),
        model: first && typeof first.id === "string" ? first.id : undefined,
      };
    },
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    paths: (h) => [join(h, ".hermes", "config.yaml")],
    detect: (h) => {
      const text = readText(join(h, ".hermes", "config.yaml"));
      if (!text) return { configured: false };
      let config: Record<string, unknown> | undefined;
      try {
        config = asRecord(yaml.parse(text));
      } catch {
        return { configured: false };
      }
      const providers = Array.isArray(config?.custom_providers) ? config.custom_providers : [];
      const configured = providers.some((p) => asRecord(p)?.name === "bailian-cli");
      const model = asRecord(config?.model);
      return {
        configured,
        model: model && typeof model.default === "string" ? model.default : undefined,
      };
    },
  },
  {
    id: "codex",
    label: "Codex",
    paths: (h) => [join(h, ".codex", "config.toml"), join(h, ".codex", "auth.json")],
    detect: (h) => {
      const text = readText(join(h, ".codex", "config.toml"));
      if (!text) return { configured: false };
      let config: Record<string, unknown> = {};
      try {
        config = parseToml(text) as Record<string, unknown>;
      } catch {
        return { configured: false };
      }
      const providers = asRecord(config.model_providers);
      const configured = Boolean(providers?.["bailian-cli"]);
      return {
        configured,
        model: typeof config.model === "string" ? config.model : undefined,
      };
    },
  },
];

/** Report each known coding agent framework and its local config state. */
export function listAgents(home: string = homedir()): AgentInfo[] {
  return AGENT_PROBES.map((probe) => {
    const paths = probe.paths(home);
    const installed = paths.some((p) => existsSync(p));
    const { configured, model } = installed
      ? probe.detect(home)
      : { configured: false, model: undefined };
    return {
      id: probe.id,
      label: probe.label,
      installed,
      configured,
      model,
      paths,
      origin: "local",
    };
  });
}

/** A single displayed config field for an agent's detail view. */
export interface AgentField {
  label: string;
  value: string;
  /** Sensitive value: the server masks it before returning. */
  secret?: boolean;
  /** Unmasked value for secrets, revealed on demand (localhost only). */
  raw?: string;
}

/** Raw content of one of the agent's config files. */
export interface AgentSettingsFile {
  path: string;
  lang: string;
  text: string;
}

/** Full detail for one agent: extracted config fields plus its config files. */
export interface AgentDetail extends AgentInfo {
  fields: AgentField[];
  files: Array<{ path: string; exists: boolean }>;
  settings: AgentSettingsFile[];
}

function pushField(out: AgentField[], label: string, value: unknown, secret = false): void {
  if (typeof value === "string" && value.trim()) out.push({ label, value: value.trim(), secret });
}

/**
 * Extract the bailian-cli connection fields (model, base URL, credential, ...)
 * an agent has written into its local config. Values are raw here; secrets are
 * masked by `getAgentDetail` before leaving the server. Read-only.
 */
function agentDetailFields(id: string, home: string): AgentField[] {
  const out: AgentField[] = [];
  if (id === "claude-code") {
    const env = asRecord(readJsonSafe(join(home, ".claude", "settings.json"))?.env);
    pushField(out, "Model", env?.ANTHROPIC_MODEL);
    pushField(out, "Base URL", env?.ANTHROPIC_BASE_URL);
    pushField(out, "Auth Token", env?.ANTHROPIC_AUTH_TOKEN, true);
  } else if (id === "qwen-code") {
    const s = readJsonSafe(join(home, ".qwen", "settings.json"));
    const model = asRecord(s?.model);
    const auth = asRecord(asRecord(s?.security)?.auth);
    const env = asRecord(s?.env);
    pushField(out, "Model", model?.name);
    pushField(out, "Base URL", auth?.baseUrl ?? model?.baseUrl);
    pushField(out, "Protocol", auth?.selectedType);
    pushField(out, "API Key", auth?.apiKey ?? env?.BAILIAN_CLI_API_KEY, true);
  } else if (id === "opencode") {
    const provider = asRecord(
      readJsonSafe(join(home, ".config", "opencode", "opencode.json"))?.provider,
    );
    const bailian = asRecord(provider?.["bailian-cli"]);
    const options = asRecord(bailian?.options);
    const models = asRecord(bailian?.models);
    pushField(out, "Model", models ? Object.keys(models)[0] : undefined);
    pushField(out, "Base URL", options?.baseURL);
    pushField(out, "Provider", bailian?.npm);
    pushField(out, "API Key", options?.apiKey, true);
  } else if (id === "openclaw") {
    const models = asRecord(readJsonSafe(join(home, ".openclaw", "openclaw.json"))?.models);
    const bailian = asRecord(asRecord(models?.providers)?.["bailian-cli"]);
    const list = Array.isArray(bailian?.models) ? bailian.models : [];
    const first = asRecord(list[0]);
    pushField(out, "Model", first?.id);
    pushField(out, "Base URL", bailian?.baseUrl);
    pushField(out, "API", bailian?.api);
    pushField(out, "API Key", bailian?.apiKey, true);
  } else if (id === "hermes") {
    const text = readText(join(home, ".hermes", "config.yaml"));
    let config: Record<string, unknown> | undefined;
    if (text) {
      try {
        config = asRecord(yaml.parse(text));
      } catch {
        config = undefined;
      }
    }
    const providers = Array.isArray(config?.custom_providers) ? config.custom_providers : [];
    const pr = asRecord(providers.find((e: unknown) => asRecord(e)?.name === "bailian-cli"));
    const list = Array.isArray(pr?.models) ? pr.models : [];
    const first = asRecord(list[0]);
    pushField(out, "Model", first?.id ?? asRecord(config?.model)?.default);
    pushField(out, "Base URL", pr?.base_url);
    pushField(out, "API Mode", pr?.api_mode);
    pushField(out, "API Key", pr?.api_key, true);
  } else if (id === "codex") {
    const text = readText(join(home, ".codex", "config.toml"));
    let config: Record<string, unknown> = {};
    if (text) {
      try {
        config = parseToml(text) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }
    const bailian = asRecord(asRecord(config.model_providers)?.["bailian-cli"]);
    const auth = readJsonSafe(join(home, ".codex", "auth.json"));
    pushField(out, "Model", config.model);
    pushField(out, "Base URL", bailian?.base_url);
    pushField(out, "Wire API", bailian?.wire_api);
    pushField(out, "API Key", auth?.OPENAI_API_KEY, true);
  }
  return out;
}

/** Mask a secret so its presence is visible but the value is not disclosed. */
function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "\u2022".repeat(Math.max(v.length, 4));
  return v.slice(0, 3) + "\u2022".repeat(Math.min(v.length - 3, 16));
}

/** Config keys whose string value is treated as a secret and masked. */
const SECRET_KEY_RE = /key|token|secret|password|passwd|auth|credential/i;

/**
 * Deep-clone a config entry, masking any string value whose key name looks
 * like a secret (API keys, tokens, Authorization headers, ...). Empty strings
 * are left untouched so placeholders like "AMAP_MAPS_API_KEY": "" stay visible.
 */
function maskConfigSecrets(value: unknown, keyName = ""): unknown {
  if (typeof value === "string") {
    return keyName && SECRET_KEY_RE.test(keyName) && value.trim() ? maskSecret(value) : value;
  }
  if (Array.isArray(value)) return value.map((v) => maskConfigSecrets(v));
  const rec = asRecord(value);
  if (rec) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = maskConfigSecrets(v, k);
    return out;
  }
  return value;
}

/** Guess a syntax-highlight language for a config file from its extension. */
function langForPath(p: string): string {
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".yaml") || p.endsWith(".yml")) return "yaml";
  if (p.endsWith(".toml")) return "toml";
  return "text";
}

/**
 * Full detail for one coding agent by id: normalized config fields plus its
 * config file list and raw file contents. Secret values (API keys/tokens) are
 * masked in `fields` but their unmasked form is included as `raw` for on-demand
 * reveal; raw file contents are returned verbatim. Localhost-only. Returns null
 * for an unknown id.
 */
export function getAgentDetail(id: string, home: string = homedir()): AgentDetail | null {
  const probe = AGENT_PROBES.find((p) => p.id === id);
  if (!probe) return null;
  const paths = probe.paths(home);
  const installed = paths.some((p) => existsSync(p));
  const { configured, model } = installed
    ? probe.detect(home)
    : { configured: false, model: undefined };
  const fields = installed
    ? agentDetailFields(id, home).map((f) =>
        f.secret ? { ...f, raw: f.value, value: maskSecret(f.value) } : f,
      )
    : [];
  const files = paths.map((p) => ({ path: p, exists: existsSync(p) }));
  const settings: AgentSettingsFile[] = installed
    ? paths
        .filter((p) => existsSync(p))
        .map((p) => ({ path: p, lang: langForPath(p), text: readText(p) ?? "" }))
        .filter((s) => s.text.trim())
    : [];
  return {
    id: probe.id,
    label: probe.label,
    installed,
    configured,
    model,
    paths,
    origin: "local",
    fields,
    files,
    settings,
  };
}
