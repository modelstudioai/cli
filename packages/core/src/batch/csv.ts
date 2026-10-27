import { Readable } from "node:stream";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify/sync";
import { readFile } from "node:fs/promises";
import {
  BatchValidator,
  batchChunks,
  batchLines,
  batchObject,
  batchUsage,
  batchIoError,
  parseBatchEndpoint,
  MAX_BATCH_BYTES,
} from "./validate.ts";
import { writeBatchFile } from "./files.ts";
import type { BatchEndpoint, BatchRequest, BatchReport } from "./types.ts";

export interface PrepareBatchParams {
  file: string;
  outputFile: string;
  model: string;
  endpoint?: BatchEndpoint;
  idColumn?: string;
  inputColumn?: string;
  system?: string;
  bodyFile?: string;
  force?: boolean;
  dryRun?: boolean;
}
export async function prepareBatch(
  params: PrepareBatchParams,
): Promise<
  BatchReport & { output_file: string; ignored_columns: string[]; samples?: BatchRequest[] }
> {
  const endpoint = parseBatchEndpoint(params.endpoint ?? "/v1/chat/completions");
  if (
    resolve(params.file) === resolve(params.outputFile) ||
    (params.bodyFile && resolve(params.bodyFile) === resolve(params.outputFile))
  )
    batchUsage("Output must differ from input/body file.", "输出路径必须与输入及 body 文件不同。");
  if (!params.model.trim()) batchUsage("Model must not be empty.", "模型不能为空。");
  const idColumn = params.idColumn ?? "custom_id";
  const inputColumn = params.inputColumn ?? "content";
  let defaults: Record<string, unknown> = {};
  if (params.bodyFile) {
    let raw: string;
    try {
      raw = await readFile(params.bodyFile, "utf8");
    } catch (error) {
      throw batchIoError(error);
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (!batchObject(value)) throw new Error();
      defaults = value;
    } catch {
      batchUsage("--body-file must contain a JSON object.", "--body-file 必须包含 JSON 对象。");
    }
  }
  if (["model", "messages", "input"].some((key) => key in defaults))
    batchUsage(
      "--body-file cannot define model/messages/input.",
      "--body-file 不得定义 model/messages/input。",
    );
  if (
    endpoint === "/v1/embeddings" &&
    (params.system !== undefined || "enable_thinking" in defaults || "thinking_budget" in defaults)
  )
    batchUsage(
      "System/thinking parameters do not apply to embeddings.",
      "向量请求不适用系统提示词或思考参数。",
    );
  const validator = new BatchValidator();
  const samples: BatchRequest[] = [];
  let ignored: string[] = [];
  let report!: BatchReport;
  async function* decodedCsv() {
    const decoder = new TextDecoder("utf8", { fatal: true });
    let bytes = 0;
    for await (const chunk of batchChunks(params.file)) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BATCH_BYTES) batchUsage("CSV exceeds 500 MiB.", "CSV 超过 500 MiB。");
      try {
        yield decoder.decode(chunk, { stream: true });
      } catch {
        batchUsage("CSV must be UTF-8.", "CSV 必须是 UTF-8。");
      }
    }
    try {
      yield decoder.decode();
    } catch {
      batchUsage("CSV must be UTF-8.", "CSV 必须是 UTF-8。");
    }
  }
  async function* generated(): AsyncGenerator<string> {
    const source = Readable.from(decodedCsv());
    const parser = parse({
      bom: true,
      max_record_size: 6 * 1024 * 1024,
      columns: (headers: string[]) => {
        if (
          new Set(headers).size !== headers.length ||
          !headers.includes(idColumn) ||
          !headers.includes(inputColumn)
        )
          batchUsage(
            "CSV requires unique headers and mapped ID/input columns.",
            "CSV 表头必须唯一并包含映射的 ID/输入列。",
          );
        ignored = headers.filter((header) => header !== idColumn && header !== inputColumn);
        return headers;
      },
    });
    source.on("error", (error) => parser.destroy(error));
    source.pipe(parser);
    let position = 0;
    try {
      for await (const entry of parser) {
        position++;
        const row = entry as Record<string, string>;
        if (!row[inputColumn]?.trim())
          batchUsage(
            `Empty CSV input at record ${position}.`,
            `CSV 第 ${position} 条记录输入为空。`,
          );
        const body: BatchRequest["body"] = { ...defaults, model: params.model };
        if (endpoint === "/v1/embeddings") {
          body.input = row[inputColumn];
          body.encoding_format ??= "float";
        } else
          body.messages = [
            ...(params.system !== undefined ? [{ role: "system", content: params.system }] : []),
            { role: "user", content: row[inputColumn] },
          ];
        const request: BatchRequest = {
          custom_id: row[idColumn],
          method: "POST",
          url: endpoint,
          body,
        };
        const line = JSON.stringify(request) + "\n";
        validator.add(request, Buffer.byteLength(line));
        if (params.dryRun && samples.length < 2) samples.push(request);
        yield line;
      }
      report = validator.finish();
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "Error" &&
        "code" in error &&
        String(error.code).startsWith("CSV_")
      )
        batchUsage(
          `Invalid CSV near record ${position + 1}: ${error.message}`,
          `第 ${position + 1} 条记录附近 CSV 格式错误：${error.message}`,
        );
      throw batchIoError(error);
    } finally {
      source.destroy();
      parser.destroy();
    }
  }
  if (params.dryRun) {
    for await (const _line of generated()) {
      /* 完整读取校验，但不写文件。 */
    }
  } else await writeBatchFile(params.outputFile, generated(), params.force);
  return {
    ...report,
    output_file: resolve(params.outputFile),
    ignored_columns: ignored,
    ...(params.dryRun ? { samples } : {}),
  };
}

export const BATCH_CSV_COLUMNS = [
  "custom_id",
  "model",
  "request_id",
  "status_code",
  "content",
  "embedding",
  "error_code",
  "error_message",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
] as const;
function objectOrEmpty(value: unknown): Record<string, unknown> {
  return batchObject(value) ? value : {};
}
function textCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  // oxlint-disable-next-line no-control-regex -- 覆盖隐藏控制字符，避免绕过 CSV 公式注入防护。
  return /^[\s\x00-\x1f]*[=+@-]/.test(text) ? `'${text}` : text;
}
function numberCell(value: unknown): number | "" {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}
export function projectBatchCsv(value: unknown): {
  row: Record<string, string | number>;
  recognized: boolean;
} {
  const record = objectOrEmpty(value);
  const response = objectOrEmpty(record.response);
  const body = objectOrEmpty(response.body);
  const error = objectOrEmpty(record.error ?? body.error);
  const usage = objectOrEmpty(body.usage);
  const choice = objectOrEmpty(Array.isArray(body.choices) ? body.choices[0] : undefined);
  const message = objectOrEmpty(choice.message);
  const embeddings = Array.isArray(body.data)
    ? body.data.map((entry) => {
        const data = objectOrEmpty(entry);
        return { index: data.index, embedding: data.embedding };
      })
    : undefined;
  return {
    recognized:
      Array.isArray(body.choices) ||
      Array.isArray(body.data) ||
      "code" in error ||
      "message" in error,
    row: {
      custom_id: textCell(record.custom_id),
      model: textCell(body.model),
      request_id: textCell(response.request_id),
      status_code: numberCell(response.status_code),
      content: textCell(message.content),
      embedding: textCell(embeddings),
      error_code: textCell(error.code),
      error_message: textCell(error.message),
      prompt_tokens: numberCell(usage.prompt_tokens),
      completion_tokens: numberCell(usage.completion_tokens),
      total_tokens: numberCell(usage.total_tokens),
    },
  };
}
export async function exportBatchCsv(
  files: string[],
  outputFile: string,
  force = false,
): Promise<{ records: number; unknown_records: number }> {
  let records = 0;
  let unknown = 0;
  async function* converted() {
    yield "\uFEFF" + stringify([], { columns: [...BATCH_CSV_COLUMNS], header: true });
    for (const file of files) {
      for await (const line of batchLines(file, Infinity, Infinity)) {
        if (!line.text.trim()) continue;
        let value: unknown;
        try {
          value = JSON.parse(line.text);
        } catch {
          batchUsage(
            `Invalid result JSONL at ${file}:${records + 1}.`,
            `结果 JSONL 格式错误：${file}:${records + 1}。`,
          );
        }
        const projection = projectBatchCsv(value);
        records++;
        if (!projection.recognized) unknown++;
        yield stringify([projection.row], { columns: [...BATCH_CSV_COLUMNS] });
      }
    }
  }
  await writeBatchFile(outputFile, converted(), force);
  return { records, unknown_records: unknown };
}
