import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Link an allowlisted local Command Pack for development",
    "zh-CN": "链接白名单内的本地 Command Pack 用于开发",
  },
  auth: "none",
  usageArgs: "--path <directory>",
  flags: {
    path: {
      type: "string",
      valueHint: "<directory>",
      description: {
        "en-US": "Local Command Pack package directory",
        "zh-CN": "本地 Command Pack 包目录",
      },
      required: true,
    },
  },
  exampleArgs: ["--path ../bailian-plugin-agent"],
  async run(ctx) {
    const linked = await ctx.commandPacks.link(ctx.flags.path);
    emitResult({ linked }, detectOutputFormat(ctx.settings.output));
  },
});
