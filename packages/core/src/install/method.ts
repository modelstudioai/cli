import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";

/** How the CLI was installed on this machine. */
export type InstallMethod = "binary" | "npm" | "brew" | "winget" | "unknown";

const INSTALL_METHOD_FILE = "install-method";
const VALID_METHODS = new Set<InstallMethod>(["binary", "npm", "brew", "winget", "unknown"]);

function installMethodPath(): string {
  return join(getConfigDir(), INSTALL_METHOD_FILE);
}

/**
 * True when running a Bun-compiled standalone executable
 * rather than via the Node/npm entry shim.
 *
 * Binary entrypoints set `BAILIAN_COMPILED=1` before other code runs.
 */
export function isCompiledBinary(): boolean {
  if (process.env.BAILIAN_COMPILED === "1") return true;
  const execPath = process.execPath.replaceAll("\\", "/");
  if (/(^|\/)node(\.exe)?$/i.test(execPath) || execPath.includes("/node/")) return false;
  if (/(^|\/)bun(\.exe)?$/i.test(execPath) || execPath.includes("/.bun/")) return false;
  return /\/(bl|bailian)(\.exe)?$/i.test(execPath);
}

function parseInstallMethod(raw: string | undefined): InstallMethod | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase() as InstallMethod;
  return VALID_METHODS.has(value) ? value : null;
}

/** Infer install method when no marker file / env override is present. */
export function detectInstallMethod(): InstallMethod {
  const fromEnv = parseInstallMethod(process.env.BAILIAN_INSTALL_METHOD);
  if (fromEnv) return fromEnv;

  if (isCompiledBinary()) {
    const execPath = process.execPath.replaceAll("\\", "/");
    if (execPath.includes("/Cellar/") || execPath.includes("/homebrew/")) return "brew";
    return "binary";
  }

  return "npm";
}

/** Read the persisted install method, falling back to detection. */
export function getInstallMethod(): InstallMethod {
  const fromEnv = parseInstallMethod(process.env.BAILIAN_INSTALL_METHOD);
  if (fromEnv) return fromEnv;

  try {
    const raw = readFileSync(installMethodPath(), "utf-8");
    const parsed = parseInstallMethod(raw.split("\n")[0]);
    if (parsed) return parsed;
  } catch {
    /* missing or unreadable */
  }

  return detectInstallMethod();
}

/** Persist install method under `~/.bailian/install-method` (best-effort). */
export function writeInstallMethodSync(method: InstallMethod): void {
  try {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(installMethodPath(), `${method}\n`, { mode: 0o600 });
  } catch {
    /* best effort */
  }
}
