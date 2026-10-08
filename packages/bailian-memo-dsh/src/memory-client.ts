/**
 * Narrow Memory API client used by the dsh plugin (no bl CLI shell-out).
 */

import { createHash } from "node:crypto";
import {
  memoryAddAsyncPath,
  memoryEndpoint,
  memoryEventPath,
  memoryListPath,
  memoryNodePath,
  memorySearchPath,
  profileSchemaPath,
  userProfilePath,
  userProfileValuesPath,
  DEFAULT_ENDPOINT_HOST,
} from "./endpoints.js";

const ERROR_BODY_LIMIT = 500;

export class MemoryApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MemoryApiError";
  }
}

export interface MemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MemorySearchHit {
  memory_node_id?: string;
  content?: string;
  score?: number;
  memory_type?: string;
  meta_data?: Record<string, unknown>;
}

export interface MemorySearchResponse {
  request_id?: string;
  memory_nodes?: MemorySearchHit[];
}

export interface MemoryAddAsyncResponse {
  request_id?: string;
  event_id?: string;
  events?: Array<{ resource_type?: string; status?: string }>;
}

export interface MemoryEventItem {
  resource_type?: string;
  status?: string;
  error?: string;
  message?: string;
  result?: Array<{
    event?: "ADD" | "UPDATE" | "DELETE";
    memory_type?: string;
    memory_node_id?: string;
    name?: string;
    content?: string;
    old_content?: string;
  }>;
}

export interface MemoryEventsResponse {
  request_id?: string;
  events?: MemoryEventItem[];
}

export interface ProfileAttributeDef {
  name: string;
  description?: string;
  default_value?: string | null;
}

export interface ProfileSchemaCreateResponse {
  request_id?: string;
  profile_schema_id?: string;
  id?: string;
}

export interface UserProfileValueItem {
  item_id?: number;
  status?: string;
  value?: string;
}

export interface UserProfileAttribute {
  id: string;
  name: string;
  description?: string;
  value?: string;
  value_items?: UserProfileValueItem[];
}

export interface UserProfileResponse {
  request_id?: string;
  profile?: {
    schema_name?: string;
    schema_description?: string;
    attributes?: UserProfileAttribute[];
  };
}

export interface MemoryClientOptions {
  resolveWorkspaceId: () => Promise<string>;
  resolveApiKey: () => Promise<string>;
  /** Optional host override resolved per request. */
  resolveEndpointHost?: () => string | undefined;
  fetchImpl?: typeof fetch;
}

export interface MemorySearchInput {
  userId: string;
  query?: string;
  messages?: MemoryMessage[];
  topK?: number;
  minScore?: number;
  memoryTypes?: Array<"observation" | "skill">;
  planVersion?: "pro" | "lite";
}

interface HashedValue {
  length: number;
  sha256: string;
}

function hashedValue(value: string): HashedValue {
  return {
    length: value.length,
    sha256: createHash("sha256").update(value).digest("hex").slice(0, 12),
  };
}

function searchBody(input: MemorySearchInput): Record<string, unknown> {
  const body: Record<string, unknown> = { user_id: input.userId };
  if (input.messages) body.messages = input.messages;
  else if (input.query) {
    body.messages = [{ role: "user", content: input.query }];
  }
  if (input.topK !== undefined) body.top_k = input.topK;
  if (input.minScore !== undefined) body.min_score = input.minScore;
  if (input.memoryTypes) body.memory_types = input.memoryTypes;
  if (input.planVersion) body.plan_version = input.planVersion;
  return body;
}

export class MemoryClient {
  constructor(private readonly opts: MemoryClientOptions) {}

  private host(): string {
    return this.opts.resolveEndpointHost?.() ?? DEFAULT_ENDPOINT_HOST;
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const [apiKey, workspaceId] = await Promise.all([
      this.opts.resolveApiKey(),
      this.opts.resolveWorkspaceId(),
    ]);
    const url = new URL(memoryEndpoint(workspaceId, path, this.host()));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") url.searchParams.set(key, value);
      }
    }
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const raw = (await response.text().catch(() => "")).slice(0, ERROR_BODY_LIMIT);
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string; code?: string };
        if (parsed.message) {
          detail = parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message;
        }
      } catch {
        /* keep bounded raw text */
      }
      throw new MemoryApiError(detail || `HTTP ${response.status}`, response.status);
    }
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResponse> {
    return this.requestJson("POST", memorySearchPath(), searchBody(input));
  }

  async describeSearchScope(input: MemorySearchInput): Promise<{
    endpointHost: string;
    workspaceId: HashedValue;
    userId: HashedValue;
    messages: Array<{ role: string; content: HashedValue }>;
    topK: number | null;
    minScore: number | null;
    memoryTypes: string[] | null;
    planVersion: string | null;
    memoryLibraryId: null;
    projectIds: null;
  }> {
    const workspaceId = await this.opts.resolveWorkspaceId();
    const body = searchBody(input);
    const messages = (body.messages as MemoryMessage[] | undefined) ?? [];
    return {
      endpointHost: this.host(),
      workspaceId: hashedValue(workspaceId),
      userId: hashedValue(input.userId),
      messages: messages.map((message) => ({
        role: message.role,
        content: hashedValue(message.content),
      })),
      topK: input.topK ?? null,
      minScore: input.minScore ?? null,
      memoryTypes: input.memoryTypes ?? null,
      planVersion: input.planVersion ?? null,
      memoryLibraryId: null,
      projectIds: null,
    };
  }

  async list(input: {
    userId: string;
    pageSize?: number;
  }): Promise<{ request_id?: string; memory_nodes?: MemorySearchHit[] }> {
    return this.requestJson("GET", memoryListPath(), undefined, {
      user_id: input.userId,
      page_size: String(input.pageSize ?? 1),
    });
  }

  async addAsync(input: {
    userId: string;
    messages?: MemoryMessage[];
    content?: string;
    profileSchema?: string;
    metaData?: Record<string, unknown>;
  }): Promise<MemoryAddAsyncResponse> {
    const body: Record<string, unknown> = { user_id: input.userId };
    if (input.messages) body.messages = input.messages;
    if (input.content) body.custom_content = input.content;
    if (input.profileSchema) body.profile_schema = input.profileSchema;
    if (input.metaData) body.meta_data = input.metaData;
    return this.requestJson("POST", memoryAddAsyncPath(), body);
  }

  async getEvent(eventId: string, signal?: AbortSignal): Promise<MemoryEventsResponse> {
    return this.requestJson("GET", memoryEventPath(eventId), undefined, undefined, signal);
  }

  async deleteNode(nodeId: string): Promise<{ request_id?: string }> {
    return this.requestJson("DELETE", memoryNodePath(nodeId));
  }

  async createProfileSchema(input: {
    name: string;
    description?: string;
    attributes: ProfileAttributeDef[];
    extractScene?: "efficient" | "complete";
    planVersion?: "pro" | "lite";
  }): Promise<ProfileSchemaCreateResponse> {
    return this.requestJson("POST", profileSchemaPath(), {
      name: input.name,
      description: input.description,
      attributes: input.attributes,
      extract_scene: input.extractScene ?? "efficient",
      plan_version: input.planVersion ?? "pro",
    });
  }

  async getProfile(input: {
    schemaId: string;
    userId: string;
    needDetail?: boolean;
  }): Promise<UserProfileResponse> {
    return this.requestJson("GET", userProfilePath(input.schemaId), undefined, {
      user_id: input.userId,
      need_detail: input.needDetail ? "true" : undefined,
    });
  }

  async patchProfileValue(input: {
    schemaId: string;
    entityId: string;
    attributeId: string;
    opType: "add" | "update" | "delete";
    itemId?: number;
    value?: string;
  }): Promise<{ request_id?: string }> {
    return this.requestJson("PATCH", userProfileValuesPath(input.schemaId), {
      entity_id: input.entityId,
      attribute_id: input.attributeId,
      op_type: input.opType,
      item_id: input.itemId,
      value: input.value,
    });
  }
}
