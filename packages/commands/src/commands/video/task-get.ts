import {
  defineCommand,
  requestJson,
  taskEndpoint,
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
  async run(config, flags) {
    const taskId = flags.taskId;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ task_id: taskId }, format);
      return;
    }

    const url = taskEndpoint(config.baseUrl, taskId);
    const response = await requestJson<DashScopeTaskResponse>(config, { url });

    if (config.quiet) {
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
