import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";

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
    const format = detectOutputFormat(ctx.settings.output);

    if (format === "json") {
      emitResult(
        {
          active_config: profiles.active,
          profiles: names,
          config_file: ctx.configStore.path,
        },
        format,
      );
      return;
    }

    const nameWidth = Math.max("NAME".length, ...names.map((name) => name.length));
    emitBare(`${"NAME".padEnd(nameWidth)}  ACTIVE`);
    for (const name of names) {
      emitBare(`${name.padEnd(nameWidth)}  ${name === profiles.active ? "*" : ""}`);
    }
  },
});
