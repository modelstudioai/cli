import { basename } from "node:path";
import type { ProviderFileInfo } from "@openagentpack/sdk";
import {
  deleteFile,
  downloadRemoteFile,
  getFileInfo,
  listRemoteFiles,
  uploadFile,
} from "@openagentpack/sdk";
import { BailianError, defineCommand, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  matchesQuery,
  SEARCH_FLAGS,
  searchCursorPages,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { inferMimeType, readInputFile, writeOutputFile } from "./_engine/output-file.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const FILE_ID_FLAG = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Remote file ID", "zh-CN": "远端 File ID" },
  },
} as const;

const SCOPE_ID_FLAG = {
  scopeId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by scope ID", "zh-CN": "按 Scope ID 筛选" },
  },
} as const;

const UPLOAD_FLAGS = {
  ...API_TARGET_FLAGS,
  path: {
    type: "string",
    valueHint: "<path>",
    required: true,
    description: { "en-US": "Local file path", "zh-CN": "本地文件路径" },
  },
  filename: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Remote filename override", "zh-CN": "覆盖远端文件名" },
  },
  mimeType: {
    type: "string",
    valueHint: "<type>",
    description: { "en-US": "MIME type override", "zh-CN": "覆盖 MIME 类型" },
  },
  purpose: {
    type: "string",
    valueHint: "<purpose>",
    description: { "en-US": "Provider upload purpose", "zh-CN": "Provider 上传用途" },
  },
} as const;

const LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...SCOPE_ID_FLAG };
const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...SCOPE_ID_FLAG,
};
const GET_FLAGS = { ...API_TARGET_FLAGS, ...FILE_ID_FLAG };
const DOWNLOAD_FLAGS = {
  ...GET_FLAGS,
  outputFile: {
    type: "string",
    valueHint: "<path>",
    required: true,
    description: { "en-US": "Destination path", "zh-CN": "目标路径" },
  },
  force: {
    type: "switch",
    description: { "en-US": "Overwrite an existing output file", "zh-CN": "覆盖已存在的输出文件" },
  },
} as const;
const DELETE_FLAGS = {
  ...GET_FLAGS,
  yes: {
    type: "switch",
    description: { "en-US": "Confirm permanent file deletion", "zh-CN": "确认永久删除文件" },
  },
} as const;

function fileRows(files: ProviderFileInfo[]): string[][] {
  return files.map((file) => [
    file.id,
    displayValue(file.filename),
    displayValue(file.status),
    String(file.size_bytes),
    displayValue(file.scope?.id),
    displayValue(file.created_at),
  ]);
}

export const managedAgentFileUpload = defineCommand({
  description: { "en-US": "Upload a Managed Agent file", "zh-CN": "上传托管 Agent 文件" },
  auth: "apiKey",
  usageArgs: "--path <path> [--filename <name>] [--mime-type <type>] [--purpose <purpose>]",
  flags: UPLOAD_FLAGS,
  exampleArgs: ["--path ./report.pdf", "--path ./data.json --purpose assistants"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_upload_file: ctx.flags.path,
          filename: ctx.flags.filename ?? basename(ctx.flags.path),
          mime_type: ctx.flags.mimeType ?? inferMimeType(ctx.flags.path),
          purpose: ctx.flags.purpose,
        },
        format,
      );
      return;
    }
    const content = await readInputFile(ctx.flags.path);
    const file = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return uploadFile(runtime, content, ctx.flags.filename ?? basename(ctx.flags.path), {
          provider: ctx.flags.provider,
          mimeType: ctx.flags.mimeType ?? inferMimeType(ctx.flags.path),
          purpose: ctx.flags.purpose,
        });
      }),
    );
    if (format === "json") emitResult(file, format);
    else emitBare(`File uploaded: ${file.id} (${file.filename})`);
  },
});

export const managedAgentFileList = defineCommand({
  description: { "en-US": "List Managed Agent files", "zh-CN": "列出托管 Agent 文件" },
  auth: "apiKey",
  usageArgs: "[--scope-id <id>] [--limit <n>] [--page <cursor>] [--all]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--scope-id sess_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteFiles(runtime, {
              provider: ctx.flags.provider,
              scope_id: ctx.flags.scopeId,
              limit: ctx.flags.limit,
              page,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "files",
      items: result.items,
      headers: ["ID", "FILENAME", "STATUS", "BYTES", "SCOPE", "CREATED"],
      rows: fileRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No files found.",
    });
  },
});

export const managedAgentFileGet = defineCommand({
  description: { "en-US": "Get Managed Agent file metadata", "zh-CN": "获取托管 Agent 文件元数据" },
  auth: "apiKey",
  usageArgs: "--file-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--file-id file_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const file = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getFileInfo(runtime, ctx.flags.fileId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") emitResult(file, format);
    else {
      emitBare(`ID:       ${file.id}`);
      emitBare(`Filename: ${file.filename}`);
      emitBare(`MIME:     ${file.mime_type}`);
      emitBare(`Bytes:    ${file.size_bytes}`);
      emitBare(`Status:   ${displayValue(file.status)}`);
      emitBare(`Scope:    ${displayValue(file.scope?.id)}`);
    }
  },
});

export const managedAgentFileSearch = defineCommand({
  description: { "en-US": "Search Managed Agent files", "zh-CN": "搜索托管 Agent 文件" },
  auth: "apiKey",
  usageArgs: "--query <text> [--scope-id <id>] [--limit <n>] [--page-limit <n>]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query report", "--query pdf --scope-id sess_abc --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteFiles(runtime, {
              provider: ctx.flags.provider,
              scope_id: ctx.flags.scopeId,
              limit: ctx.flags.limit ?? 100,
              page,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          (file) => matchesQuery(ctx.flags.query, file.id, file.filename, file.mime_type),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "files",
      items: result.items,
      headers: ["ID", "FILENAME", "STATUS", "BYTES", "SCOPE", "CREATED"],
      rows: fileRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching files found.",
    });
  },
});

export const managedAgentFileDownload = defineCommand({
  description: {
    "en-US": "Download Managed Agent file content",
    "zh-CN": "下载托管 Agent 文件内容",
  },
  auth: "apiKey",
  usageArgs: "--file-id <id> --output-file <path> [--force]",
  flags: DOWNLOAD_FLAGS,
  exampleArgs: ["--file-id file_abc --output-file ./artifact.pdf"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        { would_download_file: ctx.flags.fileId, output_file: ctx.flags.outputFile },
        format,
      );
      return;
    }
    const content = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return downloadRemoteFile(runtime, ctx.flags.fileId, { provider: ctx.flags.provider });
      }),
    );
    const outputFile = await writeOutputFile(ctx.flags.outputFile, content, ctx.flags.force);
    if (format === "json")
      emitResult({ downloaded: ctx.flags.fileId, output_file: outputFile }, format);
    else emitBare(`File downloaded to ${outputFile}`);
  },
});

export const managedAgentFileDelete = defineCommand({
  description: { "en-US": "Delete a Managed Agent file", "zh-CN": "删除托管 Agent 文件" },
  auth: "apiKey",
  usageArgs: "--file-id <id> --yes",
  flags: DELETE_FLAGS,
  exampleArgs: ["--file-id file_abc --dry-run", "--file-id file_abc --yes"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult({ would_delete_file: ctx.flags.fileId }, format);
      return;
    }
    if (!ctx.flags.yes) {
      throw new BailianError(
        `Refusing to delete file ${ctx.flags.fileId} without confirmation.`,
        ExitCode.USAGE,
        "Re-run with --yes or preview with --dry-run.",
      );
    }
    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        await deleteFile(runtime, ctx.flags.fileId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") emitResult({ deleted: ctx.flags.fileId }, format);
    else emitBare(`File ${ctx.flags.fileId} deleted.`);
  },
});
