import { defineCommand } from "bailian-cli-core";

export default defineCommand({
  description: {
    "en-US": "List config profiles and show the active profile",
    "zh-CN": "列出配置 Profile 并显示当前激活项",
  },
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const profiles = ctx.configStore.profiles();
    const names = ["default", ...Object.keys(profiles.named).sort()];
    const result = {
      active_config: profiles.active,
      profiles: names,
      config_file: ctx.configStore.path,
    };
    const nameWidth = Math.max("NAME".length, ...names.map((name) => name.length));
    const lines = [`${"NAME".padEnd(nameWidth)}  ACTIVE`];
    for (const name of names) {
      lines.push(`${name.padEnd(nameWidth)}  ${name === profiles.active ? "*" : ""}`);
    }
    ctx.output.result(result, { text: lines.join("\n") });
  },
});
