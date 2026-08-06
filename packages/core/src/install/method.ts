import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";

/** How the CLI was installed on this machine. */
export type InstallMethod = "binary" | "npm" | "brew" | "winget" | "unknown";

/** Product that currently ships standalone binary artifacts (`bl` / `bailian`). */
export const BINARY_PRODUCT_CLIENT_NAME = "bailian-cli";

const INSTALL_METHOD_FILE = "install-method";
const VALID_METHODS = new Set<InstallMethod>(["binary", "npm", "brew", "winget", "unknown"]);

export type InstallMethodIdentity = {
  clientName: string;
};

function installMethodPath(clientName?: string): string {
  if (!clientName) return join(getConfigDir(), INSTALL_METHOD_FILE);
  return join(getConfigDir(), `${INSTALL_METHOD_FILE}.${clientName}`);
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

function readInstallMethodFile(path: string): InstallMethod | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return parseInstallMethod(raw.split("\n")[0]);
  } catch {
    return null;
  }
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

/**
 * Read the persisted install method, falling back to detection.
 *
 * When `identity` is provided, prefer `install-method.<clientName>`.
 * Legacy `~/.bailian/install-method` is only consulted for `bailian-cli`
 * so other products (e.g. kscli) are not polluted by a shared binary marker.
 */
export function getInstallMethod(identity?: InstallMethodIdentity): InstallMethod {
  const fromEnv = parseInstallMethod(process.env.BAILIAN_INSTALL_METHOD);
  if (fromEnv) return fromEnv;

  if (identity?.clientName) {
    const productMethod = readInstallMethodFile(installMethodPath(identity.clientName));
    if (productMethod) return productMethod;

    if (identity.clientName === BINARY_PRODUCT_CLIENT_NAME) {
      const legacyMethod = readInstallMethodFile(installMethodPath());
      if (legacyMethod) return legacyMethod;
    }

    return detectInstallMethod();
  }

  const legacyMethod = readInstallMethodFile(installMethodPath());
  if (legacyMethod) return legacyMethod;

  return detectInstallMethod();
}

/**
 * Install method for update / auto-update routing.
 * Only `bailian-cli` may follow the binary channel; other products always use npm
 * even if env or a mistaken marker claims `binary`.
 */
export function getUpdateInstallMethod(identity: {
  clientName: string;
  npmPackage: string;
}): InstallMethod {
  const method = getInstallMethod(identity);
  if (method === "binary" && identity.npmPackage !== BINARY_PRODUCT_CLIENT_NAME) {
    return "npm";
  }
  return method;
}

/**
 * Persist install method under `~/.bailian/install-method.<clientName>` (best-effort).
 * For `bailian-cli`, also write the legacy `install-method` file for older readers.
 */
export function writeInstallMethodSync(
  method: InstallMethod,
  identity: InstallMethodIdentity = { clientName: BINARY_PRODUCT_CLIENT_NAME },
): void {
  try {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(installMethodPath(identity.clientName), `${method}\n`, { mode: 0o600 });
    if (identity.clientName === BINARY_PRODUCT_CLIENT_NAME) {
      writeFileSync(installMethodPath(), `${method}\n`, { mode: 0o600 });
    }
  } catch {
    /* best effort */
  }
}
