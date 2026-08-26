import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { confirmDangerousAction, emitBare, emitResult } from "bailian-cli-runtime";
import chalk from "chalk";
import {
  disableProjectVersioning,
  enableProjectVersioning,
  getProjectVersionStatus,
  type ProjectVersion,
  type ProjectVersionPreview,
  type ProjectVersionStatus,
  listProjectVersions,
  previewProjectVersion,
  restoreProjectVersion,
} from "@openagentpack/project-versions";

const FILE_FLAG = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
} satisfies FlagsDef;

const VERSION_FLAG = {
  versionId: {
    type: "string",
    valueHint: "<full-version>",
    required: true,
    description: {
      "en-US": "Full local version ID",
      "zh-CN": "完整的本地版本 ID",
    },
  },
} satisfies FlagsDef;

export const managedAgentVersionEnable = defineCommand({
  description: {
    "en-US": "Enable Apply-time local snapshots for agents.yaml",
    "zh-CN": "为 agents.yaml 启用 Apply 后自动本地快照",
  },
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: FILE_FLAG,
  exampleArgs: ["", "--file agents.yaml"],
  async run(ctx) {
    const file = ctx.flags.file ?? "agents.yaml";
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult({ would_enable: file, versioning: await getProjectVersionStatus(file) }, format);
      return;
    }
    const result = await enableProjectVersioning(file, "Enable Bailian CLI versioning");
    if (format === "json") {
      emitResult(result, format);
      return;
    }
    if (result.version) {
      emitBare(
        `Created baseline version ${result.version.short_version} ${result.version.message}`,
      );
    } else {
      emitBare("Current agents.yaml is already versioned; no snapshot was created.");
    }
    emitBare("Automatic versioning is enabled for this agents.yaml.");
    renderStatus(result.versioning);
  },
});

export const managedAgentVersionDisable = defineCommand({
  description: {
    "en-US": "Disable Apply-time local snapshots without removing history",
    "zh-CN": "关闭 Apply 后自动本地快照，但保留历史",
  },
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: FILE_FLAG,
  exampleArgs: ["", "--file agents.yaml"],
  async run(ctx) {
    const file = ctx.flags.file ?? "agents.yaml";
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult({ would_disable: file, versioning: await getProjectVersionStatus(file) }, format);
      return;
    }
    const status = await disableProjectVersioning(file);
    if (format === "json") {
      emitResult(status, format);
      return;
    }
    emitBare("Automatic versioning is disabled for this agents.yaml.");
    renderStatus(status);
  },
});

export const managedAgentVersionStatus = defineCommand({
  description: {
    "en-US": "Show local snapshot versioning status for agents.yaml",
    "zh-CN": "显示 agents.yaml 的本地快照版本管理状态",
  },
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: FILE_FLAG,
  exampleArgs: ["", "--file agents.yaml --output json"],
  async run(ctx) {
    const status = await getProjectVersionStatus(ctx.flags.file ?? "agents.yaml");
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") emitResult(status, format);
    else renderStatus(status);
  },
});

const LIST_FLAGS = {
  ...FILE_FLAG,
  limit: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Maximum versions to return (default: 50, max: 100)",
      "zh-CN": "最多返回的版本数（默认：50，最大：100）",
    },
  },
  cursor: {
    type: "string",
    valueHint: "<cursor>",
    description: {
      "en-US": "Pagination cursor returned by the previous page",
      "zh-CN": "上一页返回的分页游标",
    },
  },
} satisfies FlagsDef;

export const managedAgentVersionList = defineCommand({
  description: {
    "en-US": "List local snapshots of agents.yaml",
    "zh-CN": "列出 agents.yaml 的本地快照",
  },
  auth: "none",
  usageArgs: "[--file <path>] [--limit <n>] [--cursor <cursor>]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--limit 20 --output json"],
  async run(ctx) {
    const page = await listProjectVersions(ctx.flags.file ?? "agents.yaml", {
      limit: ctx.flags.limit,
      cursor: ctx.flags.cursor,
    });
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") {
      emitResult(page, format);
      return;
    }
    if (page.versions.length === 0) {
      emitBare("No local versions of agents.yaml exist.");
      return;
    }
    for (const version of page.versions) emitBare(formatVersion(version));
    if (page.next_cursor) emitBare(chalk.dim(`Next cursor: ${page.next_cursor}`));
  },
});

const PREVIEW_FLAGS = {
  ...FILE_FLAG,
  ...VERSION_FLAG,
} satisfies FlagsDef;

export const managedAgentVersionPreview = defineCommand({
  description: {
    "en-US": "Preview a historical agents.yaml version",
    "zh-CN": "预览 agents.yaml 的历史版本",
  },
  auth: "none",
  usageArgs: "--version-id <full-version> [--file <path>]",
  flags: PREVIEW_FLAGS,
  exampleArgs: ["--version-id <full-version>", "--version-id <full-version> --output json"],
  async run(ctx) {
    const preview = await previewProjectVersion(
      ctx.flags.file ?? "agents.yaml",
      ctx.flags.versionId,
    );
    const format = detectOutputFormat(ctx.settings.output);
    if (format === "json") emitResult(preview, format);
    else renderPreview(preview);
  },
});

const RESTORE_FLAGS = {
  ...PREVIEW_FLAGS,
  yes: {
    type: "switch",
    description: {
      "en-US": "Restore without an interactive confirmation",
      "zh-CN": "无需交互确认直接恢复",
    },
  },
} satisfies FlagsDef;

export const managedAgentVersionRestore = defineCommand({
  description: {
    "en-US": "Restore a historical agents.yaml version to the working tree",
    "zh-CN": "将 agents.yaml 历史版本恢复到工作区",
  },
  auth: "none",
  usageArgs: "--version-id <full-version> [--file <path>] [--yes]",
  flags: RESTORE_FLAGS,
  exampleArgs: ["--version-id <full-version>", "--version-id <full-version> --yes --output json"],
  async run(ctx) {
    const file = ctx.flags.file ?? "agents.yaml";
    const preview = await previewProjectVersion(file, ctx.flags.versionId);
    const format = detectOutputFormat(ctx.settings.output);
    if (format !== "json") renderPreview(preview);
    if (!preview.can_restore) {
      throw new BailianError(
        preview.diagnostics.find((diagnostic) => diagnostic.severity === "error")?.message ??
          preview.blockers[0] ??
          "This version cannot be restored.",
        ExitCode.GENERAL,
      );
    }
    if (ctx.settings.dryRun) {
      emitResult({ would_restore: ctx.flags.versionId, preview }, format);
      return;
    }
    await confirmDangerousAction(
      "Restore this version to the agents.yaml working tree? Version history and agents.state.json will not change.",
      ctx.flags.yes,
    );
    const restored = await restoreProjectVersion(file, ctx.flags.versionId, {
      headVersion: preview.base_head_version,
      sourceRevision: preview.base_source_revision,
    });
    if (format === "json") {
      emitResult({ restored: ctx.flags.versionId, preview: restored }, format);
    } else {
      emitBare(
        `Restored ${ctx.flags.versionId.slice(0, 12)} to the working tree. Version history was not changed.`,
      );
    }
  },
});

function renderStatus(status: ProjectVersionStatus): void {
  emitBare(`Automatic versioning: ${status.enabled ? "enabled" : "disabled"}`);
  emitBare(`Version store: ${status.initialized ? status.store_root : "not initialized"}`);
  emitBare(`Config path: ${status.config_path}`);
  emitBare(`Current version: ${status.head_version ?? "none"}`);
  emitBare(
    `agents.yaml: ${status.source_status}${status.source_versioned ? ", versioned" : ", unversioned"}`,
  );
  const blockers = [...new Set([...status.write_blockers, ...status.restore_blockers])];
  for (const blocker of blockers) emitBare(chalk.yellow(`Blocker: ${blocker}`));
}

function formatVersion(version: ProjectVersion): string {
  return `${chalk.yellow(version.short_version)} ${version.created_at} ${version.message} ${chalk.dim(`(${version.created_by})`)}`;
}

function renderPreview(preview: ProjectVersionPreview): void {
  emitBare(chalk.bold(`Version ${preview.version_id}`));
  emitBare(chalk.red("--- working tree"));
  emitBare(chalk.green(`+++ ${preview.version_id}`));
  for (const line of buildLineDiff(preview.before_yaml, preview.after_yaml)) {
    if (line.kind === "deletion") emitBare(chalk.red(`-${line.text}`));
    else if (line.kind === "addition") emitBare(chalk.green(`+${line.text}`));
    else emitBare(chalk.dim(` ${line.text}`));
  }
  for (const diagnostic of preview.diagnostics) {
    const color =
      diagnostic.severity === "error"
        ? chalk.red
        : diagnostic.severity === "warning"
          ? chalk.yellow
          : chalk.dim;
    emitBare(color(`${diagnostic.severity}: ${diagnostic.code}: ${diagnostic.message}`));
  }
  for (const blocker of preview.blockers) emitBare(chalk.yellow(`blocker: ${blocker}`));
  emitBare(`Can restore: ${preview.can_restore ? "yes" : "no"}`);
}

type DiffLine = { kind: "context" | "addition" | "deletion"; text: string };

function buildLineDiff(beforeSource: string, afterSource: string): DiffLine[] {
  const beforeLines = yamlLines(beforeSource);
  const afterLines = yamlLines(afterSource);
  const maximumDistance = beforeLines.length + afterLines.length;
  const frontier = new Map<number, number>([[1, 0]]);
  const traces: Array<Map<number, number>> = [];

  for (let editDistance = 0; editDistance <= maximumDistance; editDistance += 1) {
    traces.push(new Map(frontier));
    for (let diagonal = -editDistance; diagonal <= editDistance; diagonal += 2) {
      const deletionStart = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      const additionStart = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      const startsWithAddition =
        diagonal === -editDistance || (diagonal !== editDistance && deletionStart < additionStart);
      let beforeIndex = startsWithAddition ? (frontier.get(diagonal + 1) ?? 0) : deletionStart + 1;
      let afterIndex = beforeIndex - diagonal;
      while (
        beforeIndex < beforeLines.length &&
        afterIndex < afterLines.length &&
        beforeLines[beforeIndex] === afterLines[afterIndex]
      ) {
        beforeIndex += 1;
        afterIndex += 1;
      }
      frontier.set(diagonal, beforeIndex);
      if (beforeIndex >= beforeLines.length && afterIndex >= afterLines.length) {
        return backtrackDiff(beforeLines, afterLines, traces, editDistance);
      }
    }
  }
  return [];
}

function backtrackDiff(
  beforeLines: string[],
  afterLines: string[],
  traces: Array<Map<number, number>>,
  finalDistance: number,
): DiffLine[] {
  let beforeIndex = beforeLines.length;
  let afterIndex = afterLines.length;
  const reversedLines: DiffLine[] = [];
  for (let editDistance = finalDistance; editDistance >= 0; editDistance -= 1) {
    const frontier = traces[editDistance]!;
    const diagonal = beforeIndex - afterIndex;
    const deletionStart = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
    const additionStart = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
    const cameFromAddition =
      diagonal === -editDistance || (diagonal !== editDistance && deletionStart < additionStart);
    const previousDiagonal = cameFromAddition ? diagonal + 1 : diagonal - 1;
    const previousBeforeIndex = frontier.get(previousDiagonal) ?? 0;
    const previousAfterIndex = previousBeforeIndex - previousDiagonal;
    while (beforeIndex > previousBeforeIndex && afterIndex > previousAfterIndex) {
      reversedLines.push({ kind: "context", text: beforeLines[beforeIndex - 1]! });
      beforeIndex -= 1;
      afterIndex -= 1;
    }
    if (editDistance === 0) break;
    if (beforeIndex === previousBeforeIndex) {
      reversedLines.push({ kind: "addition", text: afterLines[afterIndex - 1]! });
      afterIndex -= 1;
    } else {
      reversedLines.push({ kind: "deletion", text: beforeLines[beforeIndex - 1]! });
      beforeIndex -= 1;
    }
  }
  return reversedLines.reverse();
}

function yamlLines(source: string): string[] {
  const lines = source.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
