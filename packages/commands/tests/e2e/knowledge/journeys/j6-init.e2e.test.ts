import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { KNOWLEDGE_INIT_ROUTES as routes } from "../../topic-routes.ts";
import { createJourneyReporter, deleteKbWithRetry } from "./journey-helpers.ts";
import { initCreatedResources, type InitCreatedResource } from "./init-resource-records.ts";

// Explicit opt-in: creates a running-time billed KB and makes model calls.
describe.skipIf(!isKbAdminE2EReady() || process.env.BAILIAN_E2E_INIT_JOURNEY !== "1")(
  "journey J6: init retrieval and reuse (live, self-cleaning)",
  () => {
    test("init verifies sample retrieval and reuses the same IDs on a second invocation", async () => {
      const reporter = createJourneyReporter(import.meta.url);
      const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
      const name = `e2e-j6-${Date.now() % 100000000}`;
      const stateFile = join(reporter.outputDir, "init-state.json");
      const created = new Map<string, InitCreatedResource>();
      const base = [
        "knowledge",
        "init",
        "--name",
        name,
        "--state-file",
        stateFile,
        "--workspace-id",
        workspaceId,
        "--timeout",
        "180",
        "--output",
        "json",
      ];
      const capture = (stdout: string, stderr: string) => {
        for (const resource of initCreatedResources(stdout, stderr)) {
          const key = `${resource.kind}:${resource.id}`;
          if (created.has(key)) continue;
          created.set(key, resource);
          reporter.trackResource(resource.kind, resource.id);
        }
      };
      reporter.recordNote(
        `Dedicated init name ${name}; workspace ${workspaceId}; state ${stateFile}. Creation incurs running-time charges, shared free allowance is not guaranteed, and model calls cost extra.`,
      );
      try {
        const preview = await reporter.runStep("preview init", routes, [...base, "--dry-run"]);
        expect(preview.exitCode, preview.stderr).toBe(0);
        expect(existsSync(stateFile)).toBe(false);
        const first = await reporter.runStep("confirmed init", routes, [...base, "--yes"]);
        capture(first.stdout, first.stderr);
        expect(first.exitCode, first.stderr).toBe(0);
        const result = parseStdoutJson<{
          indexId: string;
          agentId: string;
          fileId: string;
          sampleMatched: boolean;
          resources: InitCreatedResource[];
        }>(first.stdout);
        expect(result.sampleMatched).toBe(true);
        expect(result.indexId).toBeTruthy();
        expect(result.agentId).toBeTruthy();
        expect(result.fileId).toBeTruthy();
        expect([...created.values()].map((resource) => resource.kind).sort()).toEqual([
          "file",
          "knowledge-base",
          "service",
        ]);
        const second = await reporter.runStep(
          "repeat init without new creation confirmation",
          routes,
          base,
        );
        capture(second.stdout, second.stderr);
        expect(second.exitCode, second.stderr).toBe(0);
        const reused = parseStdoutJson<{
          indexId: string;
          agentId: string;
          fileId: string;
          sampleMatched: boolean;
          resources: { created: boolean }[];
          cleanup: unknown[];
        }>(second.stdout);
        expect(reused).toMatchObject({
          indexId: result.indexId,
          agentId: result.agentId,
          fileId: result.fileId,
          sampleMatched: true,
          cleanup: [],
        });
        expect(reused.resources.every((resource) => resource.created === false)).toBe(true);
        reporter.recordSoft(
          "first and repeated init return the same verified resources",
          true,
          "Both runs retrieved the sample; second run reused all resources.",
        );
      } finally {
        // Unknown write outcomes must remain visible even when no resource ID was returned.
        if (existsSync(stateFile)) {
          try {
            const state = JSON.parse(readFileSync(stateFile, "utf8"));
            if (state.pending?.action) {
              reporter.trackResource("unresolved-operation", `${name}:${state.pending.action}`);
              reporter.recordNote(
                `Unresolved operation retained in ${stateFile}; inspect ownership markers before retrying or deleting unknown resources.`,
              );
            }
          } catch {
            reporter.trackResource("unreadable-checkpoint", name);
          }
        }
        try {
          const order = { service: 0, "knowledge-base": 1, file: 2 };
          let retainedKnowledgeBase = false;
          for (const resource of [...created.values()].sort(
            (left, right) => order[left.kind] - order[right.kind],
          )) {
            if (resource.kind === "file" && retainedKnowledgeBase) {
              reporter.recordNote(
                `Retained file ${resource.id}: knowledge-base deletion was not confirmed successful.`,
              );
              continue;
            }
            try {
              const deleted =
                resource.kind === "knowledge-base"
                  ? await deleteKbWithRetry(
                      (args) => reporter.runStep("cleanup knowledge base", routes, args),
                      resource.id,
                      workspaceId,
                    )
                  : await reporter.runStep(`cleanup ${resource.kind}`, routes, [
                      "knowledge",
                      resource.kind,
                      "delete",
                      resource.kind === "service" ? "--agent-id" : "--file-id",
                      resource.id,
                      "--workspace-id",
                      workspaceId,
                      "--yes",
                    ]);
              if (deleted.exitCode === 0) reporter.markCleaned(resource.id);
              else if (resource.kind === "knowledge-base") retainedKnowledgeBase = true;
            } catch (error) {
              if (resource.kind === "knowledge-base") retainedKnowledgeBase = true;
              reporter.recordNote(
                `Cleanup failed for ${resource.kind} ${resource.id}: ${error instanceof Error ? error.message : "unknown error"}`,
              );
            }
          }
        } finally {
          reporter.finalize();
        }
      }
      expect(reporter.uncleanedResources()).toEqual([]);
    }, 900_000);
  },
);
