import { defineCommand } from "bailian-cli-core";
import { formatTable } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "List installed Command Packs and their load status",
    "zh-CN": "列出已安装的 Command Pack 及其加载状态",
  },
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const reports = await ctx.commandPacks.list();
    if (reports.length === 0) {
      ctx.output.result(
        { command_packs: reports },
        {
          text: ctx.localize({
            "en-US": "No Command Packs installed.",
            "zh-CN": "尚未安装 Command Pack。",
          }),
        },
      );
      return;
    }
    const rows = reports.map((report) => [
      report.name,
      report.version ?? "-",
      report.source,
      report.status,
      report.commands.join(", ") || report.error || "-",
    ]);
    const text = formatTable(
      ["NAME", "VERSION", "SOURCE", "STATUS", "COMMANDS / ERROR"],
      rows,
    ).join("\n");
    ctx.output.result({ command_packs: reports }, { text });
  },
});
