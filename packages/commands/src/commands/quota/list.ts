import { defineCommand, detectOutputFormat, modelsLimitsPath } from "bailian-cli-core";
import { emitResult, renderBoxTable } from "bailian-cli-runtime";
import { formatNumber } from "../shared/format.ts";
import { buildQuery, parseCommaList } from "../shared/params.ts";

// ---------------------------------------------------------------------------
// Types — mirror GET /api/v1/models/limits
// ---------------------------------------------------------------------------

interface LimitSpec {
  request_limit: number | null;
  request_limit_period: number | null;
  usage_limit: number | null;
  usage_limit_field: string | null;
  usage_limit_period: number | null;
  async_user_queue_limit: number | null;
  async_user_concurrency_limit: number | null;
}

interface ModelQuota {
  model: string;
  workspace_id?: string;
  model_limit?: LimitSpec | null;
  workspace_limit?: LimitSpec | null;
}

interface LimitsResponse {
  output?: {
    total?: number;
    page_no?: number;
    page_size?: number;
    quotas?: ModelQuota[];
  };
  request_id?: string;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Compact rate display: `500/s`, `60/min`, `83,333/6s`; "-" when unlimited. */
function formatLimit(limit: number | null | undefined, period: number | null | undefined): string {
  if (limit == null) return "-";
  const seconds = period ?? 60;
  if (seconds === 1) return `${formatNumber(limit)}/s`;
  if (seconds === 60) return `${formatNumber(limit)}/min`;
  return `${formatNumber(limit)}/${seconds}s`;
}

function formatRequestLimit(spec: LimitSpec | null | undefined): string {
  if (!spec) return "-";
  return formatLimit(spec.request_limit, spec.request_limit_period);
}

function formatUsageLimit(spec: LimitSpec | null | undefined): string {
  if (!spec) return "-";
  return formatLimit(spec.usage_limit, spec.usage_limit_period);
}

/** Async task headroom as `queue/concurrency`; "-" when the model has no async limits. */
function formatAsync(spec: LimitSpec | null | undefined): string {
  if (!spec || (spec.async_user_queue_limit == null && spec.async_user_concurrency_limit == null)) {
    return "-";
  }
  const queue =
    spec.async_user_queue_limit != null ? formatNumber(spec.async_user_queue_limit) : "-";
  const concurrency =
    spec.async_user_concurrency_limit != null
      ? formatNumber(spec.async_user_concurrency_limit)
      : "-";
  return `${queue}/${concurrency}`;
}

function printTable(quotas: ModelQuota[], total: number): void {
  if (quotas.length === 0) {
    process.stdout.write("No rate limits found.\n");
    return;
  }
  const headers = ["Model", "Req Limit", "Usage Limit", "WS Req", "WS Usage", "Async Q/C"];
  const rows = quotas.map((quota) => [
    quota.model,
    formatRequestLimit(quota.model_limit),
    formatUsageLimit(quota.model_limit),
    formatRequestLimit(quota.workspace_limit),
    formatUsageLimit(quota.workspace_limit),
    formatAsync(quota.model_limit),
  ]);
  const lines = renderBoxTable({
    headers,
    rows,
    align: ["left", "right", "right", "right", "right", "right"],
  });
  for (const line of lines) process.stdout.write(line + "\n");
  process.stdout.write(`\nTotal: ${total}\n`);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  description: {
    "en-US": "View model rate limits (QPM/TPM, account and workspace level)",
    "zh-CN": "查看模型限流配置（QPM/TPM，账号级和 Workspace 级）",
  },
  auth: "apiKey",
  usageArgs: "[--model <model>] [--name <name>] [--page <n>] [--page-size <n>]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name(s), comma-separated (exact match)",
        "zh-CN": "模型名称，多个以逗号分隔（精确匹配）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: { "en-US": "Fuzzy search by model name", "zh-CN": "按模型名称模糊搜索" },
    },
    page: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Results per page (default: 20)",
        "zh-CN": "每页结果数（默认：20）",
      },
    },
  },
  exampleArgs: [
    "",
    "--model qwen3-max",
    "--model qwen3-max,qwen-plus",
    "--name qwen --page-size 50",
    "--output json",
  ],
  notes: [
    {
      "en-US": "Usage-vs-limit pressure checks live in `quota check` (console auth).",
      "zh-CN": "用量与限流压力检查位于 `quota check`（Console 鉴权）。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const nameFlag = flags.name || undefined;
    const format = detectOutputFormat(settings.output);
    const endpoint = ctx.client.url(modelsLimitsPath());

    if (settings.dryRun) {
      if (modelFlag) {
        // One exact-match GET per model; dry-run lists them all.
        const requests = parseCommaList(modelFlag).map((model) => ({
          endpoint,
          method: "GET",
          query: { model, page_size: 100 },
        }));
        emitResult({ requests }, format);
      } else {
        emitResult(
          {
            endpoint,
            method: "GET",
            query: {
              name: nameFlag,
              page_no: flags.page || 1,
              page_size: flags.pageSize || 20,
            },
          },
          format,
        );
      }
      return;
    }

    let quotas: ModelQuota[];
    let total: number;

    if (modelFlag) {
      // Exact lookup per model, then merge.
      const responses = await Promise.all(
        parseCommaList(modelFlag).map((model) =>
          ctx.client.requestJson<LimitsResponse>({
            path: modelsLimitsPath() + buildQuery({ model, page_size: 100 }),
          }),
        ),
      );
      quotas = responses.flatMap((resp) => resp.output?.quotas ?? []);
      total = quotas.length;
    } else {
      const resp = await ctx.client.requestJson<LimitsResponse>({
        path:
          modelsLimitsPath() +
          buildQuery({
            name: nameFlag,
            page_no: flags.page || 1,
            page_size: flags.pageSize || 20,
          }),
      });
      quotas = resp.output?.quotas ?? [];
      total = resp.output?.total ?? quotas.length;
    }

    if (format === "json") {
      emitResult({ items: quotas, total }, format);
      return;
    }

    printTable(quotas, total);
  },
});
