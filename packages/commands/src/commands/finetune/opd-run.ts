import { defineCommand, RL_DASHSCOPE_VERSION, type FlagsDef } from "bailian-cli-core";

import { RL_RUN_FLAGS, buildRlRunParams, readRlConfigFile, runRlJob } from "./rl-shared.ts";

const OPD_RUN_FLAGS = {
  ...RL_RUN_FLAGS,
  teacherModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Teacher model ID for distillation (required)",
      "zh-CN": "蒸馏教师模型 ID（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Submit an OPD distillation training job (pg_opd with a teacher model)",
    "zh-CN": "提交 OPD 蒸馏训练任务（pg_opd，需教师模型）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    reason: "billing",
    message: {
      "en-US": "This creates a billed OPD training job that consumes compute resources.",
      "zh-CN": "该操作会创建计费的 OPD 训练任务，消耗算力资源。",
    },
  },
  usageArgs: "--model <id> --teacher-model <id> [flags]",
  flags: OPD_RUN_FLAGS,
  exampleArgs: [
    "--model qwen3.5-9b --teacher-model qwen3.5-397b-a17b --train-file ./data/train.jsonl --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch",
    "--config-file job.yaml --teacher-model qwen3.5-397b-a17b --watch",
    "--model qwen3.5-9b --teacher-model qwen3.5-397b-a17b --train-file ./data/train.jsonl --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Forces training.type=pg_opd. Pure OPD needs no --rollout / --reward / --code-dir; the job is submitted with a teacher model and no functions.",
      "zh-CN":
        "强制 training.type=pg_opd。纯 OPD 无需 --rollout / --reward / --code-dir；任务以教师模型、无函数方式提交。",
    },
    {
      "en-US": `The reviewed dashscope runtime ${RL_DASHSCOPE_VERSION} does not support pg_opd: real submission fails fast (dry-run still previews the spec). Job query commands (get/list/logs/watch/cancel/delete) are unaffected.`,
      "zh-CN": `受审查的 dashscope 运行时 ${RL_DASHSCOPE_VERSION} 不支持 pg_opd：真实提交会快速失败（dry-run 仍可预览 spec）。任务查询类命令（get/list/logs/watch/cancel/delete）不受影响。`,
    },
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
    params.teacherModel = ctx.flags.teacherModel;
    params.opd = true;
    const yamlText = ctx.flags.configFile ? readRlConfigFile(ctx.flags.configFile) : undefined;
    await runRlJob(ctx, params, yamlText, {
      action: "finetune.opd.run",
      watch: ctx.flags.watch,
      waitTimeoutSeconds: ctx.flags.waitTimeout,
      allowInstall: ctx.flags.installRuntime,
    });
  },
});
