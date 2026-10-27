import { execFileSync } from "node:child_process";
import { defaultSyncStatePath } from "../../../../src/commands/knowledge/state-paths.ts";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { KNOWLEDGE_SYNC_CONTRACT_ROUTES } from "../../topic-routes.ts";
import { createJourneyReporter, deleteKbWithRetry } from "./journey-helpers.ts";
const routes = { ...KNOWLEDGE_SYNC_CONTRACT_ROUTES, "knowledge doc sync": "knowledgeDocSync" };

describe.skipIf(!isKbAdminE2EReady() || process.env.BAILIAN_E2E_SYNC_WEBM !== "1")(
  "F02-03 WebM exclusion (live, self-cleaning)",
  () => {
    test("sync uploads Markdown and skips a real WebM without aborting", async () => {
      const reporter = createJourneyReporter(import.meta.url);
      const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
      const directory = join(reporter.outputDir, "docs");
      mkdirSync(directory);
      let stateFile = "";
      const mediaName = `webm-skip-${Date.now()}`;
      const media = join(directory, `${mediaName}.webm`);
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=32x32:r=1",
        "-t",
        "1",
        "-c:v",
        "libvpx",
        "-an",
        media,
      ]);
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
          `e2e-webm-${Date.now() % 100000000}`,
          "--description",
          "CLI WebM exclusion live test; safe to delete",
          "--doc-id",
          seedId,
        ]);
        const creation = parseStdoutJson<{ data: { pipelineId: string; ingestionId: string } }>(
          created.stdout,
        );
        indexId = creation.data.pipelineId;
        stateFile = defaultSyncStatePath(directory, indexId);
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
        const preview = await sync("preview mixed Markdown and WebM", ["--dry-run"]);
        const previewData = parseStdoutJson<{
          plan: { skipped: unknown[]; summary: { add: number } };
        }>(preview.stdout);
        const skippedMedia = {
          relativePath: `${mediaName}.webm`,
          reason: "unsupported",
          subtree: false,
        };
        expect(previewData.plan.skipped).toContainEqual(skippedMedia);
        expect(previewData.plan.summary.add).toBe(1);
        expect(existsSync(stateFile)).toBe(false);
        const synchronized = await sync("live sync mixed Markdown and WebM");
        const output = parseStdoutJson<{ skipped: unknown[]; summary: { add: number } }>(
          synchronized.stdout,
        );
        expect(output.skipped).toContainEqual(skippedMedia);
        expect(output.summary.add).toBe(1);
        const state = JSON.parse(readFileSync(stateFile, "utf8"));
        expect(Object.keys(state.entries)).toEqual(["guide.md"]);
        await checkDocuments(2);
        const mediaFiles = await run("verify WebM absent from data center", [
          "knowledge",
          "file",
          "list",
          "--category-id",
          state.target.categoryId,
          "--name",
          mediaName,
        ]);
        expect(
          parseStdoutJson<{ data: { fileList: unknown[] } }>(mediaFiles.stdout).data.fileList,
        ).toEqual([]);
        reporter.recordNote(
          "PASS: a real WebM was skipped; only guide.md was synchronized; remote knowledge base contains sentinel + guide; no matching WebM data-center file exists.",
        );
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
