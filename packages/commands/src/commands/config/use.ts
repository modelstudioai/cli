import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Set the active config profile",
  auth: "none",
  usageArgs: "--name <name>",
  flags: {
    name: {
      type: "string",
      valueHint: "<name>",
      description: "Existing profile name, or default",
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
