import {
  BailianError,
  UsageError,
  ragEndpoint,
  type CommandContext,
  type FlagsDef,
  type McpConnectedClient,
} from "bailian-cli-core";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "../shared/workspace.ts";

export const selectionFlags = {
  ...WORKSPACE_FLAG,
  tool: {
    type: "string",
    required: true,
    valueHint: "<toolRef>",
    description: {
      "en-US": "Tool reference returned by discovery",
      "zh-CN": "工具发现返回的 toolRef",
    },
  },
  instance: {
    type: "string",
    required: true,
    valueHint: "<instanceId>",
    description: {
      "en-US": "Selected authorized connector instance",
      "zh-CN": "选定的已授权连接器实例 ID",
    },
  },
  traceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Trace ID from connector discovery",
      "zh-CN": "工具发现返回的 traceId",
    },
  },
} satisfies FlagsDef;

export function schemaRequest(flags: { tool: string; instance: string; traceId?: string }) {
  if (!flags.tool.trim() || !flags.instance.trim())
    throw new UsageError("--tool and --instance must be non-empty.");
  return {
    toolRefs: [flags.tool],
    instanceId: flags.instance,
    ...(flags.traceId ? { traceId: flags.traceId } : {}),
  };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function invoke(
  client: McpConnectedClient,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool(name, args);
  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (result.isError) throw new BailianError(text || name + " failed");
  let data: unknown = result.structuredContent;
  if (data === undefined) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new BailianError(name + " returned invalid JSON");
    }
  }
  if (!isObject(data)) throw new BailianError(name + " returned an invalid result");
  return data;
}

export async function runConnector(
  ctx: Pick<CommandContext, "client" | "settings" | "identity" | "output"> & {
    flags: { workspaceId?: string };
  },
  preview: Record<string, unknown>,
  run: (client: McpConnectedClient) => Promise<Record<string, unknown>>,
) {
  const url = ragEndpoint(resolveWorkspaceId(ctx), "/api/v2/connector/mcp");
  if (ctx.settings.dryRun) {
    ctx.output.result({ url, ...preview });
    return;
  }
  const { client } = await ctx.client.connectBailianMcp("connector", url);
  try {
    ctx.output.result(await run(client));
  } finally {
    client.close?.();
  }
}
