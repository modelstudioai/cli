// Shared journey-level infrastructure: marker-word fixtures, eventual-consistency
// polling, IndexStatusError retrying deletes, and an on-disk reporter (per-step
// stdout/stderr, soft assertions, resource inventory, human-readable report).
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  e2eLabelFromMetaUrl,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandE2e,
  type RunCliResult,
} from "../../helpers.ts";
import type { E2eRouteExports } from "../../topic-routes.ts";

// ---- Marker words and fixtures ----

/** Unique marker word: journey closure is judged by whether it can be recalled */
export function uniqueMarker(journeyId: string): string {
  return `E2E_MARKER_${journeyId.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/** Write a temporary md fixture containing the marker word; returns the file path */
export function writeMarkerFixture(journeyId: string, marker: string): string {
  const fixtureDir = mkdtempSync(join(tmpdir(), `journey-${journeyId}-`));
  const filePath = join(fixtureDir, `${journeyId}-${Date.now()}.md`);
  writeFileSync(
    filePath,
    [
      `# Journey fixture for ${journeyId}`,
      "",
      `The secret code word of this document is ${marker}.`,
      `${marker} is a fictional internal project name used only by CLI journey tests.`,
      `When asked about ${marker}, this document is the authoritative source.`,
      "",
    ].join("\n"),
  );
  return filePath;
}

// ---- Eventual-consistency polling ----

export interface PollOutcome<T> {
  value: T;
  satisfied: boolean;
  attempts: number;
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Poll until the predicate holds or the timeout is reached. Never throws —
 * returns satisfied and lets the caller decide hard vs soft assertion.
 */
export async function pollUntil<T>(
  action: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<PollOutcome<T>> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let value = await action();
  attempts += 1;
  while (!predicate(value) && Date.now() < deadline) {
    await sleep(intervalMs);
    value = await action();
    attempts += 1;
  }
  return { value, satisfied: predicate(value), attempts };
}

// ---- Delete with IndexStatusError retry (server gotcha: briefly undeletable right after import) ----

export async function deleteKbWithRetry(
  runner: (args: string[]) => Promise<RunCliResult>,
  indexId: string,
  workspaceId: string,
): Promise<RunCliResult> {
  const args = [
    "knowledge",
    "delete",
    "--index-id",
    indexId,
    "--yes",
    "--workspace-id",
    workspaceId,
  ];
  let deleteRun = await runner(args);
  for (let retry = 0; retry < 5 && deleteRun.exitCode !== 0; retry++) {
    if (!deleteRun.stderr.includes("IndexStatusError")) break; // other errors are not retried
    await sleep(10_000);
    deleteRun = await runner(args);
  }
  return deleteRun;
}

// ---- Journey reporter: artifacts for manual review ----

interface JourneyStepRecord {
  index: number;
  name: string;
  args: string[];
  exitCode: number | null;
  durationMs: number;
  stdoutFile: string;
  stderrFile: string;
}

interface SoftAssertionRecord {
  name: string;
  passed: boolean;
  detail: string;
}

interface TrackedResource {
  type: string;
  id: string;
  cleaned: boolean;
  /** Resources expected to persist (e.g. no delete API); excluded from the uncleaned warning */
  persistent: boolean;
}

export interface JourneyReporter {
  outputDir: string;
  runStep(
    name: string,
    routes: E2eRouteExports,
    args: string[],
    envOverrides?: NodeJS.ProcessEnv,
  ): Promise<RunCliResult>;
  recordSoft(name: string, passed: boolean, detail: string): void;
  recordNote(text: string): void;
  trackResource(type: string, id: string, options?: { persistent?: boolean }): void;
  markCleaned(id: string): void;
  /** Inventory of uncleaned resources (queryable before finalize, for afterAll fallbacks) */
  uncleanedResources(): TrackedResource[];
  finalize(): void;
}

function sanitizeStepName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60);
}

export function createJourneyReporter(metaUrl: string): JourneyReporter {
  const outputDir = makeE2eOutputDir(e2eLabelFromMetaUrl(metaUrl));
  const logFile = join(outputDir, "journey.log");
  const steps: JourneyStepRecord[] = [];
  const softAssertions: SoftAssertionRecord[] = [];
  const notes: string[] = [];
  const resources: TrackedResource[] = [];

  function appendLog(line: string): void {
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  }

  function flushResources(): void {
    writeFileSync(join(outputDir, "resources.json"), `${JSON.stringify(resources, null, 2)}\n`);
  }

  return {
    outputDir,

    async runStep(name, routes, args, envOverrides = {}) {
      const index = steps.length + 1;
      const prefix = `${String(index).padStart(2, "0")}-${sanitizeStepName(name)}`;
      const startedAt = Date.now();
      // Redaction convention: only CLI args are persisted (credentials travel via
      // env/config, never in args); env is not persisted
      const result = await runCommandE2e(routes, args, envOverrides);
      const durationMs = Date.now() - startedAt;
      const stdoutFile = `${prefix}.stdout.txt`;
      const stderrFile = `${prefix}.stderr.txt`;
      writeFileSync(join(outputDir, stdoutFile), result.stdout);
      writeFileSync(join(outputDir, stderrFile), result.stderr);
      steps.push({
        index,
        name,
        args,
        exitCode: result.exitCode,
        durationMs,
        stdoutFile,
        stderrFile,
      });
      appendLog(`[${prefix}] exit=${result.exitCode} ${durationMs}ms args: ${args.join(" ")}`);
      return result;
    },

    recordSoft(name, passed, detail) {
      softAssertions.push({ name, passed, detail });
      appendLog(`[soft] ${passed ? "PASS" : "MISS"} ${name}`);
    },

    recordNote(text) {
      notes.push(text);
      appendLog(`[note] ${text}`);
    },

    trackResource(type, id, options = {}) {
      resources.push({ type, id, cleaned: false, persistent: options.persistent ?? false });
      flushResources();
    },

    markCleaned(id) {
      const resource = resources.find((candidate) => candidate.id === id && !candidate.cleaned);
      if (resource) resource.cleaned = true;
      flushResources();
    },

    uncleanedResources() {
      return resources.filter((resource) => !resource.cleaned && !resource.persistent);
    },

    finalize() {
      flushResources();
      const leaked = resources.filter((resource) => !resource.cleaned && !resource.persistent);
      const lines: string[] = [
        `# Journey report`,
        "",
        `- generated: ${new Date().toISOString()}`,
        `- output dir: ${outputDir}`,
        "",
        "## Steps",
        "",
        "| # | step | exit | duration | stdout |",
        "| --- | --- | --- | --- | --- |",
        ...steps.map(
          (step) =>
            `| ${step.index} | ${step.name} | ${step.exitCode} | ${step.durationMs}ms | ${step.stdoutFile} |`,
        ),
        "",
        "## Soft assertions (manual review)",
        "",
      ];
      if (softAssertions.length === 0) {
        lines.push("(none)");
      } else {
        for (const softAssertion of softAssertions) {
          lines.push(
            `### ${softAssertion.passed ? "✅" : "⚠️"} ${softAssertion.name}`,
            "",
            "```",
            softAssertion.detail,
            "```",
            "",
          );
        }
      }
      lines.push("", "## Notes", "");
      lines.push(...(notes.length === 0 ? ["(none)"] : notes.map((note) => `- ${note}`)));
      lines.push("", "## Resources", "");
      lines.push("| type | id | cleaned |", "| --- | --- | --- |");
      lines.push(
        ...resources.map(
          (resource) =>
            `| ${resource.type} | ${resource.id} | ${resource.persistent ? "retained (persistent)" : String(resource.cleaned)} |`,
        ),
      );
      if (leaked.length > 0) {
        lines.push(
          "",
          "## ⚠️ Uncleaned resources (manual cleanup required)",
          "",
          ...leaked.map((resource) => `- ${resource.type}: ${resource.id}`),
        );
      }
      lines.push("");
      writeFileSync(join(outputDir, "journey-report.md"), lines.join("\n"));
      appendLog(
        `[finalize] steps=${steps.length} soft=${softAssertions.length} leaked=${leaked.length}`,
      );
    },
  };
}

// ---- Shared J1–J4 setup: upload marker documents + create a knowledge base ----

export interface KbFixture {
  indexId: string;
  jobId: string;
  fileIds: string[];
}

/**
 * Upload N marker documents and run `kb create --wait`. Any failure throws
 * (message includes stderr). Artifacts (data-center file / kb) are tracked via
 * trackResource; cleanup is the caller's responsibility.
 */
export async function createKbWithDocs(
  reporter: JourneyReporter,
  routes: E2eRouteExports,
  journeyId: string,
  markers: string[],
  workspaceId: string,
): Promise<KbFixture> {
  const fileIds: string[] = [];
  for (const [markerIndex, marker] of markers.entries()) {
    const filePath = writeMarkerFixture(journeyId, marker);
    const uploadRun = await reporter.runStep(`upload doc ${markerIndex + 1}`, routes, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      filePath,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    if (uploadRun.exitCode !== 0) {
      throw new Error(`doc upload failed (marker ${marker}): ${uploadRun.stderr}`);
    }
    const fileId = uploadRun.stdout.trim();
    reporter.trackResource("data-center-file", fileId);
    fileIds.push(fileId);
  }

  const kbName = `e2e-${journeyId}-${Date.now() % 100000000}`;
  const createRun = await reporter.runStep("kb create --wait", routes, [
    "knowledge",
    "create",
    "--name",
    kbName,
    ...fileIds.flatMap((fileId) => ["--doc-id", fileId]),
    "--workspace-id",
    workspaceId,
    "--wait",
    "--output",
    "json",
  ]);
  if (createRun.exitCode !== 0) {
    throw new Error(`kb create failed: ${createRun.stderr}`);
  }
  const createData = parseStdoutJson<{
    data?: { pipelineId?: string; ingestionId?: string };
    final_status?: string;
  }>(createRun.stdout);
  const indexId = createData.data?.pipelineId ?? "";
  const jobId = createData.data?.ingestionId ?? "";
  if (!indexId) throw new Error(`kb create returned no pipelineId: ${createRun.stdout}`);
  reporter.trackResource("kb", indexId);
  reporter.recordNote(
    `kb ${indexId} (${kbName}) import final_status=${createData.final_status ?? "?"}`,
  );
  return { indexId, jobId, fileIds };
}

/** Unified cleanup: kb delete (with retry) + data-center file delete. Never throws — failures surface in the report. */
export async function cleanupKbFixture(
  reporter: JourneyReporter,
  routes: E2eRouteExports,
  fixture: Partial<KbFixture>,
  workspaceId: string,
): Promise<void> {
  if (fixture.indexId) {
    const deleteRun = await deleteKbWithRetry(
      (args) => reporter.runStep("cleanup: kb delete", routes, args),
      fixture.indexId,
      workspaceId,
    );
    if (deleteRun.exitCode === 0) reporter.markCleaned(fixture.indexId);
  }
  for (const fileId of fixture.fileIds ?? []) {
    const fileDeleteRun = await reporter.runStep(`cleanup: file delete ${fileId}`, routes, [
      "knowledge",
      "file",
      "delete",
      "--file-id",
      fileId,
      "--yes",
      "--workspace-id",
      workspaceId,
    ]);
    if (fileDeleteRun.exitCode === 0) reporter.markCleaned(fileId);
  }
}

// ---- Backfill required retrieval parameters for search services (server gotcha) ----
// The minimal kb_search_configs created by service create --index-id is missing
// required fields like rerank_min_score / dense_similarity_top_k, so the search
// endpoint rejects it (InvalidParameter). The chat scene is unaffected.
// Workaround: get the beta config → backfill the fields → update --config-file.

interface AgentGetPayload {
  data?: {
    agent_details?: Array<{
      agent_config?: { kb_search_configs?: Array<Record<string, unknown>> } & Record<
        string,
        unknown
      >;
    }>;
  };
}

export async function patchSearchServiceRetrievalConfig(
  reporter: JourneyReporter,
  routes: E2eRouteExports,
  agentId: string,
  workspaceId: string,
): Promise<void> {
  const getRun = await reporter.runStep("service get (patch retrieval config)", routes, [
    "knowledge",
    "service",
    "get",
    "--agent-id",
    agentId,
    "--agent-version",
    "beta",
    "--workspace-id",
    workspaceId,
    "--output",
    "json",
  ]);
  if (getRun.exitCode !== 0) {
    throw new Error(`service get failed while patching retrieval config: ${getRun.stderr}`);
  }
  const agentConfig = parseStdoutJson<AgentGetPayload>(getRun.stdout).data?.agent_details?.[0]
    ?.agent_config;
  if (!agentConfig) throw new Error(`service get returned no agent_config: ${getRun.stdout}`);
  for (const kbConfig of agentConfig.kb_search_configs ?? []) {
    Object.assign(kbConfig, {
      rerank_min_score: 0.01,
      dense_similarity_top_k: 100,
      sparse_similarity_top_k: 50,
      enable_reranking: true,
      rerank_top_n: 5,
    });
  }
  const configDir = mkdtempSync(join(tmpdir(), "journey-svc-cfg-"));
  const configFile = join(configDir, "agent-config.json");
  writeFileSync(configFile, JSON.stringify(agentConfig));
  const updateRun = await reporter.runStep("service update (patch retrieval config)", routes, [
    "knowledge",
    "service",
    "update",
    "--agent-id",
    agentId,
    "--config-file",
    configFile,
    "--workspace-id",
    workspaceId,
  ]);
  if (updateRun.exitCode !== 0) {
    throw new Error(`service update failed while patching retrieval config: ${updateRun.stderr}`);
  }
  reporter.recordNote(
    `service ${agentId} kb_search_configs patched with required retrieval parameters`,
  );
}
