import {
  defineCommand,
  taskPath,
  stripUndefined,
  type DashScopeTaskResponse,
} from "bailian-cli-core";

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

    if (settings.dryRun) {
      ctx.output.result({ task_id: taskId });
      return;
    }

    const response = await ctx.client.requestJson<DashScopeTaskResponse>({
      path: taskPath(taskId),
    });

    // Pass through server failure fields and translation outputs for image/omni tasks.
    ctx.output.result(
      stripUndefined({
        task_id: response.output.task_id,
        task_status: response.output.task_status,
        video_url: response.output.video_url,
        output_video_url: response.output.output_video_url,
        image_url: response.output.image_url,
        results: response.output.results,
        Success: response.output.Success,
        Code: response.output.Code,
        Message: response.output.Message,
        RequestId: response.output.RequestId,
        Data: response.output.Data,
        submit_time: response.output.submit_time,
        scheduled_time: response.output.scheduled_time,
        end_time: response.output.end_time,
        code: response.output.code,
        message: response.output.message,
        request_id: response.request_id,
      }),
    );
  },
});
