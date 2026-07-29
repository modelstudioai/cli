import { basename, dirname, join } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  readdirSync,
} from "fs";
import { BailianError, ExitCode } from "bailian-cli-core";

/** Parameters shared by every agent writer. */
export interface WriteParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** OpenClaw model entry context window (tokens). */
  contextWindow?: number;
  /** Codex provider wire protocol: "responses" or "chat". */
  wireApi?: string;
}

/** What a writer reports back after configuring an agent. */
export interface WriteSummary {
  paths: string[];
  nextStep: string;
  /** Non-fatal issues the command should surface to the user. */
  warnings?: string[];
}

/** An agent configuration writer: a human label plus a `write` that applies it. */
export interface AgentDef {
  label: string;
  /** Config files this writer manages, in write order. Used by `--restore`. */
  configPaths(): string[];
  write(params: WriteParams): WriteSummary;
}

/**
 * Strip JSONC syntax (line / block comments and trailing commas) so the result
 * parses with `JSON.parse`. String contents are preserved verbatim.
 */
export function stripJsonc(text: string): string {
  // Pass 1 — drop comments (string contents preserved verbatim).
  let uncommented = "";
  let index = 0;
  let inString = false;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      uncommented += char;
      if (char === "\\") {
        uncommented += next ?? "";
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      uncommented += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    uncommented += char;
    index += 1;
  }

  // Pass 2 — drop trailing commas (a comma whose next non-whitespace char
  // closes an object/array). Runs after comment removal so a trailing comment
  // cannot hide the closing bracket.
  let output = "";
  index = 0;
  inString = false;
  while (index < uncommented.length) {
    const char = uncommented[index];
    if (inString) {
      output += char;
      if (char === "\\") {
        output += uncommented[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') inString = true;
    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < uncommented.length && /\s/.test(uncommented[lookahead])) lookahead += 1;
      if (uncommented[lookahead] === "}" || uncommented[lookahead] === "]") {
        index += 1;
        continue;
      }
    }
    output += char;
    index += 1;
  }
  return output;
}

/** Read a JSON object file, returning `{}` when missing or unparseable. */
export function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Like {@link readJson}, but tolerates JSONC (comments / trailing commas). */
export function readJsonc(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(stripJsonc(readFileSync(path, "utf-8"))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Atomically write `data` as pretty JSON with owner-only permissions. */
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

/** Atomically write raw text with owner-only permissions. */
export function writeTextAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}

/** Copy an existing file to a timestamped `.bak.<epoch>` sibling. No-op if absent. */
export function backup(path: string): void {
  if (!existsSync(path)) return;
  const timestamp = Math.floor(Date.now() / 1000);
  copyFileSync(path, `${path}.bak.${timestamp}`);
}

/** Locate the newest `.bak.<epoch>` sibling created by {@link backup}, if any. */
export function findLatestBackup(path: string): string | undefined {
  const dir = dirname(path);
  if (!existsSync(dir)) return undefined;
  const prefix = basename(path) + ".bak.";
  let latest: { name: string; timestamp: number } | undefined;
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith(prefix)) continue;
    const suffix = entry.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const timestamp = Number(suffix);
    if (!latest || timestamp > latest.timestamp) latest = { name: entry, timestamp };
  }
  return latest ? join(dir, latest.name) : undefined;
}

/** Outcome of restoring one config file: which backup was used, if any. */
export interface RestoreResult {
  path: string;
  backupPath?: string;
}

/**
 * Restore `path` from its newest `.bak.<epoch>` backup (atomically, keeping the
 * backup in place so the operation stays repeatable). No-op when no backup exists.
 */
export function restoreLatestBackup(path: string): RestoreResult {
  const backupPath = findLatestBackup(path);
  if (!backupPath) return { path };
  const tmp = path + ".tmp";
  copyFileSync(backupPath, tmp);
  renameSync(tmp, path);
  return { path, backupPath };
}

/** Whether a base URL targets the Anthropic-messages compatible endpoint. */
export function isAnthropicEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("/apps/anthropic");
}

/**
 * Claude Code speaks Anthropic Messages only. Users often paste the OpenAI
 * compatible-mode URL; rewrite that to `/apps/anthropic` when possible, otherwise
 * fail with a clear USAGE error before writing a broken config.
 */
export function resolveClaudeCodeBaseUrl(baseUrl: string): {
  url: string;
  rewrittenFrom?: string;
} {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (isAnthropicEndpoint(trimmed)) {
    return { url: trimmed };
  }

  if (trimmed.includes("/compatible-mode")) {
    const rewritten = trimmed.replace(/\/compatible-mode(?:\/v\d+)?/, "/apps/anthropic");
    return { url: rewritten, rewrittenFrom: baseUrl.trim() };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    const isDashScopeHost =
      host.includes("dashscope") ||
      host.includes("maas.aliyuncs.com") ||
      host.includes("token-plan");
    if (isDashScopeHost && (parsed.pathname === "/" || parsed.pathname === "")) {
      return {
        url: `${parsed.origin}/apps/anthropic`,
        rewrittenFrom: baseUrl.trim(),
      };
    }
  } catch {
    // Fall through to the USAGE error below.
  }

  throw new BailianError(
    `Claude Code requires an Anthropic-compatible base URL, got "${baseUrl}".`,
    ExitCode.USAGE,
    "Use a URL ending in /apps/anthropic (not /compatible-mode/v1). Example: https://dashscope.aliyuncs.com/apps/anthropic",
  );
}

/**
 * Convert a Model Studio region id into a Token Plan base URL, used in place of
 * --base-url. Produces the OpenAI-compatible endpoint; the claude-code writer
 * rewrites it to /apps/anthropic on its own, and the other writers consume the
 * compatible-mode URL directly.
 */
export function resolveRegionBaseUrl(region: string): string {
  const normalized = region.trim();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new BailianError(
      `Invalid --region "${region}".`,
      ExitCode.USAGE,
      "Use a Model Studio region id, e.g. cn-beijing or ap-southeast-1.",
    );
  }
  return `https://token-plan.${normalized}.maas.aliyuncs.com/compatible-mode/v1`;
}
