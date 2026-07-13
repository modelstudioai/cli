import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Install or upgrade an allowlisted Command Pack",
  auth: "none",
  usageArgs: "--package <name[@version]>",
  flags: {
    package: {
      type: "string",
      valueHint: "<name[@version]>",
      description: "Allowlisted Command Pack package and optional version or tag",
      required: true,
    },
  },
  exampleArgs: ["--package @ali/bailian-plugin-agent", "--package @ali/bailian-plugin-agent@beta"],
  async run(ctx) {
    const installed = await ctx.commandPacks.install(ctx.flags.package);
    emitResult({ installed }, detectOutputFormat(ctx.settings.output));
  },
});
