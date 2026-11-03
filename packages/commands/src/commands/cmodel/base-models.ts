import {
  defineCommand,
  effectiveConsoleGatewayConfig,
  listSupportImportModels,
  type FlagsDef,
} from "bailian-cli-core";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "List base models that can be imported as custom models",
    "zh-CN": "列出可导入为自定义模型的基础模型",
  },
  auth: "console",
  usageArgs: "",
  flags: {} satisfies FlagsDef,
  exampleArgs: ["", "--console-region cn-beijing", "--output json"],
  notes: [
    {
      "en-US":
        "The list is returned dynamically by the console API and may change between releases. Import is currently available only in the Beijing region.",
      "zh-CN": "清单由控制台接口动态返回，可能随版本更新调整。导入当前仅北京地域开放。",
    },
  ],
  async run(ctx) {
    const { settings } = ctx;

    if (settings.dryRun) {
      const resultData = {
        action: "cmodel.baseModels",
        ...effectiveConsoleGatewayConfig(settings),
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const supported = await listSupportImportModels(ctx.client);
    const items = supported.list.map((entry) => ({
      model: entry.model ?? "",
      name: entry.name ?? "",
      support_train_types: entry.supportTrainTypes ?? [],
      post_process_capabilities: entry.postProcessCapabilities ?? null,
    }));
    const resultData = { items, total: supported.total ?? items.length };
    ctx.output.result(
      resultData,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
    );
  },
});
