/** Request/response fields of the DashScope search and chat endpoints, mirrored from the verified bl CLI types. */

/** Retrieval-service scenes; the server requires one per list query. */
export type ServiceScene = "chat" | "search";

export interface ServiceListRequest {
  agent_scene: ServiceScene;
  /**
   * Verified to be honored by the server, and to mean "deployed or edited"
   * (matching the CLI's documented `--status deployed（含 edited）`). The
   * spellings `status` and `agent_status_list` are silently ignored.
   */
  agent_status?: "deployed";
  agent_name?: string;
  page_number: number;
  page_size: number;
}

/**
 * One row of the service list, mirrored from a verified live response
 * (2026-08-23). The response carries NO description field — confirmed against
 * two workspaces, including a name-filtered single-row query — even though
 * `service create --description` accepts one. `description` is therefore absent
 * here until the backend adds it; when it does, **name the field from the real
 * response** rather than guessing.
 *
 * `pipeline_list` is typed but deliberately never consumed: it frequently omits
 * `pipeline_name` (leaving an opaque id) and is sometimes empty outright, so it
 * cannot serve as a knowledge-base label.
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
