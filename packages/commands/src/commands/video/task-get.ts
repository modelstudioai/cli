import {
  defineCommand,
  taskPath,
  detectOutputFormat,
  stripUndefined,
  type DashScopeTaskResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: { "en-US": "Query async task status", "zh-CN": "查询异步任务状态" },
  auth: "apiKey",
  usageArgs: "--task-id <id>",
  flags: {
    taskId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "Async task ID", "zh-CN": "异步任务 ID" },
      required: true,
    },
  },
  exampleArgs: [
    "--task-id 3b256896-3e70-xxxx-xxxx-xxxxxxxxxxxx",
    "--task-id 3b256896-3e70-xxxx --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const taskId = flags.taskId;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ task_id: taskId }, format);
      return;
    }

    const response = await ctx.client.requestJson<DashScopeTaskResponse>({
      path: taskPath(taskId),
    });

    if (settings.quiet) {
      emitBare(response.output.task_status);
      return;
    }

    // 透传服务端失败字段：FAILED 时 output.code / output.message 是排查依据；request_id 便于工单溯源。
    emitResult(
      stripUndefined({
        task_id: response.output.task_id,
        task_status: response.output.task_status,
        video_url: response.output.video_url,
        results: response.output.results,
        submit_time: response.output.submit_time,
        scheduled_time: response.output.scheduled_time,
        end_time: response.output.end_time,
        code: response.output.code,
        message: response.output.message,
        request_id: response.request_id,
      }),
      format,
    );
  },
});
