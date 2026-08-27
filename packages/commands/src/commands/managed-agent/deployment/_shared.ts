import type { DeploymentInfo, DeploymentRunInfo, ProjectRuntimeContext } from "@openagentpack/sdk";
import { UserError } from "@openagentpack/sdk";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  INCLUDE_ARCHIVED_FLAG,
  SEARCH_FLAGS,
} from "../_engine/api-helpers.ts";

export const DEPLOYMENT_ID_FLAG = {
  deploymentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Deployment ID", "zh-CN": "Deployment ID" },
  },
} as const;

const DEPLOYMENT_LIST_FILTER_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by agent ID", "zh-CN": "按 Agent ID 筛选" },
  },
  status: {
    type: "string",
    valueHint: "<status>",
    choices: ["active", "paused"] as const,
    description: { "en-US": "Filter by deployment status", "zh-CN": "按 Deployment 状态筛选" },
  },
  ...INCLUDE_ARCHIVED_FLAG,
  createdAtGte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or after this timestamp",
      "zh-CN": "创建时间不早于该时间戳",
    },
  },
  createdAtLte: {
    type: "string",
    valueHint: "<timestamp>",
    description: {
      "en-US": "Created at or before this timestamp",
      "zh-CN": "创建时间不晚于该时间戳",
    },
  },
} as const;

export const DEPLOYMENT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  ...DEPLOYMENT_LIST_FILTER_FLAGS,
};

export const DEPLOYMENT_GET_FLAGS = { ...API_TARGET_FLAGS, ...DEPLOYMENT_ID_FLAG };

export const DEPLOYMENT_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  query: SEARCH_FLAGS.query,
  ...DEPLOYMENT_LIST_FILTER_FLAGS,
};

export const DEPLOYMENT_RUNS_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...DEPLOYMENT_ID_FLAG,
  ...CURSOR_FLAGS,
};

export const DEPLOYMENT_RUNS_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  runId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Deployment run ID", "zh-CN": "Deployment Run ID" },
  },
} as const;

export const DEPLOYMENT_ACTION_TARGET_FLAGS = {
  ...API_TARGET_FLAGS,
  deployment: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Logical deployment name in agents.yaml/state",
      "zh-CN": "agents.yaml/State 中的逻辑 Deployment 名称",
    },
  },
  deploymentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Direct deployment ID", "zh-CN": "直接指定 Deployment ID" },
  },
} as const;

export const DEPLOYMENT_RUN_ACTION_FLAGS = {
  ...DEPLOYMENT_ACTION_TARGET_FLAGS,
  yes: {
    type: "switch",
    description: { "en-US": "Confirm deployment run", "zh-CN": "确认运行 Deployment" },
  },
} as const;

export function validateDeploymentActionTarget(flags: {
  deployment?: string;
  deploymentId?: string;
}): string | undefined {
  if (Boolean(flags.deployment) === Boolean(flags.deploymentId)) {
    return "Provide exactly one of --deployment or --deployment-id.";
  }
  return undefined;
}

export function deploymentRows(deployments: DeploymentInfo[]): string[][] {
  return deployments.map((deployment) => [
    displayValue(deployment.id),
    deployment.status,
    displayValue(deployment.schedule?.expression),
    displayValue(deployment.paused_reason?.type),
  ]);
}

export function deploymentRunRows(runs: DeploymentRunInfo[]): string[][] {
  return runs.map((run) => [
    run.id,
    displayValue(run.deployment_id),
    displayValue(run.session_id),
    displayValue(run.status),
    displayValue(run.created_at),
  ]);
}

export async function resolveDeploymentTarget(
  runtime: ProjectRuntimeContext,
  options: { provider?: string; deployment?: string; deploymentId?: string },
): Promise<string> {
  if (options.deploymentId) return options.deploymentId;
  const configuredProviders = Array.from(runtime.providers.keys());
  const provider =
    options.provider ??
    (configuredProviders.length === 1
      ? configuredProviders[0]
      : (() => {
          throw new UserError("Multiple providers configured. Use --provider to specify one.");
        })());
  const state = runtime.state.getResource({
    provider,
    type: "deployment",
    name: options.deployment!,
  });
  if (!state?.remote_id) {
    throw new UserError(
      `Deployment '${options.deployment}' is not tracked in state. Use --deployment-id or run managed-agent apply/import first.`,
    );
  }
  return state.remote_id;
}
