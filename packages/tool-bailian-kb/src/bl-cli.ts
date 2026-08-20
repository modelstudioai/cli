/**
 * Host-side bridge to the locally installed `bl` CLI (bailian-cli). The CLI's
 * credential file (`~/.bailian/config.json`) is its documented "output": the
 * console browser login (`bl auth login --console`) validates the api key the
 * console issues and persists it there in plain JSON — no CLI command ever
 * echoes the value back (auth status / config show both mask), so reading the
 * file is the only way to obtain it programmatically.
 *
 * Starting a login is NOT done through the CLI: it hard-codes
 * `needApiKey: !hasApiKey` and so refuses to have a fresh key issued once any
 * key is stored. See `console-login.ts`, which speaks the callback protocol
 * directly and always asks for one.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The two values this plugin can adopt from the bl CLI credential file. */
export interface BlCliConfig {
  /** DashScope api key (`api_key`, top-level default profile). */
  apiKey?: string
  /** Bailian workspace id (`workspace_id`), present when the console login callback carried one. */
  workspaceId?: string
}

/** Default location of the bl CLI credential file (default profile at top level). */
export function blCliConfigPath(): string {
  return join(homedir(), '.bailian', 'config.json')
}

/**
 * Read the api key and workspace id from the bl CLI credential file.
 * Best-effort: a missing, unreadable, or malformed file reads as empty —
 * callers treat that the same as "the CLI has not logged in yet".
 * @param configPath - override for tests; defaults to `~/.bailian/config.json`.
 * @returns the values found; fields are absent rather than blank.
 */
export function readBlCliConfig(configPath = blCliConfigPath()): BlCliConfig {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    const apiKey = typeof record.api_key === 'string' && record.api_key.trim() !== '' ? record.api_key.trim() : undefined
    const workspaceId = typeof record.workspace_id === 'string' && record.workspace_id.trim() !== '' ? record.workspace_id.trim() : undefined
    return {
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    }
  } catch (_unreadable) {
    return {}
  }
}
