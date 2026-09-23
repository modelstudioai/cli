import {
  BailianError,
  defineCommand,
  ExitCode,
  getCapacityInstance,
  getCapacityOperation,
  getDeployment,
  type Client,
  type FlagsDef,
  type GetCapacityOperationResponse,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { CAPACITY_OPERATION_FLAGS, validateQueryIds } from "./query-shared.ts";

const DEFAULT_INTERVAL = 2;
const DEFAULT_POLL_TIMEOUT = 600;
const MAX_POLL_TIMEOUT = 2_147_483;

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Only GETs: poll the operation, then refresh the confirmed instance and ModelCode. */
export async function waitForCapacityOperation(
  client: Client,
  deployedModel: string,
  operationId: string,
  options: {
    interval: number;
    pollTimeout: number;
    signal?: AbortSignal;
    initialResponse?: GetCapacityOperationResponse;
    fallbackInstanceId?: string;
  },
) {
  const controller = new AbortController();
  let lastResponse: GetCapacityOperationResponse | undefined;
  let initialResponse = options.initialResponse;
  const timeoutError = () =>
    new BailianError(
      "Capacity operation wait timed out; query the same operation ID before retrying any write. / 等待容量操作超时；重试写操作前请查询同一操作 ID。",
      ExitCode.TIMEOUT,
      undefined,
      {
        cause: {
          deployed_model: deployedModel,
          operation_id: operationId,
          last_response: lastResponse,
        },
      },
    );
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const deadline = Date.now() + options.pollTimeout * 1000;
  const timer = setTimeout(() => controller.abort(timeoutError()), options.pollTimeout * 1000);
  const checkDeadline = () => {
    if (Date.now() >= deadline && !controller.signal.aborted) controller.abort(timeoutError());
    controller.signal.throwIfAborted();
  };
  let intervalMs = options.interval * 1000;
  const maxIntervalMs = Math.max(intervalMs, 30_000);
  try {
    while (true) {
      checkDeadline();
      const response =
        initialResponse ??
        (await getCapacityOperation(client, deployedModel, operationId, controller.signal));
      initialResponse = undefined;
      lastResponse = response;
      checkDeadline();
      const operation = response.output ?? response.data;
      if (operation?.operation_status === "FAILED") {
        throw new BailianError(
          operation.error_message ??
            operation.error_code ??
            "Capacity operation failed. / 容量操作失败。",
          ExitCode.GENERAL,
          undefined,
          {
            api: {
              httpStatus: 200,
              apiCode: operation.error_code,
              requestId: response.request_id,
            },
            cause: operation,
            rawResponse: JSON.stringify(response),
          },
        );
      }
      if (operation?.operation_status === "SUCCEEDED") {
        const instanceId = operation.instance_id ?? options.fallbackInstanceId;
        const instance = instanceId
          ? await getCapacityInstance(client, deployedModel, instanceId, controller.signal)
          : undefined;
        checkDeadline();
        const deployment = await getDeployment(client, deployedModel, controller.signal);
        checkDeadline();
        return { ...response, instance, deployment };
      }
      if (operation?.operation_status !== "PROCESSING") {
        throw new BailianError(
          "Missing or unsupported operation_status; cannot determine completion. / 缺少或不支持的 operation_status，无法判断完成状态。",
          ExitCode.GENERAL,
          undefined,
          { cause: response, rawResponse: JSON.stringify(response) },
        );
      }
      await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())), controller.signal);
      intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

const FLAGS = {
  ...CAPACITY_OPERATION_FLAGS,
  interval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Initial poll interval (1–3600 seconds, default: 2); doubles up to max(initial, 30)",
      "zh-CN": "初始轮询间隔（1–3600 秒，默认：2）；逐次翻倍至 max(初始值, 30)",
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Total wait budget including requests and refresh (default: 600 seconds)",
      "zh-CN": "总等待时限，包含请求及刷新（默认：600 秒）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Wait for a capacity operation and refresh confirmed capacity",
    "zh-CN": "等待容量操作完成并刷新已确认容量",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs:
    "--deployed-model <code> --operation-id <id> [--interval <seconds>] [--poll-timeout <seconds>]",
  exampleArgs: [
    "--deployed-model example-model-code --operation-id 100001",
    "--deployed-model example-model-code --operation-id 100001 --interval 2 --poll-timeout 600",
  ],
  notes: [
    {
      "en-US":
        "Read-only GET polling: PROCESSING continues, FAILED exits 1 with the server error, SUCCEEDED refreshes the instance (when an ID is returned) and deployment. Output preserves the operation envelope and adds instance/deployment response envelopes. Missing or unknown status fails rather than assuming success.",
      "zh-CN":
        "只读 GET 轮询：PROCESSING 继续等待，FAILED 透传服务端错误并退出 1，SUCCEEDED 刷新实例（返回 ID 时）及部署。输出保留操作响应结构，追加 instance/deployment 响应结构。缺失或未知状态报错，不推定成功。",
    },
    {
      "en-US":
        "--timeout limits each HTTP request; --poll-timeout bounds the entire wait (exit 5 on expiry). Ctrl-C stops local waiting, not the remote operation. No write is retried; use the original operation ID after a timeout or interruption.",
      "zh-CN":
        "--timeout 限制单次 HTTP 请求，--poll-timeout 限制整个等待过程（超时退出 5）。Ctrl-C 只停止本地等待，不取消远端操作。不重试任何写请求；超时或中断后仍使用原操作 ID 查询。",
    },
  ],
  validate(flags) {
    const error = validateQueryIds(flags);
    if (error) return error;
    if (
      flags.interval !== undefined &&
      (!Number.isFinite(flags.interval) || flags.interval < 1 || flags.interval > 3600)
    ) {
      return "--interval must be 1–3600 seconds. / --interval 必须为 1–3600 秒。";
    }
    if (
      flags.pollTimeout !== undefined &&
      (!Number.isFinite(flags.pollTimeout) ||
        flags.pollTimeout <= 0 ||
        flags.pollTimeout > MAX_POLL_TIMEOUT)
    ) {
      return `--poll-timeout must be > 0 and <= ${MAX_POLL_TIMEOUT} seconds. / --poll-timeout 必须大于 0 且不超过 ${MAX_POLL_TIMEOUT} 秒。`;
    }
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const interval = flags.interval ?? DEFAULT_INTERVAL;
    const pollTimeout = flags.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.operation.wait",
          deployed_model: flags.deployedModel,
          operation_id: flags.operationId,
          interval,
          poll_timeout: pollTimeout,
        },
        "json",
      );
      return;
    }
    const controller = new AbortController();
    const onInterrupt = () => controller.abort(new Error("Interrupted. / 已中断。"));
    process.once("SIGINT", onInterrupt);
    try {
      const result = await waitForCapacityOperation(
        ctx.client,
        flags.deployedModel,
        flags.operationId,
        { interval, pollTimeout, signal: controller.signal },
      );
      emitResult(result, "json");
    } catch (error) {
      // The CLI runtime owns SIGINT's exit status (130). Do not emit success on interruption.
      if (!controller.signal.aborted) throw error;
    } finally {
      process.removeListener("SIGINT", onInterrupt);
    }
  },
});
