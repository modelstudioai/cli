import {
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type RagAgentConfig,
  type RagAgentGetResponse,
  type RagAgentMutationResponse,
} from "bailian-cli-core";

export interface CreateServiceRequest {
  agent_name: string;
  agent_scene: string;
  agent_desc?: string;
  agent_config?: RagAgentConfig;
}

export interface UpdateServiceRequest {
  agent_id: string;
  agent_name?: string;
  agent_desc?: string;
  agent_version?: string;
  agent_version_desc?: string;
  agent_config?: RagAgentConfig;
}

export function createKnowledgeService(
  client: Client,
  workspaceId: string,
  body: CreateServiceRequest,
): Promise<RagAgentMutationResponse> {
  return client.requestJson({
    path: ragEndpoint(workspaceId, RAG_PATHS.agentCreate),
    method: "POST",
    body,
  });
}

export function getKnowledgeService(
  client: Client,
  workspaceId: string,
  agentId: string,
  agentVersion?: string,
): Promise<RagAgentGetResponse> {
  return client.requestJson({
    path: ragEndpoint(workspaceId, RAG_PATHS.agentGet),
    method: "POST",
    body: { agent_id: agentId, ...(agentVersion ? { agent_version: agentVersion } : {}) },
  });
}

export function updateKnowledgeService(
  client: Client,
  workspaceId: string,
  body: UpdateServiceRequest,
): Promise<RagAgentMutationResponse> {
  return client.requestJson({
    path: ragEndpoint(workspaceId, RAG_PATHS.agentUpdate),
    method: "POST",
    body,
  });
}
