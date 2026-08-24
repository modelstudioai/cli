/**
 * On-disk cache of the workspace's deployed retrieval services.
 *
 * Landing spot: `${DSH_HOME:-~/.dsh}/cache/bailian-kb/services-<workspaceId>.json`.
 * Per-workspace files are required, not cosmetic: an api key only reaches its own
 * workspace (cross-pairs return `Endpoint.AccessDenied`), and the panel's
 * "autofill" button exists to switch accounts, so one shared file would blend
 * services from different accounts.
 *
 * Why not `ctx.storage`: the storage hub is absent from every shipped agent
 * preset, so `inject(['storage'])` may never fire for a third-party plugin, and
 * the JSON backend's on-disk location is decided by its own `root` config — the
 * plugin could not tell anyone where the data went. Why not `settings.yaml`: that
 * document is the user's, and it hot-reloads, so writing machine-refreshed data
 * there both fights the user for the file and republishes configuration for no
 * reason.
 *
 * Every read is best-effort and total: a missing, malformed, foreign, or
 * stale-schema file reads as a miss. Callers run inside `agent/pre-step`, where a
 * throw fails the user's step.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { KbClient } from './client.js'
import { listServices, type ServiceEntry } from './services.js'

/** Bumped whenever the stored shape changes; a mismatch reads as a miss (no migration). */
const CACHE_VERSION = 1

/** Refresh interval. Evaluated per `agent/pre-step`, so a short window genuinely takes effect. */
export const CACHE_TTL_MS = 30 * 60 * 1000

/**
 * Refresh interval applied when the cached list is EMPTY.
 *
 * An empty list is almost never a settled fact — it is the intermediate state of
 * a workspace being set up. Caching that negative result for the full TTL breaks
 * the standard first-run path: configure the plugin against a fresh workspace (0
 * services) → create a knowledge base and a service → and then wait up to half an
 * hour before the catalog appears. Re-asking every minute while the answer is
 * "nothing yet" has a bounded cost and removes that trap.
 */
export const EMPTY_CACHE_TTL_MS = 60 * 1000

/** The stored document. */
export interface ServiceCacheDocument {
  version: number
  /** Epoch millis of the fetch that produced `entries`. */
  fetchedAt: number
  /** Guards against reading a file written for another account or region. */
  workspaceId: string
  endpointHost: string
  entries: ServiceEntry[]
  total: number
  truncated: boolean
}

/** Resolve the harness home the same way `settings-file` does. */
function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

/**
 * Build the cache path for one workspace.
 * @param workspaceId - the resolved Bailian workspace id.
 * @param home - override for tests; defaults to `$DSH_HOME` or `~/.dsh`.
 * @returns the absolute file path.
 */
export function serviceCachePath(workspaceId: string, home: string = dshHome()): string {
  return join(home, 'cache', 'bailian-kb', `services-${workspaceId}.json`)
}

/**
 * Read a cache document, validating it belongs to this workspace and schema.
 * @param path - the cache file path.
 * @param workspaceId - the workspace the caller is serving.
 * @param endpointHost - the host the caller is serving.
 * @returns the document, or undefined for any miss (absent, malformed, foreign, or wrong version).
 */
export function readServiceCache(
  path: string,
  workspaceId: string,
  endpointHost: string,
): ServiceCacheDocument | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (_unreadableOrMalformed) {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const doc = parsed as Partial<ServiceCacheDocument>
  if (doc.version !== CACHE_VERSION) return undefined
  if (doc.workspaceId !== workspaceId || doc.endpointHost !== endpointHost) return undefined
  if (typeof doc.fetchedAt !== 'number' || !Array.isArray(doc.entries)) return undefined
  return {
    version: CACHE_VERSION,
    fetchedAt: doc.fetchedAt,
    workspaceId,
    endpointHost,
    entries: doc.entries,
    total: typeof doc.total === 'number' ? doc.total : doc.entries.length,
    truncated: doc.truncated === true,
  }
}

/**
 * Publish a cache document atomically: a reader either sees the previous file or
 * the complete new one, never a half-written mix.
 * @param path - the cache file path.
 * @param doc - the document to store.
 */
export function writeServiceCache(path: string, doc: ServiceCacheDocument): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(doc, undefined, 2)}\n`, { mode: 0o600 })
  renameSync(temp, path)
}

/** What the settings panel shows about the cache; see {@link ServiceCache.status}. */
export interface ServiceCacheStatus {
  workspaceId: string
  /** Epoch millis of the last successful fetch; absent when nothing is cached. */
  fetchedAt?: number
  searchCount: number
  chatCount: number
  /** Server-reported total, which exceeds the counts above when the fetch was capped. */
  total: number
  truncated: boolean
  stale: boolean
}

export interface ServiceCacheOptions {
  client: KbClient
  /** Resolves the current workspace id; a failure means "not configured yet". */
  resolveWorkspaceId: () => Promise<string>
  endpointHost: string
  /** Reports refresh failures without escalating them. */
  warn: (message: string) => void
  /** Test seams. */
  home?: string
  now?: () => number
}

/**
 * The service cache: a synchronous in-memory view over the on-disk document,
 * plus a deduplicated background refresh.
 */
export class ServiceCache {
  /** Last document read or written; undefined until one is available. */
  private document: ServiceCacheDocument | undefined
  /** The in-flight refresh, if any. One per instance: `pre-step` asks on every model request. */
  private inFlight: Promise<void> | undefined
  /** Workspace of {@link document}, so a workspace switch invalidates in memory too. */
  private loadedFor: string | undefined

  constructor(private readonly opts: ServiceCacheOptions) {}

  private get now(): number {
    return (this.opts.now ?? Date.now)()
  }

  /**
   * The cached entries for a workspace, loading the file on first use.
   * Synchronous and total — safe to call from `agent/pre-step`.
   * @param workspaceId - the workspace being served.
   * @returns the document, or undefined when nothing usable is cached.
   */
  peek(workspaceId: string): ServiceCacheDocument | undefined {
    if (this.loadedFor !== workspaceId) {
      this.document = readServiceCache(
        serviceCachePath(workspaceId, this.opts.home ?? dshHome()),
        workspaceId,
        this.opts.endpointHost,
      )
      this.loadedFor = workspaceId
    }
    return this.document
  }

  /**
   * Whether the cached document is missing or older than its TTL.
   * An empty list expires on the much shorter {@link EMPTY_CACHE_TTL_MS}.
   * @param workspaceId - the workspace being served.
   * @returns true when a refresh is due.
   */
  isStale(workspaceId: string): boolean {
    const doc = this.peek(workspaceId)
    if (doc === undefined) return true
    const ttl = doc.entries.length === 0 ? EMPTY_CACHE_TTL_MS : CACHE_TTL_MS
    return this.now - doc.fetchedAt >= ttl
  }

  /** Drop the in-memory view and force the next `peek` to re-read from disk. */
  invalidate(): void {
    this.document = undefined
    this.loadedFor = undefined
  }

  /**
   * A diagnostic snapshot for the settings panel.
   *
   * The panel exists because this cache's staleness is otherwise invisible: a
   * developer whose agent silently stops retrieving cannot tell an empty
   * workspace from a stale list without reading the JSON file. `fetchedAt` plus
   * the per-scene counts answer that in one glance.
   * @param workspaceId - the workspace being served.
   * @returns the snapshot; `fetchedAt` is undefined when nothing is cached.
   */
  status(workspaceId: string): ServiceCacheStatus {
    const doc = this.peek(workspaceId)
    if (doc === undefined) {
      return { workspaceId, searchCount: 0, chatCount: 0, total: 0, truncated: false, stale: true }
    }
    return {
      workspaceId,
      fetchedAt: doc.fetchedAt,
      searchCount: doc.entries.filter(entry => entry.scene === 'search').length,
      chatCount: doc.entries.filter(entry => entry.scene === 'chat').length,
      total: doc.total,
      truncated: doc.truncated,
      stale: this.isStale(workspaceId),
    }
  }

  /**
   * The cached entries of one scene, most recently modified first.
   * Backs the panel's service picker, which exists so a default service can be
   * chosen by name instead of by pasting a 36-character hex id.
   * @param workspaceId - the workspace being served.
   * @param scene - `search` or `chat`.
   * @returns the entries, newest first.
   */
  entriesFor(workspaceId: string, scene: ServiceEntry['scene']): ServiceEntry[] {
    const doc = this.peek(workspaceId)
    if (doc === undefined) return []
    return doc.entries
      .filter(entry => entry.scene === scene)
      .sort((left, right) => (right.modify_time ?? '').localeCompare(left.modify_time ?? ''))
  }

  /**
   * Fetch and store the current service list.
   * Never rejects: failures are warned and leave the previous document in place.
   * Concurrent calls share one request.
   * @returns a promise resolving once the attempt finishes.
   */
  async refresh(): Promise<void> {
    // Without this guard `pre-step` would start a fetch on every model request
    // while the first is still outstanding.
    this.inFlight ??= this.runRefresh().finally(() => {
      this.inFlight = undefined
    })
    return await this.inFlight
  }

  private async runRefresh(): Promise<void> {
    try {
      const workspaceId = await this.opts.resolveWorkspaceId()
      const list = await listServices(this.opts.client)
      // Both scenes failing means the fetch produced nothing; keep the old file.
      if (list.failedScenes.length === 2) {
        this.opts.warn('bailian-kb service cache not refreshed: both scene queries failed')
        return
      }
      if (list.failedScenes.length > 0) {
        this.opts.warn(`bailian-kb service cache refreshed without scene(s): ${list.failedScenes.join(', ')}`)
      }
      const doc: ServiceCacheDocument = {
        version: CACHE_VERSION,
        fetchedAt: this.now,
        workspaceId,
        endpointHost: this.opts.endpointHost,
        entries: list.entries,
        total: list.total,
        truncated: list.truncated,
      }
      writeServiceCache(serviceCachePath(workspaceId, this.opts.home ?? dshHome()), doc)
      this.document = doc
      this.loadedFor = workspaceId
    } catch (failed) {
      this.opts.warn(`bailian-kb service cache refresh failed: ${String(failed)}`)
    }
  }
}
