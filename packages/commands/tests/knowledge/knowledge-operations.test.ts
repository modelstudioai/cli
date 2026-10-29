import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import { uploadKnowledgeFile } from "../../src/commands/knowledge/operations/upload.ts";
import * as transfer from "../../src/commands/knowledge/upload-stream.ts";

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "rag-operations-"));
  directories.push(directory);
  const filePath = join(directory, "sample.md");
  writeFileSync(filePath, "sample content");
  const calls: string[] = [];
  const requestJson = vi.fn().mockImplementation(async (request) => {
    if (request.body.leaseId) {
      calls.push("addFile");
      return { data: { fileId: "file-1" } };
    }
    calls.push("lease");
    return { data: { leaseId: "lease-1", param: { url: "https://example.com/upload" } } };
  });
  vi.spyOn(transfer, "putFileStream").mockImplementation(async () => {
    calls.push("PUT");
    return new Response("", { status: 200 });
  });
  return {
    calls,
    requestJson,
    options: {
      client: { requestJson } as unknown as Client,
      workspaceId: "ws-test",
      filePath,
      sizeBytes: statSync(filePath).size,
      categoryId: "default",
      timeout: 1,
      localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
    },
  };
}

test("upload checkpoints lease and file IDs before the next operation", async () => {
  const { options, calls, requestJson } = fixture();
  const checkpoint = vi.fn(async (record) => {
    calls.push(record.fileId ? "file-checkpoint" : "lease-checkpoint");
  });
  expect(await uploadKnowledgeFile({ ...options, checkpoint })).toEqual({
    fileId: "file-1",
    leaseId: "lease-1",
    categoryId: "default",
  });
  expect(calls).toEqual(["lease", "lease-checkpoint", "PUT", "addFile", "file-checkpoint"]);
  expect(requestJson.mock.calls[0]![0].body).toMatchObject({
    sizeBytes: "14",
    category: "default",
    fileName: "sample.md",
  });
  expect(checkpoint.mock.calls.map(([record]) => record)).toEqual([
    { leaseId: "lease-1", categoryId: "default" },
    { leaseId: "lease-1", fileId: "file-1", categoryId: "default" },
  ]);
});

test("failed lease checkpoint prevents PUT and registration", async () => {
  const { options, calls } = fixture();
  const failure = new Error("disk full");
  await expect(
    uploadKnowledgeFile({
      ...options,
      checkpoint: async () => {
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(calls).toEqual(["lease"]);
});

test("failed file checkpoint is propagated without retrying remote registration", async () => {
  const { options, calls } = fixture();
  const failure = new Error("disk full after registration");
  await expect(
    uploadKnowledgeFile({
      ...options,
      checkpoint: async (record) => {
        if (record.fileId) throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(calls).toEqual(["lease", "PUT", "addFile"]);
});

test("changed source is not registered", async () => {
  const { options, requestJson } = fixture();
  vi.mocked(transfer.putFileStream).mockImplementation(async () => {
    writeFileSync(options.filePath, "changed");
    return new Response("", { status: 200 });
  });
  await expect(uploadKnowledgeFile(options)).rejects.toThrow(/changed during upload/);
  expect(requestJson).toHaveBeenCalledTimes(1);
});

test("a lease ID is checkpointed even when its upload URL is missing", async () => {
  const { options, requestJson } = fixture();
  requestJson.mockResolvedValue({ data: { leaseId: "lease-incomplete" } });
  const checkpoint = vi.fn(async () => {});
  await expect(uploadKnowledgeFile({ ...options, checkpoint })).rejects.toThrow(/leaseId\/url/);
  expect(checkpoint).toHaveBeenCalledWith({ leaseId: "lease-incomplete", categoryId: "default" });
  expect(transfer.putFileStream).not.toHaveBeenCalled();
});
