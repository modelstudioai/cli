import {
  defineCommand,
  memoryEndpoint,
  profileSchemaPath,
  detectOutputFormat,
  type FlagsDef,
  type MemoryPlanVersion,
  type ProfileAttribute,
  type ProfileSchemaCreateRequest,
  type ProfileSchemaCreateResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  PLAN_VERSION_FLAG,
  WORKSPACE_FLAG,
  parseJsonArrayFlag,
  resolveWorkspaceId,
} from "./shared.ts";

const PROFILE_CREATE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Schema name (required)", "zh-CN": "Schema 名称（必填）" },
    required: true,
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Schema description", "zh-CN": "Schema 描述" },
  },
  attributes: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Attributes JSON array: [{"name":"age","description":"age","default_value":"18"}]',
      "zh-CN": '属性 JSON 数组：[{"name":"age","description":"年龄","default_value":"18"}]',
    },
    required: true,
  },
  ...PLAN_VERSION_FLAG,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Create a user profile schema for memory profiling",
    "zh-CN": "创建用于记忆画像的用户 Profile Schema",
  },
  auth: "apiKey",
  usageArgs: "--name <name> --attributes <json> [flags]",
  flags: PROFILE_CREATE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Each attribute needs a name; description and default_value are optional. --plan-version picks the extraction tier (pro / lite) and is billed differently.",
      "zh-CN":
        "每个属性必须有 name，description 与 default_value 可选。--plan-version 决定抽取策略档位（pro / lite），计费单价不同。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        '--name "user_basic" --attributes \'[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]\' --workspace-id ws_xxx',
      "zh-CN":
        '--name "user_basic" --attributes \'[{"name":"age","description":"年龄"},{"name":"hobby","description":"爱好"}]\' --workspace-id ws_xxx',
    },
    {
      "en-US":
        '--name "user_basic" --attributes \'[{"name":"age"}]\' --plan-version lite --memory-library-id lib_xxx',
      "zh-CN":
        '--name "user_basic" --attributes \'[{"name":"age"}]\' --plan-version lite --memory-library-id lib_xxx',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const attributes = parseJsonArrayFlag<ProfileAttribute>("--attributes", flags.attributes);

    const body: ProfileSchemaCreateRequest = { name: flags.name, attributes };
    if (flags.description) body.description = flags.description;
    if (flags.planVersion) body.plan_version = flags.planVersion as MemoryPlanVersion;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaPath());

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "POST", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaCreateResponse>({
      path: url,
      method: "POST",
      body,
    });

    if (settings.quiet || format === "text") {
      emitBare(`Profile schema created: ${response.profile_schema_id}`);
    } else {
      emitResult(response, format);
    }
  },
});
