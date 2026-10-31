import { defineCommand, modelsLimitsPath } from "bailian-cli-core";

export default defineCommand({
  description: {
    "en-US": "Clear all custom rate limits (QPM/TPM) for a model",
    "zh-CN": "清除模型的所有自定义限流配置（QPM/TPM）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently clears all custom QPM/TPM rate limits for the specified model and cannot be undone.",
      "zh-CN": "该操作会永久清除指定模型的所有自定义 QPM/TPM 限流配置，且无法撤销。",
    },
  },
  usageArgs: "--model <model>",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: { "en-US": "Model name (required)", "zh-CN": "模型名称（必填）" },
      required: true,
    },
  },
  exampleArgs: [
    "--model qwen-plus",
    "--model qwen-plus --dry-run --output json",
    "--model qwen-plus --yes",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelName = flags.model;

    const body = { models: [{ model: modelName, operation_type: "DELETE" }] };

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(modelsLimitsPath()),
        method: "POST",
        request: body,
      });
      return;
    }

    const result = await ctx.client.requestJson<{ request_id?: string }>({
      path: modelsLimitsPath(),
      method: "POST",
      body,
    });

    ctx.output.result(
      { model: modelName, ...result },
      {
        text: ctx.localize({
          "en-US": `Rate limits cleared for "${modelName}".`,
          "zh-CN": `模型“${modelName}”的限流配置已清除。`,
        }),
      },
    );
  },
});
