import { defineCommand } from "bailian-cli-core";

export default defineCommand({
  description: {
    "en-US": "Remove an installed Command Pack",
    "zh-CN": "移除已安装的 Command Pack",
  },
  auth: "none",
  usageArgs: "--name <package>",
  flags: {
    name: {
      type: "string",
      valueHint: "<package>",
      description: {
        "en-US": "Allowlisted Command Pack package name",
        "zh-CN": "白名单内的 Command Pack 包名",
      },
      required: true,
    },
  },
  exampleArgs: ["--name @ali/bailian-plugin-agent"],
  async run(ctx) {
    await ctx.commandPacks.remove(ctx.flags.name);
    ctx.output.result({ removed: ctx.flags.name });
  },
});
