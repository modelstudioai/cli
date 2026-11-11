import { defineCommand, unwrapResponse } from "bailian-cli-core";
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
    {
      "en-US": "--model qwen3-max --yes",
      "zh-CN": "--model qwen3-max --yes",
    },
    {
      "en-US": "--model qwen3-max,qwen-turbo --yes",
      "zh-CN": "--model qwen3-max,qwen-turbo --yes",
    },
    {
      "en-US": "--all --yes",
      "zh-CN": "--all --yes",
    },
    {
      "en-US": "--on --model qwen3-max --yes",
      "zh-CN": "--on --model qwen3-max --yes",
    },
    {
      "en-US": "--off --model qwen3-max --yes",
      "zh-CN": "--off --model qwen3-max --yes",
    },
    {
      "en-US": "--off --all --yes",
      "zh-CN": "--off --all --yes",
    },
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
      ctx.output.result({
        api,
        data: { [requestKey]: { models } },
      });
      return;
    }

    if (!modelFlag) {
      models = (await fetchAllModels(ctx.client)).map((model) => model.name);
    }

    const skipped: string[] = [];
    const processed: { model: string; result: unknown }[] = [];
    const textLines: string[] = [];
    let stopMap = new Map<string, boolean>();
    if (off) {
      const stopResult = await ctx.client.console(FREE_TIER_ONLY_STATUS_API, {
        queryFreeTierOnlyStatusRequest: { models },
      });
      const stopStatuses = extractFreeTierOnlyStatuses(stopResult);
      stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));
    }

    for (const name of models) {
      if (off && stopMap.get(name) === false) {
        skipped.push(name);
        ctx.output.info({
          "en-US": `Auto-stop is already disabled for "${name}".`,
          "zh-CN": `模型 "${name}" 已停用自动停止。`,
        });
        continue;
      }
      const result = await pollFreeTierBatch(ctx.client, api, requestKey, [name]);
      processed.push({ model: name, result });
      const resultData = result ? unwrapResponse(result as Record<string, unknown>) : undefined;
      const failureModels = (resultData?.failureModels as BatchResultFailure[] | undefined) ?? [];
      if (!result) {
        ctx.output.warning({
          code: "FREETIER_OPERATION_TIMEOUT",
          message: {
            "en-US": `Operation timed out for "${name}".`,
            "zh-CN": `模型 "${name}" 的操作超时。`,
          },
          details: { model: name },
        });
      } else if (failureModels.length > 0) {
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
      }
      // Keep the existing disable response policy; the JSON report retains the raw response.
      if (off || (result && failureModels.length === 0)) {
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
    }
    if (format === "json" || textLines.length > 0) {
      ctx.output.result(
        off ? { processed, skipped } : processed.map((item) => item.result),
        format === "text" ? { text: textLines.join("\n") } : undefined,
      );
    }
  },
});
