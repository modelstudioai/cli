import { basename } from "node:path";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagOssImportResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const DOC_IMPORT_OSS_FLAGS = {
  bucket: {
    type: "string",
    valueHint: "<name>",
    description: "Authorized OSS bucket name",
    required: true,
  },
  region: {
    type: "string",
    valueHint: "<id>",
    description: "OSS region id (e.g. cn-beijing)",
    required: true,
  },
  ossKey: {
    type: "array",
    valueHint: "<key>",
    description: "OSS object key to import (repeatable, 1-10 per call)",
    required: true,
  },
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: "Target data-center category (default: the default category)",
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: "File tag applied to every imported file (repeatable, up to 10)",
  },
  overwrite: {
    type: "switch",
    description: "Overwrite files previously imported from the same OSS keys",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Batch import files from an authorized OSS bucket into the data center",
  auth: "apiKey",
  usageArgs: "--bucket <name> --region <id> --oss-key <key> [flags]",
  flags: DOC_IMPORT_OSS_FLAGS,
  notes: [
    "The bucket must be authorized to the platform service role beforehand; permission errors from the server are passed through with a pointer to check AliyunServiceRoleForBailian in the RAM console.",
    "File names are derived from the OSS key basename.",
  ],
  exampleArgs: [
    "--bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx",
    "--bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite",
  ],
  validate(flags) {
    if (flags.ossKey.length > 10) return "--oss-key accepts at most 10 entries per call";
    if (flags.tag !== undefined && flags.tag.length > 10) {
      return "--tag accepts at most 10 entries";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // categoryType fixed to UNSTRUCTURED; parser not exposed as a flag (defaults to AUTO_SELECT)
    const body = {
      categoryId: flags.categoryId ?? "default",
      categoryType: "UNSTRUCTURED",
      ossBucket: flags.bucket,
      ossRegionId: flags.region,
      fileDetails: flags.ossKey.map((ossKey) => ({ fileName: basename(ossKey), ossKey })),
      ...(flags.tag?.length ? { tags: flags.tag } : {}),
      ...(flags.overwrite ? { overWriteFileByOssKey: true } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.addFilesFromAuthorizedOss);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagOssImportResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const fileIds = response.data?.fileIds ?? [];
    if (settings.quiet) {
      for (const fileId of fileIds) emitBare(fileId);
      return;
    }
    if (format === "text") {
      emitBare(`imported: ${fileIds.length} file(s)`);
      for (const fileId of fileIds) emitBare(`  ${fileId}`);
      return;
    }
    emitResult(response, format);
  },
});
