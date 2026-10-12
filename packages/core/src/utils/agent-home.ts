import { homedir } from "os";
import { join } from "path";

/**
 * Resolve the Hermes Agent home directory the same way Hermes itself does
 * (hermes-agent `hermes_constants.get_hermes_home` → `get_process_hermes_home`):
 *
 * 1. `HERMES_HOME` env var (trimmed, leading `~` expanded), when set;
 * 2. otherwise the platform-native default:
 *    - Windows: `%LOCALAPPDATA%\hermes` (falling back to `~/AppData/Local/hermes`);
 *    - Linux/macOS: `~/.hermes`.
 *
 * Every code path that touches Hermes config — the writer, the inventory probe,
 * detail extraction and skill roots — must resolve through this helper.
 * Hard-coding `~/.hermes` silently writes config to a place Hermes never reads
 * when `HERMES_HOME` is customized or on native Windows, so the command reports
 * success while the model/provider change never takes effect.
 *
 * `home` overrides the user home used for the platform fallback (defaults to
 * `homedir()`), so callers and tests can inject a temporary home.
 */
export function getHermesHome(home: string = homedir()): string {
  const fromEnv = process.env.HERMES_HOME?.trim();
  if (fromEnv) return expandUserHome(fromEnv);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    return localAppData ? join(localAppData, "hermes") : join(home, "AppData", "Local", "hermes");
  }
  return join(home, ".hermes");
}

/** Expand a leading `~` (bare, or `~/` / `~\`) into the user's home directory. */
function expandUserHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}
