// Orchestration command: local file → data center → (optional) import into a knowledge base.
import { statSync } from "node:fs";
import { basename } from "node:path";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagUploadLeaseResponse,
  type RagAddFileResponse,
  type RagJobCreateResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  resolveWorkspaceId,
  WORKSPACE_FLAG,
  failedImportDocs,
  importJobFailureMessage,
  importJobStatus,
  importJobStatusUrl,
  pollImportJob,
  withPartialSuccessHint,
} from "./shared.ts";
import {
  checkUploadFile,
  expandUploadPaths,
  isMediaFile,
  UPLOAD_FORMAT_RULES,
} from "./upload-support.ts";

import { computeFileMd5, putFileStream } from "./upload-stream.ts";
import { PARSER_FLAGS, readParserOptions } from "./parser-config.ts";

const DOC_UPLOAD_FLAGS = {
  categoryType: {
    type: "string",
    valueHint: "<type>",
    choices: ["UNSTRUCTURED", "SESSION_FILE"] as const,
    description: {
      "en-US": "File category type (SESSION_FILE for temporary chat attachments)",
      "zh-CN": "文件类目类型（SESSION_FILE 用于临时会话附件）",
    },
  },
  ...PARSER_FLAGS,
  file: {
    type: "array",
    valueHint: "<path>",
    description: {
      "en-US":
        "Local file or directory path (repeatable). Directories are scanned recursively; unsupported formats are skipped",
      "zh-CN": "本地文件或目录路径（可重复）。目录会递归扫描，不支持的格式将被跳过",
    },
    required: true,
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Import into this knowledge base after registration (one job for all files)",
      "zh-CN": "文件注册后导入该知识库（所有文件共用一个任务）",
    },
  },
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Target data-center category; defaults to the workspace default category",
      "zh-CN": "目标数据中心类目；默认为 Workspace 的默认类目",
    },
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "File tag (repeatable), applied to every uploaded file",
      "zh-CN": "文件标签（可重复），应用于每个上传文件",
    },
  },
  wait: {
    type: "switch",
    description: {
      "en-US": "Poll the import job to a terminal state (needs --index-id)",
      "zh-CN": "轮询导入任务直到进入终态（需要 --index-id）",
    },
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 5)",
      "zh-CN": "等待时的轮询间隔（默认：5）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

interface UploadedFile {
  path: string;
  fileId: string;
}

export default defineCommand({
  description: {
    "en-US":
      "Upload local files or directories to the data center and optionally import into a knowledge base",
    "zh-CN": "上传本地文件或目录到数据中心，并可选择导入知识库",
  },
  auth: "apiKey",
  usageArgs: "--file <path> [flags]",
  flags: DOC_UPLOAD_FLAGS,
  notes: [
    {
      "en-US":
        "Audio/video files support up to 2 GB (2,000,000,000 bytes) each. With --index-id, at most 50 local media files per call; no automatic splitting.",
      "zh-CN":
        "音视频单文件上限 2 GB（2,000,000,000 字节）。带 --index-id 时每次最多 50 个本地音视频文件，不自动拆批。",
    },
    {
      "en-US":
        "Pipeline: apply upload lease → PUT to OSS → register file → (with --index-id) create import job.",
      "zh-CN":
        "处理流程：申请上传凭证 → PUT 到 OSS → 注册文件 →（传入 --index-id 时）创建导入任务。",
    },
    {
      "en-US": "Without --category-id the workspace default category is resolved automatically.",
      "zh-CN": "未传入 --category-id 时，会自动解析 Workspace 的默认类目。",
    },
    {
      "en-US":
        "Directories are scanned recursively; node_modules, .git, and similar are skipped automatically.",
      "zh-CN": "目录会递归扫描；node_modules、.git 等目录会被自动跳过。",
    },
    {
      "en-US":
        "Multiple files are processed sequentially; on failure, already-registered file ids are listed in the error hint.",
      "zh-CN": "多个文件会依次处理；失败时，错误提示会列出已经注册成功的文件 ID。",
    },
  ],
  exampleArgs: [
    "--file ./a.md --workspace-id ws-xxx",
    "--file ./a.md --file ./b.pdf --index-id idx-xxx --wait",
    "--file ./docs/ --workspace-id ws-xxx",
    "--file ./docs/ --dry-run --verbose",
  ],
  validate(flags) {
    if (
      flags.categoryType === "SESSION_FILE" &&
      (flags.indexId || flags.parser !== undefined || flags.parserConfigFile !== undefined)
    )
      return {
        "en-US":
          "SESSION_FILE uses the default parser and cannot be imported with --index-id; omit parser options.",
        "zh-CN": "SESSION_FILE 使用默认解析器，不能通过 --index-id 入库；请省略 parser 选项。",
      };
    if (flags.wait && !flags.indexId) return "--wait requires --index-id";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);
    const parserOptions = { parser: "AUTO_SELECT", ...readParserOptions(flags, ctx.localize) };

    // Expand directories into individual file paths; unsupported extensions are
    // collected into `skipped` rather than throwing (directory-scan semantics)
    const { files: expandedFiles, skipped } = expandUploadPaths(flags.file);
    if (flags.indexId && expandedFiles.filter(isMediaFile).length > 50) {
      throw new BailianError(
        ctx.localize({
          "en-US":
            "At most 50 media files can be imported in one call. Split the input before uploading.",
          "zh-CN": "每次最多导入 50 个音视频文件，请在上传前拆分输入。",
        }),
        ExitCode.USAGE,
      );
    }
    if (expandedFiles.length === 0) {
      throw new BailianError(
        "No supported files found",
        ExitCode.USAGE,
        `Supported formats: ${Object.keys(UPLOAD_FORMAT_RULES).join(" ")}`,
      );
    }

    // Local pre-flight validation also runs in dry-run (rehearsal semantics: surface
    // file problems early); exceeding a soft limit only warns
    const checkedFiles = expandedFiles.map((filePath) => {
      const checked = checkUploadFile(filePath, ctx.localize);
      if (checked.warning) process.stderr.write(`Warning: ${checked.warning}\n`);
      return { filePath, sizeBytes: checked.sizeBytes };
    });

    if (settings.dryRun) {
      // dry-run does not read file contents (md5 shown as a placeholder)
      const categoryPlaceholder = flags.categoryId ?? "default";
      const steps = checkedFiles.flatMap((checkedFile) => [
        {
          step: "applyFileUploadLease",
          endpoint: ragEndpoint(workspaceId, RAG_PATHS.applyFileUploadLease),
          request: {
            category: categoryPlaceholder,
            ...(flags.categoryType ? { categoryType: flags.categoryType } : {}),
            fileName: basename(checkedFile.filePath),
            sizeBytes: String(checkedFile.sizeBytes), // gotcha: must be a string
            contentMd5: "<md5-base64>",
          } as unknown,
        },
        {
          step: "ossPut",
          endpoint: "<lease.param.url>",
          request: { method: "PUT", headers: "<lease.param.headers>" } as unknown,
        },
        {
          step: "addFile",
          endpoint: ragEndpoint(workspaceId, RAG_PATHS.addFile),
          request: {
            leaseId: "<leaseId>",
            category: categoryPlaceholder,
            ...(flags.categoryType ? { categoryType: flags.categoryType } : {}),
            ...parserOptions,
            ...(flags.tag?.length ? { tags: flags.tag } : {}),
          } as unknown,
        },
      ]);
      if (flags.indexId) {
        steps.push({
          step: "createImportJob",
          endpoint: ragEndpoint(workspaceId, RAG_PATHS.indexJobCreate),
          request: {
            indexId: flags.indexId,
            // Live-verified: the field name is docIds (not documentIds as in the
            // public docs); omitting sourceType would import the entire data center.
            sourceType: "DATA_CENTER_FILE",
            docIds: ["<fileId>"],
          } as unknown,
        });
      }
      emitResult({ steps, skipped }, format);
      return;
    }

    // Default category: the literal "default" is accepted by lease/addFile
    // (verified against the live API), so no listCategory resolution is needed
    const categoryId = flags.categoryId ?? "default";

    // Multiple files run steps 1-3 sequentially (no concurrency in this version,
    // to avoid OSS rate-limit complexity)
    const uploaded: UploadedFile[] = [];
    for (const checkedFile of checkedFiles) {
      try {
        const originalStat = statSync(checkedFile.filePath);
        if (originalStat.size !== checkedFile.sizeBytes) {
          throw new BailianError(
            ctx.localize({
              "en-US": "The source file changed since validation; upload was stopped.",
              "zh-CN": "源文件在校验后发生变化，已停止上传。",
            }),
            ExitCode.GENERAL,
          );
        }
        const contentMd5 = await computeFileMd5(checkedFile.filePath);

        // 1) Apply for an upload lease (gotcha: the category parameter is named
        //    category, not categoryId; sizeBytes must be a string)
        const lease = await ctx.client.requestJson<RagUploadLeaseResponse>({
          path: ragEndpoint(workspaceId, RAG_PATHS.applyFileUploadLease),
          method: "POST",
          body: {
            category: categoryId,
            ...(flags.categoryType ? { categoryType: flags.categoryType } : {}),
            fileName: basename(checkedFile.filePath),
            sizeBytes: String(checkedFile.sizeBytes),
            contentMd5,
          },
        });
        const leaseId = lease.data?.leaseId;
        const leaseParam = lease.data?.param;
        if (!leaseId || !leaseParam?.url) {
          throw new BailianError(
            `Upload lease response missing leaseId/url for ${checkedFile.filePath}`,
            ExitCode.GENERAL,
          );
        }

        // 2) OSS upload: goes to the OSS host, not the DashScope gateway — native fetch without a Bearer header
        let ossResponse: Response;
        try {
          ossResponse = await putFileStream(
            checkedFile.filePath,
            { ...leaseParam, url: leaseParam.url },
            AbortSignal.timeout(settings.timeout * 1000),
          );
        } catch (error) {
          const fileError = error as { code?: string; cause?: { code?: string } };
          const causeCode = fileError.code ?? fileError.cause?.code;
          const localReadFailure = ["ENOENT", "EACCES", "EPERM", "EISDIR", "EIO"].includes(
            causeCode ?? "",
          );
          throw new BailianError(
            ctx.localize({
              "en-US": `OSS upload failed for ${basename(checkedFile.filePath)}`,
              "zh-CN": `文件 ${basename(checkedFile.filePath)} 的 OSS 上传失败`,
            }),
            localReadFailure ? ExitCode.GENERAL : ExitCode.NETWORK,
            causeCode
              ? ctx.localize(
                  localReadFailure
                    ? {
                        "en-US": `File read error (${causeCode}); check that the source exists and is readable.`,
                        "zh-CN": `文件读取错误（${causeCode}）；请检查源文件是否存在且可读。`,
                      }
                    : {
                        "en-US": `Network error (${causeCode}).`,
                        "zh-CN": `网络错误（${causeCode}）。`,
                      },
                )
              : undefined,
            { cause: error },
          );
        }
        if (!ossResponse.ok) {
          const ossBody = await ossResponse.text().catch(() => "");
          throw new BailianError(
            `OSS upload rejected (HTTP ${ossResponse.status}) for ${basename(checkedFile.filePath)}${ossBody ? `: ${ossBody.slice(0, 300)}` : ""}`,
            ExitCode.GENERAL,
          );
        }

        const uploadedStat = statSync(checkedFile.filePath);
        if (
          originalStat.size !== uploadedStat.size ||
          originalStat.mtimeMs !== uploadedStat.mtimeMs ||
          originalStat.ino !== uploadedStat.ino
        ) {
          throw new BailianError(
            ctx.localize({
              "en-US": "The source file changed during upload; registration was stopped.",
              "zh-CN": "源文件在上传过程中发生变化，已停止注册。",
            }),
            ExitCode.GENERAL,
          );
        }

        // 3) Register the file
        const added = await ctx.client.requestJson<RagAddFileResponse>({
          path: ragEndpoint(workspaceId, RAG_PATHS.addFile),
          method: "POST",
          body: {
            leaseId,
            category: categoryId,
            ...(flags.categoryType ? { categoryType: flags.categoryType } : {}),
            ...parserOptions,
            ...(flags.tag?.length ? { tags: flags.tag } : {}),
          },
        });
        const fileId = added.data?.fileId;
        if (!fileId) {
          throw new BailianError(
            `addFile response missing fileId for ${checkedFile.filePath}`,
            ExitCode.GENERAL,
          );
        }
        uploaded.push({ path: checkedFile.filePath, fileId });
      } catch (error) {
        // Partial-failure semantics: abort with an error, listing already-registered
        // fileIds in the hint so users can resume without re-uploading
        if (uploaded.length > 0) {
          throw withPartialSuccessHint(
            error,
            `Already registered: ${uploaded.map((item) => item.fileId).join(", ")}`,
          );
        }
        throw error;
      }
    }

    // 4) Optional import (merged into a single job after all files are registered)
    let ingestionId: string | undefined;
    let finalStatus: string | undefined;
    if (flags.indexId) {
      try {
        const job = await ctx.client.requestJson<RagJobCreateResponse>({
          path: ragEndpoint(workspaceId, RAG_PATHS.indexJobCreate),
          method: "POST",
          body: {
            indexId: flags.indexId,
            // Live-verified: the field name is docIds (not documentIds as in the
            // public docs); omitting sourceType would import the entire data center.
            sourceType: "DATA_CENTER_FILE",
            docIds: uploaded.map((item) => item.fileId),
          },
        });
        ingestionId = job.data?.ingestionId;
        if (flags.wait && ingestionId) {
          const statusResponse = await pollImportJob(ctx.client, settings, {
            statusUrl: importJobStatusUrl(workspaceId, flags.indexId, ingestionId).toString(),
            intervalSec: flags.pollInterval ?? 5,
          });
          finalStatus = importJobStatus(statusResponse);
          // Job finished but some documents failed to parse → non-zero exit, server message passed through verbatim
          if (failedImportDocs(statusResponse).length > 0) {
            throw new BailianError(
              importJobFailureMessage(statusResponse, "Import job reported document failures."),
              ExitCode.GENERAL,
              `Registered file ids: ${uploaded.map((item) => item.fileId).join(", ")}`,
            );
          }
        }
      } catch (error) {
        throw withPartialSuccessHint(
          error,
          `fileIds: ${uploaded.map((item) => item.fileId).join(", ")}; indexId: ${flags.indexId}${ingestionId ? `; ingestionId: ${ingestionId}` : ""}`,
        );
      }
    }

    if (settings.quiet) {
      for (const item of uploaded) emitBare(item.fileId);
      return;
    }
    if (format === "text") {
      for (const item of uploaded) {
        emitBare(`${basename(item.path)}  ${item.fileId}  registered`);
      }
      if (ingestionId) emitBare(`job: ${ingestionId}`);
      if (finalStatus) emitBare(`status: ${finalStatus}`);
      // Summary line: always show counts; list skipped files only with --verbose
      const summaryParts = [`Uploaded ${uploaded.length} file${uploaded.length !== 1 ? "s" : ""}`];
      if (skipped.length > 0) {
        summaryParts.push(`skipped ${skipped.length} unsupported`);
      }
      emitBare(`\n${summaryParts.join(", ")}.`);
      if (settings.verbose && skipped.length > 0) {
        emitBare("Skipped files:");
        for (const skippedPath of skipped) {
          emitBare(`  ${basename(skippedPath)}`);
        }
      }
      return;
    }
    // An orchestration command has no single response to pass through — emit a custom stable shape
    emitResult(
      {
        files: uploaded.map((item) => ({ path: item.path, fileId: item.fileId })),
        skipped,
        ...(flags.indexId ? { index_id: flags.indexId } : {}),
        ...(ingestionId ? { ingestion_id: ingestionId } : {}),
        ...(finalStatus ? { final_status: finalStatus } : {}),
      },
      format,
    );
  },
});
