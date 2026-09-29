import { statSync } from "node:fs";
import { basename } from "node:path";
import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type RagUploadLeaseResponse,
  type RagAddFileResponse,
} from "bailian-cli-core";
import { computeFileMd5, putFileStream } from "../upload-stream.ts";

export interface UploadCheckpoint {
  leaseId: string;
  categoryId: string;
  fileId?: string;
}

export interface KnowledgeUploadOptions {
  client: Client;
  workspaceId: string;
  filePath: string;
  sizeBytes: number;
  categoryId: string;
  categoryType?: string;
  parserOptions?: { parser?: string; parserConfig?: Record<string, unknown> };
  tags?: string[];
  timeout: number;
  localize: (text: LocalizedText) => string;
  checkpoint?: (record: UploadCheckpoint) => Promise<void>;
}

/** Upload one validated file. No output or credential-store side effects. */
export async function uploadKnowledgeFile(
  options: KnowledgeUploadOptions,
): Promise<UploadCheckpoint & { fileId: string }> {
  const {
    client,
    workspaceId,
    filePath,
    sizeBytes,
    categoryId,
    categoryType,
    tags,
    timeout,
    localize,
    checkpoint,
  } = options;
  const parserOptions = { parser: "AUTO_SELECT", ...options.parserOptions };
  const originalStat = statSync(filePath);
  if (originalStat.size !== sizeBytes) {
    throw new BailianError(
      localize({
        "en-US": "The source file changed since validation; upload was stopped.",
        "zh-CN": "源文件在校验后发生变化，已停止上传。",
      }),
      ExitCode.GENERAL,
    );
  }
  const contentMd5 = await computeFileMd5(filePath);

  // 1) Apply for an upload lease (gotcha: the category parameter is named
  //    category, not categoryId; sizeBytes must be a string)
  const lease = await client.requestJson<RagUploadLeaseResponse>({
    path: ragEndpoint(workspaceId, RAG_PATHS.applyFileUploadLease),
    method: "POST",
    body: {
      category: categoryId,
      ...(categoryType ? { categoryType: categoryType } : {}),
      fileName: basename(filePath),
      sizeBytes: String(sizeBytes),
      contentMd5,
    },
  });
  const leaseId = lease.data?.leaseId;
  const leaseParam = lease.data?.param;
  if (leaseId) await checkpoint?.({ leaseId, categoryId });
  if (!leaseId || !leaseParam?.url) {
    throw new BailianError(
      localize({
        "en-US": `Upload lease response missing leaseId/url for ${filePath}`,
        "zh-CN": `文件 ${filePath} 的上传凭证响应缺少 leaseId/url`,
      }),
      ExitCode.GENERAL,
    );
  }

  // 2) OSS upload: goes to the OSS host, not the DashScope gateway — native fetch without a Bearer header
  let ossResponse: Response;
  try {
    ossResponse = await putFileStream(
      filePath,
      { ...leaseParam, url: leaseParam.url },
      AbortSignal.timeout(timeout * 1000),
    );
  } catch (error) {
    const fileError = error as { code?: string; cause?: { code?: string } };
    const causeCode = fileError.code ?? fileError.cause?.code;
    const localReadFailure = ["ENOENT", "EACCES", "EPERM", "EISDIR", "EIO"].includes(
      causeCode ?? "",
    );
    throw new BailianError(
      localize({
        "en-US": `OSS upload failed for ${basename(filePath)}`,
        "zh-CN": `文件 ${basename(filePath)} 的 OSS 上传失败`,
      }),
      localReadFailure ? ExitCode.GENERAL : ExitCode.NETWORK,
      causeCode
        ? localize(
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
      `OSS upload rejected (HTTP ${ossResponse.status}) for ${basename(filePath)}${ossBody ? `: ${ossBody.slice(0, 300)}` : ""}`,
      ExitCode.GENERAL,
    );
  }

  const uploadedStat = statSync(filePath);
  if (
    originalStat.size !== uploadedStat.size ||
    originalStat.mtimeMs !== uploadedStat.mtimeMs ||
    originalStat.ino !== uploadedStat.ino
  ) {
    throw new BailianError(
      localize({
        "en-US": "The source file changed during upload; registration was stopped.",
        "zh-CN": "源文件在上传过程中发生变化，已停止注册。",
      }),
      ExitCode.GENERAL,
    );
  }

  // 3) Register the file
  const added = await client.requestJson<RagAddFileResponse>({
    path: ragEndpoint(workspaceId, RAG_PATHS.addFile),
    method: "POST",
    body: {
      leaseId,
      category: categoryId,
      ...(categoryType ? { categoryType: categoryType } : {}),
      ...parserOptions,
      ...(tags?.length ? { tags: tags } : {}),
    },
  });
  const fileId = added.data?.fileId;
  if (!fileId) {
    throw new BailianError(
      localize({
        "en-US": `addFile response missing fileId for ${filePath}`,
        "zh-CN": `文件 ${filePath} 的 addFile 响应缺少 fileId`,
      }),
      ExitCode.GENERAL,
    );
  }
  await checkpoint?.({ leaseId, fileId, categoryId });
  return { leaseId, fileId, categoryId };
}
