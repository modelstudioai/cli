import { join } from "path";
import { describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EEnabled,
  isKnowledgeE2EReady,
  monorepoRoot,
  parseStdoutJson,
  runCli,
} from "./helpers.ts";

// 已开启 E2E 但 AK/SK、索引等未齐时提醒配置根目录 .env（否则本文件整组 describe 会被 skip）
if (isBailianE2EEnabled() && !isKnowledgeE2EReady()) {
  const envFile = join(monorepoRoot(), ".env");
  console.warn(
    [
      "[e2e:knowledge] 知识库检索需要 RAM 的 AK/SK、索引 ID，以及工作空间 ID；当前未就绪，本组用例将被跳过。",
      `请在 monorepo 根目录的 .env 中配置（${envFile}）：`,
      "  ALIBABA_CLOUD_ACCESS_KEY_ID",
      "  ALIBABA_CLOUD_ACCESS_KEY_SECRET",
      "  BAILIAN_E2E_INDEX_ID",
      "  BAILIAN_WORKSPACE_ID（也可执行: bl config set workspace_id <工作空间 id>）",
    ].join("\n"),
  );
}

interface KnowledgeRetrieveBody {
  Success?: boolean;
  Code?: string;
  Data?: { Nodes?: unknown[] };
}

/** 知识库检索（需 AK/SK + workspace + 索引；未就绪则整组跳过） */
describe.skipIf(!isKnowledgeE2EReady())("e2e: knowledge retrieve", () => {
  test("知识库检索", async () => {
    const indexId = process.env.BAILIAN_E2E_INDEX_ID!;
    const { stdout, stderr, exitCode } = await runCli([
      "knowledge",
      "retrieve",
      "--index-id",
      indexId,
      "--query",
      "端到端检索测试",
      "--top-k",
      "3",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<KnowledgeRetrieveBody>(stdout);
    const ok = data.Success === true || data.Code === "Success";
    expect(ok).toBe(true);
    expect(Array.isArray(data.Data?.Nodes)).toBe(true);
  }, 120_000);
});
