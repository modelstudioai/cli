import {
  defineCommand,
  taskPath,
  detectOutputFormat,
  type DashScopeTaskResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Query async task status",
  auth: "apiKey",
  usageArgs: "--task-id <id>",
  flags: {
    taskId: { type: "string", valueHint: "<id>", description: "Async task ID", required: true },
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

    emitResult(
      {
        task_id: response.output.task_id,
        task_status: response.output.task_status,
        video_url: response.output.video_url,
        results: response.output.results,
        submit_time: response.output.submit_time,
        end_time: response.output.end_time,
      },
      format,
    );
  },
});
