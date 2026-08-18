import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: { "en-US": "Set the active config profile", "zh-CN": "设置当前激活的配置 Profile" },
  auth: "none",
  usageArgs: "--name <name>",
  flags: {
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Existing profile name, or default",
        "zh-CN": "已有 Profile 名称，或 default",
      },
      required: true,
    },
  },
  exampleArgs: ["--name token-plan", "--name default"],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      const activeConfig = ctx.configStore.validateActivation(ctx.flags.name);
      emitResult(
        {
          would_activate: activeConfig,
          config_file: ctx.configStore.path,
        },
        format,
      );
      return;
    }

    const activeConfig = await ctx.configStore.activate(ctx.flags.name);
    if (!ctx.settings.quiet) {
      emitResult(
        {
          active_config: activeConfig,
          config_file: ctx.configStore.path,
        },
        format,
      );
    }
  },
});
