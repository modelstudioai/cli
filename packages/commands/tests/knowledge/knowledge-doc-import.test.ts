import { afterEach, expect, test, vi } from "vite-plus/test";
import { BailianError, ExitCode } from "bailian-cli-core";
import command from "../../src/commands/knowledge/doc-import.ts";
afterEach(() => vi.restoreAllMocks());
function setup(wait: boolean) {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({ data: { ingestionId: "job-test" }, future: true });
  const context = {
    flags: { workspaceId: "ws_test", indexId: "index-test", docId: ["file-test"], wait },
    settings: { quiet: true, timeout: 1, output: "json" },
    client: { requestJson },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
  } as unknown as Parameters<typeof command.run>[0];
  return { context, requestJson, output: () => writes.join("") };
}
test("import existing IDs makes only the import request and emits ingestionId", async () => {
  const run = setup(false);
  await command.run(run.context);
  expect(run.requestJson).toHaveBeenCalledTimes(1);
  expect(run.requestJson.mock.calls[0]?.[0]).toMatchObject({
    method: "POST",
    body: { indexId: "index-test", sourceType: "DATA_CENTER_FILE", docIds: ["file-test"] },
  });
  expect(run.output().trim()).toBe("job-test");
});
test("wait polls the created job without uploading or registering files", async () => {
  const run = setup(true);
  run.requestJson.mockResolvedValueOnce({
    data: {
      ingestion_status: "COMPLETED",
      total_count: 1,
      rows: [{ doc_id: "file-test", code: "FINISH" }],
    },
  });
  await command.run(run.context);
  expect(run.requestJson).toHaveBeenCalledTimes(2);
  const statusUrl = new URL(run.requestJson.mock.calls[1]?.[0].path);
  expect(statusUrl.searchParams.get("job_id")).toBe("job-test");
  expect(statusUrl.searchParams.get("index_id")).toBe("index-test");
  expect(run.output().trim()).toBe("job-test");
});
test("wait error preserves backend message and appends IDs for resuming", async () => {
  const run = setup(true);
  run.requestJson.mockRejectedValueOnce(
    new BailianError("raw status error", ExitCode.GENERAL, "original hint"),
  );
  await expect(command.run(run.context)).rejects.toMatchObject({
    message: "raw status error",
    hint: "original hint\nindexId: index-test; ingestionId: job-test",
  });
  expect(run.requestJson).toHaveBeenCalledTimes(2);
});
test("missing ingestionId is a local protocol error, not a successful import", async () => {
  const run = setup(false);
  run.requestJson.mockReset().mockResolvedValue({ data: {} });
  await expect(command.run(run.context)).rejects.toMatchObject({
    exitCode: ExitCode.GENERAL,
    message: expect.stringContaining("ingestionId"),
  });
});
