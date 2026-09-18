import {
  defineCommand,
  detectOutputFormat,
  securityGet,
  securityOverviewEndpoint,
  type FlagsDef,
  type SecurityOverview,
  type SecurityScanStat,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  CAPABILITY_LABELS,
  PROTECTION_LABELS,
  SCAN_CARDS,
  WORKSPACE_FLAG,
  renderToggles,
  resolveSecurityHost,
} from "./shared.ts";

const OVERVIEW_FLAGS = {
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Show the Agent security protection overview (last 24 hours)",
    "zh-CN": "查看 Agent 安全防护总览（最近 24 小时）",
  },
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: OVERVIEW_FLAGS,
  notes: [
    {
      "en-US": "Auth: uses DashScope API Key (Bearer token).",
      "zh-CN": "鉴权：使用 DashScope API Key（Bearer Token）。",
    },
    {
      "en-US": "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.",
      "zh-CN": "`--workspace-id` 可通过 BAILIAN_WORKSPACE_ID 环境变量或配置项 workspace_id 设置。",
    },
    {
      "en-US":
        "Fixed to the last 24 hours; the AgentStudio region is always cn-beijing and is not configurable.",
      "zh-CN": "固定统计最近 24 小时；AgentStudio 地域固定为 cn-beijing，不可配置。",
    },
    {
      "en-US":
        "AgentStudio host: derived from --workspace-id by default; point --base-url / DASHSCOPE_BASE_URL (or `auth login --base-url`) at a workspace or pre-release origin such as https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio to override it, and --workspace-id is then not required.",
      "zh-CN":
        "AgentStudio 域名：默认由 --workspace-id 推导；将 --base-url / DASHSCOPE_BASE_URL（或 `auth login --base-url`）指向某个 workspace 或预发源（例如 https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio）即可覆盖，此时无需 --workspace-id。",
    },
  ],
  exampleArgs: [
    { "en-US": "--workspace-id ws-xxx", "zh-CN": "--workspace-id ws-xxx" },
    {
      "en-US": "--workspace-id ws-xxx --output json",
      "zh-CN": "--workspace-id ws-xxx --output json",
    },
  ],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const endpoint = securityOverviewEndpoint(resolveSecurityHost(ctx));

    if (settings.dryRun) {
      emitResult({ endpoint, method: "GET" }, format);
      return;
    }

    const data = await securityGet<SecurityOverview>(ctx.client, endpoint);
    if (!data) {
      if (format === "json") emitResult({}, format);
      else emitBare("Overview unavailable.");
      return;
    }

    if (format === "json") {
      emitResult(data, format);
      return;
    }

    // Banner totals are client-side sums across the detection cards. Each card
    // accepts the snake_case (REST) or camelCase (console-gateway) field.
    const cards = SCAN_CARDS.map(({ label, keys }) => {
      const stat = keys
        .map((key) => data[key] as SecurityScanStat | null | undefined)
        .find((value) => value !== undefined);
      return { label, stat: stat ?? null };
    });
    const sum = (pick: (stat: SecurityScanStat) => number | null): number =>
      cards.reduce((total, card) => total + (card.stat ? (pick(card.stat) ?? 0) : 0), 0);

    emitBare(`Scanned: ${sum((stat) => stat.scanned)}    Risks: ${sum((stat) => stat.hit)}`);

    renderToggles("Capabilities", data.capabilities, CAPABILITY_LABELS);
    renderToggles("Protection", data.protection, PROTECTION_LABELS);

    emitBare("\nDetections");
    for (const { label, stat } of cards) {
      if (!stat) {
        emitBare(`  ${label}  (unavailable)`);
      } else {
        emitBare(`  ${label}  hit ${stat.hit ?? "-"} / scanned ${stat.scanned ?? "-"}`);
      }
    }
  },
});
