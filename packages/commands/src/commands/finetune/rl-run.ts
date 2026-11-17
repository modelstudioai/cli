import { defineCommand } from "bailian-cli-core";

import { RL_RUN_FLAGS, buildRlRunParams, readRlConfigFile, runRlJob } from "./rl-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Submit a reinforcement-learning training job",
    "zh-CN": "提交强化学习训练任务",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    reason: "billing",
    message: {
      "en-US": "This creates a billed RL training job that consumes compute resources.",
      "zh-CN": "该操作会创建计费的 RL 训练任务，消耗算力资源。",
    },
  },
  usageArgs: "--model <id> [flags]",
  flags: RL_RUN_FLAGS,
  exampleArgs: [
    "--model qwen3.5-9b --train-file ./data/train.jsonl --code-dir . --rollout functions.rollout.MyRollout --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch",
    "--config-file job.yaml --watch",
    "--model qwen3.5-9b --train-file ./data/train.jsonl --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Runs inside an isolated sandbox. Prepare the runtime first with `finetune runtime prepare`, or pass --install-runtime.",
      "zh-CN":
        "在隔离沙箱内执行。请先用 `finetune runtime prepare` 准备运行时，或传入 --install-runtime。",
    },
    {
      "en-US": "Timing out with --watch stops waiting only; it does not cancel the cloud job.",
      "zh-CN": "--watch 超时仅停止等待，不会取消云端任务。",
    },
  ],
  async run(ctx) {
    const params = buildRlRunParams(ctx.flags);
    const yamlText = ctx.flags.configFile ? readRlConfigFile(ctx.flags.configFile) : undefined;
    await runRlJob(ctx, params, yamlText, {
      action: "finetune.rl.run",
      watch: ctx.flags.watch,
      waitTimeoutSeconds: ctx.flags.waitTimeout,
      allowInstall: ctx.flags.installRuntime,
    });
  },
});
