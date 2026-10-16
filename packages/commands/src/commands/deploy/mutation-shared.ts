import {
  BailianError,
  ExitCode,
  getCapacityInstance,
  type CapacityInstance,
  type CapacityOperation,
  type Client,
  type Deployment,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { waitForCapacityOperation } from "./operation-wait.ts";

export const CAPACITY_FLAGS = {
  inputTpm: {
    type: "number",
    valueHint: "<kTPM>",
    description: {
      "en-US": "Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)",
      "zh-CN": "输入绝对容量，单位 kTPM（1 kTPM = 1000 Tokens/分钟）",
    },
  },
  outputTpm: {
    type: "number",
    valueHint: "<kTPM>",
    description: {
      "en-US": "Absolute output capacity in kTPM",
      "zh-CN": "输出绝对容量，单位 kTPM",
    },
  },
} satisfies FlagsDef;

export const PREPAID_FLAGS = {
  duration: {
    type: "number",
    valueHint: "<days>",
    description: {
      "en-US": "Prepaid purchase/renewal duration, positive integer days",
      "zh-CN": "预付费购买或续订天数，正整数",
    },
  },
  autoRenewal: {
    type: "boolean",
    valueHint: "<true|false>",
    description: {
      "en-US": "Explicitly enable or disable automatic renewal for prepaid purchases",
      "zh-CN": "显式开启或关闭预付费自动续费",
    },
  },
  autoRenewalDuration: {
    type: "number",
    valueHint: "<days>",
    description: {
      "en-US": "Automatic renewal duration; required when enabled",
      "zh-CN": "自动续费天数，开启自动续费时必填",
    },
  },
  autoRenewalCycle: {
    type: "string",
    valueHint: "<cycle>",
    description: {
      "en-US": "Optional supported renewal cycle, e.g. Day",
      "zh-CN": "可选续费周期单位，按服务支持的值传入，如 Day",
    },
  },
} satisfies FlagsDef;

export const WAIT_OPTIONS = {
  wait: {
    type: "switch",
    description: {
      "en-US": "Wait for the returned capacity operation and refresh capacity",
      "zh-CN": "等待返回的容量操作完成并刷新容量",
    },
  },
  interval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Initial wait poll interval (1–3600, default: 2 seconds)",
      "zh-CN": "等待初始轮询间隔（1–3600，默认：2 秒）",
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Wait budget after submission (default: 600 seconds)",
      "zh-CN": "提交后的等待总时限（默认：600 秒）",
    },
  },
} satisfies FlagsDef;

export const WRITE_OPTIONS = {
  requestId: {
    type: "string",
    valueHint: "<uuid>",
    description: {
      "en-US":
        "Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation",
      "zh-CN": "请求标识，省略时生成；仅重试同一容量操作时保持标识和参数一致",
    },
  },
  ...WAIT_OPTIONS,
} satisfies FlagsDef;

export const ORDER_TYPE_FLAG = {
  orderType: {
    type: "string",
    valueHint: "<UPGRADE|DOWNGRADE>",
    choices: ["UPGRADE", "DOWNGRADE"] as const,
    description: {
      "en-US": "Optional order direction; otherwise the server decides",
      "zh-CN": "可选变配方向，省略时由服务端判定",
    },
  },
} satisfies FlagsDef;

export const MUTATION_NOTES: LocalizedText[] = [
  {
    "en-US":
      "Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.",
    "zh-CN":
      "先用 --dry-run 预览，确认后再用 --yes。写请求只提交一次，不自动重试。HTTP 200 不等于操作成功：检查 operation_status 或使用 --wait。中断或超时后，先查询已保存的 ModelCode/操作 ID，再考虑是否重试写请求。",
  },
  {
    "en-US":
      "Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal configuration is part of purchase/scale/renew, not a standalone free setting change.",
    "zh-CN":
      "容量是单个实例的绝对 kTPM，不是增量或 ModelCode 总量；容量归零不等于释放。模型步长、上下限及购买时长限制由服务端校验。自动续费配置属于购买、变配或续订流程，不是独立免费设置操作。",
  },
];

export interface MutationOptions {
  requestId?: string;
  wait?: boolean;
  interval?: number;
  pollTimeout?: number;
}

export function validateWriteOptions(flags: MutationOptions): string | undefined {
  if (
    flags.requestId !== undefined &&
    (!flags.requestId.trim() || /[\r\n]/.test(flags.requestId))
  ) {
    return "--request-id must be non-empty and contain no line breaks. / --request-id 不能为空或包含换行。";
  }
  if (!flags.wait && (flags.interval !== undefined || flags.pollTimeout !== undefined)) {
    return "--interval/--poll-timeout require --wait. / --interval/--poll-timeout 需要同时指定 --wait。";
  }
  if (
    flags.interval !== undefined &&
    (!Number.isFinite(flags.interval) || flags.interval < 1 || flags.interval > 3600)
  ) {
    return "--interval must be 1–3600 seconds. / --interval 必须为 1–3600 秒。";
  }
  if (
    flags.pollTimeout !== undefined &&
    (!Number.isFinite(flags.pollTimeout) || flags.pollTimeout <= 0 || flags.pollTimeout > 2_147_483)
  ) {
    return "--poll-timeout must be > 0 and <= 2147483 seconds. / --poll-timeout 必须大于 0 且不超过 2147483 秒。";
  }
  return undefined;
}

export async function requireCapacityInstance(
  client: Client,
  code: string,
  id: string,
  action: "scale" | "renew" | "delete",
): Promise<CapacityInstance> {
  const response = await getCapacityInstance(client, code, id);
  const instance = response.output ?? response.data;
  if (!instance || instance.deleted === true || instance[`can_${action}`] !== true) {
    throw new BailianError(
      `Capacity instance does not currently allow ${action}; refresh its details. / 容量实例当前不允许 ${action}，请刷新详情。`,
      ExitCode.USAGE,
      undefined,
      { cause: response },
    );
  }
  return instance;
}

type MutationResponse = {
  request_id?: string;
  output?: Deployment | CapacityOperation;
  data?: Deployment | CapacityOperation;
};

/** Preserve service errors and enough context to avoid re-submitting an uncertain write. */
export async function submitCapacityWrite<T>(
  requestId: string,
  submit: () => Promise<T>,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    const context = {
      client_request_id: requestId,
      error: error instanceof Error ? error.message : error,
    };
    const hint = `Request ID: ${requestId}. No automatic retry; first check whether the operation was accepted. / 请求标识：${requestId}。未自动重试，请先核查操作是否已受理。`;
    if (error instanceof BailianError) {
      throw new BailianError(
        error.message,
        error.exitCode,
        [error.hint, hint].filter(Boolean).join("\n"),
        {
          api: error.api,
          rawResponse: error.rawResponse,
          cause: { ...context, original_cause: error.cause },
        },
      );
    }
    if (error instanceof Error) {
      // Preserve the error identity/name (including AbortError/DOMException) so the
      // runtime can still classify local timeouts. DOMException.message is a
      // getter-only accessor, so appending would throw and mask the original error;
      // guard it and rethrow the untouched error when the message is read-only.
      try {
        error.message += `\n${hint}`;
      } catch {
        // Read-only message (e.g. DOMException): keep the original error as-is.
      }
    }
    throw error;
  }
}

export async function finishMutation(
  client: Client,
  code: string | undefined,
  response: MutationResponse,
  flags: MutationOptions,
  requestId?: string,
  requireOperationStatus = false,
  releasedInstanceId?: string,
): Promise<void> {
  const operation = response.output ?? response.data;
  const result = {
    ...response,
    ...(requestId ? { client_request_id: requestId } : {}),
  };
  if (operation?.operation_status === "FAILED") {
    const message =
      typeof operation.error_message === "string"
        ? operation.error_message
        : typeof operation.error_code === "string"
          ? operation.error_code
          : "Capacity operation failed. / 容量操作失败。";
    throw new BailianError(message, ExitCode.GENERAL, undefined, {
      api: {
        httpStatus: 200,
        apiCode: typeof operation.error_code === "string" ? operation.error_code : undefined,
        requestId: response.request_id,
      },
      cause: result,
      rawResponse: JSON.stringify(result),
    });
  }
  if (
    requireOperationStatus &&
    !["PROCESSING", "SUCCEEDED"].includes(String(operation?.operation_status))
  ) {
    throw new BailianError(
      "Missing or unsupported operation_status after submission; do not repeat the write. / 提交后缺少或不支持的 operation_status，请勿重复写入。",
      ExitCode.GENERAL,
      undefined,
      { cause: result },
    );
  }
  if (!flags.wait) {
    emitResult(result, "json");
    return;
  }
  const returnedCode =
    code ?? (typeof operation?.deployed_model === "string" ? operation.deployed_model : undefined);
  const operationId = operation?.operation_id;
  if (!returnedCode || typeof operationId !== "string" || !operationId.trim()) {
    throw new BailianError(
      "Write submitted but no ModelCode/operation ID was returned for waiting; query the deployment before retrying. / 写请求已提交，但未返回等待所需的 ModelCode/操作 ID；重试前请查询部署。",
      ExitCode.GENERAL,
      undefined,
      { cause: result, rawResponse: JSON.stringify(result) },
    );
  }
  // stderr survives a later polling failure or Ctrl-C without producing two stdout JSON objects.
  process.stderr.write(
    `${JSON.stringify({ submitted: true, deployed_model: returnedCode, operation_id: operationId, client_request_id: requestId })}\n`,
  );
  const controller = new AbortController();
  const onInterrupt = () => controller.abort(new Error("Interrupted. / 已中断。"));
  process.once("SIGINT", onInterrupt);
  try {
    const completed = await waitForCapacityOperation(client, returnedCode, operationId, {
      interval: flags.interval ?? 2,
      pollTimeout: flags.pollTimeout ?? 600,
      signal: controller.signal,
      initialResponse: operation?.operation_status === "SUCCEEDED" ? response : undefined,
      fallbackInstanceId: releasedInstanceId,
    });
    const confirmed = completed.output ?? completed.data;
    const envelope = completed.output ? "output" : "data";
    const finalResult = {
      ...completed,
      ...(confirmed
        ? {
            [envelope]: {
              ...confirmed,
              operation_id: confirmed.operation_id ?? operationId,
            },
          }
        : {}),
      ...(requestId ? { client_request_id: requestId } : {}),
    };
    if (
      releasedInstanceId &&
      (completed.instance?.output ?? completed.instance?.data)?.deleted !== true
    ) {
      throw new BailianError(
        "Release operation completed but deleted=true is not confirmed; refresh the instance before deleting the ModelCode. / 释放操作已结束，但未确认 deleted=true；删除 ModelCode 前请刷新实例。",
        ExitCode.GENERAL,
        undefined,
        { cause: finalResult },
      );
    }
    emitResult(finalResult, "json");
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
  }
}
