import { defineCommand, listCompressTemplates, type FlagsDef } from "bailian-cli-core";

const TEMPLATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Filter by custom model ID or base model name",
      "zh-CN": "按自定义模型 ID 或基础模型名称筛选",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "List quantizable models and their compression templates",
    "zh-CN": "列出可量化模型及其压缩模板",
  },
  auth: "apiKey",
  usageArgs: "[--model <model>]",
  flags: TEMPLATE_FLAGS,
  exampleArgs: ["", "--model qwen3.5-flash-2026-02-23-ft-xxx"],
  notes: [
    {
      "en-US":
        "Only supported full-parameter fine-tuned models are returned. LoRA and already-quantized models are excluded.",
      "zh-CN": "仅返回支持压缩的全参调优模型；LoRA 模型和已量化模型不会返回。",
    },
    {
      "en-US":
        "Template IDs live in output.custom_models[].templates[].template_id. output.base_models only lists quantizable base model names and carries no templates, so an empty custom_models array means no template ID is available yet.",
      "zh-CN":
        "模板 ID 位于 output.custom_models[].templates[].template_id；output.base_models 只列出可量化的基础模型名称，不含模板，因此 custom_models 为空数组时说明当前还拿不到任何模板 ID。",
    },
    {
      "en-US":
        "An empty templates[].hyper_parameters array means that template exposes no tunable hyper-parameters; omit --hparam when creating the compression job.",
      "zh-CN":
        "templates[].hyper_parameters 为空数组表示该模板没有可调超参，创建压缩任务时不要传 --hparam。",
    },
    {
      "en-US":
        "template_name and description are localized server-side from the CLI language setting (default en-US), sent as the lang query parameter. Run `config set --key language --value zh-CN` to get Chinese text.",
      "zh-CN":
        "template_name 和 description 由服务端按 CLI 的 language 设置本地化（默认 en-US，作为 lang 查询参数下发）；需要中文执行 `config set --key language --value zh-CN`。",
    },
  ],
  async run(ctx) {
    const model = ctx.flags.model || undefined;
    const lang = ctx.localize({ "en-US": "en-US", "zh-CN": "zh-CN" });
    if (ctx.settings.dryRun) {
      const resultData1 = { action: "finetune.compress.templates", model, lang };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const response = await listCompressTemplates(ctx.client, { model, lang });
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
