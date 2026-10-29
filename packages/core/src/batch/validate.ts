import { createReadStream } from "node:fs";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { BailianError, UsageError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { BATCH_ENDPOINTS, type BatchEndpoint, type BatchReport } from "./types.ts";

export const MAX_BATCH_BYTES = 500 * 1024 * 1024;
export const MAX_BATCH_LINE_BYTES = 6 * 1024 * 1024;
export const MAX_BATCH_RECORDS = 50_000;
export type BatchSource = string | Blob | AsyncIterable<Uint8Array>;
export function batchUsage(english: string, chinese: string): never {
  throw new UsageError(`${english}\n${chinese}`);
}
export function batchIoError(error: unknown): BailianError {
  if (error instanceof BailianError) return error;
  const errno = (error as NodeJS.ErrnoException)?.code;
  return new BailianError(
    `Batch file I/O failed${errno ? ` (${errno})` : ""}.\nBatch 文件读写失败${errno ? `（${errno}）` : ""}。`,
    ExitCode.GENERAL,
    errno === "ENOENT"
      ? "Check the file and parent directory paths. / 请检查文件及父目录路径。"
      : errno === "EEXIST"
        ? "Output exists; use --force to replace it. / 输出已存在，使用 --force 覆盖。"
        : "Check file permissions and available disk space. / 请检查文件权限与磁盘空间。",
    { cause: error },
  );
}
export function batchObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseBatchEndpoint(value: string): BatchEndpoint {
  if (!BATCH_ENDPOINTS.includes(value as BatchEndpoint))
    batchUsage(`Unsupported Batch endpoint: ${value}`, `不支持的 Batch endpoint：${value}`);
  return value as BatchEndpoint;
}
export async function* batchChunks(source: BatchSource): AsyncGenerator<Uint8Array> {
  const stream =
    typeof source === "string"
      ? createReadStream(source)
      : source instanceof Blob
        ? Readable.fromWeb(source.stream() as import("node:stream/web").ReadableStream<Uint8Array>)
        : source;
  try {
    for await (const chunk of stream) yield chunk;
  } catch (error) {
    throw batchIoError(error);
  }
}
// 按原始字节分行，UTF-8 解码使用 fatal，避免把坏输入悄悄替换为 U+FFFD。
export async function* batchLines(
  source: BatchSource,
  maxBytes = Infinity,
  maxLineBytes = MAX_BATCH_LINE_BYTES,
): AsyncGenerator<{ text: string; bytes: number }> {
  let carry = Buffer.alloc(0);
  let total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decode = (bytes: Uint8Array) => {
    try {
      return decoder.decode(bytes);
    } catch {
      return batchUsage("Invalid UTF-8 input.", "输入不是有效 UTF-8。");
    }
  };
  for await (const chunk of batchChunks(source)) {
    total += chunk.byteLength;
    if (total > maxBytes)
      batchUsage(`File exceeds ${maxBytes} bytes.`, `文件超过 ${maxBytes} 字节。`);
    const data = Buffer.concat([carry, chunk]);
    let start = 0;
    let newline = data.indexOf(10, start);
    while (newline !== -1) {
      const length = newline - start;
      if (length > maxLineBytes) batchUsage("JSONL line exceeds 6 MiB.", "JSONL 单行超过 6 MiB。");
      yield { text: decode(data.subarray(start, newline)).replace(/\r$/, ""), bytes: length + 1 };
      start = newline + 1;
      newline = data.indexOf(10, start);
    }
    carry = Buffer.from(data.subarray(start));
    if (carry.byteLength > maxLineBytes)
      batchUsage("JSONL line exceeds 6 MiB.", "JSONL 单行超过 6 MiB。");
  }
  if (carry.length) yield { text: decode(carry), bytes: carry.length };
}

function validateMedia(value: unknown, media = false): void {
  if (typeof value === "string" && media) {
    if (/^data:[^,]+;base64,/i.test(value)) return;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return batchUsage(
        "Media must use a public HTTP(S) or base64 data URL.",
        "媒体必须使用公网 HTTP(S) 或 base64 data URL。",
      );
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    // WHATWG URL 将映射 IPv4 规范化为 ::ffff:7f00:1，先还原再判定私网。
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    const mappedHigh = mapped ? parseInt(mapped[1], 16) : 0;
    const mappedLow = mapped ? parseInt(mapped[2], 16) : 0;
    const ipv4 = mapped
      ? [mappedHigh >> 8, mappedHigh & 255, mappedLow >> 8, mappedLow & 255].join(".")
      : host;
    const privateHost =
      host === "localhost" ||
      host.endsWith(".localhost") ||
      (isIP(ipv4) === 4 &&
        /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)(\.|$)/.test(ipv4)) ||
      (isIP(host) === 6 && /^(::1$|::$|f[cd]|fe[89ab])/.test(host));
    if (!["http:", "https:"].includes(url.protocol) || privateHost)
      batchUsage(
        "Media URLs must not use local/private addresses.",
        "媒体 URL 不得使用本地或私网地址。",
      );
  } else if (Array.isArray(value)) {
    for (const entry of value) validateMedia(entry, media);
  } else if (batchObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      validateMedia(
        entry,
        ["image_url", "video_url", "audio_url", "file_url", "image", "video"].includes(key) ||
          (media && key === "url"),
      );
    }
  }
}

export class BatchValidator {
  private ids = new Set<string>();
  private thinking: unknown;
  private report: BatchReport = {
    records: 0,
    bytes: 0,
    model: "",
    endpoint: "/v1/chat/completions",
    warnings: [],
  };
  private warn(message: string): void {
    if (!this.report.warnings.includes(message)) this.report.warnings.push(message);
  }
  add(value: unknown, bytes: number): void {
    const row = this.report.records + 1;
    const fail = (field: string) =>
      batchUsage(
        `Invalid or inconsistent ${field} at record ${row}.`,
        `第 ${row} 条记录的 ${field} 无效或不一致。`,
      );
    if (!batchObject(value)) fail("JSON object");
    const record = value as Record<string, unknown>;
    const id = record.custom_id;
    if (typeof id !== "string" || !id.trim() || Array.from(id).length > 256 || this.ids.has(id))
      fail("custom_id");
    if (record.method !== "POST") fail("method=POST");
    const endpoint = parseBatchEndpoint(String(record.url));
    if (!batchObject(record.body)) fail("body");
    const body = record.body as Record<string, unknown>;
    if (typeof body.model !== "string" || !body.model.trim()) fail("body.model");
    if (body.enable_thinking !== undefined && typeof body.enable_thinking !== "boolean")
      fail("enable_thinking");
    if (
      this.report.records &&
      (this.report.model !== body.model ||
        this.report.endpoint !== endpoint ||
        this.thinking !== body.enable_thinking)
    )
      fail("model/url/enable_thinking");
    if (endpoint === "/v1/embeddings") {
      const nonemptyText = (input: unknown) => typeof input === "string" && !!input.trim();
      const tokenArray = (input: unknown) =>
        Array.isArray(input) &&
        input.length > 0 &&
        input.every((token) => Number.isInteger(token) && token >= 0);
      const validInput =
        nonemptyText(body.input) ||
        tokenArray(body.input) ||
        (Array.isArray(body.input) &&
          body.input.length > 0 &&
          (body.input.every(nonemptyText) || body.input.every(tokenArray)));
      if (!validInput) fail("body.input");
    } else if (
      !Array.isArray(body.messages) ||
      !body.messages.length ||
      body.messages.some(
        (message) =>
          !batchObject(message) ||
          typeof message.role !== "string" ||
          !message.role.trim() ||
          (typeof message.content !== "string" &&
            !(
              Array.isArray(message.content) &&
              message.content.length > 0 &&
              message.content.every(batchObject)
            ) &&
            !(
              Array.isArray(message.tool_calls) &&
              message.tool_calls.length > 0 &&
              message.tool_calls.every(batchObject)
            )),
      )
    )
      fail("body.messages");
    validateMedia(body);
    if (
      batchObject(body.extra_body) &&
      ("enable_thinking" in body.extra_body || "thinking_budget" in body.extra_body)
    )
      this.warn(
        "Place enable_thinking/thinking_budget at body top level, not extra_body. / enable_thinking/thinking_budget 应放在 body 顶层，而非 extra_body。",
      );
    if (bytes > MAX_BATCH_LINE_BYTES) fail("line <=6 MiB");
    if (bytes > 1024 * 1024)
      this.warn(
        "Line exceeds 1 MiB; documentation differs (1/6 MiB), compatibility is not guaranteed. / 单行超过 1 MiB，文档存在 1/6 MiB 差异，不保证兼容。",
      );
    this.ids.add(id as string);
    this.report.records++;
    this.report.bytes += bytes;
    this.report.model = body.model as string;
    this.report.endpoint = endpoint;
    this.thinking = body.enable_thinking;
    if (this.report.records > MAX_BATCH_RECORDS || this.report.bytes > MAX_BATCH_BYTES)
      fail("50000 records / 500 MiB");
    if (
      body.model === "batch-test-model" &&
      (this.report.records > 100 || this.report.bytes > 1024 * 1024)
    )
      fail("batch-test-model: 100 records / 1 MiB");
  }
  finish(): BatchReport {
    if (!this.report.records) batchUsage("Batch input is empty.", "Batch 输入为空。");
    return this.report;
  }
}
export async function validateBatch(source: BatchSource): Promise<BatchReport> {
  const validator = new BatchValidator();
  let row = 0;
  for await (const line of batchLines(source, MAX_BATCH_BYTES)) {
    row++;
    let value: unknown;
    try {
      value = JSON.parse(line.text);
    } catch {
      batchUsage(`Invalid JSONL at line ${row}.`, `第 ${row} 行不是有效 JSONL。`);
    }
    validator.add(value, line.bytes);
  }
  return validator.finish();
}
export async function readBatchBlob(file: string): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of batchChunks(file)) {
    bytes += chunk.byteLength;
    if (bytes > MAX_BATCH_BYTES) batchUsage("File exceeds 500 MiB.", "文件超过 500 MiB。");
    chunks.push(chunk);
  }
  return new Blob(chunks);
}
