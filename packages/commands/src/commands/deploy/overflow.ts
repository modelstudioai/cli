import {
  BailianError,
  defineCommand,
  ExitCode,
  getDeployment,
  updateDeploymentOverflow,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { DEPLOYED_MODEL_FLAG, validateQueryIds } from "./query-shared.ts";

export default defineCommand({
  description: {
    "en-US": "Set the overflow strategy for a throughput reservation ModelCode",
    "zh-CN": "设置吞吐预留 ModelCode 的溢出策略",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "Enabling overflow incurs pay-as-you-go charges beyond reserved capacity; disabling it rate-limits excess requests.",
      "zh-CN": "开启溢出后，预留容量外的流量将产生按量费用；关闭后，超额请求会被限流。",
    },
  },
  flags: {
    ...DEPLOYED_MODEL_FLAG,
    strategy: {
      type: "string",
      valueHint: "<enable|disable>",
      required: true,
      choices: ["enable", "disable"] as const,
      description: {
        "en-US": "Allow pay-as-you-go overflow or restrict requests to reserved capacity",
        "zh-CN": "允许按量溢出或将请求限制在预留容量内",
      },
    },
  },
  usageArgs: "--deployed-model <code> --strategy <enable|disable>",
  exampleArgs: [
    "--deployed-model example-code --strategy enable --dry-run",
    "--deployed-model example-code --strategy disable --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Applies to the whole ModelCode, not one capacity instance. Sends one update then one GET to confirm the strategy. Never retries the update automatically; a read-back failure does not mean the change was not applied.",
      "zh-CN":
        "配置作用于整个 ModelCode，而非单个容量实例。提交一次更新后 GET 回读确认策略。不自动重试更新；回读失败不代表配置未生效。",
    },
  ],
  validate: validateQueryIds,
  async run(ctx) {
    const { settings, flags } = ctx;
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.overflow",
          deployed_model: flags.deployedModel,
          body: { overflow_strategy: flags.strategy },
        },
        "json",
      );
      return;
    }
    const response = await updateDeploymentOverflow(
      ctx.client,
      flags.deployedModel,
      flags.strategy,
    );
    const deployment = await getDeployment(ctx.client, flags.deployedModel);
    if ((deployment.output ?? deployment.data)?.overflow_strategy !== flags.strategy) {
      throw new BailianError(
        "Overflow update submitted but not confirmed by read-back; query the deployment before retrying. / 溢出配置已提交，但回读未确认，请先查询部署再决定是否重试。",
        ExitCode.GENERAL,
        undefined,
        { cause: { response, deployment } },
      );
    }
    emitResult({ ...response, deployment }, "json");
  },
});
