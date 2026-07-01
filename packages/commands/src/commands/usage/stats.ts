import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

const OVERVIEW_API = "zeldaEasy.bailian-telemetry.model.getModelUsageStatistic";
const LIST_API = "zeldaEasy.bailian-telemetry.model.listModelUsageStatisticData";

interface UsageItem {
  key: string;
  value: number;
  unit: string;
}

interface OverviewStatistic {
  callCount: number;
  modelCount: number;
  callSuccessCount: number;
  usages: UsageItem[];
}

interface ModelStatisticItem {
  model: string;
  callSuccessCount: number;
  usages?: UsageItem[];
  usage?: Record<string, number | undefined>;
}

interface ListStatisticResponse {
  list: ModelStatisticItem[];
  totalCount: number;
  maxResults: number;
}

function getNestedRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  return undefined;
}

function extractResponseData(result: Record<string, unknown>): Record<string, unknown> {
  const data = getNestedRecord(result, "data");
  if (!data) return result;

  const dataV2 = getNestedRecord(data, "DataV2");
  if (dataV2) {
    const inner = getNestedRecord(dataV2, "data");
    const innerData = inner ? getNestedRecord(inner, "data") : undefined;
    return innerData ?? inner ?? dataV2;
  }

  const direct = getNestedRecord(data, "data");
  return direct ?? data;
}

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 30;

async function pollTelemetryApi(
  config: Config,
  token: string,
  api: string,
  reqDTO: Record<string, unknown>,
): Promise<unknown> {
  let nextTaskId: string | undefined;

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const requestData = nextTaskId
      ? { reqDTO: { ...reqDTO, asyncTaskId: nextTaskId } }
      : { reqDTO };

    const raw = await callConsoleGateway(config, token, {
      api,
      data: requestData,
    });

    const resp = extractResponseData(raw as Record<string, unknown>);

    if (resp.taskId && Object.keys(resp).length === 1) {
      nextTaskId = resp.taskId as string;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    return raw;
  }
  return null;
}

function resolveWorkspaceId(config: Config, flagWorkspaceId?: string): string {
  if (flagWorkspaceId) return flagWorkspaceId;
  if (config.workspaceId) return config.workspaceId;

  process.stderr.write(
    `Error: workspace-id is required. Set via --workspace-id, BAILIAN_WORKSPACE_ID, or \`${config.binName} config set workspace_id <id>\`.\n`,
  );
  process.stderr.write(
    `Hint: run \`${config.binName} workspace list\` to view available workspaces.\n`,
  );
  process.exit(1);
}

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractOverviewData(result: unknown): OverviewStatistic | undefined {
  const resp = extractResponseData(result as Record<string, unknown>);
  if (resp.callSuccessCount !== undefined || resp.usages !== undefined) {
    return resp as unknown as OverviewStatistic;
  }
  return undefined;
}

function extractListData(result: unknown): ListStatisticResponse {
  const resp = extractResponseData(result as Record<string, unknown>);
  const list = (resp.list as ModelStatisticItem[]) ?? [];
  const totalCount = (resp.totalCount as number) ?? 0;
  const maxResults = (resp.maxResults as number) ?? 0;
  return { list, totalCount, maxResults };
}

function resolveUsageMap(item: ModelStatisticItem): Record<string, number> {
  const out: Record<string, number> = {};
  if (item.usages && Array.isArray(item.usages)) {
    for (const entry of item.usages) {
      if (entry.key && entry.value != null) {
        out[entry.key] = entry.value;
      }
    }
  }
  if (item.usage && typeof item.usage === "object") {
    for (const [key, val] of Object.entries(item.usage)) {
      if (val != null) out[key] = val;
    }
  }
  return out;
}

interface UsageLabel {
  en: string;
  unit?: string;
}

const USAGE_KEY_LABELS: Record<string, UsageLabel> = {
  total_token: { en: "Total Tokens", unit: "tokens" },
  input_token: { en: "Input Tokens", unit: "tokens" },
  output_token: { en: "Output Tokens", unit: "tokens" },
  input_token_cache: { en: "Cached Tokens", unit: "tokens" },
  input_token_cache_read: { en: "Cache Read", unit: "tokens" },
  input_token_cache_creation: { en: "Cache Creation", unit: "tokens" },
  thinking_input_token: { en: "Thinking Input", unit: "tokens" },
  thinking_output_token: { en: "Thinking Output", unit: "tokens" },
  text_input_token: { en: "Text Input", unit: "tokens" },
  purein_text_output_token: { en: "Text Output", unit: "tokens" },
  embedding_token: { en: "Embedding", unit: "tokens" },
  image_number: { en: "Images", unit: "images" },
  video_duration: { en: "Video Duration", unit: "sec" },
  content_duration: { en: "Audio Duration", unit: "sec" },
  tts_text_number: { en: "TTS Chars", unit: "chars" },
  total_token_avg: { en: "Avg Tokens/Req" },
};

function formatLabel(label: UsageLabel): string {
  const unitSuffix = label.unit ? ` [${label.unit}]` : "";
  return `${label.en}${unitSuffix}`;
}

function printOverview(
  stat: OverviewStatistic,
  startTime: number,
  endTime: number,
  days: number,
  noColor: boolean,
): void {
  const bold = noColor ? (text: string) => text : (text: string) => `\x1b[1m${text}\x1b[0m`;
  const dim = noColor ? (text: string) => text : (text: string) => `\x1b[2m${text}\x1b[0m`;

  process.stdout.write(
    `${dim("Time Range Period:")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${dim(`(${days} days)`)}\n\n`,
  );

  const rows: [string, string][] = [
    ["Models Called", formatNumber(stat.modelCount ?? 0)],
    ["Successful Calls", formatNumber(stat.callSuccessCount ?? 0)],
  ];

  for (const usage of stat.usages ?? []) {
    const label = USAGE_KEY_LABELS[usage.key];
    const text = label ? formatLabel(label) : usage.key;
    rows.push([text, formatNumber(usage.value)]);
  }

  const maxLabel = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    process.stdout.write(`${bold(padEnd(label, maxLabel + 2))}${value}\n`);
  }
}

function printModelTable(
  items: ModelStatisticItem[],
  startTime: number,
  endTime: number,
  days: number,
  noColor: boolean,
): void {
  const bold = noColor ? (text: string) => text : (text: string) => `\x1b[1m${text}\x1b[0m`;
  const dim = noColor ? (text: string) => text : (text: string) => `\x1b[2m${text}\x1b[0m`;

  process.stdout.write(
    `${dim("Time Range Period:")} ${formatDate(startTime)} ~ ${formatDate(endTime)} ${dim(`(${days} days)`)}\n\n`,
  );

  if (items.length === 0) {
    process.stdout.write("No usage data found.\n");
    return;
  }

  const usageKeys = new Set<string>();
  const itemUsages = items.map((item) => {
    const usage = resolveUsageMap(item);
    for (const key of Object.keys(usage)) usageKeys.add(key);
    return usage;
  });

  const orderedKeys = [...usageKeys].sort((keyA, keyB) => {
    const order = [
      "total_token",
      "input_token",
      "output_token",
      "input_token_cache",
      "image_number",
      "video_duration",
      "content_duration",
      "tts_text_number",
    ];
    const idxA = order.indexOf(keyA);
    const idxB = order.indexOf(keyB);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const headers = ["Model", "Calls", ...orderedKeys.map((key) => USAGE_KEY_LABELS[key]?.en ?? key)];
  const rows = items.map((item, idx) => [
    item.model,
    formatNumber(item.callSuccessCount ?? 0),
    ...orderedKeys.map((key) => {
      const val = itemUsages[idx][key];
      return val != null ? formatNumber(val) : "-";
    }),
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((width) => dim("─".repeat(width))).join("──");

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    const cells = row.map((cell, col) => padEnd(cell, widths[col]));
    process.stdout.write(cells.join("  ") + "\n");
  }

  process.stdout.write(dim(`\nTotal: ${items.length} models`) + "\n");
}

export default defineCommand({
  description: "Query model usage statistics",
  skipDefaultApiKeySetup: true,
  usageArgs: "[--model <model>] [--days <days>] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name(s), comma-separated; omit for overview",
    },
    {
      flag: "--days <days>",
      description: "Number of days (default: 7)",
    },
    {
      flag: "--type <type>",
      description: "Model type: Text, Vision, Multimodal, Audio, Embedding",
    },
    {
      flag: "--workspace-id <id>",
      description: "Workspace ID (env: BAILIAN_WORKSPACE_ID)",
    },
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
  exampleArgs: [
    "",
    "--days 30",
    "--model qwen-turbo",
    "--model qwen-turbo --days 7",
    "--model qwen3.6-plus,deepseek-v4-pro",
    "--type Text --days 14",
    "--output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const modelFlag = (flags.model as string) || undefined;
    const daysFlag = Number(flags.days) || 7;
    const typeFlag = (flags.type as string) || undefined;
    const format = detectOutputFormat(config.output);

    const flagWorkspaceId = (flags.workspaceId as string) || undefined;
    const workspaceId = resolveWorkspaceId(config, flagWorkspaceId);

    const endTime = Date.now();
    const startTime = endTime - daysFlag * 24 * 60 * 60 * 1000;

    if (modelFlag) {
      const models = [
        ...new Set(
          modelFlag
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];

      const baseReqDTO: Record<string, unknown> = {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
        maxResults: 50,
        skip: 0,
        sortField: "success_count",
        sortOrder: "DESC",
      };
      if (typeFlag) baseReqDTO.obsModelType = typeFlag;

      if (config.dryRun) {
        emitResult(
          { api: LIST_API, data: { reqDTO: { ...baseReqDTO, model: models.join(",") } } },
          format,
        );
        return;
      }

      const credential = await resolveConsoleGatewayCredential(config);

      const results = await Promise.all(
        models.map((model) =>
          pollTelemetryApi(config, credential.token, LIST_API, { ...baseReqDTO, model }),
        ),
      );

      const allItems: ModelStatisticItem[] = [];
      for (const result of results) {
        if (!result) continue;
        const listData = extractListData(result);
        allItems.push(...listData.list);
      }

      if (format === "json") {
        const items = allItems.map((item) => {
          const usage = resolveUsageMap(item);
          const clean: Record<string, unknown> = {
            model: item.model,
            successfulCalls: item.callSuccessCount ?? 0,
          };
          for (const [key, val] of Object.entries(usage)) {
            clean[key] = val;
          }
          return clean;
        });
        emitResult(
          {
            period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
            items,
          },
          format,
        );
        return;
      }

      printModelTable(allItems, startTime, endTime, daysFlag, config.noColor);
    } else {
      const reqDTO: Record<string, unknown> = {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
      };
      if (typeFlag) reqDTO.obsModelType = typeFlag;

      if (config.dryRun) {
        emitResult({ api: OVERVIEW_API, data: { reqDTO } }, format);
        return;
      }

      const credential = await resolveConsoleGatewayCredential(config);

      const result = await pollTelemetryApi(config, credential.token, OVERVIEW_API, reqDTO);
      if (!result) {
        process.stderr.write("Error: request timed out.\n");
        process.exit(1);
      }

      const stat = extractOverviewData(result);

      if (format === "json") {
        if (!stat) {
          emitResult(
            {
              period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
              modelsCalled: 0,
              successfulCalls: 0,
            },
            format,
          );
          return;
        }
        emitResult(
          {
            period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
            modelsCalled: stat.modelCount ?? 0,
            successfulCalls: stat.callSuccessCount ?? 0,
            usages: (stat.usages ?? []).map((u) => ({
              key: u.key,
              value: u.value,
              unit: u.unit,
              label: USAGE_KEY_LABELS[u.key]?.en ?? u.key,
            })),
          },
          format,
        );
        return;
      }

      if (!stat) {
        process.stdout.write("No usage data found.\n");
        return;
      }

      printOverview(stat, startTime, endTime, daysFlag, config.noColor);
    }
  },
});
