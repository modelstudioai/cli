import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vite-plus/test";
import { BailianError, ExitCode } from "bailian-cli-core";
import upload from "../../src/commands/knowledge/doc-upload.ts";
import * as transfer from "../../src/commands/knowledge/upload-stream.ts";

const directory = mkdtempSync(join(tmpdir(), "rag-upload-command-"));
const source = join(directory, "sample.mp4");
writeFileSync(source, "tiny offline fixture");
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());
function context(
  requestJson: ReturnType<typeof vi.fn>,
  wait = false,
): Parameters<typeof upload.run>[0] {
  return {
    flags: { file: [source], workspaceId: "ws_test", indexId: "index-test", wait },
    settings: { output: "json", quiet: true, timeout: 1 },
    client: { requestJson },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
  } as unknown as Parameters<typeof upload.run>[0];
}
function preparedClient() {
  vi.spyOn(transfer, "putFileStream").mockResolvedValue(new Response("", { status: 200 }));
  return vi
    .fn()
    .mockResolvedValueOnce({
      data: { leaseId: "lease-test", param: { url: "https://example.com/upload" } },
    })
    .mockResolvedValueOnce({ data: { fileId: "file-test" } });
}
test("PUT failure prevents file registration and import", async () => {
  const requestJson = preparedClient();
  vi.mocked(transfer.putFileStream).mockRejectedValue(new Error("connection lost"));
  await expect(upload.run(context(requestJson))).rejects.toMatchObject({
    exitCode: ExitCode.NETWORK,
  });
  expect(requestJson).toHaveBeenCalledTimes(1);
});
test("registration failure prevents import and preserves backend error", async () => {
  const backend = new BailianError("raw addFile failure", ExitCode.GENERAL);
  const requestJson = preparedClient();
  requestJson
    .mockReset()
    .mockResolvedValueOnce({
      data: { leaseId: "lease-test", param: { url: "https://example.com/upload" } },
    })
    .mockRejectedValueOnce(backend);
  await expect(upload.run(context(requestJson))).rejects.toBe(backend);
  expect(requestJson).toHaveBeenCalledTimes(2);
});
test("job creation failure retains the already registered file ID", async () => {
  const requestJson = preparedClient().mockRejectedValueOnce(
    new BailianError("raw job failure", ExitCode.GENERAL),
  );
  await expect(upload.run(context(requestJson))).rejects.toMatchObject({
    message: "raw job failure",
    hint: expect.stringContaining("file-test"),
  });
  expect(requestJson).toHaveBeenCalledTimes(3);
});
test("wait failure retains both file and job IDs without resubmission", async () => {
  const requestJson = preparedClient()
    .mockResolvedValueOnce({ data: { ingestionId: "job-test" } })
    .mockRejectedValueOnce(
      new BailianError("Polling timed out.", ExitCode.TIMEOUT, "Original hint."),
    );
  await expect(upload.run(context(requestJson, true))).rejects.toMatchObject({
    exitCode: ExitCode.TIMEOUT,
    hint: expect.stringMatching(/Original hint\.[\s\S]*file-test[\s\S]*job-test/),
  });
  expect(requestJson).toHaveBeenCalledTimes(4);
});

test("local file read failure during PUT is not classified as network failure", async () => {
  const requestJson = preparedClient();
  vi.mocked(transfer.putFileStream).mockRejectedValue(
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("file removed"), { code: "ENOENT" }),
    }),
  );
  await expect(upload.run(context(requestJson))).rejects.toMatchObject({
    exitCode: ExitCode.GENERAL,
    hint: expect.stringContaining("ENOENT"),
  });
  expect(requestJson).toHaveBeenCalledTimes(1);
});

test("source mutation stops registration after PUT", async () => {
  const requestJson = preparedClient();
  vi.mocked(transfer.putFileStream).mockImplementation(async () => {
    writeFileSync(source, "changed source bytes");
    return new Response("", { status: 200 });
  });
  await expect(upload.run(context(requestJson))).rejects.toMatchObject({
    exitCode: ExitCode.GENERAL,
    message: expect.stringContaining("changed during upload"),
  });
  expect(requestJson).toHaveBeenCalledTimes(1);
});

test.each([49, 50, 51])("media count %s is validated offline before any request", async (count) => {
  const paths = Array.from({ length: count }, (_, index) => {
    const path = join(directory, `count-${index}.mp4`);
    writeFileSync(path, "tiny placeholder");
    return path;
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const requestJson = vi.fn();
  const commandContext = context(requestJson);
  commandContext.flags.file = paths;
  commandContext.settings.dryRun = true;
  if (count > 50)
    await expect(upload.run(commandContext)).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
  else await expect(upload.run(commandContext)).resolves.toBeUndefined();
  expect(requestJson).not.toHaveBeenCalled();
});

test("a later file changed since preflight is rejected before its upload lease", async () => {
  const laterSource = join(directory, "later.mp4");
  writeFileSync(laterSource, "original");
  const requestJson = preparedClient()
    .mockResolvedValueOnce({
      data: { leaseId: "second-lease", param: { url: "https://example.com/upload" } },
    })
    .mockResolvedValueOnce({ data: { fileId: "second-file" } });
  let transferred = 0;
  vi.mocked(transfer.putFileStream).mockImplementation(async () => {
    if (++transferred === 1) writeFileSync(laterSource, "changed after preflight");
    return new Response("", { status: 200 });
  });
  const commandContext = context(requestJson);
  commandContext.flags.file = [source, laterSource];
  delete commandContext.flags.indexId;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await expect(upload.run(commandContext)).rejects.toMatchObject({ exitCode: ExitCode.GENERAL });
  expect(requestJson).toHaveBeenCalledTimes(2);
});
