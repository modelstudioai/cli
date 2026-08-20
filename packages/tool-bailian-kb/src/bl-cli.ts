/**
 * Host-side bridge to the locally installed `bl` CLI (bailian-cli). The CLI's
 * credential file (`~/.bailian/config.json`) is its documented "output": the
 * console browser login (`bl auth login --console`) validates the api key the
 * console issues and persists it there in plain JSON — no CLI command ever
 * echoes the value back (auth status / config show both mask), so reading the
 * file is the only way to obtain it programmatically.
 */

import { spawn } from 'node:child_process'
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

/** Outcome of asking the host to start a console browser login. */
export type ConsoleLoginStart = 'started' | 'already-running' | 'not-found' | 'failed'

/** The in-flight login child, if any: one browser flow at a time. */
let loginChild: ReturnType<typeof spawn> | undefined

/**
 * Start `bl auth login --console` on the host: opens the Bailian console
 * login page in the host's default browser; on completion the CLI persists
 * the issued api key and workspace id to `~/.bailian/config.json` (the flow
 * requests a key only when none is stored yet). Fire-and-forget: the child
 * keeps running after this resolves — callers re-read the credential file
 * on their next fill attempt.
 * @returns whether the flow started, was already running, or the CLI is absent.
 */
export function startConsoleLogin(): Promise<ConsoleLoginStart> {
  if (loginChild !== undefined) return Promise.resolve('already-running')
  return new Promise((resolve) => {
    const child = spawn('bl', ['auth', 'login', '--console'], { stdio: 'ignore' })
    loginChild = child
    child.once('spawn', () => { resolve('started') })
    child.once('error', (err: NodeJS.ErrnoException) => {
      loginChild = undefined
      resolve(err.code === 'ENOENT' ? 'not-found' : 'failed')
    })
    child.once('exit', () => { loginChild = undefined })
  })
}
