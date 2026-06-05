import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR_NAME = ".bailian";

export function getConfigDir(): string {
  if (process.env.BAILIAN_CONFIG_DIR) return process.env.BAILIAN_CONFIG_DIR;
  return join(homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

export async function ensureConfigDir(): Promise<void> {
  const dir = getConfigDir();
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

export function getPluginsDir(): string {
  if (process.env.BAILIAN_PLUGINS_DIR) return process.env.BAILIAN_PLUGINS_DIR;
  return join(getConfigDir(), "plugins");
}

export function getPluginsManifestPath(): string {
  return join(getPluginsDir(), "package.json");
}
