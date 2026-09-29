import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  ragEndpoint,
  RAG_PATHS,
  type RagDataCenterFile,
  type RagIndexFileDetailRow,
} from "bailian-cli-core";
import { isKbAdminE2EReady, parseStdoutJson } from "../helpers.ts";
import { KNOWLEDGE_SYNC_CONTRACT_ROUTES as routes } from "../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  pollUntil,
  type KbFixture,
} from "./journeys/journey-helpers.ts";
import { syncTags } from "../../../src/commands/knowledge/sync/tags.ts";
import { exactIndexInventory } from "./journeys/exact-index-inventory.ts";

// Dedicated opt-in: this probe creates billable resources and establishes the
// remote mapping evidence required before sync replacement/deletion is shipped.
describe.skipIf(!isKbAdminE2EReady() || process.env.BAILIAN_E2E_SYNC_CONTRACT !== "1")(
  "knowledge sync remote contract (live, self-cleaning)",
  () => {
    test("same-name versions coexist and tags uniquely link file IDs to document IDs", async () => {
      const reporter = createJourneyReporter(import.meta.url);
      const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
      const localDirectory = mkdtempSync(join(tmpdir(), "sync-contract-"));
      const fixture: Partial<KbFixture> = { fileIds: [] };
      const evidence: Record<string, unknown> = {
        verified: false,
        capturedAt: new Date().toISOString(),
      };
      const identifiers = new Map<string, string>();
      function masked(id: string, label: string): string {
        if (!identifiers.has(id)) identifiers.set(id, label);
        return identifiers.get(id)!;
      }
      async function run(name: string, args: string[]) {
        const result = await reporter.runStep(name, routes, [
          ...args,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        return parseStdoutJson<Record<string, any>>(result.stdout);
      }
      async function upload(name: string, filePath: string, tags: string[]) {
        const uncertainId = `upload:${name}`;
        reporter.trackResource("unresolved-operation", uncertainId);
        const response = await run(name, [
          "knowledge",
          "doc",
          "upload",
          "--file",
          filePath,
          ...tags.flatMap((tag) => ["--tag", tag]),
        ]);
        const fileId = response.files?.[0]?.fileId;
        expect(typeof fileId).toBe("string");
        fixture.fileIds!.push(fileId);
        reporter.trackResource("data-center-file", fileId);
        reporter.markCleaned(uncertainId);
        return fileId as string;
      }
      async function details() {
        return run("index details", [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          fixture.indexId!,
          "--details",
          "--page-size",
          "10",
        ]);
      }
      try {
        const seedPath = join(localDirectory, "sentinel.md");
        writeFileSync(
          seedPath,
          "Sync contract sentinel: this document must survive version deletion.\n",
        );
        const seedId = await upload("upload sentinel", seedPath, []);
        const kbName = `e2e-sc-${Date.now() % 100000000}`;
        reporter.trackResource("unresolved-operation", `create:${kbName}`);
        reporter.recordNote(
          `Creating dedicated knowledge base ${kbName}; inspect by this name if the creation response is lost.`,
        );
        // Do not wait during creation: persist the billable ID before polling.
        const created = await run("create dedicated base", [
          "knowledge",
          "create",
          "--name",
          kbName,
          "--description",
          "CLI sync contract probe; safe to delete",
          "--doc-id",
          seedId,
          "--yes",
        ]);
        fixture.indexId = created.data?.pipelineId;
        fixture.jobId = created.data?.ingestionId;
        expect(fixture.indexId).toBeTruthy();
        reporter.trackResource("kb", fixture.indexId!);
        reporter.markCleaned(`create:${kbName}`);
        await run("wait sentinel", [
          "knowledge",
          "doc",
          "status",
          "--index-id",
          fixture.indexId!,
          "--job-id",
          fixture.jobId!,
          "--wait",
        ]);
        const initial = await details();
        expect(initial.data?.total_count).toBe(1);
        expect(initial.data?.rows).toHaveLength(1);
        const sentinelDocId = initial.data.rows[0].doc_id as string;
        expect(typeof sentinelDocId).toBe("string");
        expect(sentinelDocId).toBeTruthy();

        const scope = {
          endpointOrigin: new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList)).origin,
          workspaceId,
          indexId: fixture.indexId!,
        };
        const syncId = randomUUID();
        const versions: Array<{
          fileId: string;
          docId: string;
          tags: string[];
          file: Record<string, unknown>;
          listedFile: Record<string, unknown>;
          job: Record<string, unknown>;
          document: Record<string, unknown>;
        }> = [];
        for (const version of ["first", "second"]) {
          const content = `Sync contract ${version} version ${randomUUID()}.\n`;
          const directory = join(localDirectory, version);
          mkdirSync(directory);
          const source = join(directory, "same.md");
          writeFileSync(source, content);
          const tags = syncTags(
            scope,
            syncId,
            "same.md",
            createHash("md5").update(content).digest("hex"),
          );
          const fileId = await upload(`upload ${version} same-name version`, source, tags);
          const file = (
            await run("describe uploaded file", ["knowledge", "file", "get", "--file-id", fileId])
          ).data as RagDataCenterFile;
          expect(file.fileId).toBe(fileId);
          expect(file.tags).toEqual(expect.arrayContaining(tags));
          expect(file.category).toBeTruthy();
          const listed = await run("list exact uploaded file", [
            "knowledge",
            "file",
            "list",
            "--category-id",
            file.category!,
            "--file-id",
            fileId,
            "--max-result",
            "100",
          ]);
          const listedMatches = listed.data?.fileList?.filter(
            (entry: RagDataCenterFile) => entry.fileId === fileId,
          );
          expect(listedMatches).toHaveLength(1);
          expect(listedMatches[0].tags).toEqual(expect.arrayContaining(tags));
          const imported = await run(`import ${version} version`, [
            "knowledge",
            "doc",
            "import",
            "--index-id",
            fixture.indexId!,
            "--doc-id",
            fileId,
            "--wait",
          ]);
          const observed = await pollUntil(
            details,
            (response) =>
              response.data?.rows?.filter((entry: RagIndexFileDetailRow) =>
                tags.every((tag) => entry.tags?.includes(tag)),
              ).length === 1,
            { timeoutMs: 120000, intervalMs: 5000 },
          );
          expect(observed.satisfied).toBe(true);
          const matching = observed.value.data.rows.filter((entry: RagIndexFileDetailRow) =>
            tags.every((tag) => entry.tags?.includes(tag)),
          );
          expect(matching).toHaveLength(1);
          const document = matching[0] as RagIndexFileDetailRow;
          expect(document.doc_id).toBeTruthy();
          const jobRows = imported.status?.data?.rows;
          const job = jobRows?.find(
            (entry: { doc_id?: string }) => entry.doc_id === document.doc_id,
          );
          expect(job?.code).toBe("FINISH");
          const label = version === "first" ? "1" : "2";
          const publicFileId = masked(fileId, `file-${label}`);
          const publicDocId = masked(document.doc_id!, `doc-${label}`);
          versions.push({
            fileId,
            docId: document.doc_id!,
            tags,
            file: {
              fileId: publicFileId,
              fileName: file.fileName,
              category: "category-fixture",
              tags: file.tags,
            },
            job: { doc_id: publicDocId, code: job.code },
            listedFile: { fileId: publicFileId, tags: listedMatches[0].tags },
            document: {
              doc_id: publicDocId,
              doc_name: document.doc_name,
              status: document.status,
              tags: document.tags,
            },
          });
        }
        expect(versions[0]!.docId).not.toBe(versions[1]!.docId);
        const beforeDelete = await details();
        expect(
          exactIndexInventory(beforeDelete, [
            sentinelDocId,
            versions[0]!.docId,
            versions[1]!.docId,
          ]),
        ).toBe(true);
        expect(
          beforeDelete.data.rows.some(
            (entry: RagIndexFileDetailRow) => entry.doc_id === versions[0]!.docId,
          ),
        ).toBe(true);
        expect(
          beforeDelete.data.rows.some(
            (entry: RagIndexFileDetailRow) => entry.doc_id === versions[1]!.docId,
          ),
        ).toBe(true);
        const pageOne = await run("details page one", [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          fixture.indexId!,
          "--details",
          "--page-size",
          "1",
          "--page-number",
          "1",
        ]);
        const pageTwo = await run("details page two", [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          fixture.indexId!,
          "--details",
          "--page-size",
          "1",
          "--page-number",
          "2",
        ]);
        expect(pageOne.data.total_count).toBe(3);
        expect(pageTwo.data.total_count).toBe(3);
        expect(pageOne.data.rows).toHaveLength(1);
        expect(pageTwo.data.rows).toHaveLength(1);
        expect(pageOne.data.rows[0].doc_id).not.toBe(pageTwo.data.rows[0].doc_id);
        const pageThree = await run("details page three", [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          fixture.indexId!,
          "--details",
          "--page-size",
          "1",
          "--page-number",
          "3",
        ]);
        expect(pageThree.data.total_count).toBe(3);
        expect(pageThree.data.rows).toHaveLength(1);
        const pagedInventory = {
          data: {
            total_count: 3,
            rows: [...pageOne.data.rows, ...pageTwo.data.rows, ...pageThree.data.rows],
          },
        };
        expect(
          exactIndexInventory(pagedInventory, [
            sentinelDocId,
            versions[0]!.docId,
            versions[1]!.docId,
          ]),
        ).toBe(true);

        await run("delete only proven old document", [
          "knowledge",
          "doc",
          "delete",
          "--index-id",
          fixture.indexId!,
          "--doc-id",
          versions[0]!.docId,
          "--yes",
        ]);
        const disappeared = await pollUntil(
          details,
          (response) => exactIndexInventory(response, [sentinelDocId, versions[1]!.docId]),
          { timeoutMs: 120000, intervalMs: 5000 },
        );
        expect(disappeared.satisfied).toBe(true);
        expect(disappeared.value.data.rows).toHaveLength(2);
        expect(
          disappeared.value.data.rows.some(
            (entry: RagIndexFileDetailRow) => entry.doc_id === versions[1]!.docId,
          ),
        ).toBe(true);
        expect(
          (
            await run("old source remains", [
              "knowledge",
              "file",
              "get",
              "--file-id",
              versions[0]!.fileId,
            ])
          ).data.fileId,
        ).toBe(versions[0]!.fileId);
        Object.assign(evidence, {
          verified: true,
          mapping: "unique-complete-tags",
          sameNameCoexistence: true,
          deletionObserved: true,
          sentinelSurvived: true,
          sentinelDocId: masked(sentinelDocId, "doc-sentinel"),
          pagination: { pageSize: 1, total: 3, uniqueDocumentCount: 3 },
          totalBeforeDelete: 3,
          totalAfterDelete: 2,
          versions: versions.map((version) => ({
            fileId: masked(version.fileId, "file"),
            docId: masked(version.docId, "doc"),
            tags: version.tags,
            file: version.file,
            listedFile: version.listedFile,
            job: version.job,
            document: version.document,
          })),
        });
      } finally {
        writeFileSync(
          join(reporter.outputDir, "sync-remote-contract.json"),
          `${JSON.stringify(evidence, null, 2)}\n`,
        );
        try {
          await cleanupKbFixture(reporter, routes, fixture, workspaceId);
        } finally {
          reporter.finalize();
          rmSync(localDirectory, { recursive: true, force: true });
        }
      }
    }, 600000);
  },
);
