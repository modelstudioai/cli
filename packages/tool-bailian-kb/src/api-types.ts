/** Request/response fields of the DashScope search and chat endpoints, mirrored from the verified kscli types. */

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
