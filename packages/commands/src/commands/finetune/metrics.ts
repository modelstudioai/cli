import { defineCommand, listBasicMetrics, type FlagsDef } from "bailian-cli-core";

/**
 * The old Zelda metric API defaulted to 100 records per page; the OpenAPI
 * defaults to 1000. Send 100 explicitly unless the user overrides, so page
 * shape stays the same across the switch.
 */
const LEGACY_DEFAULT_PAGE_SIZE = 100;

const METRICS_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Fine-tune job ID (required)",
      "zh-CN": "微调任务 ID（必填）",
    },
    required: true,
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Page number, starting at 1 (default: 1)",
      "zh-CN": "页码，从 1 开始（默认：1）",
    },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": `Records per page (default: ${LEGACY_DEFAULT_PAGE_SIZE})`,
      "zh-CN": `每页记录数（默认：${LEGACY_DEFAULT_PAGE_SIZE}）`,
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Workspace ID sent as X-DashScope-WorkSpace; use the job's owning workspace. Omit when your API key is already workspace-bound.",
      "zh-CN":
        "以 X-DashScope-WorkSpace 头发送的业务空间 ID，使用任务所属空间；API Key 已绑定空间时可省略。",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Query the training metrics of a fine-tune job",
    "zh-CN": "查询微调任务的训练指标",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id> [--page <n>] [--page-size <n>] [--workspace-id <id>]",
  flags: METRICS_FLAGS,
  exampleArgs: [
    "--job-id ft-xxx",
    "--job-id ft-xxx --page 2 --page-size 100",
    "--job-id ft-xxx --output json",
    "--job-id ft-xxx --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Queries GET /api/v1/fine-tunes/{job_id}/basic_metrics. Each metrics record is returned verbatim (step + dynamic metric fields); an empty list is a normal result.",
      "zh-CN":
        "调用 GET /api/v1/fine-tunes/{job_id}/basic_metrics。每条指标记录原样返回（step + 动态指标字段）；空列表是正常结果。",
    },
    {
      "en-US":
        "Metrics are not filtered server-side; the full result is returned and callers pick the metric keys from each record. Use --page/--page-size for paging.",
      "zh-CN":
        "指标不在服务端过滤；返回全量记录，调用方从记录中自行选取指标 key 展示。翻页用 --page/--page-size。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const pageNo = flags.page ?? 1;
    const pageSize = flags.pageSize ?? LEGACY_DEFAULT_PAGE_SIZE;

    if (settings.dryRun) {
      const resultData = {
        action: "finetune.metrics",
        job_id: jobId,
        page_no: pageNo,
        page_size: pageSize,
        ...(flags.workspaceId ? { workspace_id: flags.workspaceId } : {}),
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const response = await listBasicMetrics(ctx.client, jobId, {
      pageNo,
      pageSize,
      workspaceId: flags.workspaceId || undefined,
    });

    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
