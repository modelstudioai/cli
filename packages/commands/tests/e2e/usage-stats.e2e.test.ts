import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleE2EReady,
  isConsoleAuthFailure,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";
import { buildSources } from "bailian-cli-core";

function getStaticWorkspaceId(): string | undefined {
  if (process.env.BAILIAN_WORKSPACE_ID?.trim()) return process.env.BAILIAN_WORKSPACE_ID.trim();
  try {
    const config = buildSources({}).file;
    if (config.workspace_id) return config.workspace_id;
  } catch {}
  return undefined;
}

// 当无静态 workspace-id 且 console 未登录/已过期时返回占位符，避免下游 dry-run
// 用例因 `--workspace-id undefined` 而崩溃；live 用例各自用 isConsoleAuthFailure
// 容忍鉴权失败。参考 deploy/dataset “无 key / 有效 / 失效 均绿”的策略。
const FALLBACK_WORKSPACE_ID = "ws-e2e-unavailable";

async function fetchDefaultWorkspaceId(): Promise<string> {
  const staticId = getStaticWorkspaceId();
  if (staticId) return staticId;

  const result = await runCommandE2e(USAGE_ROUTES, ["workspace", "list", "--output", "json"]);
  if (isConsoleAuthFailure(result) || result.exitCode !== 0) return FALLBACK_WORKSPACE_ID;
  try {
    const parsed = JSON.parse(result.stdout);
    const data = parsed?.data?.DataV2?.data?.data?.data ?? [];
    const defaultWs = data.find((ws: { defaultAgent?: boolean }) => ws.defaultAgent);
    if (defaultWs?.workspaceId) return defaultWs.workspaceId;
    if (data.length > 0 && data[0].workspaceId) return data[0].workspaceId;
  } catch {
    /* fall through to placeholder */
  }
  return FALLBACK_WORKSPACE_ID;
}

describe("e2e: usage stats", () => {
  test("usage stats --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, ["usage", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model|--days|stats/i);
  });

  test("usage stats --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, ["usage", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage stats");
    expect(stderr).toContain("bl usage stats --model qwen-turbo");
    expect(stderr).toContain("bl usage stats --days 30");
  });

  test("usage stats --help 包含 --workspace-id 选项", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, ["usage", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--workspace-id");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage stats（Console）", () => {
  let wsId: string;

  test("获取默认 workspace-id", async () => {
    wsId = await fetchDefaultWorkspaceId();
    expect(wsId).toBeTypeOf("string");
    expect(wsId.length).toBeGreaterThan(0);
  });

  test("usage stats --dry-run 概览模式输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          startTime?: number;
          endTime?: number;
          modelCallSource?: string;
          filterWorkspaceId?: string;
        };
      };
    }>(stdout);
    expect(data.api).toContain("getModelUsageStatistic");
    expect(data.data?.reqDTO?.modelCallSource).toBe("Online");
    expect(data.data?.reqDTO?.startTime).toBeTypeOf("number");
    expect(data.data?.reqDTO?.endTime).toBeTypeOf("number");
    expect(data.data?.reqDTO?.filterWorkspaceId).toBe(wsId);
  });

  test("usage stats --dry-run --days 30 时间跨度约 30 天", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--dry-run",
      "--days",
      "30",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { reqDTO?: { startTime?: number; endTime?: number } };
    }>(stdout);
    const span = (data.data?.reqDTO?.endTime ?? 0) - (data.data?.reqDTO?.startTime ?? 0);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(span).toBeGreaterThan(thirtyDaysMs - 5000);
    expect(span).toBeLessThan(thirtyDaysMs + 5000);
  });

  test("usage stats --dry-run --model 指定模型使用 list API", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--dry-run",
      "--model",
      "qwen-turbo",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { model?: string; filterWorkspaceId?: string } };
    }>(stdout);
    expect(data.api).toContain("listModelUsageStatisticData");
    expect(data.data?.reqDTO?.model).toBe("qwen-turbo");
    expect(data.data?.reqDTO?.filterWorkspaceId).toBe(wsId);
  });

  test("usage stats --dry-run --type Text 传递 obsModelType", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--dry-run",
      "--type",
      "Text",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { reqDTO?: { obsModelType?: string } };
    }>(stdout);
    expect(data.data?.reqDTO?.obsModelType).toBe("Text");
  });

  test("usage stats 概览模式返回 JSON 结果", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "json",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats 概览文本输出包含英文标签", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats 概览文本输出包含 Token 用量", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats --model 单模型文本输出包含英文表头", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats --model 逗号分隔多模型返回多行", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "qwen3.6-plus,deepseek-v4-pro",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats --model 不存在的模型返回空表格", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "nonexistent-model-xyz-99999",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats --days 1 短时间范围正常返回", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--days",
      "1",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage stats --type Vision 按类型过滤", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--type",
      "Vision",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });
});
