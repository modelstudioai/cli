import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_ENV_KEYS,
  SKIP_HOST_AGENTS_ENV,
  buildSources,
  type ConfigFile,
} from "bailian-cli-core";
import { ISO_ROOT_ENV, ISO_ROOT_KEY } from "./iso-root-keys.ts";

export { ISO_ROOT_ENV, ISO_ROOT_KEY };

/**
 * Console fields copied into isolated config when seedCredentials is on.
 * DashScope / OpenAPI credentials stay in `.env` / process env.
 */
const SEED_KEYS = [
  "access_token",
  "workspace_id",
  "console_site",
  "console_region",
  "console_switch_agent",
] as const satisfies readonly (keyof ConfigFile)[];

/** Isolation-critical keys: ignore undefined/empty so isolation is not undone. */
const CRITICAL_ENVS = new Set([
  "HOME",
  "USERPROFILE",
  "BAILIAN_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  SKIP_HOST_AGENTS_ENV,
]);

/** Create this run's isolation parent (globalSetup once). Teardown must delete the returned path. */
export function createIsolationSessionRoot(): string {
  const sessionRoot = mkdtempSync(join(tmpdir(), "bl-e2e-session-"));
  process.env[ISO_ROOT_ENV] = sessionRoot;
  return sessionRoot;
}

/** Temp parent: `BL_ISO_ROOT` from globalSetup, else `os.tmpdir()`. */
export function getIsolationSessionRoot(): string {
  const fromEnv = process.env[ISO_ROOT_ENV]?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return tmpdir();
}

/** Delete the given session root (idempotent). Teardown must pass its closed-over path. */
export function cleanupIsolationSessionRootAt(sessionRoot: string): void {
  if (!sessionRoot) return;
  if (process.env[ISO_ROOT_ENV] === sessionRoot) {
    delete process.env[ISO_ROOT_ENV];
  }
  rmSync(sessionRoot, { recursive: true, force: true });
}

function mkIsolationTemp(prefix: string): string {
  return mkdtempSync(join(getIsolationSessionRoot(), prefix));
}

export { AGENT_ENV_KEYS, SKIP_HOST_AGENTS_ENV };

export interface IsolatedHomeHandle {
  /** Fake HOME root */
  home: string;
  /** Matching BAILIAN_CONFIG_DIR */
  configDir: string;
  /** Restore process.env and remove the temp directory */
  restore: () => void;
}

export interface WithIsolatedHomeOptions {
  /**
   * When true, copy console fields (e.g. access_token) from the host config.
   * Default false. DashScope / OpenAPI credentials stay in env.
   */
  seedCredentials?: boolean;
}

/** Read console fields from the host config (call before changing BAILIAN_CONFIG_DIR). */
function readConsoleSeed(): Partial<ConfigFile> {
  try {
    const file = buildSources({}).file;
    const seed: Partial<ConfigFile> = {};
    for (const key of SEED_KEYS) {
      const value = file[key];
      if (value !== undefined) {
        (seed as Record<string, unknown>)[key] = value;
      }
    }
    return seed;
  } catch {
    return {};
  }
}

/** Write isolated config: force en-US, no output preference; optionally seed console fields. */
function writeIsolatedConfig(configDir: string, seedCredentials: boolean): void {
  mkdirSync(configDir, { recursive: true });
  const body: ConfigFile = {
    language: "en-US",
    ...(seedCredentials ? readConsoleSeed() : {}),
  };
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function nonEmptyEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

/**
 * Normalize caller overrides:
 * - Critical keys: drop undefined/empty so HOME/config isolation is not undone
 * - Other keys: keep undefined as "delete inherited value" (e.g. clear DASHSCOPE_API_KEY)
 * - Other keys: keep empty strings as-is
 */
function sanitizeOverrides(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (CRITICAL_ENVS.has(key)) {
      if (value === undefined || value.length === 0) continue;
      cleaned[key] = value;
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

/** Apply overrides; undefined deletes the key so children do not inherit it. */
function assignEnvOverrides(env: NodeJS.ProcessEnv, overrides: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

/**
 * Switch this process to a temp HOME/config and disable host Agent detect paths.
 * Shared by skills/advisor/agent-writer unit tests; do not invent local inFakeHome helpers.
 */
export function enterIsolatedHome(options: WithIsolatedHomeOptions = {}): IsolatedHomeHandle {
  const seedCredentials = options.seedCredentials === true;
  const saved: Record<string, string | undefined> = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    BAILIAN_CONFIG_DIR: process.env.BAILIAN_CONFIG_DIR,
    [SKIP_HOST_AGENTS_ENV]: process.env[SKIP_HOST_AGENTS_ENV],
  };
  for (const key of AGENT_ENV_KEYS) {
    saved[key] = process.env[key];
  }

  const root = mkIsolationTemp("home-");
  mkdirSync(join(root, "home"), { recursive: true });
  // realpath: align with process.cwd() /private/var prefix on macOS
  const home = realpathSync(join(root, "home"));
  const configDir = join(home, ".bailian");
  writeIsolatedConfig(configDir, seedCredentials);

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.BAILIAN_CONFIG_DIR = configDir;
  process.env[SKIP_HOST_AGENTS_ENV] = "1";
  for (const key of AGENT_ENV_KEYS) {
    delete process.env[key];
  }

  return {
    home,
    configDir,
    restore: () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Async helper with automatic restore. */
export async function withIsolatedHome(
  fn: (home: string, configDir: string) => Promise<void>,
  options?: WithIsolatedHomeOptions,
): Promise<void> {
  const handle = enterIsolatedHome(options);
  try {
    await fn(handle.home, handle.configDir);
  } finally {
    handle.restore();
  }
}

/** Sync helper with automatic restore. */
export function withIsolatedHomeSync(
  fn: (home: string, configDir: string) => void,
  options?: WithIsolatedHomeOptions,
): void {
  const handle = enterIsolatedHome(options);
  try {
    fn(handle.home, handle.configDir);
  } finally {
    handle.restore();
  }
}

export interface BuildIsolatedCliEnvOptions {
  /**
   * Highest-priority env overrides.
   * Non-empty `BAILIAN_CONFIG_DIR` is reused (no new isolated config).
   * Critical keys: undefined/empty are ignored so isolation stays intact;
   * other keys: undefined deletes inherited credentials from the child env.
   */
  overrides?: NodeJS.ProcessEnv;
  /**
   * When true, copy console fields from the host config into the isolated config.
   * Default false. DashScope / OpenAPI credentials stay in env.
   */
  seedCredentials?: boolean;
}

export interface IsolatedCliEnv {
  env: NodeJS.ProcessEnv;
  /** Remove temp dirs created by this call; caller-owned paths are left alone. */
  dispose: () => void;
}

/**
 * Build an isolated env for a CLI child process.
 * Uses the caller's HOME or a temp HOME; rewrites XDG/Agent overrides under that HOME;
 * disables host detect dirs. When `BAILIAN_CONFIG_DIR` is omitted:
 * - owned/empty HOME → write `$HOME/.bailian`
 * - caller HOME already has config.json → never overwrite; use an owned temp config dir
 * `DASHSCOPE_API_KEY` and similar env vars are kept from `process.env`.
 */
export function buildIsolatedCliEnv(options: BuildIsolatedCliEnvOptions = {}): IsolatedCliEnv {
  const overrides = sanitizeOverrides(options.overrides ?? {});
  const seedCredentials = options.seedCredentials === true;
  const env: NodeJS.ProcessEnv = { ...process.env };

  for (const key of AGENT_ENV_KEYS) {
    if (!(key in overrides)) delete env[key];
  }

  const explicitConfigDir = nonEmptyEnv(overrides.BAILIAN_CONFIG_DIR);
  const explicitHome = nonEmptyEnv(overrides.HOME) ?? nonEmptyEnv(overrides.USERPROFILE);

  let createdHomeRoot: string | undefined;
  let createdConfigRoot: string | undefined;
  let home: string;
  if (explicitHome) {
    home = explicitHome;
    mkdirSync(home, { recursive: true });
  } else {
    createdHomeRoot = mkIsolationTemp("iso-");
    mkdirSync(join(createdHomeRoot, "home"), { recursive: true });
    home = realpathSync(join(createdHomeRoot, "home"));
  }

  env.HOME = home;
  env.USERPROFILE = home;
  if (!("XDG_CONFIG_HOME" in overrides)) {
    env.XDG_CONFIG_HOME = join(home, ".config");
  }

  if (!explicitConfigDir) {
    const homeConfigDir = join(home, ".bailian");
    const homeConfigFile = join(homeConfigDir, "config.json");
    const ownsHome = createdHomeRoot !== undefined;
    if (ownsHome || !existsSync(homeConfigFile)) {
      writeIsolatedConfig(homeConfigDir, seedCredentials);
      env.BAILIAN_CONFIG_DIR = homeConfigDir;
    } else {
      // Caller HOME already has config: do not overwrite; use an owned temp dir
      createdConfigRoot = mkIsolationTemp("cfg-");
      writeIsolatedConfig(createdConfigRoot, seedCredentials);
      env.BAILIAN_CONFIG_DIR = createdConfigRoot;
    }
  }

  if (!(SKIP_HOST_AGENTS_ENV in overrides)) {
    env[SKIP_HOST_AGENTS_ENV] = "1";
  }

  assignEnvOverrides(env, overrides);
  return {
    env,
    dispose: () => {
      if (createdHomeRoot) {
        rmSync(createdHomeRoot, { recursive: true, force: true });
        createdHomeRoot = undefined;
      }
      if (createdConfigRoot) {
        rmSync(createdConfigRoot, { recursive: true, force: true });
        createdConfigRoot = undefined;
      }
    },
  };
}
