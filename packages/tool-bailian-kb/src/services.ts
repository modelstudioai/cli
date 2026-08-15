/** Retrieval-service discovery: per-scene queries merged into one model-facing list; pagination stays internal. */

import type { ServiceListResponse } from './api-types.js'
import type { KbClient } from './client.js'
import { KB_PATHS } from './endpoints.js'

/** Server page-size maximum; one page per scene covers ordinary workspaces. */
const MAX_PAGE_SIZE = 100

export interface ServiceEntry {
  agent_id: string
  name: string
  scene: string
  status: string
  knowledge_bases: string[]
}

export interface ServiceList {
  services: ServiceEntry[]
  total: number
  /** True when some scene reported more rows than one max page returned. */
  truncated: boolean
}

export interface ListServicesQuery {
  scene?: 'chat' | 'search'
  nameFilter?: string
}

/**
 * List retrieval/Q&A services. An omitted scene fans out to both scenes and merges.
 * @param client - the shared knowledge API client.
 * @param query - optional scene and fuzzy name filter.
 * @returns merged entries, the server-reported total, and the truncation flag.
 */
export async function listServices(client: KbClient, query: ListServicesQuery): Promise<ServiceList> {
  const scenes: ('chat' | 'search')[] = query.scene ? [query.scene] : ['chat', 'search']
  const services: ServiceEntry[] = []
  let total = 0
  for (const scene of scenes) {
    const res = await client.postJson<ServiceListResponse>(KB_PATHS.serviceList, {
      agent_scene: scene,
      ...(query.nameFilter ? { agent_name: query.nameFilter } : {}),
      page_number: 1,
      page_size: MAX_PAGE_SIZE,
    })
    total += res.data?.total_count ?? 0
    for (const row of res.data?.rows ?? []) {
      services.push({
        agent_id: row.agent_id ?? '',
        name: row.agent_name ?? '',
        scene: row.agent_scene ?? scene,
        status: row.agent_status ?? '',
        knowledge_bases: (row.pipeline_list ?? []).map(p => p.pipeline_name ?? p.pipeline_id ?? '').filter(Boolean),
      })
    }
  }
  return { services, total, truncated: total > services.length }
}
