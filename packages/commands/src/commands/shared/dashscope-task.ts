import {
  BailianError,
  ExitCode,
  taskPath,
  type Client,
  type CommandOutput,
  type DashScopeTaskResponse,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { downloadFile, poll } from "bailian-cli-runtime";

function taskApiCode(output: DashScopeTaskResponse["output"]): string | undefined {
  if (output.Code !== undefined) return String(output.Code);
  return output.code;
}

function taskRequestId(data: DashScopeTaskResponse): string | undefined {
  return data.output.RequestId || data.request_id;
}

function taskFailureMessage(output: DashScopeTaskResponse["output"]): string {
  return String(output.Message || output.message || output.code || "Task failed.");
}

/** Polling deadline, per-request abort, or idle-body timeout while waiting on a task. */
function isTimeoutLikeError(error: unknown): boolean {
  if (error instanceof BailianError && error.exitCode === ExitCode.TIMEOUT) return true;
  if (error !== null && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return name === "AbortError" || name === "TimeoutError";
  }
  return false;
}

/** Poll a DashScope async task until SUCCEEDED, FAILED, CANCELED, or UNKNOWN. */
export async function pollDashScopeTask(
  ctx: {
    client: Client;
    output: CommandOutput;
    localize: (text: LocalizedText) => string;
    settings: Pick<Settings, "timeout">;
  },
  taskId: string,
  options: {
    pollInterval: number;
    /** Invoked when status is SUCCEEDED (e.g. qwen-mt-uni Success check). */
    extraCheck?: (data: DashScopeTaskResponse) => void;
  },
): Promise<DashScopeTaskResponse> {
  try {
    return await poll<DashScopeTaskResponse>(ctx.client, {
      output: ctx.output,
      url: ctx.client.url(taskPath(taskId)),
      intervalSec: options.pollInterval,
      timeoutSec: ctx.settings.timeout,
      load: async () => {
        const data = await ctx.client.requestJson<DashScopeTaskResponse>({
          path: taskPath(taskId),
        });
        const status = data.output.task_status;
        if (status === "FAILED") {
          throw new BailianError(taskFailureMessage(data.output), ExitCode.GENERAL, undefined, {
            api: {
              apiCode: taskApiCode(data.output),
              requestId: taskRequestId(data),
            },
          });
        }
        if (status === "CANCELED" || status === "UNKNOWN") {
          throw new BailianError(
            ctx.localize({
              "en-US": `Task ended with status ${status}.`,
              "zh-CN": `任务以状态 ${status} 结束。`,
            }),
            ExitCode.GENERAL,
            undefined,
            {
              api: {
                apiCode: taskApiCode(data.output),
                requestId: taskRequestId(data),
              },
            },
          );
        }
        if (status === "SUCCEEDED") {
          options.extraCheck?.(data);
        }
        return data;
      },
      isComplete: (data) => (data as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: () => false,
      getStatus: (data) => (data as DashScopeTaskResponse).output.task_status,
    });
  } catch (error) {
    // Include submitted task_id for both poll-loop TIMEOUT and hung single GETs (AbortError).
    if (isTimeoutLikeError(error)) {
      throw new BailianError(
        ctx.localize({
          "en-US": `Polling timed out. task_id=${taskId}`,
          "zh-CN": `轮询超时。task_id=${taskId}`,
        }),
        ExitCode.TIMEOUT,
        ctx.localize({
          "en-US": `Try increasing --timeout, or query the task with id ${taskId}.`,
          "zh-CN": `可增大 --timeout，或用 task_id ${taskId} 查询任务状态。`,
        }),
        { cause: error },
      );
    }
    throw error;
  }
}

/** Download a succeeded task artifact; keep task_id on download / disk failures. */
export async function downloadDashScopeTaskResult(
  ctx: {
    localize: (text: LocalizedText) => string;
    settings: Pick<Settings, "quiet" | "output">;
  },
  taskId: string,
  url: string,
  destPath: string,
): Promise<{ size: number }> {
  try {
    return await downloadFile(url, destPath, {
      quiet: ctx.settings.quiet || ctx.settings.output === "json",
    });
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const exitCode = error instanceof BailianError ? error.exitCode : ExitCode.GENERAL;
    throw new BailianError(
      `${originalMessage} task_id=${taskId}`,
      exitCode,
      ctx.localize({
        "en-US": `Task already succeeded. Query or re-download with task_id ${taskId}; do not resubmit.`,
        "zh-CN": `任务已成功。请用 task_id ${taskId} 查询或重新下载，勿重新提交。`,
      }),
      { cause: error },
    );
  }
}
