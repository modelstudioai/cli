import { BailianError, ExitCode, defineCommand, unwrapResponse } from "bailian-cli-core";
import {
  FREE_TIER_ONLY_STATUS_API,
  extractFreeTierOnlyStatuses,
  fetchAllModels,
  pollFreeTierBatch,
} from "./shared.ts";

const ACTIVATE_API = "zeldaEasy.bailian-commerce.freeTrial.batchActivateFreeTierOnly";
const DEACTIVATE_API = "zeldaEasy.bailian-commerce.freeTrial.batchDeactivateFreeTierOnly";

interface BatchResultFailure {
  failureModelId: string;
  errorCode: string;
}

/** Require a positive success signal; empty successModels must not count as success. */
function isModelOperationConfirmed(
  resultData: Record<string, unknown>,
  modelName: string,
): boolean {
  const failureModels = (resultData.failureModels as BatchResultFailure[] | undefined) ?? [];
  if (failureModels.length > 0) return false;
  const successModels = resultData.successModels;
  if (Array.isArray(successModels)) {
    return successModels.includes(modelName);
  }
  if (typeof resultData.successCount === "number") {
    return resultData.successCount > 0;
  }
  // Legacy responses without a success list still use the boolean flag.
  return resultData.success === true;
}

export default defineCommand({
  description: {
    "en-US":
      "Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable",
    "zh-CN": "启用或停用免费额度模型自动停止。默认启用，使用 --off 停用",
  },
  auth: "console",
  risk: {
    level: "high",
    reason: "billing",
    message: {
      "en-US":
        "This changes free-tier auto-stop. Enabling it makes calls fail once free quota is exhausted; disabling it allows pay-as-you-go charges after free quota is exhausted.",
      "zh-CN":
        "此操作会变更免费额度自动停止。启用后，免费额度用尽时调用将失败；停用后，免费额度用尽将继续按量计费调用。",
    },
  },
  usageArgs: "<--model <model>[,model2,...] | --all> [--off] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name(s), comma-separated for multiple",
        "zh-CN": "模型名称，多个名称以逗号分隔",
      },
    },
    all: {
      type: "switch",
      description: { "en-US": "Apply to all free-tier models", "zh-CN": "应用于全部免费额度模型" },
    },
    on: {
      type: "switch",
      description: {
        "en-US": "Enable auto-stop (default behavior)",
        "zh-CN": "启用自动停止（默认行为）",
      },
    },
    off: {
      type: "switch",
      description: { "en-US": "Disable auto-stop", "zh-CN": "停用自动停止" },
    },
  },
  exampleArgs: [
    "--model qwen3-max --yes",
    "--model qwen3-max,qwen-turbo --yes",
    "--all --yes",
    "--on --model qwen3-max --yes",
    "--off --model qwen3-max --yes",
    "--off --all --yes",
  ],
  notes: [
    {
      "en-US":
        "Requires `--yes` (exit code 7 / requires_confirmation without it). Applies to both enabling and disabling auto-stop.",
      "zh-CN": "需要 `--yes`（缺少时退出码 7 / requires_confirmation）。启用与停用自动停止均适用。",
    },
  ],
  validate: (flags) =>
    !flags.model && !flags.all ? "Provide --model <model>[,model2,...] or --all." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const off = Boolean(flags.off);
    const format = settings.output;
    const action = off ? "disable" : "enable";
    const actionZh = off ? "停用" : "启用";

    let models: string[];
    if (modelFlag) {
      models = [
        ...new Set(
          modelFlag
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];
    } else {
      models = [];
    }

    const api = off ? DEACTIVATE_API : ACTIVATE_API;
    const requestKey = off
      ? "BatchDeactivateFreeTierOnlyRequest"
      : "BatchActivateFreeTierOnlyRequest";

    if (settings.dryRun) {
      const unresolvedAll = Boolean(flags.all) && !modelFlag;
      ctx.output.result({
        api,
        data: { [requestKey]: { models } },
        ...(unresolvedAll ? { scope: "all", models_resolved: false } : {}),
      });
      return;
    }

    if (!modelFlag) {
      models = (await fetchAllModels(ctx.client)).map((model) => model.name);
    }

    const skipped: string[] = [];
    const processed: { model: string; result: unknown }[] = [];
    const confirmed: string[] = [];
    const failed: string[] = [];
    const timedOut: string[] = [];
    const textLines: string[] = [];
    let stopMap = new Map<string, boolean>();
    if (off) {
      const stopResult = await ctx.client.console(FREE_TIER_ONLY_STATUS_API, {
        queryFreeTierOnlyStatusRequest: { models },
      });
      const stopStatuses = extractFreeTierOnlyStatuses(stopResult);
      stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));
    }

    let resultWritten = false;
    /** Empty JSON is a valid success; only skip empty output when catching with no progress. */
    const writeBusinessResult = (options?: { requireProgress?: boolean }) => {
      if (resultWritten) return;
      if (format === "text" && textLines.length === 0) return;
      if (
        options?.requireProgress &&
        processed.length === 0 &&
        skipped.length === 0 &&
        textLines.length === 0
      ) {
        return;
      }
      ctx.output.result(
        off ? { processed, skipped } : processed.map((item) => item.result),
        format === "text" ? { text: textLines.join("\n") } : undefined,
      );
      resultWritten = true;
    };

    const progressMessage = (failedModel: string) =>
      ctx.localize({
        "en-US": [
          `Confirmed ${action} auto-stop for ${confirmed.length} model(s)${confirmed.length > 0 ? `: ${confirmed.join(", ")}` : ""}.`,
          `Model "${failedModel}" failed; its outcome is unconfirmed. Later models were not executed.`,
        ].join("\n"),
        "zh-CN": [
          `已确认${actionZh}自动停止 ${confirmed.length} 个模型${confirmed.length > 0 ? `：${confirmed.join("、")}` : ""}。`,
          `模型 "${failedModel}" 失败，结果未确认。后续模型未执行。`,
        ].join("\n"),
      });

    for (const name of models) {
      if (off && stopMap.get(name) === false) {
        skipped.push(name);
        ctx.output.info({
          "en-US": `Auto-stop is already disabled for "${name}".`,
          "zh-CN": `模型 "${name}" 已停用自动停止。`,
        });
        continue;
      }

      let result: unknown;
      try {
        result = await pollFreeTierBatch(ctx.client, api, requestKey, [name]);
      } catch (error) {
        // Keep stdout progress, but do not wrap the original error (preserves cause.code /
        // ERROR_STACK). Surface confirmed work via warning instead.
        writeBusinessResult({ requireProgress: true });
        if (confirmed.length > 0 || processed.length > 0 || skipped.length > 0) {
          ctx.output.warning({
            code: "FREETIER_PARTIAL_PROGRESS",
            message: progressMessage(name),
            details: {
              confirmed,
              failed_model: name,
              processed_count: processed.length,
              skipped_count: skipped.length,
            },
          });
        }
        throw error;
      }

      processed.push({ model: name, result });
      const resultData = result ? unwrapResponse(result as Record<string, unknown>) : undefined;
      const failureModels = (resultData?.failureModels as BatchResultFailure[] | undefined) ?? [];

      if (!result) {
        timedOut.push(name);
        ctx.output.warning({
          code: "FREETIER_OPERATION_TIMEOUT",
          message: {
            "en-US": `Operation timed out for "${name}".`,
            "zh-CN": `模型 "${name}" 的操作超时。`,
          },
          details: { model: name },
        });
        break;
      }

      if (failureModels.length > 0) {
        failed.push(name);
        const errorCode = failureModels[0].errorCode;
        ctx.output.warning({
          code: "FREETIER_OPERATION_FAILED",
          message: off
            ? {
                "en-US": `Failed to disable auto-stop for "${name}" (${errorCode}).`,
                "zh-CN": `模型 "${name}" 停用自动停止失败（${errorCode}）。`,
              }
            : {
                "en-US": `Failed to enable auto-stop for "${name}" (${errorCode}).`,
                "zh-CN": `模型 "${name}" 启用自动停止失败（${errorCode}）。`,
              },
          details: { model: name, error_code: errorCode },
        });
        break;
      }

      if (!resultData || !isModelOperationConfirmed(resultData, name)) {
        failed.push(name);
        ctx.output.warning({
          code: "FREETIER_OPERATION_FAILED",
          message: {
            "en-US": `Auto-stop ${action} for "${name}" was not confirmed by the server.`,
            "zh-CN": `服务端未确认模型 "${name}" 的自动停止${actionZh}。`,
          },
          details: { model: name },
        });
        break;
      }

      confirmed.push(name);
      textLines.push(
        ctx.localize(
          off
            ? {
                "en-US": `Disabled auto-stop for "${name}".`,
                "zh-CN": `已为模型 "${name}" 停用自动停止。`,
              }
            : {
                "en-US": `Enabled auto-stop for "${name}".`,
                "zh-CN": `已为模型 "${name}" 启用自动停止。`,
              },
        ),
      );
    }

    writeBusinessResult();
    if (failed.length === 0 && timedOut.length === 0) return;

    // Client poll timeout is internal TIMEOUT; server rejection stays GENERAL.
    const summaryPartsEn: string[] = [];
    const summaryPartsZh: string[] = [];
    if (failed.length > 0) {
      summaryPartsEn.push(
        `Failed to ${action} auto-stop for ${failed.length} model(s): ${failed.join(", ")}.`,
      );
      summaryPartsZh.push(`${failed.length} 个模型${actionZh}自动停止失败：${failed.join("、")}。`);
    }
    if (timedOut.length > 0) {
      summaryPartsEn.push(
        `Timed out waiting to confirm ${action} auto-stop for ${timedOut.length} model(s): ${timedOut.join(", ")}.`,
      );
      summaryPartsZh.push(
        `${timedOut.length} 个模型${actionZh}自动停止超时未确认：${timedOut.join("、")}。`,
      );
    }
    throw new BailianError(
      ctx.localize({
        "en-US": summaryPartsEn.join(" "),
        "zh-CN": summaryPartsZh.join(""),
      }),
      failed.length > 0 ? ExitCode.GENERAL : ExitCode.TIMEOUT,
    );
  },
});
