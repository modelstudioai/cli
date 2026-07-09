import {
  defineCommand,
  taskPath,
  detectOutputFormat,
  type DashScopeTaskResponse,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Download a completed video by task ID",
  auth: "apiKey",
  usageArgs: "--task-id <id> --out <path>",
  flags: {
    taskId: {
      type: "string",
      valueHint: "<id>",
      description: "Task ID to download from",
      required: true,
    },
    out: { type: "string", valueHint: "<path>", description: "Output file path", required: true },
  },
  exampleArgs: [
    "--task-id 3b256896-xxxx --out video.mp4",
    "--task-id 3b256896-xxxx --out video.mp4 --quiet",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const taskId = flags.taskId;

    const outPath = flags.out;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ task_id: taskId, action: "download", out: outPath }, format);
      return;
    }

    // Get task info to find the video URL.
    const taskInfo = await ctx.client.requestJson<DashScopeTaskResponse>({
      path: taskPath(taskId),
    });

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

    const { size } = await downloadFile(downloadUrl, outPath, { quiet: settings.quiet });

    if (settings.quiet) {
      emitBare(outPath);
      return;
    }

    emitResult({ saved: outPath, size: formatBytes(size) }, format);
  },
});
