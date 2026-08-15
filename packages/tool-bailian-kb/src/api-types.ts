/** Request/response fields of the three DashScope knowledge endpoints, mirrored from the verified kscli types. */

export interface ServiceListRequest {
  agent_scene: 'chat' | 'search'
  agent_name?: string
  page_number: number
  page_size: number
}

export interface ServiceListRow {
  agent_id?: string
  agent_name?: string
  agent_scene?: string
  agent_status?: string
  pipeline_list?: { pipeline_id?: string; pipeline_name?: string }[]
}

export interface ServiceListResponse {
  code?: string
  message?: string
  data?: { total_count?: number; rows?: ServiceListRow[] }
}

export interface SearchRequest {
  query: string
  agent_id: string
  agent_version?: string
  images?: string[]
}

export interface SearchResponse {
  request_id?: string
  data?: {
    total?: number
    nodes?: { score: number; text: string; metadata?: Record<string, unknown> }[]
  }
}

export interface ChatRequest {
  input: { messages: { role: 'user' | 'assistant'; content: string }[] }
  parameters: { agent_options: { agent_id: string; agent_version?: string } }
  stream: true
}

export interface ChatStreamChunk {
  output?: {
    choices?: {
      message?: { content?: string; extra?: { step_change?: string } }
      finish_reason?: string
    }[]
  }
  request_id?: string
}
