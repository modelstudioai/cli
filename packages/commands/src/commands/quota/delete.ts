import { defineCommand, detectOutputFormat, modelsLimitsPath } from "bailian-cli-core";
import { emitResult, confirmDangerousAction } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Clear all custom rate limits (QPM/TPM) for a model",
    "zh-CN": "清除模型的所有自定义限流配置（QPM/TPM）",
  },
  auth: "apiKey",
  usageArgs: "--model <model> [--yes]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: { "en-US": "Model name (required)", "zh-CN": "模型名称（必填）" },
      required: true,
    },
    yes: {
      type: "switch",
      description: {
        "en-US": "Skip the confirmation prompt",
        "zh-CN": "跳过确认提示",
      },
    },
  },
  exampleArgs: ["--model qwen-plus", "--model qwen-plus --yes", "--model qwen-plus --output json"],
  notes: [
    {
      "en-US":
        "Irreversible — the server-side OVERLAY is reset to defaults, so your custom QPM/TPM configuration is permanently removed.",
      "zh-CN":
        "该操作不可撤销——服务端 OVERLAY 会重置为默认值，你的自定义 QPM/TPM 配置将被永久删除。",
    },
    {
      "en-US": "Requires confirmation; pass --yes to skip the prompt in scripts.",
      "zh-CN": "需要确认；脚本中可加 --yes 跳过交互提示。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelName = flags.model;
    const format = detectOutputFormat(settings.output);

    const body = { models: [{ model: modelName, operation_type: "DELETE" }] };

    if (settings.dryRun) {
      emitResult(
        { endpoint: ctx.client.url(modelsLimitsPath()), method: "POST", request: body },
        format,
      );
      return;
    }

    await confirmDangerousAction(
      `Clear all custom rate limits for model ${modelName}.\nYour custom QPM/TPM configuration will be removed.`,
      flags.yes ?? false,
    );

    const result = await ctx.client.requestJson<{ request_id?: string }>({
      path: modelsLimitsPath(),
      method: "POST",
      body,
    });

    if (format === "json") {
      emitResult({ model: modelName, ...result }, format);
      return;
    }
    process.stdout.write(`Rate limits cleared for "${modelName}".\n`);
  },
});
