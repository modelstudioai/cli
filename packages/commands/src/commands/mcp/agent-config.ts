import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { BailianError, ExitCode } from "bailian-cli-core";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  backup,
  stripJsonc,
  writeJsonAtomic,
  writeTextAtomic,
} from "../config/agent/writers/utils.ts";

export const MCP_AGENT_IDS = ["codex", "claude-code", "qwen-code", "gemini"] as const;

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
      throw new BailianError(
        `Codex does not support SSE MCP servers; use --transport streamable-http.`,
        ExitCode.USAGE,
      );
    }

    const path = adapter.path(options.home);
    const config = adapter.parse(path);
    const servers = adapter.getServers(config);
    const key = registrationKey(agent, options.spec.name);
    const managed = manifest.registrations[key];
    const existing = servers[options.spec.name];
    assertManagedEntry(existing, managed, agent, options.spec.name);

    const desired = adapter.buildEntry(options.spec);
    const desiredFingerprint = fingerprint(desired);
    const status =
      existing === undefined
        ? "added"
        : fingerprint(existing) === desiredFingerprint
          ? "unchanged"
          : "updated";
    results.push({ agent, path, status });

    if (status !== "unchanged") {
      servers[options.spec.name] = desired;
      writes.push({
        path,
        original: existsSync(path) ? readFileSync(path, "utf8") : undefined,
        content: adapter.serialize(config),
      });
      manifest.registrations[key] = {
        agent,
        name: options.spec.name,
        serverCode: options.spec.serverCode,
        transport: options.spec.transport,
        endpoint: options.spec.endpoint,
        path,
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
    const path = adapter.path(options.home);
    const key = registrationKey(agent, options.name);
    const managed = manifest.registrations[key];
    if (!managed) {
      results.push({ agent, path, status: "absent" });
      continue;
    }

    const config = adapter.parse(path);
    const servers = adapter.getServers(config);
    const existing = servers[options.name];
    if (existing === undefined) {
      delete manifest.registrations[key];
      manifestChanged = true;
      results.push({ agent, path, status: "absent" });
      continue;
    }
    assertManagedEntry(existing, managed, agent, options.name);
    delete servers[options.name];
    const result: McpAgentResult = { agent, path, status: "removed" };
    results.push(result);
    writes.push({
      path,
      original: readFileSync(path, "utf8"),
      content: adapter.serialize(config),
    });
    delete manifest.registrations[key];
    manifestChanged = true;
  }

  if (writes.length > 0 || manifestChanged) {
    applyWrites(writes, manifest, options.configDir);
  }
  return results;
}
