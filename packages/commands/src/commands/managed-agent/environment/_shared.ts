import type { CloudEnvironment } from "@openagentpack/sdk";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  INCLUDE_ARCHIVED_FLAG,
  SEARCH_FLAGS,
} from "../_engine/api-helpers.ts";

export const ENVIRONMENT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const ENVIRONMENT_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const ENVIRONMENT_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  environmentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Environment ID", "zh-CN": "Environment ID" },
  },
} as const;

export function environmentRows(environments: CloudEnvironment[]): string[][] {
  return environments.map((environment) => [
    environment.id,
    displayValue(environment.name),
    displayValue(environment.scope),
    displayValue(environment.version),
    displayValue(environment.updated_at),
  ]);
}
