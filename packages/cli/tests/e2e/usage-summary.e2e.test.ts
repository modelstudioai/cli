import { describe, expect, test } from "vite-plus/test";
import { isConsoleE2EReady, isConsoleAuthFailure, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: usage summary", () => {
  test("usage summary --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["usage", "summary", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--days|summary|usage/i);
  });

  test("usage summary --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCli(["usage", "summary", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage summary");
    expect(stderr).toContain("bl usage summary --days 30");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage summary（Console）", () => {
  test("usage summary --dry-run 输出 free-tier 计划请求", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "summary",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ freeTier?: { api?: string }; usage?: unknown }>(stdout);
    expect(data.freeTier?.api).toContain("queryFreeTierQuota");
  });

  test("usage summary --dry-run --workspace-id 附带用量概览计划请求", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "summary",
      "--dry-run",
      "--workspace-id",
      "ws-e2e-dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      usage?: { api?: string; data?: { reqDTO?: { filterWorkspaceId?: string } } };
    }>(stdout);
    expect(data.usage?.api).toContain("getModelUsageStatistic");
    expect(data.usage?.data?.reqDTO?.filterWorkspaceId).toBe("ws-e2e-dry-run");
  });

  test("usage summary 文本输出正常返回", async () => {
    const result = await runCli(["usage", "summary", "--output", "text"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage summary JSON 输出包含 freeTier 字段", async () => {
    const result = await runCli(["usage", "summary", "--output", "json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ freeTier?: unknown; period?: unknown }>(result.stdout);
    expect(data.period).toBeTypeOf("object");
    expect(Array.isArray(data.freeTier)).toBe(true);
  });
});
