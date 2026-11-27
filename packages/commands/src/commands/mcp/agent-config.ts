import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import yaml from "yaml";
import { getPiAgentDir } from "../config/agent/pi-home.ts";
import {
  backup,
  stripJsonc,
  writeJsonAtomic,
  writeTextAtomic,
} from "../config/agent/writers/utils.ts";

export const MCP_AGENT_IDS = [
  "codex",
  "claude-code",
  "cursor",
  "qoder",
  "qoderwork",
  "qwenwork",
  "qwen-code",
  "gemini",
  "opencode",
  "openclaw",
  "deepseek-harness",
  "zcode",
  "workbuddy",
  "pi",
] as const;

const DSH_MCP_PLUGIN = "@deepseek-ai/dsh-mcp-client";
const DSH_OTHER_PATCHES = "__dshOtherPatches";
const DSH_SERVERS = "mcpServers";
const WORKBUDDY_DIRS = [".workbuddy-ai", ".workbuddy", ".codebuddy"] as const;
const OPENCLAW_DIRS = [".openclaw", ".clawdbot", ".moltbot"] as const;

export type NativeMcpAgent = (typeof MCP_AGENT_IDS)[number];
export type McpTransport = "streamable-http" | "sse";
export type McpScope = "user" | "project";

const projectFiles: Partial<Record<NativeMcpAgent, string>> = {
  codex: ".codex/config.toml",
  "claude-code": ".mcp.json",
  cursor: ".cursor/mcp.json",
  qoder: ".qoder/settings.json",
  "qwen-code": ".qwen/settings.json",
  gemini: ".gemini/settings.json",
  opencode: "opencode.json",
  pi: ".pi/mcp.json",
  workbuddy: ".workbuddy/mcp.json",
};
export const projectAgents = MCP_AGENT_IDS.filter((agent) => projectFiles[agent]);

export class McpRegistrationError extends BailianError {
  constructor(
    readonly reason: string,
    readonly text: LocalizedText,
    exitCode: ExitCode = ExitCode.GENERAL,
  ) {
    super(typeof text === "string" ? text : text["en-US"], exitCode);
  }
}

export interface McpConnectionSpec {
  name: string;
  serverCode: string;
  transport: McpTransport;
  endpoint: string;
  headers: Record<string, string>;
}

export interface McpAgentResult {
  agent: NativeMcpAgent;
  path: string;
  status: "added" | "updated" | "unchanged" | "removed" | "absent";
}

interface ManagedRegistration {
  agent: NativeMcpAgent;
  name: string;
  serverCode: string;
  transport: McpTransport;
  endpoint: string;
  path: string;
  scope?: McpScope;
  projectRoot?: string | null;
  configPath?: string;
  configPaths?: string[];
  fingerprint: string;
  cliVersion: string;
  updatedAt: string;
}

interface RegistrationManifest {
  version: 1;
  registrations: Record<string, ManagedRegistration>;
}

interface AgentAdapter {
  path(home: string): string;
  paths?(home: string): string[];
  installed(home: string): boolean;
  supports(transport: McpTransport): boolean;
  parse(path: string): Record<string, unknown>;
  serialize(config: Record<string, unknown>): string;
  getServers(config: Record<string, unknown>): Record<string, unknown>;
  buildEntry(spec: McpConnectionSpec): Record<string, unknown>;
}

interface RegistrationOptions {
  scope?: McpScope;
  projectRoot?: string;
  dryRun?: boolean;
}

interface ConnectOptions extends RegistrationOptions {
  agents: NativeMcpAgent[];
  spec: McpConnectionSpec;
  cliVersion: string;
  home: string;
  configDir: string;
}

interface DisconnectOptions extends RegistrationOptions {
  agents: NativeMcpAgent[];
  name: string;
  home: string;
  configDir: string;
}

interface PlannedWrite {
  path: string;
  original?: string;
  content: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidConfiguration(path: string) {
  return new McpRegistrationError("INVALID_CONFIG", {
    "en-US": `Invalid MCP configuration in ${path}. Correct the file before retrying.`,
    "zh-CN": `${path} 中的 MCP 配置无效，请修正文件后重试。`,
  });
}

function parseObject(path: string, parser: (content: string) => unknown): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf8");
  try {
    const parsed = parser(content);
    if (!isObject(parsed)) throw new Error("root value is not an object");
    return parsed;
  } catch {
    // Parser errors may quote credentials from the source file.
    throw invalidConfiguration(path);
  }
}

function parseJson(path: string): Record<string, unknown> {
  return parseObject(path, (content) => JSON.parse(stripJsonc(content)));
}

function parseTomlObject(path: string): Record<string, unknown> {
  return parseObject(path, parseToml);
}

function serverMap(config: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = config[key];
  if (current === undefined) {
    const created: Record<string, unknown> = {};
    config[key] = created;
    return created;
  }
  if (!isObject(current)) {
    throw new McpRegistrationError("INVALID_CONFIG", {
      "en-US": `Expected an object for ${key} in the MCP configuration.`,
      "zh-CN": `MCP 配置中的 ${key} 应为对象。`,
    });
  }
  return current;
}

function nestedServerMap(config: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  let current = config;
  for (const key of keys) {
    current = serverMap(current, key);
  }
  return current;
}

function adapterWritePaths(adapter: AgentAdapter, home: string): string[] {
  const listed = adapter.paths?.(home);
  if (listed && listed.length > 0) return listed;
  return [adapter.path(home)];
}

function envOrHomePath(envValue: string | undefined, home: string, fallbackDir: string): string {
  const trimmed = envValue?.trim();
  return trimmed ? trimmed : join(home, fallbackDir);
}

function mergeConnectStatus(
  current: McpAgentResult["status"] | undefined,
  next: "added" | "updated" | "unchanged",
): McpAgentResult["status"] {
  if (current === undefined || current === "unchanged") return next;
  if (next === "updated" || current === "updated") return "updated";
  return current;
}

function unsupportedSseError(agent: NativeMcpAgent): BailianError {
  const label =
    agent === "codex" ? "Codex" : agent === "deepseek-harness" ? "DeepSeek Harness" : agent;
  return new McpRegistrationError(
    "TRANSPORT_UNSUPPORTED",
    {
      "en-US": `${label} does not support SSE MCP servers. Choose a Streamable HTTP server.`,
      "zh-CN": `${label} 不支持 SSE MCP 服务，请选择 Streamable HTTP 服务。`,
    },
    ExitCode.USAGE,
  );
}

const QWENWORK_DIRS = [".qwenworkcn", ".qwenwork"] as const;

function qwenworkConfigDirs(home: string): string[] {
  return QWENWORK_DIRS.map((dir) => join(home, dir));
}

/** QwenWork / 千问办公 stores MCP config in `~/.qwenworkcn/mcp.json` (or `~/.qwenwork/mcp.json`). */
export function qwenworkMcpPath(home: string): string {
  const dirs = qwenworkConfigDirs(home);
  for (const dir of dirs) {
    const file = join(dir, "mcp.json");
    if (existsSync(file)) return file;
  }
  for (const dir of dirs) {
    if (existsSync(dir)) return join(dir, "mcp.json");
  }
  return join(dirs[0], "mcp.json");
}

export function opencodeMcpPath(home: string): string {
  return join(home, ".config", "opencode", "opencode.json");
}

export function openclawMcpPath(home: string): string {
  const fromEnv = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (fromEnv) return fromEnv;
  const existing = OPENCLAW_DIRS.map((dir) => join(home, dir)).find((dir) => existsSync(dir));
  return join(existing ?? join(home, OPENCLAW_DIRS[0]), "openclaw.json");
}

export function dshHomeDir(home: string): string {
  return envOrHomePath(process.env.DSH_HOME, home, ".dsh");
}

export function dshMcpPath(home: string): string {
  return join(dshHomeDir(home), "cordis.patch.yml");
}

export function zcodeMcpPath(home: string): string {
  return join(envOrHomePath(process.env.ZCODE_HOME, home, ".zcode"), "cli", "config.json");
}

function workbuddyProductDirs(home: string): string[] {
  return WORKBUDDY_DIRS.map((dir) => join(home, dir));
}

function workbuddyFileInDir(dir: string): string {
  const recommended = join(dir, ".mcp.json");
  if (existsSync(recommended)) return recommended;
  return join(dir, "mcp.json");
}

export function workbuddyMcpPaths(home: string): string[] {
  const existing = workbuddyProductDirs(home).filter((dir) => existsSync(dir));
  const dirs = existing.length > 0 ? existing : [join(home, WORKBUDDY_DIRS[0])];
  return dirs.map((dir) => workbuddyFileInDir(dir));
}

function isDshMcpEntry(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value.name === DSH_MCP_PLUGIN && isObject(value.config);
}

function dshServerName(entry: Record<string, unknown>): string | undefined {
  const config = entry.config;
  if (!isObject(config) || typeof config.serverName !== "string" || config.serverName === "") {
    return undefined;
  }
  return config.serverName;
}

function parseDshPatch(path: string): Record<string, unknown> {
  if (!existsSync(path)) return { [DSH_OTHER_PATCHES]: [], [DSH_SERVERS]: {} };
  let parsed: unknown;
  const content = readFileSync(path, "utf8");
  try {
    parsed = yaml.parse(content);
  } catch {
    throw invalidConfiguration(path);
  }
  if (parsed === null || parsed === undefined) {
    return { [DSH_OTHER_PATCHES]: [], [DSH_SERVERS]: {} };
  }
  if (!Array.isArray(parsed)) {
    throw invalidConfiguration(path);
  }

  const otherPatches: unknown[] = [];
  const servers: Record<string, unknown> = Object.create(null);
  for (const item of parsed) {
    if (isObject(item) && Array.isArray(item.insert)) {
      const otherEntries: unknown[] = [];
      for (const entry of item.insert) {
        if (isDshMcpEntry(entry)) {
          const name = dshServerName(entry);
          if (name) {
            servers[name] = entry;
            continue;
          }
        }
        otherEntries.push(entry);
      }
      if (otherEntries.length > 0) otherPatches.push({ ...item, insert: otherEntries });
      continue;
    }
    if (isDshMcpEntry(item)) {
      const name = dshServerName(item);
      if (name) {
        servers[name] = item;
        continue;
      }
    }
    otherPatches.push(item);
  }
  return { [DSH_OTHER_PATCHES]: otherPatches, [DSH_SERVERS]: servers };
}

function serializeDshPatch(config: Record<string, unknown>): string {
  const otherPatches = Array.isArray(config[DSH_OTHER_PATCHES]) ? config[DSH_OTHER_PATCHES] : [];
  const servers = isObject(config[DSH_SERVERS]) ? config[DSH_SERVERS] : {};
  const patches = [...otherPatches];
  const mcpEntries = Object.values(servers);
  if (mcpEntries.length > 0) patches.push({ insert: mcpEntries });
  return yaml.stringify(patches);
}

function jsonMcpAdapter(options: {
  path: (home: string) => string;
  paths?: (home: string) => string[];
  installed: (home: string) => boolean;
  supports?: (transport: McpTransport) => boolean;
  typed?: boolean;
  serverKeys?: string[];
  buildEntry?: (spec: McpConnectionSpec) => Record<string, unknown>;
}): AgentAdapter {
  const serverKeys = options.serverKeys ?? ["mcpServers"];
  return {
    path: options.path,
    paths: options.paths,
    installed: options.installed,
    supports: options.supports ?? (() => true),
    parse: parseJson,
    serialize: (config) => `${JSON.stringify(config, null, 2)}\n`,
    getServers: (config) => nestedServerMap(config, serverKeys),
    buildEntry:
      options.buildEntry ??
      ((spec) =>
        options.typed
          ? {
              type: spec.transport === "sse" ? "sse" : "http",
              url: spec.endpoint,
              headers: spec.headers,
            }
          : { url: spec.endpoint, headers: spec.headers }),
  };
}

const adapters: Record<NativeMcpAgent, AgentAdapter> = {
  pi: jsonMcpAdapter({
    path: (home) => join(getPiAgentDir(home), "mcp.json"),
    installed: (home) => existsSync(getPiAgentDir(home)),
    supports: (transport) => transport === "streamable-http",
  }),
  codex: {
    path: (home) => join(process.env.CODEX_HOME || join(home, ".codex"), "config.toml"),
    installed: (home) =>
      existsSync(process.env.CODEX_HOME || join(home, ".codex")) ||
      existsSync(join(process.env.CODEX_HOME || join(home, ".codex"), "config.toml")),
    supports: (transport) => transport === "streamable-http",
    parse: parseTomlObject,
    serialize: (config) => `${stringifyToml(config)}\n`,
    getServers: (config) => serverMap(config, "mcp_servers"),
    buildEntry: (spec) => ({ url: spec.endpoint, http_headers: spec.headers }),
  },
  "claude-code": {
    path: (home) => join(home, ".claude.json"),
    installed: (home) =>
      existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")),
    supports: () => true,
    parse: parseJson,
    serialize: (config) => `${JSON.stringify(config, null, 2)}\n`,
    getServers: (config) => serverMap(config, "mcpServers"),
    buildEntry: (spec) => ({
      type: spec.transport === "sse" ? "sse" : "http",
      url: spec.endpoint,
      headers: spec.headers,
    }),
  },
  cursor: jsonMcpAdapter({
    path: (home) => join(home, ".cursor", "mcp.json"),
    installed: (home) =>
      existsSync(join(home, ".cursor")) || existsSync(join(home, ".cursor", "mcp.json")),
  }),
  qoder: jsonMcpAdapter({
    path: (home) => join(home, ".qoder", "mcp.json"),
    installed: (home) =>
      existsSync(join(home, ".qoder")) || existsSync(join(home, ".qoder", "mcp.json")),
  }),
  qoderwork: jsonMcpAdapter({
    path: (home) => join(home, ".qoderwork", "mcp.json"),
    installed: (home) =>
      existsSync(join(home, ".qoderwork")) || existsSync(join(home, ".qoderwork", "mcp.json")),
  }),
  qwenwork: jsonMcpAdapter({
    path: qwenworkMcpPath,
    installed: (home) =>
      qwenworkConfigDirs(home).some((dir) => existsSync(dir) || existsSync(join(dir, "mcp.json"))),
    buildEntry: (spec) => ({
      type: spec.transport === "sse" ? "sse" : "streamable-http",
      url: spec.endpoint,
      headers: spec.headers,
    }),
  }),
  "qwen-code": {
    path: (home) => join(home, ".qwen", "settings.json"),
    installed: (home) => existsSync(join(home, ".qwen")),
    supports: () => true,
    parse: parseJson,
    serialize: (config) => `${JSON.stringify(config, null, 2)}\n`,
    getServers: (config) => serverMap(config, "mcpServers"),
    buildEntry: (spec) =>
      spec.transport === "sse"
        ? { url: spec.endpoint, headers: spec.headers }
        : { httpUrl: spec.endpoint, headers: spec.headers },
  },
  gemini: {
    path: (home) => join(home, ".gemini", "settings.json"),
    installed: (home) => existsSync(join(home, ".gemini")),
    supports: () => true,
    parse: parseJson,
    serialize: (config) => `${JSON.stringify(config, null, 2)}\n`,
    getServers: (config) => serverMap(config, "mcpServers"),
    buildEntry: (spec) =>
      spec.transport === "sse"
        ? { url: spec.endpoint, headers: spec.headers }
        : { httpUrl: spec.endpoint, headers: spec.headers },
  },
  opencode: jsonMcpAdapter({
    path: opencodeMcpPath,
    installed: (home) =>
      existsSync(join(home, ".config", "opencode")) || existsSync(opencodeMcpPath(home)),
    serverKeys: ["mcp"],
    buildEntry: (spec) => ({
      type: "remote",
      url: spec.endpoint,
      enabled: true,
      oauth: false,
      headers: spec.headers,
    }),
  }),
  openclaw: jsonMcpAdapter({
    path: openclawMcpPath,
    installed: (home) =>
      Boolean(process.env.OPENCLAW_CONFIG_PATH?.trim()) ||
      OPENCLAW_DIRS.some((dir) => existsSync(join(home, dir))) ||
      existsSync(openclawMcpPath(home)),
    serverKeys: ["mcp", "servers"],
    buildEntry: (spec) => ({
      url: spec.endpoint,
      transport: spec.transport === "sse" ? "sse" : "streamable-http",
      headers: spec.headers,
    }),
  }),
  "deepseek-harness": {
    path: dshMcpPath,
    installed: (home) => existsSync(dshHomeDir(home)),
    supports: (transport) => transport === "streamable-http",
    parse: parseDshPatch,
    serialize: serializeDshPatch,
    getServers: (config) => serverMap(config, DSH_SERVERS),
    buildEntry: (spec) => ({
      id: `mcp-bailian-${spec.name}`,
      name: DSH_MCP_PLUGIN,
      config: {
        serverName: spec.name,
        transport: "streamable-http",
        url: spec.endpoint,
        headers: spec.headers,
      },
    }),
  },
  zcode: jsonMcpAdapter({
    path: zcodeMcpPath,
    installed: (home) => existsSync(envOrHomePath(process.env.ZCODE_HOME, home, ".zcode")),
    serverKeys: ["mcp", "servers"],
    buildEntry: (spec) => ({
      type: spec.transport === "sse" ? "sse" : "http",
      url: spec.endpoint,
      enabled: true,
      headers: spec.headers,
    }),
  }),
  workbuddy: jsonMcpAdapter({
    path: (home) => workbuddyMcpPaths(home)[0] ?? join(home, WORKBUDDY_DIRS[0], "mcp.json"),
    paths: workbuddyMcpPaths,
    installed: (home) => workbuddyProductDirs(home).some((dir) => existsSync(dir)),
    typed: true,
  }),
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function registrationKey(agent: NativeMcpAgent, name: string, projectRoot?: string): string {
  if (projectRoot) return JSON.stringify([agent, projectRoot, name]);
  return `${agent}:${name}`;
}

function targetPaths(
  agent: NativeMcpAgent,
  home: string,
  projectRoot?: string,
  savedPaths?: string[],
): string[] {
  if (!projectRoot) return adapterWritePaths(adapters[agent], home).map((path) => resolve(path));
  const file = projectFiles[agent];
  if (!file)
    throw new McpRegistrationError("SCOPE_UNSUPPORTED", {
      "en-US": `Project scope is unavailable for ${agent}.`,
      "zh-CN": `${agent} 不支持项目级 MCP 配置。`,
    });
  let files = [file];
  const accepted = [file];
  if (agent === "opencode") {
    accepted.push("opencode.jsonc");
    if (existsSync(join(projectRoot, "opencode.jsonc"))) files = ["opencode.jsonc"];
  }
  if (agent === "workbuddy") {
    accepted.push(".mcp.json", "mcp.json");
    if (existsSync(join(home, ".codebuddy"))) {
      if (!existsSync(join(home, ".workbuddy")) && !existsSync(join(home, ".workbuddy-ai")))
        files = [];
      files.push(
        !existsSync(join(projectRoot, ".mcp.json")) && existsSync(join(projectRoot, "mcp.json"))
          ? "mcp.json"
          : ".mcp.json",
      );
    }
  }
  const paths = files.map((name) => join(projectRoot, name));
  if (Array.isArray(savedPaths)) {
    for (const name of accepted) {
      const candidate = join(projectRoot, name);
      if (savedPaths.includes(candidate) && !paths.includes(candidate)) paths.push(candidate);
    }
  }
  for (const path of paths) {
    if (!existsSync(projectRoot)) continue;
    let parent = path;
    while (!existsSync(parent)) parent = dirname(parent);
    const within = relative(realpathSync(projectRoot), realpathSync(parent));
    if (isAbsolute(within) || within === ".." || within.startsWith(".." + sep)) {
      throw new McpRegistrationError("CONFIG_OUTSIDE_PROJECT", {
        "en-US": `The Agent config resolves outside the project: ${path}.`,
        "zh-CN": `Agent 配置路径指向项目以外的位置：${path}。`,
      });
    }
  }
  return paths;
}

function registrationTarget(
  options: RegistrationOptions & { home: string },
  manifest: RegistrationManifest,
  agent: NativeMcpAgent,
  name: string,
) {
  const projectRoot =
    options.scope === "project" ? (options.projectRoot ?? process.cwd()) : undefined;
  const key = registrationKey(agent, name, projectRoot);
  const managed = manifest.registrations[key];
  const paths = targetPaths(
    agent,
    options.home,
    projectRoot,
    managed?.configPaths ?? (managed?.configPath ? [managed.configPath] : undefined),
  );
  const ambiguous = () =>
    new McpRegistrationError("AMBIGUOUS_REGISTRATION", {
      "en-US": `Cannot identify the configuration owned by the saved ${agent} registration for ${name}.`,
      "zh-CN": `无法确定 ${agent} 中 ${name} 的托管记录对应哪份配置。`,
    });
  if (!Object.hasOwn(manifest.registrations, key)) {
    if (
      !projectRoot &&
      Object.values(manifest.registrations).some(
        (record) => record && !record.scope && record.agent === agent && record.serverCode === name,
      )
    )
      throw ambiguous();
    return { key, managed: undefined, paths, projectRoot };
  }
  if (
    !managed ||
    managed.agent !== agent ||
    managed.name !== name ||
    managed.serverCode !== name ||
    !managed.fingerprint ||
    (managed.scope ?? "user") !== (options.scope ?? "user") ||
    (managed.projectRoot ?? undefined) !== projectRoot
  )
    throw ambiguous();
  // Version-one records only stored the primary user path. Migrate only recognizable targets.
  if (!managed.scope) {
    if (!paths.includes(managed.path)) throw ambiguous();
    return { key, managed, paths, projectRoot };
  }
  const recorded = managed.configPaths ?? [managed.configPath];
  if (
    !Array.isArray(recorded) ||
    !recorded.length ||
    !recorded.every((path): path is string => typeof path === "string" && isAbsolute(path)) ||
    recorded[0] !== managed.configPath ||
    (projectRoot && !recorded.every((path) => paths.includes(path)))
  )
    throw ambiguous();
  // Keep managing recorded files when discovery changes; new WorkBuddy product folders can join on connect.
  return { key, managed, paths: recorded, projectRoot };
}

export function manifestPath(configDir: string): string {
  return join(configDir, "mcp-registrations.json");
}

function readManifest(configDir: string): RegistrationManifest {
  const path = manifestPath(configDir);
  if (!existsSync(path)) return { version: 1, registrations: {} };
  const parsed = parseJson(path);
  if (parsed.version !== 1 || !isObject(parsed.registrations)) {
    throw invalidConfiguration(path);
  }
  return parsed as unknown as RegistrationManifest;
}

export function registeredMcpAgents(configDir: string, serverCode: string): NativeMcpAgent[] {
  const { registrations } = readManifest(configDir);
  const records = Object.values(registrations);
  return MCP_AGENT_IDS.filter((agent) =>
    records.some((record) => record?.agent === agent && record.serverCode === serverCode),
  );
}

/** Join managed registrations to the native entries still present on this machine. */
export function connectedMcpPaths(
  configDir: string,
  home: string,
  serverCodes: Set<string>,
  onUnreadable: (path: string) => void,
) {
  type PathsByAgent = Partial<Record<NativeMcpAgent, string[]>>;
  const connections = new Map<string, PathsByAgent>();
  if (serverCodes.size === 0) return connections;
  let manifest: RegistrationManifest;
  try {
    manifest = readManifest(configDir);
  } catch {
    onUnreadable(manifestPath(configDir));
    return connections;
  }
  const records = Object.values(manifest.registrations).filter(
    (record) => record && serverCodes.has(record.serverCode),
  );
  for (const agent of MCP_AGENT_IDS) {
    const managed = records.filter((record) => record.agent === agent);
    if (!managed.length) continue;
    const adapter = adapters[agent];
    const recordsByPath = new Map<string, ManagedRegistration[]>();
    for (const record of managed) {
      try {
        const target = registrationTarget(
          { home, scope: record.scope, projectRoot: record.projectRoot ?? undefined },
          manifest,
          agent,
          record.name,
        );
        if (target.managed !== record) {
          onUnreadable(manifestPath(configDir));
          continue;
        }
        for (const path of target.paths) {
          if (!recordsByPath.has(path)) recordsByPath.set(path, []);
          recordsByPath.get(path)!.push(record);
        }
      } catch {
        onUnreadable(manifestPath(configDir));
      }
    }
    for (const [path, pathRecords] of recordsByPath) {
      if (!existsSync(path)) continue;
      let entries: Record<string, unknown>;
      try {
        entries = adapter.getServers(adapter.parse(path));
      } catch {
        onUnreadable(path);
        continue;
      }
      for (const record of pathRecords) {
        if (
          !Object.hasOwn(entries, record.name) ||
          fingerprint(entries[record.name]) !== record.fingerprint
        )
          continue;
        const paths = connections.get(record.serverCode) ?? {};
        (paths[agent] ??= []).push(path);
        connections.set(record.serverCode, paths);
      }
    }
  }
  return connections;
}

function assertManagedEntry(
  existing: unknown,
  managed: ManagedRegistration | undefined,
  agent: NativeMcpAgent,
  name: string,
): void {
  if (existing === undefined) return;
  if (!managed) {
    throw new McpRegistrationError("UNMANAGED_CONFLICT", {
      "en-US": `MCP server "${name}" already exists in ${agent} and is not managed by bailian-cli.`,
      "zh-CN": `${agent} 中已存在由其他方式管理的同名 MCP 服务“${name}”。`,
    });
  }
  if (fingerprint(existing) !== managed.fingerprint) {
    throw new McpRegistrationError("MODIFIED_CONFLICT", {
      "en-US": `MCP server "${name}" in ${agent} conflicts with the last bailian-cli registration.`,
      "zh-CN": `${agent} 中的 MCP 服务“${name}”在注册后已被修改。`,
    });
  }
}

function restoreWrites(writes: PlannedWrite[]): void {
  for (const write of writes.reverse()) {
    try {
      if (readFileSync(write.path, "utf8") !== write.content) continue;
      if (write.original === undefined) unlinkSync(write.path);
      else writeTextAtomic(write.path, write.original);
    } catch {
      // Preserve the original failure; timestamped backups remain available.
    }
  }
}

function applyWrites(
  writes: PlannedWrite[],
  manifest: RegistrationManifest,
  configDir: string,
): void {
  const completed: PlannedWrite[] = [];
  try {
    for (const write of writes) {
      const current = existsSync(write.path) ? readFileSync(write.path, "utf8") : undefined;
      if (current !== write.original)
        throw new McpRegistrationError("MODIFIED_CONFLICT", {
          "en-US": `The configuration changed during registration: ${write.path}.`,
          "zh-CN": `注册期间配置文件发生变化：${write.path}。`,
        });
      backup(write.path);
      writeTextAtomic(write.path, write.content);
      completed.push(write);
    }
    writeJsonAtomic(manifestPath(configDir), manifest);
  } catch (error) {
    restoreWrites(completed);
    throw error;
  }
}

export function resolveMcpAgentTargets(
  target: NativeMcpAgent | "all",
  home: string,
  registration?: { configDir: string; server: string; projectRoot?: string },
): NativeMcpAgent[] {
  if (target !== "all") return [target];
  const records = registration ? readManifest(registration.configDir).registrations : {};
  return MCP_AGENT_IDS.filter(
    (agent) =>
      adapters[agent].installed(home) ||
      (registration &&
        Object.hasOwn(
          records,
          registrationKey(agent, registration.server, registration.projectRoot),
        )),
  );
}

export function connectMcpAgents(options: ConnectOptions): McpAgentResult[] {
  const manifest = readManifest(options.configDir);
  const writes: PlannedWrite[] = [];
  const results: McpAgentResult[] = [];
  let manifestChanged = false;

  for (const agent of options.agents) {
    const adapter = adapters[agent];
    if (!adapter.supports(options.spec.transport)) {
      throw unsupportedSseError(agent);
    }

    const target = registrationTarget(options, manifest, agent, options.spec.name);
    const { key, managed, projectRoot } = target;
    const paths =
      agent === "workbuddy"
        ? [...new Set([...target.paths, ...targetPaths(agent, options.home, projectRoot)])]
        : target.paths;
    const primaryPath = paths[0];
    const desired = adapter.buildEntry(options.spec);
    const desiredFingerprint = fingerprint(desired);
    let status: McpAgentResult["status"] | undefined;

    for (const path of paths) {
      const original = existsSync(path) ? readFileSync(path, "utf8") : undefined;
      const config = adapter.parse(path);
      const servers = adapter.getServers(config);
      const existing = Object.hasOwn(servers, options.spec.name)
        ? servers[options.spec.name]
        : undefined;
      assertManagedEntry(
        existing,
        target.paths.includes(path) ? managed : undefined,
        agent,
        options.spec.name,
      );
      const pathStatus =
        existing === undefined
          ? "added"
          : fingerprint(existing) === desiredFingerprint
            ? "unchanged"
            : "updated";
      status = mergeConnectStatus(status, pathStatus);
      if (pathStatus !== "unchanged") {
        Object.defineProperty(servers, options.spec.name, {
          value: desired,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        writes.push({
          path,
          original,
          content: adapter.serialize(config),
        });
      }
    }

    const resolvedStatus = status ?? "unchanged";
    results.push({ agent, path: primaryPath, status: resolvedStatus });
    if (resolvedStatus !== "unchanged" || !managed?.scope) {
      manifest.registrations[key] = {
        agent,
        name: options.spec.name,
        serverCode: options.spec.serverCode,
        transport: options.spec.transport,
        endpoint: options.spec.endpoint,
        path: primaryPath,
        scope: options.scope ?? "user",
        projectRoot: projectRoot ?? null,
        configPath: primaryPath,
        configPaths: paths,
        fingerprint: desiredFingerprint,
        cliVersion: options.cliVersion,
        updatedAt: new Date().toISOString(),
      };
      manifestChanged = true;
    }
  }
  if (!options.dryRun && manifestChanged) applyWrites(writes, manifest, options.configDir);
  return results;
}

export function disconnectMcpAgents(options: DisconnectOptions): McpAgentResult[] {
  const manifest = readManifest(options.configDir);
  const writes: PlannedWrite[] = [];
  const results: McpAgentResult[] = [];
  let manifestChanged = false;

  for (const agent of options.agents) {
    const adapter = adapters[agent];
    const { key, managed, paths } = registrationTarget(options, manifest, agent, options.name);
    const primaryPath = paths[0];
    if (!managed) {
      results.push({ agent, path: primaryPath, status: "absent" });
      continue;
    }

    let removed = false;
    for (const path of paths) {
      const original = existsSync(path) ? readFileSync(path, "utf8") : undefined;
      const config = adapter.parse(path);
      const servers = adapter.getServers(config);
      const existing = Object.hasOwn(servers, options.name) ? servers[options.name] : undefined;
      if (existing === undefined) continue;
      assertManagedEntry(existing, managed, agent, options.name);
      delete servers[options.name];
      removed = true;
      writes.push({
        path,
        original,
        content: adapter.serialize(config),
      });
    }

    delete manifest.registrations[key];
    manifestChanged = true;
    results.push({
      agent,
      path: primaryPath,
      status: removed ? "removed" : "absent",
    });
  }

  if (!options.dryRun && (writes.length > 0 || manifestChanged)) {
    applyWrites(writes, manifest, options.configDir);
  }
  return results;
}
