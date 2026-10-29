import { defineCommand, listBatches, BATCH_STATUSES, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { batchDate, batchInteger, DRY_RUN_NOTE } from "./shared.ts";
const LIST_FLAGS = {
  limit: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Page size: 1–100 (default: 20)",
      "zh-CN": "每页数量：1–100（默认：20）",
    },
  },
  after: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Previous page last_id", "zh-CN": "上一页 last_id" },
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Task name filter", "zh-CN": "任务名称筛选" },
  },
  inputFileId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Input file filter (repeatable, max 20)",
      "zh-CN": "输入文件筛选（可重复，最多 20 个）",
    },
  },
  status: {
    type: "array",
    choices: BATCH_STATUSES,
    valueHint: "<status>",
    description: { "en-US": "Task status filter (repeatable)", "zh-CN": "任务状态筛选（可重复）" },
  },
  createdAfter: {
    type: "string",
    valueHint: "<yyyyMMddHHmmss>",
    description: {
      "en-US": "Created after API timestamp",
      "zh-CN": "创建时间下限（API 时间格式）",
    },
  },
  createdBefore: {
    type: "string",
    valueHint: "<yyyyMMddHHmmss>",
    description: {
      "en-US": "Created before API timestamp",
      "zh-CN": "创建时间上限（API 时间格式）",
    },
  },
} satisfies FlagsDef;
export default defineCommand({
  description: { "en-US": "List one page of Batch tasks", "zh-CN": "查询一页 Batch 任务" },
  auth: "apiKey",
  flags: LIST_FLAGS,
  usageArgs: "[filters] [--after <id>] [--limit <n>]",
  exampleArgs: [
    "--status completed --status failed --limit 20",
    "--after batch_xxx --limit 20",
    "--created-after 20261001000000 --created-before 20261023235959",
  ],
  notes: [
    {
      "en-US":
        "Returns data, last_id and has_more; use --after last_id for the next page. API timestamps are not timezone-converted.",
      "zh-CN":
        "返回 data、last_id 与 has_more；用 --after last_id 获取下一页。API 时间不自动转换时区。",
    },
    DRY_RUN_NOTE,
  ],
  validate(flags) {
    batchInteger(flags.limit, "--limit", 1, 100);
    batchDate(flags.createdAfter);
    batchDate(flags.createdBefore);
    if ((flags.inputFileId?.length ?? 0) > 20)
      return "At most 20 input file IDs. / 最多指定 20 个输入文件 ID。";
    if (flags.createdAfter && flags.createdBefore && flags.createdAfter > flags.createdBefore)
      return "--created-after must not exceed --created-before. / --created-after 不得晚于 --created-before。";
    return undefined;
  },
  async run(ctx) {
    const query = {
      limit: ctx.flags.limit ?? 20,
      after: ctx.flags.after,
      ds_name: ctx.flags.name,
      input_file_ids: ctx.flags.inputFileId,
      status: ctx.flags.status,
      create_after: ctx.flags.createdAfter,
      create_before: ctx.flags.createdBefore,
    };
    if (ctx.settings.dryRun) {
      emitResult({ action: "batch.list", query }, "json");
      return;
    }
    const response = await listBatches(ctx.client, query);
    if (ctx.settings.quiet) emitBare(response.data.map((job) => job.id).join("\n"));
    else if (ctx.settings.output === "text")
      emitBare(
        formatTable(
          ctx
            .localize({
              "en-US": "ID|NAME|STATUS|COMPLETED/FAILED/TOTAL|CREATED",
              "zh-CN": "ID|名称|状态|成功/失败/总数|创建时间",
            })
            .split("|"),
          response.data.map((job) => [
            job.id,
            job.metadata?.ds_name ?? "",
            job.status,
            `${job.request_counts?.completed ?? ""}/${job.request_counts?.failed ?? ""}/${job.request_counts?.total ?? ""}`,
            job.created_at ? new Date(job.created_at * 1000).toISOString() : "",
          ]),
        ).join("\n"),
      );
    else emitResult(response, "json");
    if (response.has_more && response.last_id && !ctx.settings.quiet)
      console.error(
        ctx.localize({
          "en-US": `Next page: batch list --after ${response.last_id}`,
          "zh-CN": `下一页：batch list --after ${response.last_id}`,
        }),
      );
  },
});
