// ---- Chat (OpenAI Compatible) ----

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatMessageContent[];
}

export type ChatMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format?: string } }
  | { type: "audio_url"; audio_url: { url: string } }
  | { type: "video"; video: string[] }
  | { type: "video_url"; video_url: { url: string } };

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResponseFormat {
  type: "json_object" | "json_schema";
  json_schema?: {
    name: string;
    schema?: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ChatTool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  enable_thinking?: boolean;
  thinking_budget?: number;
  modalities?: string[];
  audio?: { voice: string; format?: string };
  stream_options?: { include_usage?: boolean };
  response_format?: ChatResponseFormat;
}

export interface ChatChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---- Streaming (OpenAI SSE) ----

export interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    reasoning_content?: string | null;
    audio?: { data?: string; id?: string; expires_at?: number };
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: "function";
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason: string | null;
}

export interface StreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---- Image (DashScope) ----

export interface DashScopeImageRequest {
  model: string;
  input:
    | {
        messages: Array<{
          role: "user";
          content: Array<{ text?: string; image?: string }>;
        }>;
      }
    | {
        prompt: string;
        /** Required by image2image models such as wan2.5-i2i-preview. */
        images?: string[];
        negative_prompt?: string;
      }
    | {
        /** Required by wanx*-imageedit models. */
        function: string;
        prompt: string;
        base_image_url: string;
        mask_image_url?: string;
      };
  parameters?: {
    size?: string;
    n?: number;
    seed?: number;
    prompt_extend?: boolean;
    watermark?: boolean;
    negative_prompt?: string;
    strength?: number;
  };
}

export interface DashScopeImageSyncResponse {
  output: {
    choices: Array<{
      finish_reason: string;
      message: {
        role: "assistant";
        content: Array<{ image: string; type: "image" }>;
      };
    }>;
    finished: boolean;
  };
  usage: {
    image_count: number;
  };
  request_id: string;
}

// ---- Video (DashScope) ----

export interface DashScopeVideoRequest {
  model: string;
  input: {
    prompt: string;
    negative_prompt?: string;
    img_url?: string;
    media?: Array<{
      type: "image" | "video" | "first_frame" | "last_frame" | "driving_audio" | "first_clip";
      url: string;
    }>;
  };
  parameters?: {
    resolution?: string;
    ratio?: string;
    duration?: number;
    prompt_extend?: boolean;
    watermark?: boolean;
    seed?: number;
  };
}

export interface DashScopeVideoRefRequest {
  model: string;
  input: {
    prompt: string;
    media: Array<{
      type: "reference_image" | "reference_video";
      url: string;
      reference_voice?: string;
    }>;
  };
  parameters?: {
    resolution?: string;
    ratio?: string;
    duration?: number;
    prompt_extend?: boolean;
    watermark?: boolean;
    seed?: number;
  };
}

export interface DashScopeVideoEditRequest {
  model: string;
  input: {
    prompt?: string;
    negative_prompt?: string;
    media: Array<{
      type: "video" | "reference_image";
      url: string;
    }>;
  };
  parameters?: {
    resolution?: string;
    ratio?: string;
    duration?: number;
    audio_setting?: "auto" | "origin";
    prompt_extend?: boolean;
    watermark?: boolean;
    seed?: number;
  };
}

// ---- Application (Agent / Workflow) ----

export interface AppCompletionRequest {
  input: {
    prompt?: string;
    session_id?: string;
    image_list?: string[];
    file_ids?: string[];
    biz_params?: Record<string, unknown>;
  };
  parameters?: {
    has_thoughts?: boolean;
    incremental_output?: boolean;
    rag_options?: {
      pipeline_ids?: string[];
      knowledge_base_ids?: string[];
    };
    memory_id?: string;
  };
  debug?: Record<string, unknown>;
}

export interface AppCompletionResponse {
  output: {
    text: string;
    finish_reason: string;
    session_id: string;
    thoughts?: Array<{
      thought: string;
      action_type: string;
      action_name: string;
      action: string;
      action_input_stream: string;
      action_input: string;
      response: string;
      observation: string;
    }>;
    doc_references?: Array<{
      index_id: string;
      title: string;
      doc_id: string;
      doc_name: string;
      text: string;
      images?: string[];
    }>;
  };
  usage: {
    models: Array<{
      model_id: string;
      input_tokens: number;
      output_tokens: number;
    }>;
  };
  request_id: string;
}

export interface AppStreamChunk {
  output: {
    text: string;
    finish_reason: string;
    session_id: string;
    thoughts?: AppCompletionResponse["output"]["thoughts"];
    doc_references?: AppCompletionResponse["output"]["doc_references"];
  };
  usage?: AppCompletionResponse["usage"];
  request_id: string;
}

// ---- Memory (DashScope v2) ----

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MemoryAddRequest {
  user_id: string;
  messages?: MemoryMessage[];
  custom_content?: string;
  profile_schema?: string;
  memory_library_id?: string;
}

export interface MemoryAddResponse {
  request_id: string;
  memory_ids?: string[];
}

export interface MemorySearchRequest {
  user_id: string;
  messages?: MemoryMessage[];
  query?: string;
  top_k?: number;
  memory_library_id?: string;
}

export interface MemoryNode {
  memory_node_id: string;
  content: string;
  user_id?: string;
  meta_data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MemorySearchResponse {
  request_id: string;
  memory_nodes: MemoryNode[];
}

export interface MemoryNodeListResponse {
  request_id: string;
  memory_nodes: MemoryNode[];
  total?: number;
  page_num?: number;
  page_size?: number;
}

export interface MemoryNodeUpdateRequest {
  user_id: string;
  custom_content: string;
  /** 非默认记忆库时必填（与控制台记忆库 ID 一致） */
  memory_library_id?: string;
}

// ---- Memory Profile (DashScope v2) ----

export interface ProfileAttribute {
  name: string;
  description: string;
  value?: string;
}

export interface ProfileSchemaCreateRequest {
  name: string;
  description?: string;
  attributes: ProfileAttribute[];
}

export interface ProfileSchemaCreateResponse {
  request_id: string;
  profile_schema_id: string;
}

export interface UserProfileResponse {
  request_id: string;
  profile: {
    schema_id: string;
    user_id: string;
    attributes: ProfileAttribute[];
  };
}

// ---- Knowledge Retrieve (DashScope protocol — snake_case) ----

export interface DashScopeKnowledgeRetrieveRequest {
  index_id: string;
  query: string;
  search_filters?: Array<Record<string, unknown>>;
  dense_similarity_top_k?: number;
  sparse_similarity_top_k?: number;
  enable_reranking?: boolean;
  rerank_top_n?: number;
  rerank?: Array<{
    model_name: string;
    rerank_mode?: string;
    rerank_instruct?: string;
  }>;
}

export interface DashScopeKnowledgeRetrieveResponse {
  request_id: string;
  data: {
    total: number;
    nodes: Array<{
      text: string;
      score: number;
      metadata: Record<string, unknown>;
    }>;
  };
}

// ---- Knowledge Search (新版 RAG 检索 API, agent_id-based) ----

export interface KnowledgeSearchRequest {
  query: string;
  agent_id: string;
  /** "beta" targets the debug draft; a numeric version targets that published version; defaults to the latest published version */
  agent_version?: string;
  images?: string[];
}

export interface KnowledgeSearchResponse {
  code: string;
  status_code: number;
  request_id: string;
  data: {
    total: number;
    cost_time: number;
    nodes: Array<{
      score: number;
      text: string;
      metadata: {
        content?: string;
        title?: string;
        doc_id?: string;
        doc_name?: string;
        doc_url?: string;
        pipeline_id?: string;
        workspace_id?: string;
        page_number?: number;
        image_url?: string;
        _knowledge_type?: string;
        _citation_index?: number;
        _score?: number;
      };
    }>;
  };
}

// ---- Knowledge Chat (新版 RAG 问答 SSE API, agent_id-based) ----

export type KnowledgeChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface KnowledgeChatMessage {
  role: "user" | "assistant";
  content: string | KnowledgeChatContentPart[];
}

export interface KnowledgeChatRequest {
  input: {
    messages: KnowledgeChatMessage[];
  };
  parameters: {
    agent_options: {
      agent_id: string;
      /** "beta" targets the debug draft; a numeric version targets that published version; defaults to the latest published version */
      agent_version?: string;
      user?: {
        user_id?: string;
        workspace_id?: string;
      };
    };
  };
  stream: boolean;
}

export interface KnowledgeChatStreamChunk {
  output: {
    choices: Array<{
      message: {
        role: string;
        content: string;
        tool_calls?: unknown[];
        extra?: {
          group?: string;
          step_change?: string;
          step?: string;
        };
      };
      finish_reason: string;
    }>;
  };
  code: string;
  message: string;
  request_id: string;
}

// ---- Speech Synthesis / TTS (DashScope) ----

export interface DashScopeTTSRequest {
  model: string;
  input: {
    text: string;
    voice?: string;
    format?: "mp3" | "pcm" | "wav" | "opus";
    sample_rate?: number;
    volume?: number;
    rate?: number;
    pitch?: number;
    seed?: number;
    language_hints?: string[];
    instruction?: string;
    enable_ssml?: boolean;
  };
}

export interface DashScopeTTSResponse {
  output: {
    audio: { url: string; expires_at?: string };
    finish_reason?: string;
  };
  usage?: Record<string, unknown>;
  request_id: string;
}

export interface DashScopeTTSStreamChunk {
  output: {
    audio: { data?: string; url?: string; expires_at?: string };
    finish_reason?: string;
  };
  usage?: Record<string, unknown>;
  request_id?: string;
}

// ---- Speech Recognition / ASR (DashScope) ----

export interface DashScopeASRRequest {
  model: string;
  input: {
    file_urls?: string[];
    file_url?: string;
  };
  parameters?: {
    channel_id?: number[];
    /** Classic async models (fun-asr / paraformer / qwen-audio filetrans, etc.) */
    language_hints?: string[];
    /** qwen3-asr-flash-filetrans* uses singular `language` */
    language?: string;
    diarization_enabled?: boolean;
    speaker_count?: number;
    vocabulary_id?: string;
  };
}

export interface DashScopeASRTranscriptionItem {
  file_url?: string;
  transcription_url?: string;
  subtask_status?: string;
  code?: string;
  message?: string;
}

export interface DashScopeASRTaskResult {
  output: {
    task_id: string;
    task_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
    /** Multi-file async results (fun-asr / paraformer / qwen-audio filetrans, etc.) */
    results?: DashScopeASRTranscriptionItem[];
    /** Singular result returned by qwen3-asr-flash-filetrans* on success */
    result?: {
      transcription_url?: string;
    };
    task_metrics?: {
      TOTAL: number;
      SUCCEEDED: number;
      FAILED: number;
    };
    code?: string;
    message?: string;
  };
  usage?: Record<string, unknown>;
  request_id: string;
}

// ---- Async Task (DashScope) ----

export interface DashScopeAsyncResponse {
  output: {
    task_id: string;
    task_status: string;
  };
  request_id: string;
}

export interface DashScopeTaskResponse {
  output: {
    task_id: string;
    task_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
    finished?: boolean;
    task_metrics?: {
      TOTAL?: number;
      SUCCEEDED?: number;
      FAILED?: number;
    };
    // Image generation (wan2.x) returns choices
    choices?: Array<{
      finish_reason: string;
      message: {
        role: "assistant";
        content: Array<{ image: string; type: "image" }>;
      };
    }>;
    // Some models return results array
    results?: Array<{ url: string }>;
    // Video generation returns video_url
    video_url?: string;
    submit_time?: string;
    scheduled_time?: string;
    end_time?: string;
    code?: string;
    message?: string;
  };
  usage?: Record<string, unknown>;
  request_id: string;
}
