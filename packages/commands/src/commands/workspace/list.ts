import { defineCommand, type LocalizedText } from "bailian-cli-core";
import { ansi } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

import {
  LIST_WORKSPACES_API,
  listConsoleWorkspaces,
  type ConsoleWorkspaceInfo,
} from "../shared/workspace.ts";

function workspaceTable(
  workspaces: ConsoleWorkspaceInfo[],
  localize: (text: LocalizedText) => string,
): string {
  const color = ansi(process.stdout);
  const positive = localize({ "en-US": "Yes", "zh-CN": "是" });

  const headers = [
    localize({ "en-US": "Name", "zh-CN": "名称" }),
    localize({ "en-US": "Workspace ID", "zh-CN": "工作空间 ID" }),
    localize({ "en-US": "Default", "zh-CN": "默认" }),
  ];

  const rows = workspaces.map((ws) => [
    ws.agentName,
    ws.workspaceId,
    ws.defaultAgent ? positive : "-",
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => color.bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((width) => color.dim("─".repeat(width))).join("──");

  const lines = [headerLine, separator];

  for (const row of rows) {
    const cells = row.map((cell, col) => {
      if (col === 2 && cell === positive) return color.green(padEnd(cell, widths[col]));
      return padEnd(cell, widths[col]);
    });
    lines.push(cells.join("  "));
  }

  lines.push(
    color.dim(
      localize({
        "en-US": `\nTotal: ${workspaces.length}`,
        "zh-CN": `\n总计: ${workspaces.length}`,
      }),
    ),
  );
  return lines.join("\n");
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
    const format = settings.output;

    if (settings.dryRun) {
      ctx.output.result({ api: LIST_WORKSPACES_API, data: {} });
      return;
    }

    let workspaces = await listConsoleWorkspaces(ctx.client);
    if (workspaces.length === 0) {
      ctx.output.result(
        [],
        format === "text"
          ? { text: ctx.localize({ "en-US": "No workspace found.", "zh-CN": "未找到工作空间。" }) }
          : undefined,
      );
      return;
    }
    if (limit > 0) workspaces = workspaces.slice(0, limit);
    const items = workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      name: workspace.agentName,
      default: workspace.defaultAgent,
    }));
    ctx.output.result(
      items,
      format === "text" ? { text: workspaceTable(workspaces, ctx.localize) } : undefined,
    );
  },
});
