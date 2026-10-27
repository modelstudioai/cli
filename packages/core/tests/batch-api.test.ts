import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import {
  createBatch,
  getBatch,
  cancelBatch,
  listBatches,
  getBatchFileContent,
  resolveBatchChatEndpoint,
  uploadDataset,
} from "../src/index.ts";

function client(baseUrl = "https://example.test", baseUrlIsDefault = false) {
  return new Client({
    identity: {
      binName: "test-cli",
      version: "0.0.0-test",
      npmPackage: "test-cli",
      clientName: "test-client",
    },
    settings: {
      output: "json",
      outputExplicit: true,
      timeout: 5,
      watermark: true,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: false,
    },
    baseUrl,
    baseUrlIsDefault,
    apiCred: { token: "offline-test-only", baseUrl, source: "flag" },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Batch 请求接缝", () => {
  test("Batch REST 路径、分页筛选和取消响应不改写", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({
        url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return Response.json({
        id: "batch-one",
        status: "cancelling",
        data: [],
        has_more: true,
        last_id: "cursor",
      });
    });
    const service = client();
    await createBatch(service, {
      input_file_id: "file-one",
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
      metadata: { ds_name: "name" },
    });
    await getBatch(service, "batch/one");
    const cancelled = await cancelBatch(service, "batch/one");
    expect(cancelled.status).toBe("cancelling");
    const page = await listBatches(service, {
      after: "cursor",
      limit: 20,
      ds_name: "测试 名称",
      input_file_ids: ["file-one", "file-two"],
      status: ["completed", "expired"],
      create_after: "20261001000000",
    });
    expect(page).toMatchObject({ has_more: true, last_id: "cursor" });
    expect(requests[0]).toMatchObject({
      url: "https://example.test/compatible-mode/v1/batches",
      method: "POST",
      body: { input_file_id: "file-one", completion_window: "24h" },
    });
    expect(requests[1].url).toBe("https://example.test/compatible-mode/v1/batches/batch%2Fone");
    expect(requests[2]).toMatchObject({
      url: "https://example.test/compatible-mode/v1/batches/batch%2Fone/cancel",
      method: "POST",
    });
    const query = new URL(requests[3].url).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      after: "cursor",
      limit: "20",
      ds_name: "测试 名称",
      input_file_ids: "file-one,file-two",
      status: "completed,expired",
      create_after: "20261001000000",
    });
  });
  test("文件下载原始字节保真且只请求兼容路径", async () => {
    const raw = new Uint8Array([0xef, 0xbb, 0xbf, 123, 125, 13, 10, 10]);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(raw));
    expect(
      new Uint8Array(await (await getBatchFileContent(client(), "file/one")).arrayBuffer()),
    ).toEqual(raw);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://example.test/compatible-mode/v1/files/file%2Fone/content",
    );
  });
  test("上传使用已校验 Blob，不重新读取路径，purpose 显式 batch", async () => {
    const blob = new Blob(['{"custom_id":"original"}\n']);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: "file-one" }));
    const uploaded = await uploadDataset(client(), {
      filePath: "/missing/input.jsonl",
      fileBlob: blob,
      purpose: "batch",
    });
    const form = fetch.mock.calls[0][1]?.body as FormData;
    expect(form.get("purpose")).toBe("batch");
    expect(await (form.get("file") as Blob).text()).toBe('{"custom_id":"original"}\n');
    expect(uploaded).toMatchObject({ file_id: "file-one", size: blob.size, purpose: "batch" });
  });
  test("共享上传 failed_uploads 透传服务消息、错码、请求 ID", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        request_id: "req-one",
        data: { failed_uploads: [{ code: "ServiceCode", message: "服务原始消息" }] },
      }),
    );
    await expect(
      uploadDataset(client(), {
        filePath: "input.jsonl",
        fileBlob: new Blob(["test"]),
        purpose: "batch",
      }),
    ).rejects.toMatchObject({
      message: "服务原始消息",
      exitCode: 1,
      api: { httpStatus: 200, apiCode: "ServiceCode", requestId: "req-one" },
    });
  });
  test("上传无 ID 不声称成功、不自动重发", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ request_id: "req-one" }));
    await expect(
      uploadDataset(client(), { filePath: "input.jsonl", fileBlob: new Blob(["test"]) }),
    ).rejects.toMatchObject({ exitCode: 1, hint: expect.stringMatching(/inspect the file list/) });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test.each([400, 404, 429, 500])("Batch HTTP %s 错误原样透传而不换端点重试", async (status) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("raw service error", { status, headers: { "x-request-id": "req-raw" } }),
      );
    await expect(getBatch(client(), "batch-one")).rejects.toMatchObject({
      message: "raw service error",
      exitCode: 1,
      api: { httpStatus: status, requestId: "req-raw" },
      rawResponse: "raw service error",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test.each([
    "https://dashscope.aliyuncs.com",
    "https://dashscope-intl.aliyuncs.com",
    "https://dashscope-us.aliyuncs.com",
    "https://token-plan.cn-beijing.maas.aliyuncs.com",
  ])("显式已知非 Batch 地址拒绝：%s", (baseUrl) => {
    expect(() => resolveBatchChatEndpoint(client(baseUrl))).toThrow(/Batch/);
  });
  test("国内默认切 Batch，显式 Batch/custom 保留", () => {
    expect(resolveBatchChatEndpoint(client("https://dashscope.aliyuncs.com", true))).toBe(
      "https://batch.dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(resolveBatchChatEndpoint(client("https://batch.dashscope.aliyuncs.com"))).toBe(
      "https://batch.dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(resolveBatchChatEndpoint(client())).toBe(
      "https://example.test/compatible-mode/v1/chat/completions",
    );
  });
  test("默认国际站不能被 Batch 默认地址遮蔽", () => {
    expect(() =>
      resolveBatchChatEndpoint(client("https://dashscope-intl.aliyuncs.com", true)),
    ).toThrow(/international|国际站/);
  });
});
