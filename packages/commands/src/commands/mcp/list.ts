import {
  defineCommand,
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
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
  options: [
    { flag: "--name <text>", description: "Filter by server name (substring match)" },
    {
      flag: "--type <type>",
      description: "Server type: OFFICIAL | PRIVATE (default: OFFICIAL)",
    },
    { flag: "--page <n>", description: "Page number (default: 1)", type: "number" },
    { flag: "--page-size <n>", description: "Results per page (default: 30)", type: "number" },
    { flag: "--console-region <region>", description: "Console region" },
    {
      flag: "--console-site <site>",
      description: "Console site: domestic, international",
    },
    {
      flag: "--console-switch-agent <uid>",
      description: "Switch agent UID",
      type: "number",
    },
  ],
  exampleArgs: ["", "--name finance", "--output json"],
  async run(config: Config, flags: GlobalFlags) {
    const serverName = (flags.name as string) || "";
    const type = (flags.type as string) || "OFFICIAL";
    const pageNo = (flags.page as number) || 1;
    const pageSize = (flags.pageSize as number) || 30;
    const format = detectOutputFormat(config.output);

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

    if (config.dryRun) {
      emitResult({ api: MCP_LIST_API, data, ...effectiveConsoleGatewayConfig(config) }, format);
      return;
    }

    const credential = await resolveConsoleGatewayCredential(config);

    const result = (await callConsoleGateway(config, credential.token, {
      api: MCP_LIST_API,
      data,
    })) as Record<string, unknown>;

    const dataField = (result?.data as Record<string, unknown> | undefined) ?? {};
    if (dataField.success === false) {
      const code = (dataField.errorCode as string | undefined) ?? "UnknownError";
      const msg = (dataField.errorMsg as string | undefined) ?? code;
      const hint =
        code === "BailianGateway.Login.NotLogined"
          ? `Run \`${config.binName} auth login --console\` to refresh your console session.`
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
