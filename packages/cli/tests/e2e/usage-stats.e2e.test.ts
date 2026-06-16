import { describe, expect, test } from "vite-plus/test";
import { isBailianE2EEnabled, parseStdoutJson, runCli } from "./helpers.ts";
import { readConfigFile } from "bailian-cli-core";

function isConsoleE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (process.env.DASHSCOPE_ACCESS_TOKEN?.trim()) return true;
  try {
    const config = readConfigFile();
    return typeof config.access_token === "string" && config.access_token.length > 0;
  } catch {
    return false;
  }
}

function getStaticWorkspaceId(): string | undefined {
  if (process.env.BAILIAN_WORKSPACE_ID?.trim()) return process.env.BAILIAN_WORKSPACE_ID.trim();
  try {
    const config = readConfigFile();
    if (config.workspace_id) return config.workspace_id;
  } catch {}
  return undefined;
}

async function fetchDefaultWorkspaceId(): Promise<string> {
  const staticId = getStaticWorkspaceId();
  if (staticId) return staticId;

  const { stdout } = await runCli(["workspace", "list", "--output", "json"]);
  const result = JSON.parse(stdout);
  const data = result?.data?.DataV2?.data?.data?.data ?? [];
  const defaultWs = data.find((ws: { defaultAgent?: boolean }) => ws.defaultAgent);
  if (defaultWs?.workspaceId) return defaultWs.workspaceId;
  if (data.length > 0 && data[0].workspaceId) return data[0].workspaceId;
  throw new Error("No workspace found for e2e tests");
}

describe("e2e: usage stats", () => {
  test("usage stats --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["usage", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model|--days|stats/i);
  });

  test("usage stats --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCli(["usage", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage stats");
    expect(stderr).toContain("bl usage stats --model qwen-turbo");
    expect(stderr).toContain("bl usage stats --days 30");
  });

  test("usage stats --help 包含 --workspace-id 选项", async () => {
    const { stderr, exitCode } = await runCli(["usage", "stats", "--help"]);
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
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      period?: { start?: string; end?: string; days?: number };
      modelsCalled?: number;
      successfulCalls?: number;
      usages?: Array<{ key?: string; value?: number }>;
    }>(stdout);
    expect(data.period).toBeDefined();
    expect(data.period?.start).toBeTypeOf("string");
    expect(data.period?.end).toBeTypeOf("string");
    expect(data.period?.days).toBeTypeOf("number");
    expect(data.modelsCalled).toBeTypeOf("number");
    expect(data.successfulCalls).toBeTypeOf("number");
  });

  test("usage stats 概览文本输出包含中英文表头", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage stats 概览文本输出包含 Token 用量", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage stats --model 单模型文本输出包含双行表头", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage stats --model 逗号分隔多模型返回多行", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "qwen3.6-plus,deepseek-v4-pro",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage stats --model 不存在的模型返回空表格", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--model",
      "nonexistent-model-xyz-99999",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No usage data found");
  });

  test("usage stats --days 1 短时间范围正常返回", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--days",
      "1",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage stats --type Vision 按类型过滤", async () => {
    const { stderr, exitCode } = await runCli([
      "usage",
      "stats",
      "--workspace-id",
      wsId,
      "--type",
      "Vision",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
  });
});
