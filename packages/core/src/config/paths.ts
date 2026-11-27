import { homedir } from "os";
import { basename, join } from "path";
import type { PreControlPlane } from "./control-plane.ts";

const CONFIG_DIR_NAME = ".bailian";
const PRE_CONFIG_FILE_NAME = "control-pre.json";

export function getConfigDir(): string {
  if (process.env.BAILIAN_CONFIG_DIR) return process.env.BAILIAN_CONFIG_DIR;
  return join(homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(preControlPlane?: PreControlPlane): string {
  const dir = getConfigDir();
  return preControlPlane ? join(dir, "pre", PRE_CONFIG_FILE_NAME) : join(dir, "config.json");
}

/** The reserved basename also identifies a pre-release file passed by explicit path. */
export function isPreConfigPath(path: string): boolean {
  return basename(path) === PRE_CONFIG_FILE_NAME;
}

export function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

export async function ensureConfigDir(dir = getConfigDir()): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // `mkdir`'s `mode` only applies to directories it creates (and is masked by
  // umask). A config dir created by an older build or another tool may still be
  // world/group-readable while holding cleartext credentials, so tighten it
  // explicitly. Best-effort: never let a chmod failure break the command.
  try {
    await fs.chmod(dir, 0o700);
  } catch {
    /* best effort */
  }
}
