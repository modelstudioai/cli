// J5 data-plane governance: the collection/category/file read-write loop (decoupled from the index plane).
// collection reuse-or-create (no delete API, fixed-name idempotent) → category add → visible in list
// → upload a file into the self-created category → file list/get → file delete
// → category delete → list verifies removal.
// gating: collection artifacts cannot be cleaned up — only enable explicitly for a
// full manual regression (BAILIAN_E2E_CONNECTOR=1).
import { describe, expect, test } from "vite-plus/test";
import { isConnectorE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J5_ROUTES } from "../../topic-routes.ts";
import { createJourneyReporter, uniqueMarker, writeMarkerFixture } from "./journey-helpers.ts";

describe.skipIf(!isConnectorE2EReady())("journey J5: 数据面治理 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("collection → category → file 读写 → 类目清理闭环", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    let categoryId = "";
    let categoryName = "";
    try {
      // 1) collection reuse-or-create (fixed-name idempotent — avoid accumulating undeletable collections)
      // Server rejects names longer than 20 characters ("Connector name is longer than 20")
      const collectionName = "e2e-journey-coll";
      const collectionGetRun = await reporter.runStep("collection get by name", JOURNEY_J5_ROUTES, [
        "knowledge",
        "collection",
        "get",
        "--name",
        collectionName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      let collectionId = collectionGetRun.exitCode === 0 ? collectionGetRun.stdout.trim() : "";
      if (!collectionId) {
        const collectionCreateRun = await reporter.runStep("collection create", JOURNEY_J5_ROUTES, [
          "knowledge",
          "collection",
          "create",
          "--name",
          collectionName,
          "--description",
          "journey J5 fixture collection (PLATFORM, reused across runs)",
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(collectionCreateRun.exitCode, collectionCreateRun.stderr).toBe(0);
        collectionId = collectionCreateRun.stdout.trim();
      }
      expect(collectionId).toBeTruthy();
      reporter.trackResource("collection", collectionId, { persistent: true });

      // 2) Self-created category → visible via exact-name filtering in list (hard)
      categoryName = `e2e-j5-${Date.now() % 100000000}`;
      const categoryAddRun = await reporter.runStep("category add", JOURNEY_J5_ROUTES, [
        "knowledge",
        "category",
        "add",
        "--name",
        categoryName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(categoryAddRun.exitCode, categoryAddRun.stderr).toBe(0);
      categoryId = categoryAddRun.stdout.trim();
      expect(categoryId).toMatch(/^cate_/);
      reporter.trackResource("category", categoryId);

      const categoryListRun = await reporter.runStep("category list (filter)", JOURNEY_J5_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--name",
        categoryName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(categoryListRun.exitCode, categoryListRun.stderr).toBe(0);
      expect(categoryListRun.stdout.trim().split("\n")).toContain(categoryId);

      // 3) Upload a file into the self-created category → file list/get → file delete
      // (only touch self-created artifacts)
      const marker = uniqueMarker("j5");
      const filePath = writeMarkerFixture("j5", marker);
      const uploadRun = await reporter.runStep("doc upload to category", JOURNEY_J5_ROUTES, [
        "knowledge",
        "doc",
        "upload",
        "--file",
        filePath,
        "--category-id",
        categoryId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);
      const fileId = uploadRun.stdout.trim();
      expect(fileId).toMatch(/^file_/);
      reporter.trackResource("data-center-file", fileId);

      const fileListRun = await reporter.runStep("file list", JOURNEY_J5_ROUTES, [
        "knowledge",
        "file",
        "list",
        "--category-id",
        categoryId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(fileListRun.exitCode, fileListRun.stderr).toBe(0);
      expect(fileListRun.stdout.trim().split("\n")).toContain(fileId);

      const fileGetRun = await reporter.runStep("file get", JOURNEY_J5_ROUTES, [
        "knowledge",
        "file",
        "get",
        "--file-id",
        fileId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(fileGetRun.exitCode, fileGetRun.stderr).toBe(0);
      const fileDetail = parseStdoutJson<{ data?: { category?: string } }>(fileGetRun.stdout);
      expect(fileDetail.data?.category).toBe(categoryId);

      const fileDeleteRun = await reporter.runStep("file delete", JOURNEY_J5_ROUTES, [
        "knowledge",
        "file",
        "delete",
        "--file-id",
        fileId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
      expect(fileDeleteRun.exitCode, fileDeleteRun.stderr).toBe(0);
      reporter.markCleaned(fileId);
    } finally {
      if (categoryId) {
        // 4) Clean up the self-created category + list verifies removal
        // (doubles as live coverage of category delete)
        const categoryDeleteRun = await reporter.runStep(
          "cleanup: category delete",
          JOURNEY_J5_ROUTES,
          [
            "knowledge",
            "category",
            "delete",
            "--category-id",
            categoryId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ],
        );
        if (categoryDeleteRun.exitCode === 0) {
          reporter.markCleaned(categoryId);
          const goneListRun = await reporter.runStep(
            "category list (verify gone)",
            JOURNEY_J5_ROUTES,
            [
              "knowledge",
              "category",
              "list",
              "--name",
              categoryName,
              "--workspace-id",
              workspaceId,
              "--quiet",
            ],
          );
          if (goneListRun.exitCode === 0) {
            expect(goneListRun.stdout.trim().split("\n")).not.toContain(categoryId);
          }
        }
      }
      reporter.finalize();
    }
  }, 300_000);
});
