import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Install or upgrade an allowlisted Command Pack",
    "zh-CN": "安装或升级白名单内的 Command Pack",
  },
  auth: "none",
  usageArgs: "--package <name[@version]>",
  flags: {
    package: {
      type: "string",
      valueHint: "<name[@version]>",
      description: {
        "en-US": "Allowlisted Command Pack package and optional version or tag",
        "zh-CN": "白名单内的 Command Pack 包名，以及可选的版本或 Tag",
      },
      required: true,
    },
  },
  exampleArgs: ["--package @ali/bailian-plugin-agent", "--package @ali/bailian-plugin-agent@beta"],
  async run(ctx) {
    const installed = await ctx.commandPacks.install(ctx.flags.package);
    emitResult({ installed }, detectOutputFormat(ctx.settings.output));
  },
});
