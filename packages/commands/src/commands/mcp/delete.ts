import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineCommand, getConfigDir, type CommandRisk } from "bailian-cli-core";
import { registeredMcpAgents } from "./agent-config.ts";
import {
  executeServerWrite,
  getCustomServer,
  serverFlag,
  validateServer,
  type ServerWrite,
} from "./server-management.ts";

const flags = {
  ...WORKSPACE_FLAG,
  server: serverFlag,
};
const risk = {
  level: "high",
  reason: "destructive",
  message: {
    "en-US": "Permanently delete this custom MCP server. This cannot be undone.",
    "zh-CN": "将永久删除此自定义 MCP 服务，删除后无法恢复。",
  },
} satisfies CommandRisk;

export default defineCommand<typeof flags, ServerWrite>({
  description: {
    "en-US": "Permanently delete a custom MCP server",
    "zh-CN": "永久删除自定义 MCP 服务",
  },
  auth: "apiKey",
  flags,
  risk,
  usageArgs: "--server <code> [flags]",
  exampleArgs: ["--server mcp-example --dry-run", "--server mcp-example --yes"],
  notes: [
    {
      "en-US":
        "Deletion is irreversible. Use mcp disconnect to remove any local Agent registrations listed in the result.",
      "zh-CN": "云端删除不可撤销。结果中列出的本地 Agent 注册可用 mcp disconnect 清理。",
    },
  ],
  validate: (values) => validateServer(values.server),
  async prepare(ctx) {
    const detail = await getCustomServer(ctx, ctx.flags.server);
    const registeredAgents = registeredMcpAgents(getConfigDir(), ctx.flags.server);
    return {
      data: { method: "DELETE", server: ctx.flags.server, registeredAgents },
      preview: {
        action: "delete",
        server_code: detail.mcp_code,
        server_name: detail.server_name,
        server_status: detail.server_status,
        connected_agents: registeredAgents,
      },
      risk,
      notices: [],
    };
  },
  run: executeServerWrite,
});
