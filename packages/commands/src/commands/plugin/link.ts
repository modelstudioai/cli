import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Link an allowlisted local Command Pack for development",
  auth: "none",
  usageArgs: "--path <directory>",
  flags: {
    path: {
      type: "string",
      valueHint: "<directory>",
      description: "Local Command Pack package directory",
      required: true,
    },
  },
  exampleArgs: ["--path ../bailian-plugin-agent"],
  async run(ctx) {
    const linked = await ctx.commandPacks.link(ctx.flags.path);
    emitResult({ linked }, detectOutputFormat(ctx.settings.output));
  },
});
