/**
 * Upload local files to DashScope temporary OSS storage.
 *
 * Returns an `oss://` prefixed URL valid for 48 hours.
 * When using this URL in API calls, the request MUST include:
 *   X-DashScope-OssResourceResolve: enable
 */
import { existsSync, readFileSync, statSync } from "fs";
import { basename, extname } from "path";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { trackingHeaders, type TrackingIdentity } from "../client/headers.ts";
import { getApiKeyLoginKind } from "../config/profile-presets.ts";
import { REGIONS } from "../config/schema.ts";
import { normalizeModelBaseUrl } from "../config/model-base-url.ts";

const SUPPORTED_UPLOAD_REGIONS = ["cn-beijing", "ap-southeast-1"] as const;

function unsupportedTemporaryUpload(target: string): BailianError {
  return new BailianError(
    `Local-file temporary upload is supported only in ${SUPPORTED_UPLOAD_REGIONS.join(", ")}; "${target}" is not supported.`,
    ExitCode.USAGE,
    "Use a reachable HTTPS media URL instead.",
  );
}

/** Reject Token Plan keys only after the endpoint is recognized as official. */
function rejectOfficialTokenPlanKey(apiKey: string): void {
  if (getApiKeyLoginKind(apiKey) === "token-plan") {
    throw unsupportedTemporaryUpload("Token Plan");
  }
}

/** Keep supported official origins; reject known unsupported official regions. Custom proxies skip key-prefix checks. */
function resolveUploadBaseUrl(baseUrl: string, apiKey: string): string {
  const normalizedBaseUrl = normalizeModelBaseUrl(baseUrl);
  const hostname = new URL(normalizedBaseUrl).hostname.toLowerCase();

  if (/^token-plan\.[a-z0-9-]+\.maas\.aliyuncs\.com$/.test(hostname)) {
    throw unsupportedTemporaryUpload("Token Plan");
  }

  if (hostname === new URL(REGIONS.cn).hostname || hostname === new URL(REGIONS.intl).hostname) {
    rejectOfficialTokenPlanKey(apiKey);
    return normalizedBaseUrl;
  }
  if (hostname === new URL(REGIONS.us).hostname) {
    throw unsupportedTemporaryUpload(hostname);
  }

  const maasMatch = /^[^.]+\.([a-z0-9-]+)\.maas\.aliyuncs\.com$/.exec(hostname);
  const cloudRegion = maasMatch?.[1];
  if (cloudRegion === "cn-beijing" || cloudRegion === "ap-southeast-1") {
    rejectOfficialTokenPlanKey(apiKey);
    return normalizedBaseUrl;
  }
  if (cloudRegion) throw unsupportedTemporaryUpload(cloudRegion);

  // Explicit custom proxies decide temporary-upload support themselves; do not gate on key prefix.
  return normalizedBaseUrl;
}

interface UploadPolicy {
  upload_host: string;
  upload_dir: string;
  oss_access_key_id: string;
  signature: string;
  policy: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
}

interface UploadPolicyResponse {
  data: UploadPolicy;
  request_id?: string;
}

interface UploadPolicyErrorResponse {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
}

/**
 * Step 1: Fetch the upload policy (presigned credentials) from DashScope.
 */
async function getUploadPolicy(
  apiKey: string,
  model: string,
  identity: TrackingIdentity,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<UploadPolicy> {
  const uploadApi = `${resolveUploadBaseUrl(baseUrl, apiKey)}/api/v1/uploads`;
  const url = `${uploadApi}?action=getPolicy&model=${encodeURIComponent(model)}`;
  const policySignal = combineWithTimeout(15_000, signal);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...trackingHeaders(identity),
    },
    signal: policySignal.signal,
  }).finally(policySignal.cleanup);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let serviceError: UploadPolicyErrorResponse | undefined;
    try {
      serviceError = JSON.parse(text) as UploadPolicyErrorResponse;
    } catch {
      // Non-JSON service responses pass through below.
    }
    const serviceMessage =
      typeof serviceError?.message === "string" && serviceError.message
        ? serviceError.message
        : text || `${res.status} ${res.statusText}`;
    const apiCode = typeof serviceError?.code === "string" ? serviceError.code : undefined;
    const requestId =
      typeof serviceError?.request_id === "string" ? serviceError.request_id : undefined;
    const responseContext = [
      `HTTP ${res.status}`,
      apiCode ? `code=${apiCode}` : undefined,
      requestId ? `request_id=${requestId}` : undefined,
      `upload_endpoint=${uploadApi}`,
    ]
      .filter((item): item is string => item !== undefined)
      .join("; ");
    throw new BailianError(`${responseContext} - ${serviceMessage}`, ExitCode.GENERAL, undefined, {
      api: {
        httpStatus: res.status,
        apiCode,
        requestId,
      },
      rawResponse: text.slice(0, 500),
    });
  }

  const body = (await res.json()) as UploadPolicyResponse;
  return body.data;
}

const DEFAULT_UPLOAD_TIMEOUT = 120;

/**
 * Step 2: Upload the file to OSS using the policy.
 */
async function uploadToOSS(
  policy: UploadPolicy,
  filePath: string,
  signal?: AbortSignal,
  timeoutSeconds: number = DEFAULT_UPLOAD_TIMEOUT,
): Promise<string> {
  const fileName = basename(filePath);
  const key = `${policy.upload_dir}/${fileName}`;

  const fileData = readFileSync(filePath);

  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  form.append("file", new Blob([fileData]), fileName);

  const uploadSignal = combineWithTimeout(timeoutSeconds * 1000, signal);
  const res = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
    signal: uploadSignal.signal,
  }).finally(uploadSignal.cleanup);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BailianError(
      `Failed to upload file to OSS (HTTP ${res.status}): ${text}`,
      ExitCode.GENERAL,
    );
  }

  return `oss://${key}`;
}

export interface UploadOptions {
  apiKey: string;
  /** Model origin used only to resolve the supported regional upload service. Defaults to CN. */
  baseUrl?: string;
  model: string;
  filePath: string;
  identity: TrackingIdentity;
  signal?: AbortSignal;
  timeout?: number;
}

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".jpe": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

/** Encode a local image as a Data URI. */
export function imageFileToDataUri(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new BailianError(`File not found: ${filePath}`, ExitCode.USAGE);
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new BailianError(`Not a file: ${filePath}`, ExitCode.USAGE);
  }

  const extension = extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (!mimeType) {
    throw new BailianError(
      `Unsupported image format "${extension || "unknown"}".`,
      ExitCode.USAGE,
      "Use an image file with a recognized extension.",
    );
  }

  const encoded = readFileSync(filePath).toString("base64");
  return `data:${mimeType};base64,${encoded}`;
}

/** Keep dry-run output readable and avoid echoing the complete inline image. */
export function redactDataUri(input: string): string {
  const match = /^data:([^;,]+);base64,/i.exec(input);
  return match ? `data:${match[1]};base64,<omitted>` : input;
}

/**
 * Upload a local file to DashScope temporary storage and return the oss:// URL.
 * The URL is valid for 48 hours.
 */
export async function uploadFile(opts: UploadOptions): Promise<string> {
  const { apiKey, baseUrl = REGIONS.cn, model, filePath, identity, signal, timeout } = opts;

  if (!existsSync(filePath)) {
    throw new BailianError(`File not found: ${filePath}`, ExitCode.USAGE);
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new BailianError(`Not a file: ${filePath}`, ExitCode.USAGE);
  }

  const policy = await getUploadPolicy(apiKey, model, identity, baseUrl, signal);
  return uploadToOSS(policy, filePath, signal, timeout);
}

/**
 * Check if a string looks like a local file path (not a URL).
 */
export function isLocalFile(input: string): boolean {
  if (input.startsWith("http://") || input.startsWith("https://")) return false;
  if (input.startsWith("oss://")) return false;
  if (input.startsWith("data:")) return false;
  return existsSync(input);
}

/**
 * Resolve a file argument: if it's a local path, upload it and return the oss:// URL.
 * If it's already a URL, return as-is.
 */
export async function resolveFileUrl(
  input: string,
  apiKey: string,
  model: string,
  opts: { identity: TrackingIdentity; baseUrl?: string; signal?: AbortSignal; timeout?: number },
): Promise<string> {
  if (!isLocalFile(input)) return input;
  return uploadFile({
    apiKey,
    baseUrl: opts.baseUrl,
    model,
    filePath: input,
    identity: opts.identity,
    signal: opts.signal,
    timeout: opts.timeout,
  });
}

function combineWithTimeout(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const cleanup = () => {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  controller.signal.addEventListener("abort", cleanup, { once: true });

  return { signal: controller.signal, cleanup };
}
