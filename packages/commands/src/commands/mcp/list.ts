import {
  defineCommand,
  effectiveConsoleGatewayConfig,
  detectOutputFormat,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const MCP_LIST_API = "zeldaEasy.broadscope-bailian.mcp-server.PageList";

interface ServerSummary {
  code: string;
  name: string;
  description?: string;
  type: string;
  source?: string;
  bizType?: string;
  installType?: string;
  streamable: boolean;
}

export default defineCommand({
  description: "List MCP servers activated under your Bailian account",
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    name: {
      type: "string",
      valueHint: "<text>",
      description: "Filter by server name (substring match)",
    },
    type: {
      type: "string",
      valueHint: "<type>",
      description: "Server type: OFFICIAL | PRIVATE (default: OFFICIAL)",
    },
    page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
    pageSize: { type: "number", valueHint: "<n>", description: "Results per page (default: 30)" },
  },
  exampleArgs: ["", "--name finance", "--output json"],
  async run(ctx) {
    const { settings, identity, flags } = ctx;
    const serverName = flags.name || "";
    const type = flags.type || "OFFICIAL";
    const pageNo = flags.page || 1;
    const pageSize = flags.pageSize || 30;
    const format = detectOutputFormat(settings.output);

    const data = {
      reqDTO: {
        type,
        displayTools: false,
        activated: 1,
        pageNo,
        pageSize,
        serverName,
      },
    };

    if (settings.dryRun) {
      emitResult({ api: MCP_LIST_API, data, ...effectiveConsoleGatewayConfig(settings) }, format);
      return;
    }

    const result = (await ctx.client.console(MCP_LIST_API, data)) as Record<string, unknown>;

    const dataField = (result?.data as Record<string, unknown> | undefined) ?? {};
    if (dataField.success === false) {
      const code = (dataField.errorCode as string | undefined) ?? "UnknownError";
      const msg = (dataField.errorMsg as string | undefined) ?? code;
      const hint =
        code === "BailianGateway.Login.NotLogined"
          ? `Run \`${identity.binName} auth login --console\` to refresh your console session.`
          : undefined;
      throw new BailianError(`Console gateway: ${msg}`, ExitCode.AUTH, hint);
    }
    const dataV2 = (dataField.DataV2 as Record<string, unknown> | undefined) ?? {};
    const inner =
      (dataV2.data as { data?: { mcpServerDetailList?: unknown[]; total?: number } } | undefined)
        ?.data ?? {};
    const list = (inner.mcpServerDetailList ?? []) as Array<Record<string, unknown>>;
    const total = (inner.total as number) ?? 0;

    const servers: ServerSummary[] = list.map((item) => ({
      code: (item.serverCode as string | undefined) ?? "",
      name: (item.serverName as string | undefined) ?? "",
      description: item.description as string | undefined,
      type: (item.type as string | undefined) ?? "",
      source: item.source as string | undefined,
      bizType: item.bizType as string | undefined,
      installType: item.installType as string | undefined,
      streamable: item.streamable === true,
    }));

    emitResult({ total, servers }, format);
  },
});
