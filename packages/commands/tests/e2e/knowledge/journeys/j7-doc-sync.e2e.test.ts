import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { KNOWLEDGE_SYNC_CONTRACT_ROUTES } from "../../topic-routes.ts";
import { createJourneyReporter, deleteKbWithRetry } from "./journey-helpers.ts";
const routes = { ...KNOWLEDGE_SYNC_CONTRACT_ROUTES, "knowledge doc sync": "knowledgeDocSync" };

describe.skipIf(!isKbAdminE2EReady() || process.env.BAILIAN_E2E_SYNC_JOURNEY !== "1")(
  "journey J7: directory sync (live, self-cleaning)",
  () => {
    test("add, unchanged, replace, retain, delete preserve an unmanaged sentinel", async () => {
      const reporter = createJourneyReporter(import.meta.url);
      const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
      const directory = join(reporter.outputDir, "docs");
      mkdirSync(directory);
      const stateFile = join(directory, ".bailian", "sync-state.json");
      const source = join(directory, "guide.md");
      const seed = join(reporter.outputDir, "sentinel.md");
      writeFileSync(seed, "Unmanaged sentinel must survive every sync operation.\n");
      const fileIds = new Set<string>();
      let indexId: string | undefined;
      async function run(name: string, args: string[], expected = 0) {
        const result = await reporter.runStep(name, routes, [
          ...args,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
          "--timeout",
          "180",
        ]);
        expect(result.exitCode, result.stderr).toBe(expected);
        return result;
      }
      function capture() {
        if (!existsSync(stateFile)) return;
        const state = JSON.parse(readFileSync(stateFile, "utf8"));
        for (const entry of [...Object.values(state.entries), ...state.pending] as {
          fileId?: string;
        }[]) {
          if (entry.fileId && !fileIds.has(entry.fileId)) {
            fileIds.add(entry.fileId);
            reporter.trackResource("data-center-file", entry.fileId);
          }
        }
      }
      async function sync(name: string, flags: string[] = [], expected = 0) {
        try {
          return await run(
            name,
            [
              "knowledge",
              "doc",
              "sync",
              "--dir",
              directory,
              "--index-id",
              indexId!,
              "--poll-interval",
              "1",
              ...flags,
            ],
            expected,
          );
        } finally {
          capture();
        }
      }
      let sentinelDocId = "";
      async function checkDocuments(count: number) {
        const result = await run("verify sentinel and document count", [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          indexId!,
          "--details",
        ]);
        const response = parseStdoutJson<{
          data: { total_count: number; rows: { doc_id: string }[] };
        }>(result.stdout);
        expect(response.data.total_count).toBe(count);
        if (!sentinelDocId) sentinelDocId = response.data.rows[0].doc_id;
        expect(response.data.rows.some((document) => document.doc_id === sentinelDocId)).toBe(true);
      }
      try {
        const uploaded = await run("upload sentinel", [
          "knowledge",
          "doc",
          "upload",
          "--file",
          seed,
        ]);
        const seedId = parseStdoutJson<{ files: { fileId: string }[] }>(uploaded.stdout).files[0]
          .fileId;
        fileIds.add(seedId);
        reporter.trackResource("data-center-file", seedId);
        const created = await run("create dedicated sync base", [
          "knowledge",
          "create",
          "--name",
          `e2e-j7-${Date.now() % 100000000}`,
          "--description",
          "CLI J7 directory sync verification; safe to delete",
          "--doc-id",
          seedId,
          "--yes",
        ]);
        const creation = parseStdoutJson<{ data: { pipelineId: string; ingestionId: string } }>(
          created.stdout,
        );
        indexId = creation.data.pipelineId;
        reporter.trackResource("kb", indexId);
        await run("wait sentinel", [
          "knowledge",
          "doc",
          "status",
          "--index-id",
          indexId,
          "--job-id",
          creation.data.ingestionId,
          "--wait",
        ]);
        await checkDocuments(1);
        writeFileSync(source, "First version: directory sync integration test.\n");
        await sync("preview first addition", ["--dry-run"]);
        expect(existsSync(stateFile)).toBe(false);
        await sync("first addition");
        await checkDocuments(2);
        const firstState = readFileSync(stateFile, "utf8");
        await sync("unchanged repeat");
        expect(readFileSync(stateFile, "utf8")).toBe(firstState);
        await checkDocuments(2);
        writeFileSync(source, "Second version: updated directory sync integration test.\n");
        await sync("replacement needs confirmation", [], 7);
        expect(readFileSync(stateFile, "utf8")).toBe(firstState);
        await sync("confirmed replacement", ["--yes"]);
        await checkDocuments(2);
        writeFileSync(source, "First version: directory sync integration test.\n");
        await sync("restore earlier identical content", ["--yes"]);
        await checkDocuments(2);
        const savedSyncId = JSON.parse(readFileSync(stateFile, "utf8")).syncId as string;
        rmSync(stateFile);
        await sync("preview lost checkpoint restoration", ["--sync-id", savedSyncId, "--dry-run"]);
        expect(existsSync(stateFile)).toBe(false);
        await sync("restoration requires confirmation", ["--sync-id", savedSyncId], 7);
        expect(existsSync(stateFile)).toBe(false);
        await sync("restore lost checkpoint with verified upload", [
          "--sync-id",
          savedSyncId,
          "--yes",
        ]);
        await checkDocuments(2);
        await sync("unchanged after restoration");
        await checkDocuments(2);
        rmSync(source);
        await sync("retain removed local file");
        await checkDocuments(2);
        await sync("preview explicit deletion", ["--delete", "--dry-run"]);
        await checkDocuments(2);
        await sync("confirmed deletion", ["--delete", "--yes"]);
        await checkDocuments(1);
        expect(JSON.parse(readFileSync(stateFile, "utf8")).entries).toEqual({});
      } finally {
        capture();
        let deletedBase = !indexId;
        if (indexId) {
          const result = await deleteKbWithRetry(
            (args) => reporter.runStep("cleanup knowledge base", routes, args),
            indexId,
            workspaceId,
          );
          deletedBase = result.exitCode === 0;
          if (deletedBase) reporter.markCleaned(indexId);
        }
        if (deletedBase)
          for (const fileId of fileIds) {
            const result = await reporter.runStep("cleanup source file", routes, [
              "knowledge",
              "file",
              "delete",
              "--file-id",
              fileId,
              "--workspace-id",
              workspaceId,
              "--yes",
            ]);
            if (result.exitCode === 0) reporter.markCleaned(fileId);
          }
        reporter.finalize();
      }
    }, 900000);
  },
);
