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
    description: { "en-US": "Authorized OSS bucket name", "zh-CN": "已授权的 OSS Bucket 名称" },
    required: true,
  },
  region: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "OSS region id (e.g. cn-beijing)",
      "zh-CN": "OSS Region ID（例如 cn-beijing）",
    },
    required: true,
  },
  ossKey: {
    type: "array",
    valueHint: "<key>",
    description: {
      "en-US": "OSS object key to import (repeatable, 1-10 per call)",
      "zh-CN": "要导入的 OSS Object Key（可重复，每次调用 1–10 个）",
    },
    required: true,
  },
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Target data-center category (default: the default category)",
      "zh-CN": "目标数据中心类目（默认：默认类目）",
    },
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "File tag applied to every imported file (repeatable, up to 10)",
      "zh-CN": "应用于每个导入文件的标签（可重复，最多 10 个）",
    },
  },
  overwrite: {
    type: "switch",
    description: {
      "en-US": "Overwrite files previously imported from the same OSS keys",
      "zh-CN": "覆盖此前从相同 OSS Key 导入的文件",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Batch import files from an authorized OSS bucket into the data center",
    "zh-CN": "从已授权的 OSS Bucket 批量导入文件到数据中心",
  },
  auth: "apiKey",
  usageArgs: "--bucket <name> --region <id> --oss-key <key> [flags]",
  flags: DOC_IMPORT_OSS_FLAGS,
  notes: [
    {
      "en-US":
        "The bucket must be authorized to the platform service role beforehand; permission errors from the server are passed through with a pointer to check AliyunServiceRoleForBailian in the RAM console.",
      "zh-CN":
        "必须预先将 Bucket 授权给平台服务角色；服务端权限错误将原样透传，并提示在 RAM 控制台检查 AliyunServiceRoleForBailian。",
    },
    {
      "en-US": "File names are derived from the OSS key basename.",
      "zh-CN": "文件名取自 OSS Key 的 basename。",
    },
    {
      "en-US":
        "--overwrite replaces the previously imported file and issues a NEW fileId (the old one becomes invalid) — verified live.",
      "zh-CN":
        "--overwrite 会替换此前导入的文件并生成新的 fileId（旧 fileId 将失效）——已通过真实环境验证。",
    },
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

    // Live-verified shape: results come back as addFileResultList (the docs' flat
    // fileIds field is not returned); per-file status is SUCCESS on success
    const results = response.data?.addFileResultList ?? [];
    const fileIds = results
      .map((result) => result.fileId)
      .filter((fileId): fileId is string => !!fileId);
    if (settings.quiet) {
      for (const fileId of fileIds) emitBare(fileId);
      return;
    }
    if (format === "text") {
      emitBare(`imported: ${fileIds.length} file(s)`);
      for (const result of results) {
        emitBare(`  ${result.fileId ?? "-"}  ${result.status ?? "-"}  ${result.ossKey ?? ""}`);
      }
      return;
    }
    emitResult(response, format);
  },
});
