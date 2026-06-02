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
}

export function getPluginsDir(): string {
  if (process.env.BAILIAN_PLUGINS_DIR) return process.env.BAILIAN_PLUGINS_DIR;
  return join(getConfigDir(), "plugins");
}

export function getPluginsManifestPath(): string {
  return join(getPluginsDir(), "package.json");
}
