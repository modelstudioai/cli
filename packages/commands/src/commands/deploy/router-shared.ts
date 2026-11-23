import {
  BailianError,
  ExitCode,
  type CreateModelRouterRequest,
  type Deployment,
  type FlagsDef,
  type ModelRoutingConfig,
  type UpdateModelRouterRequest,
} from "bailian-cli-core";

import { DEPLOYED_MODEL_FLAG, validatePagination } from "./query-shared.ts";

const ROUTER_CONFIG_FLAG_DEFINITIONS = {
  routeVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US": "Model-routing version returned by the versions command",
      "zh-CN": "版本命令返回的模型路由版本",
    },
  },
  strategy: {
    type: "string",
    valueHint: "<EFFECT_FIRST|COST_FIRST>",
    choices: ["EFFECT_FIRST", "COST_FIRST"] as const,
    description: {
      "en-US": "Routing optimization strategy",
      "zh-CN": "路由优化策略",
    },
  },
  candidates: {
    type: "string",
    valueHint: "<model-id,...>",
    description: {
      "en-US": "Candidate model IDs, comma-separated",
      "zh-CN": "候选模型 ID，逗号分隔",
    },
  },
} satisfies FlagsDef;

export const ROUTER_CONFIG_FLAGS = {
  routeVersion: { ...ROUTER_CONFIG_FLAG_DEFINITIONS.routeVersion, required: true },
  strategy: { ...ROUTER_CONFIG_FLAG_DEFINITIONS.strategy, required: true },
  candidates: { ...ROUTER_CONFIG_FLAG_DEFINITIONS.candidates, required: true },
} satisfies FlagsDef;

export const ROUTER_RESOURCE_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
} satisfies FlagsDef;

export const ROUTER_UPDATE_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  ...ROUTER_CONFIG_FLAG_DEFINITIONS,
} satisfies FlagsDef;

export function validateRouterResource(flags: { deployedModel?: string }): string | undefined {
  if (flags.deployedModel !== undefined && !flags.deployedModel.trim()) {
    return "--deployed-model must not be empty. / --deployed-model 不能为空。";
  }
  return undefined;
}

export function validateRouterConfig(flags: {
  deployedModel?: string;
  routeVersion: string;
  candidates: string;
}): string | undefined {
  const resourceError = validateRouterResource(flags);
  if (resourceError) return resourceError;
  if (!flags.routeVersion.trim()) {
    return "--route-version must not be empty. / --route-version 不能为空。";
  }
  if (splitCandidates(flags.candidates).some((candidate) => !candidate)) {
    return "--candidates must not contain empty values. / --candidates 不能包含空值。";
  }
  return undefined;
}

export function validateRouterUpdate(flags: {
  deployedModel?: string;
  routeVersion?: string;
  strategy?: "EFFECT_FIRST" | "COST_FIRST";
  candidates?: string;
}): string | undefined {
  const resourceError = validateRouterResource(flags);
  if (resourceError) return resourceError;
  if (
    flags.routeVersion === undefined &&
    flags.strategy === undefined &&
    flags.candidates === undefined
  ) {
    return "Provide at least one of --route-version, --strategy or --candidates. / 请至少提供 --route-version、--strategy 或 --candidates 之一。";
  }
  if (flags.routeVersion !== undefined && !flags.routeVersion.trim()) {
    return "--route-version must not be empty. / --route-version 不能为空。";
  }
  if (
    flags.candidates !== undefined &&
    splitCandidates(flags.candidates).some((candidate) => !candidate)
  ) {
    return "--candidates must not contain empty values. / --candidates 不能包含空值。";
  }
  return undefined;
}

export function hasCompleteRouterUpdate(flags: {
  routeVersion?: string;
  strategy?: "EFFECT_FIRST" | "COST_FIRST";
  candidates?: string;
}): flags is {
  routeVersion: string;
  strategy: "EFFECT_FIRST" | "COST_FIRST";
  candidates: string;
} {
  return (
    flags.routeVersion !== undefined &&
    flags.strategy !== undefined &&
    flags.candidates !== undefined
  );
}

function splitCandidates(candidates: string): string[] {
  return candidates.split(",").map((candidate) => candidate.trim());
}

export function validateRouterName(name: string): string | undefined {
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 64) {
    return "--name must contain 1–64 characters. / --name 长度必须为 1–64 个字符。";
  }
  if (!/^[A-Za-z0-9-]+$/.test(trimmedName)) {
    return "--name may contain only letters, digits and hyphens. / --name 只能包含字母、数字和连字符。";
  }
  return undefined;
}

export function validateRouterVersionsPagination(flags: {
  page?: number;
  pageSize?: number;
}): string | undefined {
  if (flags.page !== undefined && (!Number.isSafeInteger(flags.page) || flags.page < 1)) {
    return "--page must be a positive integer. / --page 必须是正整数。";
  }
  if (
    flags.pageSize !== undefined &&
    (!Number.isSafeInteger(flags.pageSize) || flags.pageSize < 1 || flags.pageSize > 1000)
  ) {
    return "--page-size must be an integer from 1 to 1000. / --page-size 必须是 1–1000 的整数。";
  }
  return undefined;
}

export function validateRouterListPagination(flags: {
  page?: number;
  pageSize?: number;
}): string | undefined {
  return validatePagination(flags);
}

export function buildRoutingConfig(flags: {
  routeVersion: string;
  strategy: "EFFECT_FIRST" | "COST_FIRST";
  candidates: string;
}): ModelRoutingConfig {
  const candidateModelIds = [...new Set(splitCandidates(flags.candidates))];
  return {
    route_model_version: flags.routeVersion.trim(),
    strategy: flags.strategy,
    candidate_model_ids: candidateModelIds,
  };
}

export function buildCreateModelRouterRequest(flags: {
  name: string;
  routeVersion: string;
  strategy: "EFFECT_FIRST" | "COST_FIRST";
  candidates: string;
}): CreateModelRouterRequest {
  return {
    name: flags.name.trim(),
    plan: "mr",
    charge_type: "post_paid",
    routing_config: buildRoutingConfig(flags),
  };
}

export function buildUpdateModelRouterRequest(
  flags: {
    routeVersion?: string;
    strategy?: "EFFECT_FIRST" | "COST_FIRST";
    candidates?: string;
  },
  currentConfig?: ModelRoutingConfig,
): UpdateModelRouterRequest {
  const mergedConfig: Record<string, unknown> = { ...currentConfig };
  if (flags.routeVersion !== undefined) {
    mergedConfig.route_model_version = flags.routeVersion.trim();
  }
  if (flags.strategy !== undefined) {
    mergedConfig.strategy = flags.strategy;
  }
  if (flags.candidates !== undefined) {
    mergedConfig.candidate_model_ids = [...new Set(splitCandidates(flags.candidates))];
  }

  const routeModelVersion = mergedConfig.route_model_version;
  const strategy = mergedConfig.strategy;
  const candidateModelIds = mergedConfig.candidate_model_ids;
  if (
    typeof routeModelVersion !== "string" ||
    !routeModelVersion.trim() ||
    (strategy !== "EFFECT_FIRST" && strategy !== "COST_FIRST") ||
    !Array.isArray(candidateModelIds) ||
    candidateModelIds.some((candidate) => typeof candidate !== "string" || !candidate.trim())
  ) {
    throw new BailianError(
      "The current router response does not contain a complete routing_config, so the update cannot be merged safely. / 当前路由响应未包含完整的 routing_config，无法安全合并更新。",
      ExitCode.GENERAL,
    );
  }

  return {
    routing_config: {
      ...mergedConfig,
      route_model_version: routeModelVersion.trim(),
      strategy,
      candidate_model_ids: candidateModelIds,
    },
  };
}

export function assertModelRouter(
  deployment: Deployment | undefined,
): asserts deployment is Deployment {
  if (deployment?.plan?.trim().toLowerCase() !== "mr") {
    throw new BailianError(
      "The specified deployment is not a model router (plan=mr). / 指定的部署不是模型路由（plan=mr）。",
      ExitCode.USAGE,
    );
  }
}

export function assertRouterRunning(deployment: Deployment): void {
  if (deployment.status?.trim().toUpperCase() !== "RUNNING") {
    throw new BailianError(
      `The model router must be RUNNING for this operation (current: ${deployment.status || "unknown"}). / 执行此操作时模型路由必须为 RUNNING（当前：${deployment.status || "未知"}）。`,
      ExitCode.USAGE,
    );
  }
}
