import {
  defineCommand,
  UsageError,
  memoryEndpoint,
  profileSchemaItemPath,
  detectOutputFormat,
  type FlagsDef,
  type ProfileSchemaAttributeOperation,
  type ProfileSchemaUpdateRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  WORKSPACE_FLAG,
  parseJsonArrayFlag,
  resolveWorkspaceId,
} from "./shared.ts";

const PROFILE_UPDATE_FLAGS = {
  schemaId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID (required)",
      "zh-CN": "Profile Schema ID（必填）",
    },
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "New schema name", "zh-CN": "新的 Schema 名称" },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "New schema description", "zh-CN": "新的 Schema 描述" },
  },
  attributesOperations: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Attribute operations JSON array: [{"op":"add","name":"plan"}]',
      "zh-CN": '属性操作 JSON 数组：[{"op":"add","name":"plan"}]',
    },
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

const VALID_OPS = ["add", "update", "delete"] as const;

/** Reject operation shapes the API would reject anyway, so the error stays local and precise. */
function validateOperations(operations: ProfileSchemaAttributeOperation[]): void {
  operations.forEach((operation, index) => {
    const position = `--attributes-operations[${index}]`;
    if (!VALID_OPS.includes(operation.op)) {
      throw new UsageError(`${position}.op must be one of ${VALID_OPS.join(" / ")}`);
    }
    if (operation.op === "add" && !operation.name) {
      throw new UsageError(`${position}.name is required when op is "add"`);
    }
    if (operation.op !== "add" && !operation.attribute_id) {
      throw new UsageError(`${position}.attribute_id is required when op is "${operation.op}"`);
    }
  });
}

export default defineCommand({
  description: {
    "en-US": "Update a profile schema name, description, or attributes",
    "zh-CN": "更新画像模板的名称、描述或属性",
  },
  auth: "apiKey",
  usageArgs: "--schema-id <id> [flags]",
  flags: PROFILE_UPDATE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        'Each operation needs "op": add (requires name), update / delete (require attribute_id). Run `memory profile show` first to get attribute IDs.',
      "zh-CN":
        '每条操作必须带 "op"：add（需要 name）、update / delete（需要 attribute_id）。属性 ID 先用 `memory profile show` 查。',
    },
  ],
  exampleArgs: [
    {
      "en-US": '--schema-id schema_xxx --name "user_basic_v2" --workspace-id ws_xxx',
      "zh-CN": '--schema-id schema_xxx --name "user_basic_v2" --workspace-id ws_xxx',
    },
    {
      "en-US":
        '--schema-id schema_xxx --attributes-operations \'[{"op":"add","name":"plan","default_value":"free"},{"op":"delete","attribute_id":"attr_2"}]\'',
      "zh-CN":
        '--schema-id schema_xxx --attributes-operations \'[{"op":"add","name":"plan","default_value":"free"},{"op":"delete","attribute_id":"attr_2"}]\'',
    },
  ],
  validate: (flags) => {
    if (!flags.name && !flags.description && !flags.attributesOperations)
      return "Provide --name, --description, or --attributes-operations.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const body: ProfileSchemaUpdateRequest = {};
    if (flags.name) body.name = flags.name;
    if (flags.description) body.description = flags.description;
    if (flags.attributesOperations) {
      const operations = parseJsonArrayFlag<ProfileSchemaAttributeOperation>(
        "--attributes-operations",
        flags.attributesOperations,
      );
      validateOperations(operations);
      body.attributes_operations = operations;
    }
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaItemPath(flags.schemaId));

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "PATCH", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: url,
      method: "PATCH",
      body,
    });

    if (settings.quiet || format === "text") {
      emitBare(`Profile schema ${flags.schemaId} updated.`);
    } else {
      emitResult(response, format);
    }
  },
});
