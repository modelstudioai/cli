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
import { poll } from "bailian-cli-runtime";

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
  return poll<DashScopeTaskResponse>(ctx.client, {
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
}
