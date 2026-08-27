// The live group chains the full lifecycle: upload → create → update → upload --index-id
// (import orchestration) → delete → list to verify removal.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { deleteKbWithRetry } from "./journeys/journey-helpers.ts";
import { KNOWLEDGE_KB_DELETE_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge kb delete", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
      "knowledge",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--yes/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
      "knowledge",
      "delete",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 body index_id (snake_case)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
      "knowledge",
      "delete",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; request?: Record<string, unknown> }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/delete/);
    expect(data.request?.index_id).toBe("idx_test");
  });

  test("无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
      "knowledge",
      "delete",
      "--index-id",
      "idx_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: {
        code: 7,
        type: "requires_confirmation",
        hint: expect.stringContaining("--yes"),
      },
    });
  });
});

describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge kb 写链路 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("upload → create → update → upload --index-id → delete → list 验证消失", async () => {
    // Mid-chain failures must not leak the base / data-center files — track created
    // resources and best-effort clean them in finally (only when the chain aborted)
    const fixtureFileIds: string[] = [];
    let indexId = "";
    let chainCompleted = false;
    try {
      // 1) Upload a file
      const fixtureDir = mkdtempSync(join(tmpdir(), "kb-chain-e2e-"));
      const filePath = join(fixtureDir, `chain-${Date.now()}.md`);
      writeFileSync(filePath, "# kb chain e2e fixture\n");
      const uploadRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "doc",
        "upload",
        "--file",
        filePath,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);
      const fileId = uploadRun.stdout.trim();
      expect(fileId).toMatch(/^file_/);
      fixtureFileIds.push(fileId);

      // 2) Create the knowledge base (--wait for the import; server gotcha: a freshly
      //    created base cannot be deleted immediately — Index.IndexStatusError)
      const kbName = `e2e-del-${Date.now() % 100000000}`;
      const createRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "create",
        "--name",
        kbName,
        "--description",
        "e2e fixture knowledge base (safe to delete)",
        "--doc-id",
        fileId,
        "--workspace-id",
        workspaceId,
        "--wait",
        "--poll-interval",
        "3",
        "--quiet",
      ]);
      expect(createRun.exitCode, createRun.stderr).toBe(0);
      indexId = createRun.stdout.trim().split("\n")[0]!;
      expect(indexId).toBeTruthy();

      // 2.5) Live update coverage: name / description / rerank threshold in one call
      const updatedName = `e2e-upd-${Date.now() % 100000000}`;
      const updateRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "update",
        "--index-id",
        indexId,
        "--name",
        updatedName,
        "--description",
        "e2e chain updated description",
        "--rerank-min-score",
        "0.3",
        "--workspace-id",
        workspaceId,
      ]);
      expect(updateRun.exitCode, updateRun.stderr).toBe(0);
      expect(updateRun.stdout).toMatch(/updated/);

      // 2.6) Verify the update actually landed on the server — not just that the
      //      command returned Success, but that a fresh read-back shows the new values
      const infoRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "info",
        "--index-id",
        indexId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(infoRun.exitCode, infoRun.stderr).toBe(0);
      const infoData = parseStdoutJson<{
        name?: string;
        description?: string;
        rerankMinScore?: number;
      }>(infoRun.stdout);
      expect(infoData.name).toBe(updatedName);
      expect(infoData.description).toBe("e2e chain updated description");
      expect(infoData.rerankMinScore).toBe(0.3);

      // 2.7) Live coverage of the upload → import orchestration (doc upload --index-id --wait):
      //      the journeys always upload bare files and import via kb create, so this is the
      //      only place the createImportJob step runs live. Using --output json (not --quiet)
      //      so we can assert final_status and ingestion_id — a regression in the job/create
      //      request body (e.g. wrong field name) is caught by the server returning HTTP 400.
      const importFilePath = join(fixtureDir, `chain-import-${Date.now()}.md`);
      writeFileSync(importFilePath, "# kb chain e2e import fixture\n");
      const importUploadRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "doc",
        "upload",
        "--file",
        importFilePath,
        "--index-id",
        indexId,
        "--wait",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(importUploadRun.exitCode, importUploadRun.stderr).toBe(0);
      const importData = parseStdoutJson<{
        files: Array<{ fileId: string }>;
        ingestion_id?: string;
        final_status?: string;
      }>(importUploadRun.stdout);
      // These assertions verify the full pipeline completed: ingestion_id proves the
      // job was created, and final_status COMPLETED proves parsing finished successfully.
      expect(importData.ingestion_id).toBeTruthy();
      expect(importData.final_status).toBe("COMPLETED");
      const importedFileId = importData.files?.[0]?.fileId;
      expect(importedFileId).toMatch(/^file_/);
      fixtureFileIds.push(importedFileId);

      // 2.8) Verify the imported file is actually visible in the KB — final_status
      //      COMPLETED only proves the job finished; an independent doc list query
      //      confirms the file was registered as a document in the index
      const docListRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "doc",
        "list",
        "--index-id",
        indexId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(docListRun.exitCode, docListRun.stderr).toBe(0);
      const docListData = parseStdoutJson<{
        data?: { rows?: Array<{ doc_name?: string; status?: string }> };
      }>(docListRun.stdout);
      // doc_name drops the file extension (e.g. "foo.md" → "foo"); match by stem
      const importedFileStem = basename(importFilePath).replace(/\.[^.]+$/, "");
      const importedDoc = docListData.data?.rows?.find((row) =>
        row.doc_name?.includes(importedFileStem),
      );
      expect(importedDoc, `expected doc list to contain file "${importedFileStem}"`).toBeTruthy();

      // 3) Delete the base (--yes non-interactive; deleteKbWithRetry retries on
      //    IndexStatusError: readiness can lag briefly even after the import completes)
      const deleteRun = await deleteKbWithRetry(
        (args) => runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, args),
        indexId,
        workspaceId,
      );
      expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);
      expect(deleteRun.stdout).toMatch(/deleted/);

      // 3.5) Clean up the data-center files (kb delete removes them from the base but
      //      the file artifacts persist in the data center)
      for (const cleanupFileId of fixtureFileIds) {
        const fileDeleteRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
          "knowledge",
          "file",
          "delete",
          "--file-id",
          cleanupFileId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(fileDeleteRun.exitCode, fileDeleteRun.stderr).toBe(0);
      }

      // 4) list verifies the base is gone
      const listRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "list",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(listRun.exitCode, listRun.stderr).toBe(0);
      const remainingIds = listRun.stdout.trim().split("\n");
      expect(remainingIds).not.toContain(indexId);
      chainCompleted = true;
    } finally {
      if (!chainCompleted) {
        // Best-effort cleanup on abort — do not assert, the original failure matters more
        if (indexId) {
          await deleteKbWithRetry(
            (args) => runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, args),
            indexId,
            workspaceId,
          );
        }
        for (const cleanupFileId of fixtureFileIds) {
          await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
            "knowledge",
            "file",
            "delete",
            "--file-id",
            cleanupFileId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
        }
      }
    }
    // Two --wait import phases in the chain — timeout sized for slow server-side parsing
  }, 600_000);
});
