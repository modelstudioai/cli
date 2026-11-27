import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { BailianError, defineCommand, ExitCode } from "bailian-cli-core";
import {
  buildServerBody,
  deploymentNote,
  editableFlags,
  executeServerWrite,
  getCustomServer,
  serverFlag,
  validateEdits,
  validateServer,
  type ServerWrite,
} from "./server-management.ts";

const flags = {
  ...WORKSPACE_FLAG,
  server: serverFlag,
  ...editableFlags,
};
export default defineCommand<typeof flags, ServerWrite>({
  description: {
    "en-US": "Update a custom MCP server's metadata or replace its configuration",
    "zh-CN": "更新自定义 MCP 服务的基本信息或替换完整配置",
  },
  auth: "apiKey",
  flags,
  usageArgs:
    "--server <code> [--name <text>] [--description <text>] [--mcp-type <type> --mcp-config <json|path>] [flags]",
  exampleArgs: [
    "--server mcp-example --name weather-v2",
    "--server mcp-example --mcp-type sse --mcp-config ./weather.json --dry-run",
  ],
  notes: [
    deploymentNote,
    {
      "en-US":
        "Name and description changes take effect without redeployment. Stop the instance before replacing its configuration and redeploying.",
      "zh-CN": "单改名称或描述可直接生效。替换完整配置前须先停用实例，再重新部署。",
    },
  ],
  validate(values) {
    return validateServer(values.server) ?? validateEdits(values);
  },
  async prepare(ctx) {
    const body = await buildServerBody(ctx.flags, ctx.localize);
    const detail = await getCustomServer(ctx, ctx.flags.server);
    const redeploy = body.mcp_config !== undefined;
    if (
      redeploy &&
      (!detail.server_status || ["ACTIVATED", "ACTIVATING"].includes(detail.server_status))
    ) {
      throw new BailianError(
        ctx.localize({
          "en-US":
            "The instance must be stopped before replacing the MCP configuration. Use mcp deactivate --server <code> to stop it.",
          "zh-CN": "替换 MCP 配置前须先停用实例。可用 mcp deactivate --server <code> 停用。",
        }),
        ExitCode.GENERAL,
        undefined,
        { api: { requestId: detail.request_id } },
      );
    }
    return {
      data: { method: "POST", server: ctx.flags.server, body },
      preview: {
        action: "update",
        server_code: detail.mcp_code,
        server_name: detail.server_name,
        server_status: detail.server_status,
        ...(detail.billing && { billing: detail.billing }),
        changes: {
          server_name: body.server_name,
          description: body.description,
          mcp_type: body.mcp_type,
        },
        replace_config: redeploy,
        deploy: redeploy,
      },
      risk: null,
      notices: [],
    };
  },
  run: executeServerWrite,
});
