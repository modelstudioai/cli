// Orchestration command: local file → data center → (optional) import into a knowledge base.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { checkUploadFile, expandUploadPaths } from "./upload-support.ts";

const DOC_UPLOAD_FLAGS = {
  file: {
    type: "array",
    valueHint: "<path>",
    description:
      "Local file or directory path (repeatable). Directories are scanned recursively; unsupported formats are skipped",
    required: true,
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Import into this knowledge base after registration (one job for all files)",
  },
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: "Target data-center category; defaults to the workspace default category",
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: "File tag (repeatable), applied to every uploaded file",
  },
  wait: {
    type: "switch",
    description: "Poll the import job to a terminal state (needs --index-id)",
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: "Polling interval when waiting (default: 5)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

interface UploadedFile {
  path: string;
  fileId: string;
}

export default defineCommand({
  description:
    "Upload local files or directories to the data center and optionally import into a knowledge base",
  auth: "apiKey",
  usageArgs: "--file <path> [flags]",
  flags: DOC_UPLOAD_FLAGS,
  notes: [
    "Pipeline: apply upload lease → PUT to OSS → register file → (with --index-id) create import job.",
    "Without --category-id the workspace default category is resolved automatically.",
    "Directories are scanned recursively; node_modules, .git, and similar are skipped automatically.",
    "Multiple files are processed sequentially; on failure, already-registered file ids are listed in the error hint.",
  ],
  exampleArgs: [
    "--file ./a.md --workspace-id ws-xxx",
    "--file ./a.md --file ./b.pdf --index-id idx-xxx --wait",
    "--file ./docs/ --workspace-id ws-xxx",
    "--file ./docs/ --dry-run --verbose",
  ],
  validate(flags) {
    if (flags.wait && !flags.indexId) return "--wait requires --index-id";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Expand directories into individual file paths; unsupported extensions are
    // collected into `skipped` rather than throwing (directory-scan semantics)
    const { files: expandedFiles, skipped } = expandUploadPaths(flags.file);
    if (expandedFiles.length === 0) {
      throw new BailianError(
        "No supported files found",
        ExitCode.USAGE,
        `Supported formats: .pdf .doc .docx .ppt .pptx .xls .xlsx .csv .md .txt .html .png .jpg .jpeg .bmp .gif`,
      );
    }

    // Local pre-flight validation also runs in dry-run (rehearsal semantics: surface
    // file problems early); exceeding a soft limit only warns
    const checkedFiles = expandedFiles.map((filePath) => {
      const checked = checkUploadFile(filePath);
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
            parser: "AUTO_SELECT",
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
        const fileBuffer = readFileSync(checkedFile.filePath);
        const contentMd5 = createHash("md5").update(fileBuffer).digest("base64");

        // 1) Apply for an upload lease (gotcha: the category parameter is named
        //    category, not categoryId; sizeBytes must be a string)
        const lease = await ctx.client.requestJson<RagUploadLeaseResponse>({
          path: ragEndpoint(workspaceId, RAG_PATHS.applyFileUploadLease),
          method: "POST",
          body: {
            category: categoryId,
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
          ossResponse = await fetch(leaseParam.url, {
            method: leaseParam.method ?? "PUT",
            headers: leaseParam.headers,
            body: fileBuffer,
          });
        } catch (error) {
          const causeCode = (error as { cause?: { code?: string } }).cause?.code;
          throw new BailianError(
            `OSS upload failed for ${basename(checkedFile.filePath)}`,
            ExitCode.NETWORK,
            causeCode ? `Network error (${causeCode}).` : undefined,
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

        // 3) Register the file
        const added = await ctx.client.requestJson<RagAddFileResponse>({
          path: ragEndpoint(workspaceId, RAG_PATHS.addFile),
          method: "POST",
          body: {
            leaseId,
            category: categoryId,
            parser: "AUTO_SELECT",
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
        // fileIds in the hint (re-uploading is cheap and idempotent)
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
