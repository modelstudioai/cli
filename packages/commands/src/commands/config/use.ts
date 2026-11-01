import { defineCommand } from "bailian-cli-core";

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
    if (ctx.settings.dryRun) {
      const activeConfig = ctx.configStore.validateActivation(ctx.flags.name);
      ctx.output.result({
        would_activate: activeConfig,
        config_file: ctx.configStore.path,
      });
      return;
    }

    const activeConfig = await ctx.configStore.activate(ctx.flags.name);
    ctx.output.result({
      active_config: activeConfig,
      config_file: ctx.configStore.path,
    });
  },
});
