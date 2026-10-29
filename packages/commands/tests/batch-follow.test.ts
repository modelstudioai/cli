import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { getEventListeners } from "node:events";
import { Client, BailianError, ExitCode, httpTransport } from "bailian-cli-core";
import { followBatch } from "../src/commands/batch/shared.ts";

function client() {
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
    baseUrl: "https://example.test",
    apiCred: { token: "offline-test-only", baseUrl: "https://example.test", source: "flag" },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Batch 轮询预算", () => {
  test("finalizing/cancelling/未知状态继续查询，请求开始遵守间隔", async () => {
    const statuses = ["finalizing", "cancelling", "future-state", "completed"];
    const starts: number[] = [];
    vi.spyOn(httpTransport, "fetch").mockImplementation(async () => {
      starts.push(Date.now());
      return Response.json({ id: "batch-one", status: statuses.shift() });
    });
    const progress: string[] = [];
    const job = await followBatch(client(), "batch-one", {
      interval: 0.03,
      pollTimeout: 1,
      progress: (current) => progress.push(current.status),
    });
    expect(job.status).toBe("completed");
    expect(progress).toEqual(["finalizing", "cancelling", "future-state", "completed"]);
    for (let position = 1; position < starts.length; position++)
      expect(starts[position] - starts[position - 1]).toBeGreaterThanOrEqual(30);
  });
  test("deadline 中断在途 HTTP，原样保留 TIMEOUT 并释放父监听", async () => {
    const parent = new AbortController();
    const fetch = vi.spyOn(httpTransport, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    await expect(
      followBatch(client(), "batch-one", {
        interval: 65,
        pollTimeout: 0.04,
        signal: parent.signal,
      }),
    ).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
  });
  test("deadline 覆盖重试退避，不另开请求预算", async () => {
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => new Response("limited", { status: 429 }));
    await expect(
      followBatch(client(), "batch-one", { interval: 0, pollTimeout: 0.04 }),
    ).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("永久 HTTP 错误不重试", async () => {
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => new Response("access denied", { status: 403 }));
    await expect(followBatch(client(), "batch-one", { interval: 0 })).rejects.toMatchObject({
      message: "access denied",
      exitCode: ExitCode.GENERAL,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("可重试错误最多三次重试，耗尽后仍透传服务错误", async () => {
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => new Response("service unavailable", { status: 503 }));
    await expect(followBatch(client(), "batch-one", { interval: 0 })).rejects.toMatchObject({
      message: "service unavailable",
      api: { httpStatus: 503 },
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  }, 15_000);
  test("未设置总超时可在 sleep 期间取消本地等待，不调用 cancel", async () => {
    const parent = new AbortController();
    const reason = new BailianError("interrupted", ExitCode.INTERRUPTED);
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => Response.json({ id: "batch-one", status: "in_progress" }));
    const pending = followBatch(client(), "batch-one", {
      interval: 65,
      signal: parent.signal,
      progress: () => setTimeout(() => parent.abort(reason), 10),
    });
    await expect(pending).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://example.test/compatible-mode/v1/batches/batch-one",
    );
    expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
  });
  test("超大 interval 不因 Node timer 溢出而快速重查", async () => {
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => Response.json({ id: "batch-one", status: "finalizing" }));
    await expect(
      followBatch(client(), "batch-one", { interval: 3_000_000, pollTimeout: 0.04 }),
    ).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
