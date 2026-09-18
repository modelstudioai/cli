import {
  defineCommand,
  detectOutputFormat,
  securityAgentLogsEndpoint,
  securityGet,
  type FlagsDef,
  type SecurityAlertList,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { WORKSPACE_FLAG, renderAlert, resolveSecurityHost, setSecurityParam } from "./shared.ts";

const ASSET_TYPES = ["agent", "tool", "skill", "knowledge_base", "memory", "channel"] as const;

const ALERTS_FLAGS = {
  ...WORKSPACE_FLAG,
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Results per page (default: 20)", "zh-CN": "每页结果数（默认：20）" },
  },
  riskLevel: {
    type: "string",
    valueHint: "<level>",
    choices: ["high", "medium", "low"] as const,
    description: {
      "en-US": "Filter by risk level: high, medium, low",
      "zh-CN": "按风险等级筛选：high、medium、low",
    },
  },
  riskName: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Filter by risk name", "zh-CN": "按风险名称筛选" },
  },
  status: {
    type: "string",
    valueHint: "<status>",
    description: { "en-US": "Filter by handling status", "zh-CN": "按处理状态筛选" },
  },
  statusList: {
    type: "array",
    valueHint: "<status>",
    description: {
      "en-US": "Filter by multiple statuses (repeatable)",
      "zh-CN": "按多个状态筛选（可重复传入）",
    },
  },
  appName: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Filter by application name", "zh-CN": "按应用名称筛选" },
  },
  assetType: {
    type: "string",
    valueHint: "<type>",
    choices: ASSET_TYPES,
    description: {
      "en-US": `Filter by asset type: ${ASSET_TYPES.join(", ")}`,
      "zh-CN": `按资产类型筛选：${ASSET_TYPES.join("、")}`,
    },
  },
  vendor: {
    type: "string",
    valueHint: "<vendor>",
    description: { "en-US": "Filter by vendor", "zh-CN": "按厂商筛选" },
  },
  orderBy: {
    type: "string",
    valueHint: "<field>",
    description: {
      "en-US": "Sort field (default: check_time)",
      "zh-CN": "排序字段（默认：check_time）",
    },
  },
  order: {
    type: "string",
    valueHint: "<dir>",
    choices: ["asc", "desc"] as const,
    description: {
      "en-US": "Sort direction: asc, desc (default: desc)",
      "zh-CN": "排序方向：asc、desc（默认：desc）",
    },
  },
  lang: {
    type: "string",
    valueHint: "<lang>",
    choices: ["zh", "en"] as const,
    description: { "en-US": "Response language: zh, en", "zh-CN": "响应语言：zh、en" },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List Agent security alerts",
    "zh-CN": "列出 Agent 安全告警",
  },
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: ALERTS_FLAGS,
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
        "Filters, pagination and sorting go in the query string; enum flags are validated before any request is sent.",
      "zh-CN": "筛选、分页与排序参数走 query string；枚举类 flag 在发起请求前校验。",
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
      "en-US": "--risk-level high --page-size 50",
      "zh-CN": "--risk-level high --page-size 50",
    },
    {
      "en-US": '--asset-type agent --app-name "demo app" --output json',
      "zh-CN": '--asset-type agent --app-name "测试应用0" --output json',
    },
    {
      "en-US": "--status-list unhandled --status-list handling",
      "zh-CN": "--status-list unhandled --status-list handling",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const host = resolveSecurityHost(ctx);

    const params = new URLSearchParams();
    setSecurityParam(params, "current_page", flags.page);
    setSecurityParam(params, "page_size", flags.pageSize);
    setSecurityParam(params, "risk_level", flags.riskLevel);
    setSecurityParam(params, "risk_name", flags.riskName);
    setSecurityParam(params, "status", flags.status);
    setSecurityParam(params, "status_list", flags.statusList);
    setSecurityParam(params, "app_name", flags.appName);
    setSecurityParam(params, "asset_type", flags.assetType);
    setSecurityParam(params, "vendor", flags.vendor);
    setSecurityParam(params, "order_by", flags.orderBy);
    setSecurityParam(params, "order", flags.order);
    setSecurityParam(params, "lang", flags.lang);

    const query = params.toString();
    const base = securityAgentLogsEndpoint(host);
    const endpoint = query ? `${base}?${query}` : base;

    if (settings.dryRun) {
      emitResult({ endpoint, method: "GET" }, format);
      return;
    }

    const data = await securityGet<SecurityAlertList>(ctx.client, endpoint);
    const alerts = data?.data ?? [];

    if (format === "json") {
      emitResult(data ?? { stats: null, data: [], next_page: null }, format);
      return;
    }

    if (settings.quiet) {
      for (const alert of alerts) emitBare(alert.alert_id);
      return;
    }

    const stats = data?.stats;
    if (stats) {
      emitBare(
        `Total: ${stats.total ?? "-"}    high: ${stats.high ?? "-"}    ` +
          `medium: ${stats.medium ?? "-"}    low: ${stats.low ?? "-"}\n`,
      );
    }

    if (alerts.length === 0) {
      emitBare("No alerts found.");
      return;
    }

    for (const alert of alerts) renderAlert(alert);

    if (data?.next_page) {
      emitBare(`Next page cursor: ${data.next_page}`);
    }
  },
});
