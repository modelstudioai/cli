import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineCommand } from "bailian-cli-core";
import {
  buildServerBody,
  deploymentNote,
  editableFlags,
  executeServerWrite,
  validateEdits,
  type ServerWrite,
} from "./server-management.ts";

const flags = {
  ...WORKSPACE_FLAG,
  name: { ...editableFlags.name, required: true },
  description: { ...editableFlags.description, required: true },
  mcpType: { ...editableFlags.mcpType, required: true },
  mcpConfig: { ...editableFlags.mcpConfig, required: true },
} as const;

export default defineCommand<typeof flags, ServerWrite>({
  description: {
    "en-US": "Create and deploy a custom MCP server",
    "zh-CN": "创建并部署自定义 MCP 服务",
  },
  auth: "apiKey",
  notes: [deploymentNote],
  flags,
  usageArgs:
    "--name <text> --description <text> --mcp-type <type> --mcp-config <json|path> [flags]",
  exampleArgs: [
    {
      "en-US": `--name weather --description "Weather lookup" --mcp-type http --mcp-config '{"url":"https://mcp.example.com/mcp"}' --dry-run`,
      "zh-CN": `--name weather --description "天气查询" --mcp-type http --mcp-config '{"url":"https://mcp.example.com/mcp"}' --dry-run`,
    },
    {
      "en-US": `--name weather --description "Weather lookup" --mcp-type http --mcp-config ./weather.json`,
      "zh-CN": `--name weather --description "天气查询" --mcp-type http --mcp-config ./weather.json`,
    },
  ],
  validate: validateEdits,
  async prepare(ctx) {
    const body = await buildServerBody(ctx.flags, ctx.localize);
    return {
      data: { method: "POST", body },
      preview: {
        action: "create",
        deploy: true,
        server_name: body.server_name,
        mcp_type: body.mcp_type,
      },
      risk: null,
      notices: [],
    };
  },
  run: executeServerWrite,
});
