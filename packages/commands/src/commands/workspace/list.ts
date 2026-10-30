import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

import {
  LIST_WORKSPACES_API,
  listConsoleWorkspaces,
  type ConsoleWorkspaceInfo,
} from "../shared/workspace.ts";

function printTable(workspaces: ConsoleWorkspaceInfo[]): void {
  const color = ansi(process.stdout);

  const headers = ["Name", "Workspace ID", "Default"];

  const rows = workspaces.map((ws) => [
    ws.agentName,
    ws.workspaceId,
    ws.defaultAgent ? "Yes" : "-",
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => color.bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((width) => color.dim("─".repeat(width))).join("──");

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    const cells = row.map((cell, col) => {
      if (col === 2 && cell === "Yes") return color.green(padEnd(cell, widths[col]));
      return padEnd(cell, widths[col]);
    });
    process.stdout.write(cells.join("  ") + "\n");
  }

  process.stdout.write(color.dim(`\nTotal: ${workspaces.length}`) + "\n");
}

export default defineCommand({
  description: { "en-US": "List all workspaces", "zh-CN": "列出全部 Workspace" },
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    list: {
      type: "string",
      valueHint: "<n>",
      description: { "en-US": "Limit number of results", "zh-CN": "限制结果数量" },
    },
  },
  exampleArgs: ["", "--list 5", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const limit = Number(flags.list) || 0;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ api: LIST_WORKSPACES_API, data: {} }, format);
      return;
    }

    let workspaces = await listConsoleWorkspaces(ctx.client);
    if (workspaces.length === 0) {
      if (format === "json") {
        emitResult([], format);
      } else {
        process.stdout.write("No workspace found.\n");
      }
      return;
    }

    if (limit > 0) workspaces = workspaces.slice(0, limit);

    if (format === "json") {
      const items = workspaces.map((ws) => ({
        workspaceId: ws.workspaceId,
        name: ws.agentName,
        default: ws.defaultAgent,
      }));
      emitResult(items, format);
      return;
    }

    printTable(workspaces);
  },
});
