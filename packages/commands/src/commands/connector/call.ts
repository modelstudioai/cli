import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BailianError, defineCommand, UsageError } from "bailian-cli-core";
import { isObject, invoke, runConnector, schemaRequest, selectionFlags } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Validate arguments and execute one connector tool on the selected account",
    "zh-CN": "校验入参并在所选账号执行一个连接器工具",
  },
  auth: "apiKey",
  usageArgs: "--tool <toolRef> --instance <instanceId> --json '<object>' [--trace-id <id>]",
  flags: {
    ...selectionFlags,
    json: {
      type: "string",
      required: true,
      valueHint: "<object>",
      description: {
        "en-US": "JSON object matching the selected tool schema",
        "zh-CN": "与所选工具入参定义匹配的 JSON 对象",
      },
    },
  },
  exampleArgs: ["--tool <toolRef> --instance <instanceId> --json '{}' --dry-run"],
  async run(ctx) {
    const { tool, instance, traceId } = ctx.flags;
    const lookup = schemaRequest(ctx.flags);
    let args: unknown;
    try {
      args = JSON.parse(ctx.flags.json);
    } catch {
      throw new UsageError("--json must contain valid JSON.");
    }
    if (!isObject(args)) throw new UsageError("--json must be an object.");
    const payload = {
      executions: [{ toolRef: tool, instanceId: instance, arguments: args }],
      ...(traceId ? { traceId } : {}),
    };
    const name = "CONNECTOR_MULTI_EXECUTE_TOOL";
    await runConnector(ctx, { tool: name, arguments: payload }, async (client) => {
      const data = await invoke(client, "CONNECTOR_GET_TOOL_SCHEMAS", lookup);
      const entries = Array.isArray(data.schemas)
        ? data.schemas.filter((row) => isObject(row) && row.toolRef === tool)
        : [];
      const schema = entries[0]?.inputSchema;
      if (data.instanceId !== instance || entries.length !== 1 || !isObject(schema))
        throw new BailianError(
          "Missing matching input schema for the selected connector tool and instance.",
        );
      const options = { ownProperties: true, strict: false };
      const validator =
        schema.$schema === "https://json-schema.org/draft/2020-12/schema"
          ? new Ajv2020(options)
          : new Ajv(options);
      const validate = validator.compile(schema);
      if ("$async" in validate) throw new BailianError("Unsupported async connector input schema.");
      if (!validate(args)) throw new UsageError(validator.errorsText(validate.errors));
      const result = await invoke(client, name, payload);
      if (Array.isArray(result.errors) && result.errors.length)
        throw new BailianError(JSON.stringify(result.errors));
      if (!Array.isArray(result.results) || result.results.length !== 1)
        throw new BailianError("Expected one connector execution result.");
      return result;
    });
  },
});
