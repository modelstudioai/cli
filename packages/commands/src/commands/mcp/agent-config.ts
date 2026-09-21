import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { BailianError, ExitCode } from "bailian-cli-core";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import yaml from "yaml";
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
] as const;

const DSH_MCP_PLUGIN = "@deepseek-ai/dsh-mcp-client";
const DSH_OTHER_PATCHES = "__dshOtherPatches";
const DSH_SERVERS = "mcpServers";
const WORKBUDDY_DIRS = [".workbuddy-ai", ".workbuddy", ".codebuddy"] as const;
const OPENCLAW_DIRS = [".openclaw", ".clawdbot", ".moltbot"] as const;

export type NativeMcpAgent = (typeof MCP_AGENT_IDS)[number];
export type McpTransport = "streamable-http" | "sse";

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

interface ConnectOptions {
  agents: NativeMcpAgent[];
  spec: McpConnectionSpec;
  cliVersion: string;
  home: string;
  configDir: string;
}

interface DisconnectOptions {
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

function parseObject(path: string, parser: (content: string) => unknown): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = parser(readFileSync(path, "utf8"));
    if (!isObject(parsed)) throw new Error("root value is not an object");
    return parsed;
  } catch (error) {
    throw new BailianError(
      `Cannot update MCP configuration because ${path} is invalid.`,
      ExitCode.GENERAL,
      "Fix the existing configuration file and retry; it was not changed.",
      { cause: error },
    );
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
    throw new BailianError(
      `Cannot update MCP configuration because ${key} is not an object.`,
      ExitCode.GENERAL,
    );
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
  return new BailianError(
    `${label} does not support SSE MCP servers; use --transport streamable-http.`,
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
  try {
    parsed = yaml.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new BailianError(
      `Cannot update MCP configuration because ${path} is invalid.`,
      ExitCode.GENERAL,
      "Fix the existing configuration file and retry; it was not changed.",
      { cause: error },
    );
  }
  if (parsed === null || parsed === undefined) {
    return { [DSH_OTHER_PATCHES]: [], [DSH_SERVERS]: {} };
  }
  if (!Array.isArray(parsed)) {
    throw new BailianError(
      `Cannot update MCP configuration because ${path} is invalid.`,
      ExitCode.GENERAL,
      "Fix the existing configuration file and retry; it was not changed.",
    );
  }

  const otherPatches: unknown[] = [];
  const servers: Record<string, unknown> = {};
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

function registrationKey(agent: NativeMcpAgent, name: string): string {
  return `${agent}:${name}`;
}

function manifestPath(configDir: string): string {
  return join(configDir, "mcp-registrations.json");
}

function readManifest(configDir: string): RegistrationManifest {
  const path = manifestPath(configDir);
  if (!existsSync(path)) return { version: 1, registrations: {} };
  const parsed = parseJson(path);
  if (parsed.version !== 1 || !isObject(parsed.registrations)) {
    throw new BailianError(
      `Cannot update MCP registrations because ${path} has an unsupported format.`,
      ExitCode.GENERAL,
    );
  }
  return parsed as unknown as RegistrationManifest;
}

function assertManagedEntry(
  existing: unknown,
  managed: ManagedRegistration | undefined,
  agent: NativeMcpAgent,
  name: string,
): void {
  if (existing === undefined) return;
  if (!managed) {
    throw new BailianError(
      `MCP server "${name}" already exists in ${agent} and is not managed by bailian-cli.`,
      ExitCode.GENERAL,
      "Choose another server name or remove the existing entry yourself.",
    );
  }
  if (fingerprint(existing) !== managed.fingerprint) {
    throw new BailianError(
      `MCP server "${name}" in ${agent} conflicts with the last bailian-cli registration.`,
      ExitCode.GENERAL,
      "The entry was changed after registration; resolve it manually before retrying.",
    );
  }
}

function restoreWrites(writes: PlannedWrite[]): void {
  for (const write of writes.reverse()) {
    try {
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
      backup(write.path);
      writeTextAtomic(write.path, write.content);
      completed.push(write);
    }
    writeJsonAtomic(manifestPath(configDir), manifest);
  } catch (error) {
    restoreWrites(completed);
    throw new BailianError(
      "Failed to update MCP Agent configuration.",
      ExitCode.GENERAL,
      undefined,
      {
        cause: error,
      },
    );
  }
}

export function resolveMcpAgentTargets(
  target: NativeMcpAgent | "all",
  home: string,
): NativeMcpAgent[] {
  if (target !== "all") return [target];
  return MCP_AGENT_IDS.filter((agent) => adapters[agent].installed(home));
}

export function connectMcpAgents(options: ConnectOptions): McpAgentResult[] {
  const manifest = readManifest(options.configDir);
  const writes: PlannedWrite[] = [];
  const results: McpAgentResult[] = [];

  for (const agent of options.agents) {
    const adapter = adapters[agent];
    if (!adapter.supports(options.spec.transport)) {
      throw unsupportedSseError(agent);
    }

    const paths = adapterWritePaths(adapter, options.home);
    const primaryPath = adapter.path(options.home);
    const key = registrationKey(agent, options.spec.name);
    const managed = manifest.registrations[key];
    const desired = adapter.buildEntry(options.spec);
    const desiredFingerprint = fingerprint(desired);
    let status: McpAgentResult["status"] | undefined;

    for (const path of paths) {
      const config = adapter.parse(path);
      const servers = adapter.getServers(config);
      const existing = servers[options.spec.name];
      assertManagedEntry(existing, managed, agent, options.spec.name);
      const pathStatus =
        existing === undefined
          ? "added"
          : fingerprint(existing) === desiredFingerprint
            ? "unchanged"
            : "updated";
      status = mergeConnectStatus(status, pathStatus);
      if (pathStatus !== "unchanged") {
        servers[options.spec.name] = desired;
        writes.push({
          path,
          original: existsSync(path) ? readFileSync(path, "utf8") : undefined,
          content: adapter.serialize(config),
        });
      }
    }

    const resolvedStatus = status ?? "unchanged";
    results.push({ agent, path: primaryPath, status: resolvedStatus });
    if (resolvedStatus !== "unchanged") {
      manifest.registrations[key] = {
        agent,
        name: options.spec.name,
        serverCode: options.spec.serverCode,
        transport: options.spec.transport,
        endpoint: options.spec.endpoint,
        path: primaryPath,
        fingerprint: desiredFingerprint,
        cliVersion: options.cliVersion,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (writes.length > 0) applyWrites(writes, manifest, options.configDir);
  return results;
}

export function disconnectMcpAgents(options: DisconnectOptions): McpAgentResult[] {
  const manifest = readManifest(options.configDir);
  const writes: PlannedWrite[] = [];
  const results: McpAgentResult[] = [];
  let manifestChanged = false;

  for (const agent of options.agents) {
    const adapter = adapters[agent];
    const primaryPath = adapter.path(options.home);
    const key = registrationKey(agent, options.name);
    const managed = manifest.registrations[key];
    if (!managed) {
      results.push({ agent, path: primaryPath, status: "absent" });
      continue;
    }

    let removed = false;
    let sawExisting = false;
    for (const path of adapterWritePaths(adapter, options.home)) {
      const config = adapter.parse(path);
      const servers = adapter.getServers(config);
      const existing = servers[options.name];
      if (existing === undefined) continue;
      sawExisting = true;
      assertManagedEntry(existing, managed, agent, options.name);
      delete servers[options.name];
      removed = true;
      writes.push({
        path,
        original: readFileSync(path, "utf8"),
        content: adapter.serialize(config),
      });
    }

    delete manifest.registrations[key];
    manifestChanged = true;
    results.push({
      agent,
      path: primaryPath,
      status: sawExisting && removed ? "removed" : "absent",
    });
  }

  if (writes.length > 0 || manifestChanged) {
    applyWrites(writes, manifest, options.configDir);
  }
  return results;
}
