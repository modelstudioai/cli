import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Remove an installed Command Pack",
  auth: "none",
  usageArgs: "--name <package>",
  flags: {
    name: {
      type: "string",
      valueHint: "<package>",
      description: "Allowlisted Command Pack package name",
      required: true,
    },
  },
  exampleArgs: ["--name @ali/bailian-plugin-agent"],
  async run(ctx) {
    await ctx.commandPacks.remove(ctx.flags.name);
    emitResult({ removed: ctx.flags.name }, detectOutputFormat(ctx.settings.output));
  },
});
