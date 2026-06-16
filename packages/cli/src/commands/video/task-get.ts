import {
  defineCommand,
  requestJson,
  taskEndpoint,
  detectOutputFormat,
  type DashScopeTaskResponse,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "video task get",
  description: "Query async task status",
  usage: "bl video task get --task-id <id>",
  options: [{ flag: "--task-id <id>", description: "Async task ID" }],
  examples: [
    "bl video task get --task-id 3b256896-3e70-xxxx-xxxx-xxxxxxxxxxxx",
    "bl video task get --task-id 3b256896-3e70-xxxx --output json",
  ],
  async run(config, flags) {
    const taskId = flags.taskId;
    if (!taskId) failIfMissing("task-id", "bl video task get --task-id <id>");

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
