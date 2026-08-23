/**
 * Retrieval-service discovery for the plugin's internal cache. Not a model tool:
 * see `KB_PATHS.serviceList`.
 *
 * Two verified server facts shape this module:
 * - `page_size` is capped at 100 regardless of what is requested, so a workspace
 *   with hundreds of services needs many round trips. Test/CI workspaces reach
 *   the high hundreds (913 observed), which is pure noise for routing, so this
 *   module stops after {@link MAX_PAGES} and reports the shortfall instead of
 *   faithfully paging through it.
 * - `agent_status: 'deployed'` is honored and means "deployed or edited". Only
 *   those are callable by the default agent version, so drafts never reach the
 *   model.
 */

import type { ServiceListResponse, ServiceScene } from './api-types.js'
import type { KbClient } from './client.js'
import { KB_PATHS } from './endpoints.js'

/** Server page-size maximum; larger requests are silently clamped to this. */
const PAGE_SIZE = 100

/** Pages fetched per scene before reporting truncation (200 rows is far past the useful range). */
const MAX_PAGES = 2

/** One deployed retrieval or Q&A service, reduced to the fields that inform routing. */
export interface ServiceEntry {
  agent_id: string
  agent_name: string
  scene: ServiceScene
  /** `deployed` or `edited` — both are callable by the default version. */
  status: string
  /** Last modification timestamp; the only signal for "which of these is in use". */
  modify_time?: string
  /** Absent until the backend adds a description to the list response. */
  description?: string
}

export interface ServiceList {
  entries: ServiceEntry[]
  /** Server-reported total across the queried scenes, including rows never fetched. */
  total: number
  /** True when a scene reported more rows than {@link MAX_PAGES} pages returned. */
  truncated: boolean
  /** Scenes whose query failed; a partial list stays usable. */
  failedScenes: ServiceScene[]
}

const SCENES: readonly ServiceScene[] = ['search', 'chat']

/**
 * Fetch the deployed services of one scene, stopping at the page cap.
 * @param client - the shared knowledge API client.
 * @param scene - `search` or `chat`.
 * @returns the scene's entries, its server-reported total, and whether rows were left unfetched.
 */
async function listScene(
  client: KbClient,
  scene: ServiceScene,
): Promise<{ entries: ServiceEntry[]; total: number; truncated: boolean }> {
  const entries: ServiceEntry[] = []
  let total = 0
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await client.postJson<ServiceListResponse>(KB_PATHS.serviceList, {
      agent_scene: scene,
      agent_status: 'deployed',
      page_number: page,
      page_size: PAGE_SIZE,
    })
    total = res.data?.total_count ?? total
    const rows = res.data?.rows ?? []
    for (const row of rows) {
      const agentId = row.agent_id ?? ''
      // A row without an id cannot be called, so it has no reason to exist here.
      if (agentId === '') continue
      entries.push({
        agent_id: agentId,
        agent_name: row.agent_name ?? '',
        scene,
        status: row.agent_status ?? '',
        ...(typeof row.modify_time === 'string' ? { modify_time: row.modify_time } : {}),
      })
    }
    // A short page is the last page; the server has nothing further to give.
    if (rows.length < PAGE_SIZE) return { entries, total, truncated: false }
  }
  return { entries, total, truncated: total > entries.length }
}

/**
 * List the deployed services of both scenes.
 * A scene that fails is recorded and skipped rather than failing the whole
 * refresh: half a list still routes better than none.
 * @param client - the shared knowledge API client.
 * @returns merged entries plus totals, truncation, and per-scene failures.
 */
export async function listServices(client: KbClient): Promise<ServiceList> {
  const entries: ServiceEntry[] = []
  const failedScenes: ServiceScene[] = []
  let total = 0
  let truncated = false
  for (const scene of SCENES) {
    try {
      const result = await listScene(client, scene)
      entries.push(...result.entries)
      total += result.total
      truncated = truncated || result.truncated
    } catch (_sceneFailed) {
      failedScenes.push(scene)
    }
  }
  return { entries, total, truncated, failedScenes }
}
