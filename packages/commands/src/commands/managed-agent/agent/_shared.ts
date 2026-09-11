import type { CloudAgent } from "@openagentpack/sdk";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  INCLUDE_ARCHIVED_FLAG,
  SEARCH_FLAGS,
} from "../_engine/api-helpers.ts";

export const AGENT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const AGENT_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const AGENT_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  agentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Agent ID", "zh-CN": "Agent ID" },
  },
  agentVersion: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Specific agent version", "zh-CN": "指定 Agent 版本" },
  },
} as const;

export const AGENT_VERSIONS_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  agentId: AGENT_GET_FLAGS.agentId,
};

export function agentRows(agents: CloudAgent[]): string[][] {
  return agents.map((agent) => [
    agent.id,
    displayValue(agent.name),
    displayValue(agent.version),
    displayValue(agent.type),
    displayValue(agent.updated_at),
  ]);
}
