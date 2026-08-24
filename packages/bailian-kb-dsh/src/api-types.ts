/** Request/response fields of the DashScope search and chat endpoints. */

/** Retrieval-service scenes; the server requires one per list query. */
export type ServiceScene = "chat" | "search";

export interface ServiceListRequest {
  agent_scene: ServiceScene;
  /** Filter to deployed services (spelling required by the server). */
  agent_status?: "deployed";
  agent_name?: string;
  page_number: number;
  page_size: number;
}

/**
 * One row of the service list.
 *
 * `description` is not included: the listing endpoint does not currently return
 * it, even for services created with a description. Add it here once it starts
 * appearing on the wire.
 *
 * `pipeline_list` is typed but deliberately never consumed: it can omit
 * `pipeline_name` or come back empty, so it cannot serve as a knowledge-base
 * label.
 */
export interface ServiceListRow {
  agent_id?: string;
  agent_name?: string;
  agent_scene?: string;
  agent_status?: string;
  agent_version?: string;
  create_time?: string;
  modify_time?: string;
  pipeline_list?: { pipeline_id?: string; pipeline_name?: string }[];
}

export interface ServiceListResponse {
  code?: string;
  message?: string;
  data?: { total_count?: number; rows?: ServiceListRow[] };
}

export interface SearchRequest {
  query: string;
  agent_id: string;
  agent_version?: string;
  images?: string[];
}

export interface SearchResponse {
  request_id?: string;
  data?: {
    total?: number;
    nodes?: { score: number; text: string; metadata?: Record<string, unknown> }[];
  };
}

export interface ChatRequest {
  input: { messages: { role: "user" | "assistant"; content: string }[] };
  parameters: { agent_options: { agent_id: string; agent_version?: string } };
  stream: true;
}

export interface ChatStreamChunk {
  output?: {
    choices?: {
      message?: { content?: string; extra?: { step_change?: string } };
      finish_reason?: string;
    }[];
  };
  request_id?: string;
}
