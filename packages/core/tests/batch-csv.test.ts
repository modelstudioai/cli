import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { parse } from "csv-parse/sync";
import {
  prepareBatch,
  exportBatchCsv,
  batchExamples,
  batchDataNotes,
  validateBatch,
  writeBatchFile,
} from "../src/batch/index.ts";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "batch-csv-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function prepare(csv: string, overrides: Partial<Parameters<typeof prepareBatch>[0]> = {}) {
  const file = join(directory, "input.csv");
  await writeFile(file, csv);
  return prepareBatch({
    file,
    outputFile: join(directory, "input.jsonl"),
    model: "qwen-plus",
    ...overrides,
  });
}

describe("Batch CSV 公共转换", () => {
  test("保留前导零、BOM、CRLF、逗号、引号与字段内换行，完整校验输出", async () => {
    const report = await prepare(
      '\uFEFFcustom_id,content,ignored\r\n00123,"你好,\r\n世界 ""ok""",other\r\n00002,2+2?,other\r\n',
    );
    expect(report).toMatchObject({ records: 2, ignored_columns: ["ignored"] });
    const raw = await readFile(report.output_file, "utf8");
    const first = JSON.parse(raw.split("\n")[0]);
    expect(first).toMatchObject({
      custom_id: "00123",
      body: { messages: [{ role: "user", content: '你好,\r\n世界 "ok"' }] },
    });
    expect((await validateBatch(report.output_file)).records).toBe(2);
  });
  test("向量 CSV 自定义列映射并默认 float", async () => {
    const report = await prepare("id,prompt\n00123,hello", {
      endpoint: "/v1/embeddings",
      model: "text-embedding-v4",
      idColumn: "id",
      inputColumn: "prompt",
    });
    expect(JSON.parse(await readFile(report.output_file, "utf8"))).toEqual({
      custom_id: "00123",
      method: "POST",
      url: "/v1/embeddings",
      body: { model: "text-embedding-v4", input: "hello", encoding_format: "float" },
    });
  });
  test.each([
    'custom_id,content\n00123,"unfinished',
    "custom_id,content\n00123,ok,extra",
    "custom_id,custom_id,content\n1,2,ok",
    "custom_id,content\n1,ok\n1,again",
    "custom_id,content",
  ])("坏 CSV 为 USAGE 且不发布输出：%s", async (csv) => {
    await expect(prepare(csv)).rejects.toMatchObject({ exitCode: 2 });
    expect(await readdir(directory)).toEqual(["input.csv"]);
  });
  test("dry-run 扫描到末尾，限制样例且不创建输出目录", async () => {
    const report = await prepare("custom_id,content\n1,one\n2,two\n3,three", {
      dryRun: true,
      outputFile: join(directory, "absent", "out.jsonl"),
    });
    expect(report.records).toBe(3);
    expect(report.samples).toHaveLength(2);
    expect(await readdir(directory)).toEqual(["input.csv"]);
  });
  test("公共参数不能覆盖生成字段或用于向量思考参数", async () => {
    const bodyFile = join(directory, "defaults.json");
    await writeFile(bodyFile, '{"model":"another"}');
    await expect(prepare("custom_id,content\n1,ok", { bodyFile })).rejects.toMatchObject({
      exitCode: 2,
    });
    await writeFile(bodyFile, '{"enable_thinking":false}');
    await expect(
      prepare("custom_id,content\n1,ok", { bodyFile, endpoint: "/v1/embeddings" }),
    ).rejects.toMatchObject({ exitCode: 2 });
  });
  test("CSV 只展示第一项回复，公式文本防护，缺失数值留空，未知包络计数", async () => {
    const source = join(directory, "result.jsonl");
    const output = join(directory, "result.csv");
    await writeFile(
      source,
      [
        {
          custom_id: "00123",
          response: {
            status_code: 200,
            request_id: "req",
            body: {
              model: "model",
              choices: [{ message: { content: "\t=1+2" } }, { message: { content: "不展示" } }],
              usage: { total_tokens: 3 },
            },
          },
        },
        {
          custom_id: "two",
          response: { status_code: 400, body: { error: { code: "-bad", message: "+formula" } } },
        },
        { custom_id: "unknown", other: "unknown envelope" },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n"),
    );
    expect(await exportBatchCsv([source], output)).toEqual({ records: 3, unknown_records: 1 });
    const rows: Record<string, string>[] = parse(await readFile(output, "utf8"), {
      bom: true,
      columns: true,
    });
    expect(rows[0]).toMatchObject({
      custom_id: "00123",
      content: "'\t=1+2",
      total_tokens: "3",
      prompt_tokens: "",
      error_message: "",
    });
    expect(rows[1]).toMatchObject({
      status_code: "400",
      error_code: "'-bad",
      error_message: "'+formula",
    });
    expect(rows[2].content).toBe("");
  });
  test("原子拒覆盖有且只有一个并发发布者成功，force 替换及失败保留原文件", async () => {
    const output = join(directory, "result.jsonl");
    async function* bytes(text: string) {
      yield text;
    }
    const published = await Promise.allSettled([
      writeBatchFile(output, bytes("first")),
      writeBatchFile(output, bytes("second")),
    ]);
    expect(published.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(["first", "second"]).toContain(await readFile(output, "utf8"));
    expect(await readdir(directory)).toEqual(["result.jsonl"]);
    async function* failed() {
      yield "partial";
      throw new Error("source failed");
    }
    await expect(writeBatchFile(output, failed(), true)).rejects.toThrow("source failed");
    expect(["first", "second"]).toContain(await readFile(output, "utf8"));
    await writeBatchFile(output, bytes("replacement"), true);
    expect(await readFile(output, "utf8")).toBe("replacement");
    expect(await readdir(directory)).toEqual(["result.jsonl"]);
  });
  test("Help 的 CSV 结果数据与展示投影一致，空列不伪造空格", async () => {
    const example = batchExamples("en-US");
    const result = join(directory, "result.jsonl");
    const errors = join(directory, "error.jsonl");
    const csv = join(directory, "result.csv");
    await writeFile(result, JSON.stringify(example.success) + "\n");
    await writeFile(errors, JSON.stringify(example.failure) + "\n");
    await exportBatchCsv([result, errors], csv);
    const actual = parse(await readFile(csv, "utf8"), { bom: true, columns: true });
    const helpCsv = batchDataNotes("download")["en-US"].split("result.csv:\n")[1];
    expect(parse(helpCsv, { columns: true })).toEqual(actual);
  });
});
