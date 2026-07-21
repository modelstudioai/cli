// Read-only discovery of locally installed AI tooling, surfaced by `config ui`:
// - Agent skills installed under ~/.agents/skills (via `npx skills add`).
// - MCP servers declared in each coding agent's local config file.
// - Coding agent frameworks and whether the bailian-cli provider is wired in.
//
// Everything here only reads the filesystem; nothing is written. Missing files,
// unreadable dirs and malformed configs degrade to empty results rather than
// throwing, so a broken third-party config never takes down the UI.
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
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
}

/** A coding agent framework and its local configuration state. */
export interface AgentInfo {
  id: string;
  label: string;
  installed: boolean;
  configured: boolean;
  model?: string;
  paths: string[];
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
    { source: "hermes", dir: join(home, ".hermes", "skills") },
    { source: "gemini", dir: join(home, ".gemini", "skills") },
    { source: "windsurf", dir: join(home, ".windsurf", "skills") },
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

function collectMcpMap(raw: unknown, source: string, scope: string, out: McpServerInfo[]): void {
  const map = asRecord(raw);
  if (!map) return;
  for (const [name, value] of Object.entries(map)) {
    const entry = asRecord(value) ?? {};
    const { transport, detail } = transportOf(entry);
    out.push({ name, source, transport, detail, scope, origin: "local" });
  }
}

/** Discover MCP servers declared across local agent config files. */
export function listMcpServers(home: string = homedir()): McpServerInfo[] {
  const out: McpServerInfo[] = [];

  // Claude Code: global mcpServers + per-project mcpServers in ~/.claude.json.
  const claude = readJsonSafe(join(home, ".claude.json"));
  if (claude) {
    collectMcpMap(claude.mcpServers, "claude-code", "global", out);
    const projects = asRecord(claude.projects);
    if (projects) {
      for (const [projectPath, projectValue] of Object.entries(projects)) {
        const project = asRecord(projectValue);
        if (project?.mcpServers) collectMcpMap(project.mcpServers, "claude-code", projectPath, out);
      }
    }
  }

  // Qwen Code.
  const qwen = readJsonSafe(join(home, ".qwen", "settings.json"));
  if (qwen) collectMcpMap(qwen.mcpServers, "qwen-code", "global", out);

  // OpenCode uses `mcp` rather than `mcpServers`.
  const opencode = readJsonSafe(join(home, ".config", "opencode", "opencode.json"));
  if (opencode) collectMcpMap(opencode.mcp, "opencode", "global", out);

  // Codex declares servers as [mcp_servers.<name>] TOML tables.
  const codexToml = readText(join(home, ".codex", "config.toml"));
  if (codexToml) {
    try {
      const parsed = parseToml(codexToml) as Record<string, unknown>;
      collectMcpMap(parsed.mcp_servers, "codex", "global", out);
    } catch {
      /* ignore malformed toml */
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
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
    };
  });
}
