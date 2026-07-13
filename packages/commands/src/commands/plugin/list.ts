import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

export default defineCommand({
  description: "List installed Command Packs and their load status",
  auth: "none",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const reports = await ctx.commandPacks.list();
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") {
      emitResult({ command_packs: reports }, format);
      return;
    }
    if (reports.length === 0) {
      emitBare("No Command Packs installed.");
      return;
    }
    const rows = reports.map((report) => [
      report.name,
      report.version ?? "-",
      report.source,
      report.status,
      report.commands.join(", ") || report.error || "-",
    ]);
    for (const line of formatTable(
      ["NAME", "VERSION", "SOURCE", "STATUS", "COMMANDS / ERROR"],
      rows,
    )) {
      emitBare(line);
    }
  },
});
