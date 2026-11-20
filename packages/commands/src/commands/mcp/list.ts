import { homedir } from "node:os";
import {
  BailianError,
  defineCommand,
  ExitCode,
  getConfigDir,
  mcpServersPath,
} from "bailian-cli-core";
import { connectedMcpPaths } from "./agent-config.ts";
import { publicServer, requestMcpData, type ServerDto } from "./server-response.ts";

const SCAN_PAGE_SIZE = 100;
const MAX_CANDIDATES = 10_000;
interface ServerPage {
  items: ServerDto[];
  total: number;
  page_no?: number;
  pageNo?: number;
  page_size?: number;
  pageSize?: number;
}

export default defineCommand({
  description: {
    "en-US": "List activated MCP servers and their local Agent registrations",
    "zh-CN": "列出已启用的 MCP 服务及其本地 Agent 注册",
  },
  auth: "apiKey",
  usageArgs: "[--name <text>] [--type <official|private>] [--page <n>] [--page-size <n>]",
  flags: {
    name: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Filter by server name (substring match)",
        "zh-CN": "按服务名称子串筛选",
      },
    },
    type: {
      type: "string",
      valueHint: "<official|private>",
      description: {
        "en-US": "Ownership type (default official, case-insensitive)",
        "zh-CN": "服务归属类型（默认 official，不区分大小写）",
      },
    },
    page: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Page of matching servers (default 1)",
        "zh-CN": "筛选后的页码（默认 1）",
      },
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Matching servers per page (1–100, default 30)",
        "zh-CN": "每页服务数（1～100，默认 30）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "The CLI scans the selected type to compute the activated total before paging. connected_agents and config_paths report managed native entries whose fingerprints still match.",
      "zh-CN":
        "CLI 扫描所选类型，统计已启用且名称匹配的服务后分页。connected_agents 和 config_paths 列出仍与托管记录指纹匹配的本地 Agent 和配置路径。",
    },
  ],
  exampleArgs: ["", "--name finance", "--type private --page 2 --page-size 10"],
  validate(flags) {
    if (
      flags.type !== undefined &&
      !["OFFICIAL", "PRIVATE", "CUSTOMER"].includes(flags.type.toUpperCase())
    ) {
      return {
        "en-US": "--type must be official or private (CUSTOMER).",
        "zh-CN": "--type 须为 official 或 private（CUSTOMER）。",
      };
    }
    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 30;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      page * pageSize > MAX_CANDIDATES
    ) {
      return {
        "en-US":
          "--page must be a positive integer, --page-size an integer from 1 to 100, and their product at most 10000.",
        "zh-CN": "--page 须为正整数，--page-size 须为 1～100 的整数，两者乘积不能超过 10000。",
      };
    }
  },
  async run(ctx) {
    const { flags } = ctx;
    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 30;
    const type = (flags.type ?? "official").toUpperCase() === "OFFICIAL" ? "OFFICIAL" : "CUSTOMER";
    const name = flags.name ?? "";
    const listPath = `${mcpServersPath()}/list`;
    if (ctx.settings.dryRun) {
      ctx.output.result({
        method: "GET",
        path: listPath,
        type,
        name,
        activated: true,
        page,
        page_size: pageSize,
        scan_page_size: SCAN_PAGE_SIZE,
      });
      return;
    }

    const offset = (page - 1) * pageSize;
    const selected: ReturnType<typeof publicServer>[] = [];
    const needle = name.toLowerCase();
    let total = 0;
    for (let scanPage = 1; ; scanPage++) {
      const query = new URLSearchParams({
        type,
        pageNo: String(scanPage),
        pageSize: String(SCAN_PAGE_SIZE),
      });
      const { data, requestId } = await requestMcpData<ServerPage>(ctx, {
        method: "GET",
        path: `${listPath}?${query.toString()}`,
      });
      if (data.total > MAX_CANDIDATES)
        throw new BailianError(
          ctx.localize({
            "en-US":
              "The candidate list exceeds the API's 10000-record window. An accurate activated total is unavailable.",
            "zh-CN": "候选服务超过接口的 10000 条分页上限，无法统计准确的已启用服务总数。",
          }),
          ExitCode.GENERAL,
          undefined,
          { api: { requestId } },
        );
      const scanned = (scanPage - 1) * SCAN_PAGE_SIZE;
      if (
        !Number.isSafeInteger(data.total) ||
        data.total < 0 ||
        !Array.isArray(data.items) ||
        data.items.length !== Math.min(SCAN_PAGE_SIZE, Math.max(0, data.total - scanned)) ||
        (data.page_no ?? data.pageNo ?? scanPage) !== scanPage ||
        (data.page_size ?? data.pageSize ?? SCAN_PAGE_SIZE) !== SCAN_PAGE_SIZE
      ) {
        throw new BailianError(
          ctx.localize({
            "en-US": "The MCP list response contains inconsistent pagination. Retry the list.",
            "zh-CN": "MCP 列表响应的分页信息不一致，请重新查询。",
          }),
          ExitCode.GENERAL,
          undefined,
          { api: { requestId } },
        );
      }
      for (const item of data.items) {
        const detail = publicServer(ctx, item, requestId);
        if (!detail.activated || !(detail.server_name ?? "").toLowerCase().includes(needle))
          continue;
        if (total >= offset && selected.length < pageSize) selected.push(detail);
        total++;
      }
      if (scanned + data.items.length >= data.total) break;
    }
    const pathsByCode = connectedMcpPaths(
      getConfigDir(),
      homedir(),
      new Set(selected.map((detail) => detail.server_code)),
      (path) => {
        ctx.output.warning({
          code: "MCP_REGISTRATIONS_UNREADABLE",
          message: {
            "en-US": `Could not read ${path}. Local registrations may be incomplete.`,
            "zh-CN": `无法读取 ${path}，本地注册信息可能不完整。`,
          },
        });
      },
    );
    const servers = selected.map((detail) => {
      const paths = pathsByCode.get(detail.server_code) ?? {};
      const streamable = detail.endpoint
        ? /\/mcp\/?(?:[?#].*)?$/.test(detail.endpoint)
        : detail.server_type === "HTTP";
      return {
        ...detail,
        code: detail.server_code,
        name: detail.server_name ?? "",
        streamable,
        connected_agents: Object.keys(paths),
        config_paths: paths,
      };
    });
    ctx.output.result({ total, servers });
  },
});
