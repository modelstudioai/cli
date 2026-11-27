import { defineCommand } from "bailian-cli-core";
import { invoke, runConnector, schemaRequest, selectionFlags } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Inspect a connector tool's input schema for the selected account",
    "zh-CN": "查看所选账号下连接器工具的入参定义",
  },
  auth: "apiKey",
  usageArgs: "--tool <toolRef> --instance <instanceId> [--trace-id <id>]",
  flags: selectionFlags,
  exampleArgs: ["--tool <toolRef> --instance <instanceId> --output json"],
  async run(ctx) {
    const name = "CONNECTOR_GET_TOOL_SCHEMAS";
    const args = schemaRequest(ctx.flags);
    await runConnector(ctx, { tool: name, arguments: args }, (client) =>
      invoke(client, name, args),
    );
  },
});
