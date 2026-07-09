import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

const LIST_WORKSPACES_API = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";

interface WorkspaceInfo {
  workspaceId: string;
  agentName: string;
  defaultAgent: boolean;
}

function getNestedRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  return undefined;
}

function extractResponseData(result: Record<string, unknown>): Record<string, unknown> {
  const data = getNestedRecord(result, "data");
  if (!data) return result;

  const dataV2 = getNestedRecord(data, "DataV2");
  if (dataV2) {
    const inner = getNestedRecord(dataV2, "data");
    const innerData = inner ? getNestedRecord(inner, "data") : undefined;
    return innerData ?? inner ?? dataV2;
  }

  const direct = getNestedRecord(data, "data");
  return direct ?? data;
}

function printTable(workspaces: WorkspaceInfo[]): void {
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
  description: "List all workspaces",
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    list: {
      type: "string",
      valueHint: "<n>",
      description: "Limit number of results",
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

    const result = await ctx.client.console(LIST_WORKSPACES_API, {});

    const resp = extractResponseData(result as Record<string, unknown>);
    const dataArr = resp.data as Record<string, unknown>[] | undefined;
    if (!Array.isArray(dataArr) || dataArr.length === 0) {
      if (format === "json") {
        emitResult([], format);
      } else {
        process.stdout.write("No workspace found.\n");
      }
      return;
    }

    let workspaces = dataArr as unknown as WorkspaceInfo[];
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
