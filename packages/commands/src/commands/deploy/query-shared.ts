import type { FlagsDef } from "bailian-cli-core";

export const DEPLOYED_MODEL_FLAG = {
  deployedModel: {
    type: "string",
    valueHint: "<code>",
    required: true,
    description: {
      "en-US": "Deployed model identifier (ModelCode)",
      "zh-CN": "部署调用标识（ModelCode）",
    },
  },
} satisfies FlagsDef;

export const CAPACITY_INSTANCE_FLAG = {
  instanceId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: {
      "en-US": "Capacity instance ID returned by the API",
      "zh-CN": "接口返回的容量实例 ID",
    },
  },
} satisfies FlagsDef;

export const CAPACITY_OPERATION_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  operationId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: {
      "en-US": "Capacity operation ID returned by a write request",
      "zh-CN": "写请求返回的容量操作 ID",
    },
  },
} satisfies FlagsDef;

export function validateQueryIds(flags: {
  deployedModel?: string;
  instanceId?: string;
  operationId?: string;
}): string | undefined {
  for (const [name, value] of Object.entries(flags)) {
    if (
      ["deployedModel", "instanceId", "operationId"].includes(name) &&
      typeof value === "string" &&
      !value.trim()
    ) {
      return "Identifiers must not be empty. / 标识不能为空。";
    }
  }
  return undefined;
}

export function validatePagination(flags: {
  page?: number;
  pageSize?: number;
}): string | undefined {
  if (flags.page !== undefined && (!Number.isSafeInteger(flags.page) || flags.page < 1)) {
    return "--page must be a positive integer. / --page 必须是正整数。";
  }
  if (
    flags.pageSize !== undefined &&
    (!Number.isSafeInteger(flags.pageSize) || flags.pageSize < 1 || flags.pageSize > 100)
  ) {
    return "--page-size must be an integer from 1 to 100. / --page-size 必须是 1–100 的整数。";
  }
  return undefined;
}

export function queryValues(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(",").map((entry) => entry.trim());
}
