import { parseSessionResources } from "@openagentpack/sdk";
import type { FlagsDef } from "bailian-cli-core";
import { withAgentErrors } from "./errors.ts";
import { parseJsonInputs } from "./scoped-create.ts";

export const SESSION_RESOURCE_FLAGS = {
  resource: {
    type: "array",
    valueHint: "<json|@path>",
    description: {
      "en-US":
        "Session resource JSON (repeatable); memory_store uses a YAML key, access and instructions",
      "zh-CN": "Session 资源 JSON（可重复）；memory_store 使用 YAML key、access 和 instructions",
    },
  },
} satisfies FlagsDef;

export async function readSessionResources(values?: string[]) {
  if (values === undefined) return undefined;
  const decoded = await parseJsonInputs(values, "resource");
  return withAgentErrors(async () => parseSessionResources(decoded));
}
