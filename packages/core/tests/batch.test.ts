import { afterEach, describe, expect, test } from "vite-plus/test";
import { validateBatch, writeBatchFile, BatchValidator } from "../src/batch/index.ts";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function request(
  customId = "one",
  body: Record<string, unknown> = {
    model: "qwen-plus",
    messages: [{ role: "user", content: "你好" }],
  },
  url = "/v1/chat/completions",
) {
  return { custom_id: customId, method: "POST", url, body };
}
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("Batch 输入校验", () => {
  test("Embedding 输入拒绝空项与混合类型，保留合法文本和 Token 数组", async () => {
    const record = (input: unknown) =>
      new Blob([
        JSON.stringify({
          custom_id: "one",
          method: "POST",
          url: "/v1/embeddings",
          body: { model: "text-embedding-v4", input },
        }),
      ]);
    for (const input of [[null], ["hello", null], ["hello", 1], [[]], [1, -1], [" "]]) {
      await expect(validateBatch(record(input))).rejects.toMatchObject({ exitCode: 2 });
    }
    for (const input of ["hello", ["hello", "world"], [1, 2], [[1, 2], [3]]]) {
      await expect(validateBatch(record(input))).resolves.toMatchObject({ records: 1 });
    }
  });
  test("Chat 拒绝空角色与无效 content/tool_calls，保留工具调用消息", async () => {
    const record = (messages: unknown) =>
      new Blob([
        JSON.stringify({
          custom_id: "one",
          method: "POST",
          url: "/v1/chat/completions",
          body: { model: "qwen-plus", messages },
        }),
      ]);
    for (const messages of [
      [{ role: "", content: "hello" }],
      [{ role: "user", content: [] }],
      [{ role: "assistant", content: null, tool_calls: null }],
    ]) {
      await expect(validateBatch(record(messages))).rejects.toMatchObject({ exitCode: 2 });
    }
    await expect(
      validateBatch(
        record([
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call-one", type: "function", function: { name: "weather", arguments: "{}" } },
            ],
          },
        ]),
      ),
    ).resolves.toMatchObject({ records: 1 });
  });
  test("拒绝 IPv4 映射 IPv6 的明显私网媒体地址", async () => {
    const input = {
      custom_id: "one",
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "qwen-vl-plus",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "http://[::ffff:127.0.0.1]/image.png" } },
            ],
          },
        ],
      },
    };
    await expect(validateBatch(new Blob([JSON.stringify(input)]))).rejects.toThrow(/private|私网/);
  });
  test("发布下载流时保留传输错误，不伪称本地文件错误", async () => {
    const directory = await mkdtemp(join(tmpdir(), "batch-stream-"));
    directories.push(directory);
    const failure = new TypeError("fetch failed");
    async function* brokenDownload() {
      yield "partial";
      throw failure;
    }
    await expect(writeBatchFile(join(directory, "result.jsonl"), brokenDownload())).rejects.toBe(
      failure,
    );
    expect(await readdir(directory)).toEqual([]);
  });
  test("逐行扫描 50000 条允许，50001 条拒绝，不抽样跳过后段", async () => {
    async function* records(count: number) {
      for (let position = 0; position < count; position++)
        yield Buffer.from(JSON.stringify(request(`req-${position}`)) + "\n");
    }
    await expect(validateBatch(records(50_000))).resolves.toMatchObject({ records: 50_000 });
    await expect(validateBatch(records(50_001))).rejects.toMatchObject({ exitCode: 2 });
  });
  test("500 MiB 计数门槛包含换行字节，超过一个字节拒绝", () => {
    const validator = new BatchValidator();
    for (let position = 0; position < 100; position++)
      validator.add(request(`req-${position}`), 5 * 1024 * 1024);
    expect(validator.finish()).toMatchObject({ bytes: 524_288_000, records: 100 });
    expect(() => validator.add(request("extra"), 1)).toThrow(/500 MiB/);
  });
  test("单行 6 MiB 字节边界与 1 MiB 告警（包括末尾 LF）", async () => {
    const record = request("one", {
      model: "qwen-plus",
      messages: [{ role: "user", content: "" }],
    });
    const overhead = Buffer.byteLength(JSON.stringify(record) + "\n");
    record.body.messages = [{ role: "user", content: "a".repeat(6 * 1024 * 1024 - overhead) }];
    const accepted = JSON.stringify(record) + "\n";
    await expect(validateBatch(new Blob([accepted]))).resolves.toMatchObject({
      bytes: 6 * 1024 * 1024,
      warnings: [expect.stringMatching(/1 MiB/)],
    });
    await expect(validateBatch(new Blob([accepted.slice(0, -1) + " \n"]))).rejects.toMatchObject({
      exitCode: 2,
    });
  });
  test("UTF-8 跨 chunk 完整解码；坏字节、空文件、内部空白行拒绝", async () => {
    const bytes = Buffer.from(JSON.stringify(request()) + "\r\n");
    async function* splitBytes() {
      for (const byte of bytes) yield new Uint8Array([byte]);
    }
    await expect(validateBatch(splitBytes())).resolves.toMatchObject({
      bytes: bytes.length,
      records: 1,
    });
    for (const source of [
      new Blob([]),
      new Blob([new Uint8Array([0xff])]),
      new Blob([JSON.stringify(request()) + "\n\n"]),
    ])
      await expect(validateBatch(source)).rejects.toMatchObject({ exitCode: 2 });
  });
  test("ID 字符门槛及全文件模型/endpoint/思考显式状态一致", async () => {
    const serialize = (record: unknown) => JSON.stringify(record) + "\n";
    await expect(
      validateBatch(new Blob([serialize(request("😀".repeat(256)))])),
    ).resolves.toMatchObject({ records: 1 });
    for (const id of ["", " ", "😀".repeat(257)])
      await expect(validateBatch(new Blob([serialize(request(id))]))).rejects.toMatchObject({
        exitCode: 2,
      });
    for (const second of [
      request("two", { model: "other", messages: [{ role: "user", content: "hello" }] }),
      request("two", { model: "qwen-plus", input: "hello" }, "/v1/embeddings"),
      request("two", {
        model: "qwen-plus",
        messages: [{ role: "user", content: "hello" }],
        enable_thinking: false,
      }),
      request("two", {
        model: "qwen-plus",
        messages: [{ role: "user", content: "hello" }],
        enable_thinking: "false",
      }),
    ])
      await expect(
        validateBatch(new Blob([serialize(request()), serialize(second)])),
      ).rejects.toMatchObject({ exitCode: 2 });
  });
  test("测试模型专限 100 条/1 MiB，Data URL 放行且 extra_body 仅告警", async () => {
    const validator = new BatchValidator();
    const testBody = { model: "batch-test-model", messages: [{ role: "user", content: "hello" }] };
    for (let position = 0; position < 100; position++)
      validator.add(request(`req-${position}`, testBody, "/v1/chat/ds-test"), 100);
    expect(validator.finish().records).toBe(100);
    expect(() => validator.add(request("extra", testBody, "/v1/chat/ds-test"), 100)).toThrow(
      /batch-test-model/,
    );
    const sizeValidator = new BatchValidator();
    sizeValidator.add(request("one", testBody, "/v1/chat/ds-test"), 1024 * 1024);
    expect(sizeValidator.finish().bytes).toBe(1_048_576);
    expect(() => sizeValidator.add(request("two", testBody, "/v1/chat/ds-test"), 1)).toThrow(
      /batch-test-model/,
    );
    const report = await validateBatch(
      new Blob([
        JSON.stringify(
          request("media", {
            model: "qwen-vl-plus",
            extra_body: { enable_thinking: false },
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
                ],
              },
            ],
          }),
        ),
      ]),
    );
    expect(report).toMatchObject({ records: 1, warnings: [expect.stringMatching(/extra_body/)] });
  });
  test("扫描完整 JSONL 并推导 endpoint/model，拒绝重复 ID", async () => {
    const record = {
      custom_id: "00123",
      method: "POST",
      url: "/v1/chat/completions",
      body: { model: "qwen-plus", messages: [{ role: "user", content: "你好" }] },
    };
    const report = await validateBatch(new Blob([JSON.stringify(record) + "\n"]));
    expect(report).toMatchObject({
      records: 1,
      model: "qwen-plus",
      endpoint: "/v1/chat/completions",
    });
    await expect(
      validateBatch(new Blob([JSON.stringify(record) + "\n" + JSON.stringify(record)])),
    ).rejects.toThrow(/custom_id/);
  });
});
