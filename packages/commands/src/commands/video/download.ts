import {
  defineCommand,
  requestJson,
  taskEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type DashScopeTaskResponse,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import { failIfMissing } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  name: "video download",
  description: "Download a completed video by task ID",
  usage: "bl video download --task-id <id> --out <path>",
  options: [
    { flag: "--task-id <id>", description: "Task ID to download from" },
    { flag: "--out <path>", description: "Output file path" },
  ],
  examples: [
    "bl video download --task-id 3b256896-xxxx --out video.mp4",
    "bl video download --task-id 3b256896-xxxx --out video.mp4 --quiet",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const taskId = flags.taskId as string | undefined;
    if (!taskId) failIfMissing("task-id", "bl video download --task-id <id> --out <path>");

    const outPath = flags.out as string | undefined;
    if (!outPath) failIfMissing("out", "bl video download --task-id <id> --out video.mp4");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ task_id: taskId, action: "download", out: outPath }, format);
      return;
    }

    // Get task info to find video URL
    const url = taskEndpoint(config.baseUrl, taskId);
    const taskInfo = await requestJson<DashScopeTaskResponse>(config, { url });

    if (taskInfo.output.task_status !== "SUCCEEDED") {
      throw new BailianError(
        `Task is not complete (status: ${taskInfo.output.task_status}).`,
        ExitCode.GENERAL,
        "Wait for the task to complete before downloading.",
      );
    }

    const downloadUrl =
      taskInfo.output.video_url || (taskInfo.output.results && taskInfo.output.results[0]?.url);

    if (!downloadUrl) {
      throw new BailianError("No download URL available for this task.", ExitCode.GENERAL);
    }

    const { size } = await downloadFile(downloadUrl, outPath, { quiet: config.quiet });

    if (config.quiet) {
      emitBare(outPath);
      return;
    }

    emitResult({ saved: outPath, size: formatBytes(size) }, format);
  },
});
