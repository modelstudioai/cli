// J4 service tuning: draft (beta) usable → config change persisted → released version carries the change after deploy.
// create + service create (search, initial draft/beta) → search --agent-version beta recalls (hard)
// → service update --description/--temperature (scalar merge path) → get (beta) asserts (hard)
// → service update --config-file tweaking kb_search_configs (whole-replace path) → get (beta) asserts
//   the nested change AND that the replace kept the scalar tuning (hard) → deploy
// → get (released version) asserts both changes landed in the published version (hard) → released search recalls (hard).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J4_ROUTES } from "../../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  createKbWithDocs,
  nodesRecallMarker,
  patchSearchServiceRetrievalConfig,
  pollUntil,
  uniqueMarker,
  type KbFixture,
} from "./journey-helpers.ts";

describe.skipIf(!isKbAdminE2EReady())("journey J4: 问答服务调优 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("draft 可用 → update 落库 → deploy → 正式版详情携带修改且可用", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    const marker = uniqueMarker("j4");
    const fixture: Partial<KbFixture> = {};
    let agentId = "";
    try {
      // 1) Create the base + a retrieval service bound to it (initial draft/beta)
      const kb = await createKbWithDocs(reporter, JOURNEY_J4_ROUTES, "j4", [marker], workspaceId);
      Object.assign(fixture, kb);

      const createServiceRun = await reporter.runStep(
        "service create (search)",
        JOURNEY_J4_ROUTES,
        [
          "knowledge",
          "service",
          "create",
          "--name",
          `e2e-j4-${Date.now() % 100000000}`,
          "--scene",
          "search",
          "--index-id",
          kb.indexId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ],
      );
      expect(createServiceRun.exitCode, createServiceRun.stderr).toBe(0);
      agentId = createServiceRun.stdout.trim().split("\n").pop()!;
      expect(agentId).toMatch(/^aid-/);
      reporter.trackResource("service", agentId);

      // Server gotcha: a minimally created search service is missing required
      // retrieval parameters — backfill before calling (see journey-helpers)
      await patchSearchServiceRetrievalConfig(reporter, JOURNEY_J4_ROUTES, agentId, workspaceId);

      // 2) Draft search recalls (hard, polling to absorb index/service propagation lag)
      const betaSearchArgs = [
        "knowledge",
        "search",
        "--query",
        marker,
        "--agent-id",
        agentId,
        "--agent-version",
        "beta",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ];
      const betaPoll = await pollUntil(
        () => reporter.runStep("search (beta)", JOURNEY_J4_ROUTES, betaSearchArgs),
        (run) => run.exitCode === 0 && nodesRecallMarker(run.stdout, marker),
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`beta search 轮询 ${betaPoll.attempts} 次`);
      expect(betaPoll.satisfied, `search(beta) 未召回标记词 ${marker}`).toBe(true);

      // 3) tune the draft: description (top-level) + temperature (config-level scalar,
      //    read-merge-write keeps the backfilled retrieval params) → get asserts both (hard)
      const newDescription = `journey j4 tuned at ${Date.now()}`;
      const tunedTemperature = 0.55;
      const updateRun = await reporter.runStep(
        "service update --description --temperature",
        JOURNEY_J4_ROUTES,
        [
          "knowledge",
          "service",
          "update",
          "--agent-id",
          agentId,
          "--description",
          newDescription,
          "--temperature",
          String(tunedTemperature),
          "--workspace-id",
          workspaceId,
        ],
      );
      expect(updateRun.exitCode, updateRun.stderr).toBe(0);

      const getRun = await reporter.runStep("service get (beta)", JOURNEY_J4_ROUTES, [
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
      expect(getRun.exitCode, getRun.stderr).toBe(0);
      const getData = parseStdoutJson<{
        data?: {
          agent_desc?: string;
          agent_details?: Array<{
            agent_config?: { temperature?: number } & Record<string, unknown>;
          }>;
        };
      }>(getRun.stdout);
      expect(getData.data?.agent_desc).toBe(newDescription);
      expect(getData.data?.agent_details?.[0]?.agent_config?.temperature).toBe(tunedTemperature);

      // 3.5) complex nested tuning via --config-file (whole-replace path, distinct
      //      from the scalar merge path above): read the current beta config, tweak
      //      kb_search_configs, write it back — then assert the nested change landed
      //      AND the replace kept the scalar tuning intact
      const tunedDenseTopK = 66; // distinctive value, still recall-safe (loose top-k)
      const betaConfig = getData.data?.agent_details?.[0]?.agent_config as
        | ({ kb_search_configs?: Array<Record<string, unknown>> } & Record<string, unknown>)
        | undefined;
      expect(betaConfig?.kb_search_configs?.length, "beta 配置应含 kb_search_configs").toBeTruthy();
      for (const kbConfig of betaConfig!.kb_search_configs!) {
        kbConfig.dense_similarity_top_k = tunedDenseTopK;
      }
      const configDir = mkdtempSync(join(tmpdir(), "j4-config-"));
      const configFile = join(configDir, "agent-config.json");
      writeFileSync(configFile, JSON.stringify(betaConfig));
      const configUpdateRun = await reporter.runStep(
        "service update --config-file (kb_search_configs)",
        JOURNEY_J4_ROUTES,
        [
          "knowledge",
          "service",
          "update",
          "--agent-id",
          agentId,
          "--config-file",
          configFile,
          "--workspace-id",
          workspaceId,
        ],
      );
      expect(configUpdateRun.exitCode, configUpdateRun.stderr).toBe(0);

      const betaAfterConfigRun = await reporter.runStep(
        "service get (beta, after config-file)",
        JOURNEY_J4_ROUTES,
        [
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
        ],
      );
      expect(betaAfterConfigRun.exitCode, betaAfterConfigRun.stderr).toBe(0);
      const betaAfterConfig = parseStdoutJson<{
        data?: {
          agent_details?: Array<{
            agent_config?: {
              temperature?: number;
              kb_search_configs?: Array<{ dense_similarity_top_k?: number }>;
            };
          }>;
        };
      }>(betaAfterConfigRun.stdout).data?.agent_details?.[0]?.agent_config;
      expect(
        betaAfterConfig?.kb_search_configs?.[0]?.dense_similarity_top_k,
        "kb_search_configs 嵌套修改未落库",
      ).toBe(tunedDenseTopK);
      expect(betaAfterConfig?.temperature, "config-file 整体替换不应冲掉已调优的 temperature").toBe(
        tunedTemperature,
      );

      // 4) deploy → the published version's detail must carry the tuned config (hard):
      //    search alone only proves the released service responds, not that the
      //    change actually shipped
      const deployRun = await reporter.runStep("service deploy", JOURNEY_J4_ROUTES, [
        "knowledge",
        "service",
        "deploy",
        "--agent-id",
        agentId,
        "--yes",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(deployRun.exitCode, deployRun.stderr).toBe(0);
      const deployedVersion = deployRun.stdout.trim().split("\n").pop() ?? "";
      expect(deployedVersion, "deploy 应输出新版本号").toBeTruthy();
      reporter.recordNote(`deploy 版本号: ${deployedVersion}`);

      const releasedGetRun = await reporter.runStep(
        `service get (released v${deployedVersion})`,
        JOURNEY_J4_ROUTES,
        [
          "knowledge",
          "service",
          "get",
          "--agent-id",
          agentId,
          "--agent-version",
          deployedVersion,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ],
      );
      expect(releasedGetRun.exitCode, releasedGetRun.stderr).toBe(0);
      const releasedData = parseStdoutJson<{
        data?: {
          agent_details?: Array<{
            agent_version?: string;
            agent_config?: {
              temperature?: number;
              kb_search_configs?: Array<{ dense_similarity_top_k?: number }>;
            };
          }>;
        };
      }>(releasedGetRun.stdout);
      const releasedDetail = releasedData.data?.agent_details?.find(
        (detail) => detail.agent_version === deployedVersion,
      );
      expect(releasedDetail, `get 应返回已发布版本 ${deployedVersion} 的详情`).toBeTruthy();
      expect(releasedDetail?.agent_config?.temperature, "调优的 temperature 未进入正式版配置").toBe(
        tunedTemperature,
      );
      expect(
        releasedDetail?.agent_config?.kb_search_configs?.[0]?.dense_similarity_top_k,
        "调优的 kb_search_configs 未进入正式版配置",
      ).toBe(tunedDenseTopK);

      // 5) released search (without --agent-version) recalls (hard)
      const releasedPoll = await pollUntil(
        () =>
          reporter.runStep("search (released)", JOURNEY_J4_ROUTES, [
            "knowledge",
            "search",
            "--query",
            marker,
            "--agent-id",
            agentId,
            "--workspace-id",
            workspaceId,
            "--output",
            "json",
          ]),
        (run) => run.exitCode === 0 && nodesRecallMarker(run.stdout, marker),
        { timeoutMs: 120_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`正式版 search 轮询 ${releasedPoll.attempts} 次`);
      expect(releasedPoll.satisfied, `发布后正式版 search 未召回 ${marker}`).toBe(true);
    } finally {
      if (agentId) {
        const deleteRun = await reporter.runStep("cleanup: service delete", JOURNEY_J4_ROUTES, [
          "knowledge",
          "service",
          "delete",
          "--agent-id",
          agentId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        if (deleteRun.exitCode === 0) reporter.markCleaned(agentId);
      }
      await cleanupKbFixture(reporter, JOURNEY_J4_ROUTES, fixture, workspaceId);
      reporter.finalize();
    }
    // Base creation plus two polling phases plus deploy — timeout sized for the worst path
  }, 900_000);
});
