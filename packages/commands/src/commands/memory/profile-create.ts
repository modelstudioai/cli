import {
  defineCommand,
  UsageError,
  profileSchemaPath,
  detectOutputFormat,
  type ProfileSchemaCreateRequest,
  type ProfileSchemaCreateResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Create a user profile schema for memory profiling",
    "zh-CN": "创建用于记忆画像的用户 Profile Schema",
  },
  auth: "apiKey",
  usageArgs: "--name <name> --attributes <json> [flags]",
  flags: {
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
        "en-US": 'Attributes JSON array: [{"name":"age","description":"age"}]',
        "zh-CN": '属性 JSON 数组：[{"name":"age","description":"age"}]',
      },
      required: true,
    },
  },
  exampleArgs: [
    '--name "user_basic" --attributes \'[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]\'',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const name = flags.name;
    const attrStr = flags.attributes;

    let attributes;
    try {
      attributes = JSON.parse(attrStr);
    } catch {
      throw new UsageError("--attributes must be valid JSON array");
    }

    const body: ProfileSchemaCreateRequest = { name, attributes };
    if (flags.description) body.description = flags.description;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(profileSchemaPath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaCreateResponse>({
      path: profileSchemaPath(),
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
