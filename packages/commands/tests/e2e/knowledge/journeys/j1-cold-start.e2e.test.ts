// J1 cold-start first answer: from zero to the first citable answer.
// upload → kb create --wait → retrieve recalls the marker → service create (search/chat, draft)
// → search --agent-version beta recalls → chat --agent-version beta first answer.
// Closure assertions: the fixture marker is recalled by retrieve/search (hard);
// the chat answer cites the marker (soft).
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J1_ROUTES } from "../../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  createKbWithDocs,
  patchSearchServiceRetrievalConfig,
  pollUntil,
  uniqueMarker,
  type KbFixture,
} from "./journey-helpers.ts";

describe.skipIf(!isKbAdminE2EReady())("journey J1: 冷启动首答 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("upload → create → retrieve → search(beta) → chat(beta) 回路闭合", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    const marker = uniqueMarker("j1");
    const fixture: Partial<KbFixture> = {};
    const serviceAgentIds: string[] = [];
    try {
      // 1) Upload + create the knowledge base (--wait for the initial import)
      const kb = await createKbWithDocs(reporter, JOURNEY_J1_ROUTES, "j1", [marker], workspaceId);
      Object.assign(fixture, kb);

      // 2) retrieve directly against the base recalls the marker (hard assertion,
      // polling to absorb index-visibility lag)
      // Gotcha: retrieve is a legacy DashScope-host command and does not accept --workspace-id
      const retrievePoll = await pollUntil(
        () =>
          reporter.runStep("retrieve marker", JOURNEY_J1_ROUTES, [
            "knowledge",
            "retrieve",
            "--index-id",
            kb.indexId,
            "--query",
            marker,
            "--output",
            "json",
          ]),
        (run) => run.exitCode === 0 && run.stdout.includes(marker),
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`retrieve 轮询 ${retrievePoll.attempts} 次`);
      expect(retrievePoll.satisfied, `retrieve 未召回标记词 ${marker}`).toBe(true);

      // 3) Create a retrieval service (initial draft/beta); search on the draft recalls (hard assertion)
      const searchServiceRun = await reporter.runStep(
        "service create (search)",
        JOURNEY_J1_ROUTES,
        [
          "knowledge",
          "service",
          "create",
          "--name",
          `e2e-j1-s-${Date.now() % 100000000}`,
          "--scene",
          "search",
          "--index-id",
          kb.indexId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ],
      );
      expect(searchServiceRun.exitCode, searchServiceRun.stderr).toBe(0);
      const searchAgentId = searchServiceRun.stdout.trim().split("\n").pop()!;
      expect(searchAgentId).toMatch(/^aid-/);
      reporter.trackResource("service", searchAgentId);
      serviceAgentIds.push(searchAgentId);

      // Server gotcha: a minimally created search service is missing required
      // retrieval parameters — backfill before calling (see journey-helpers)
      await patchSearchServiceRetrievalConfig(
        reporter,
        JOURNEY_J1_ROUTES,
        searchAgentId,
        workspaceId,
      );

      const searchPoll = await pollUntil(
        () =>
          reporter.runStep("search marker (beta)", JOURNEY_J1_ROUTES, [
            "knowledge",
            "search",
            "--query",
            marker,
            "--agent-id",
            searchAgentId,
            "--agent-version",
            "beta",
            "--workspace-id",
            workspaceId,
            "--output",
            "json",
          ]),
        (run) => run.exitCode === 0 && run.stdout.includes(marker),
        { timeoutMs: 120_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`search 轮询 ${searchPoll.attempts} 次`);
      expect(searchPoll.satisfied, `search(beta) 未召回标记词 ${marker}`).toBe(true);

      // 4) Create a chat service; first answer on the draft (non-empty answer is a
      // hard assertion; citing the marker is a soft assertion for manual review)
      const chatServiceRun = await reporter.runStep("service create (chat)", JOURNEY_J1_ROUTES, [
        "knowledge",
        "service",
        "create",
        "--name",
        `e2e-j1-c-${Date.now() % 100000000}`,
        "--scene",
        "chat",
        "--index-id",
        kb.indexId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(chatServiceRun.exitCode, chatServiceRun.stderr).toBe(0);
      const chatAgentId = chatServiceRun.stdout.trim().split("\n").pop()!;
      expect(chatAgentId).toMatch(/^aid-/);
      reporter.trackResource("service", chatAgentId);
      serviceAgentIds.push(chatAgentId);

      const chatRun = await reporter.runStep("chat first answer (beta)", JOURNEY_J1_ROUTES, [
        "knowledge",
        "chat",
        "--message",
        `What is ${marker}? Answer strictly based on the knowledge base.`,
        "--agent-id",
        chatAgentId,
        "--agent-version",
        "beta",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(chatRun.exitCode, chatRun.stderr).toBe(0);
      const chatData = parseStdoutJson<{ answer?: string }>(chatRun.stdout);
      const answerText = chatData.answer?.trim() ?? "";
      expect(answerText.length, "chat 回答为空").toBeGreaterThan(0);
      reporter.recordSoft(
        "chat 回答引用 fixture 标记词",
        answerText.includes(marker),
        answerText || "(empty)",
      );
    } finally {
      for (const agentId of serviceAgentIds) {
        const deleteRun = await reporter.runStep(
          `cleanup: service delete ${agentId}`,
          JOURNEY_J1_ROUTES,
          [
            "knowledge",
            "service",
            "delete",
            "--agent-id",
            agentId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ],
        );
        if (deleteRun.exitCode === 0) reporter.markCleaned(agentId);
      }
      await cleanupKbFixture(reporter, JOURNEY_J1_ROUTES, fixture, workspaceId);
      reporter.finalize();
    }
    // Observed create times vary widely plus three polling phases — timeout sized for the worst path
  }, 900_000);
});
