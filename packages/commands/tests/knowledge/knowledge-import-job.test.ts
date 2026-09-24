import { afterEach, expect, test, vi } from "vite-plus/test";
import { BailianError, ExitCode, type Client, type Settings } from "bailian-cli-core";
import {
  pollImportJob,
  failedImportDocs,
  withPartialSuccessHint,
} from "../../src/commands/knowledge/shared.ts";

afterEach(() => vi.useRealTimers());
const settings = { quiet: true, timeout: 1 } as Settings;
const statusUrl =
  "https://example.com/status?index_id=index-test&job_id=job-test&page_number=2&page_size=1";

test("COMPLETED first page cannot conceal second-page document failures", async () => {
  const requestJson = vi.fn(async ({ path }: { path: string }) => {
    const pageNumber = new URL(path).searchParams.get("page_number");
    return {
      data: {
        ingestion_status: "COMPLETED",
        total_count: 2,
        rows: [
          pageNumber === "2"
            ? { doc_id: "second", code: "PARSE_FAILED", message: "raw backend failure" }
            : { doc_id: "first", code: "FINISH" },
        ],
      },
    };
  });
  const response = await pollImportJob({ requestJson } as unknown as Client, settings, {
    statusUrl,
    intervalSec: 0.01,
  });
  expect(requestJson).toHaveBeenCalledTimes(2);
  expect(new URL(requestJson.mock.calls[0]![0].path).searchParams.get("page_number")).toBe("1");
  expect(response.data?.rows).toHaveLength(2);
  expect(failedImportDocs(response)[0]?.message).toBe("raw backend failure");
});

test("duplicate pages never satisfy total_count even with top-level COMPLETED", async () => {
  vi.useFakeTimers();
  const requestJson = vi.fn(async () => ({
    data: {
      ingestion_status: "COMPLETED",
      total_count: 2,
      rows: [{ doc_id: "same", code: "FINISH" }],
    },
  }));
  const pending = pollImportJob({ requestJson } as unknown as Client, settings, {
    statusUrl,
    intervalSec: 0.1,
  });
  const assertion = expect(pending).rejects.toMatchObject({ exitCode: 5 });
  await vi.advanceTimersByTimeAsync(1100);
  await assertion;
});

test("RUNNING finishes when all pages contain terminal documents", async () => {
  const requestJson = vi.fn(async ({ path }: { path: string }) => ({
    data: {
      ingestion_status: "RUNNING",
      total_count: 2,
      rows: [{ doc_id: new URL(path).searchParams.get("page_number"), code: "FINISH" }],
    },
  }));
  const response = await pollImportJob({ requestJson } as unknown as Client, settings, {
    statusUrl,
    intervalSec: 0.01,
  });
  expect(response.data?.rows).toHaveLength(2);
});

test("backend failures remain the same error object", async () => {
  const failure = new Error("raw backend failure");
  const requestJson = vi.fn().mockRejectedValue(failure);
  await expect(
    pollImportJob({ requestJson } as unknown as Client, settings, { statusUrl, intervalSec: 0.01 }),
  ).rejects.toBe(failure);
});

test("changing page totals cannot prove a complete snapshot", async () => {
  vi.useFakeTimers();
  const requestJson = vi.fn(async ({ path }: { path: string }) => {
    const pageNumber = new URL(path).searchParams.get("page_number");
    return {
      data: {
        ingestion_status: "COMPLETED",
        total_count: pageNumber === "1" ? 2 : 3,
        rows: [{ doc_id: `doc-${pageNumber}`, code: "FINISH" }],
      },
    };
  });
  const pending = pollImportJob({ requestJson } as unknown as Client, settings, {
    statusUrl,
    intervalSec: 0.1,
  });
  const assertion = expect(pending).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
  await vi.advanceTimersByTimeAsync(1100);
  await assertion;
});

test("partial-success context survives an existing timeout hint", () => {
  const original = new BailianError("Polling timed out.", ExitCode.TIMEOUT, "Increase timeout.");
  const enriched = withPartialSuccessHint(original, "indexId: index-test; ingestionId: job-test");
  expect(enriched).toMatchObject({
    message: original.message,
    exitCode: ExitCode.TIMEOUT,
    hint: "Increase timeout.\nindexId: index-test; ingestionId: job-test",
  });
});
