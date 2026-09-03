import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_KB_LIST_ROUTES } from "../topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: unknown;
}

describe("e2e: knowledge kb list", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--name/i);
    expect(stderr).toMatch(/--page-number/i);
    expect(stderr).toMatch(/--page-size/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 workspace 时报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_KB_LIST_ROUTES,
      ["knowledge", "list", "--api-key", "sk-fake", "--output", "json"],
      { BAILIAN_WORKSPACE_ID: "", BAILIAN_CONFIG_DIR: "/tmp" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/workspace.*required/i);
  });

  test("--dry-run 输出 endpoint (query string 含分页/过滤参数)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--name",
      "demo",
      "--page-number",
      "2",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/ws_test\.cn-beijing\.maas\.aliyuncs\.com/);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/list/);
    expect(data.endpoint).toMatch(/page_number=2/);
    expect(data.endpoint).toMatch(/pipeline_name=demo/);
    expect(data.request).toBeNull();
  });

  test("--name 21 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--name",
      "x".repeat(21),
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page-size 101 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--page-size",
      "101",
    ]);
    expect(exitCode).toBe(2);
  });
});

interface KbListResponse {
  code: string;
  data: { rows: Array<{ id: string; name: string }> };
}

describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge kb list (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("list 返回 rows 数组", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<KbListResponse>(stdout);
    expect(data.code).toBe("Success");
    expect(Array.isArray(data.data.rows)).toBe(true);
  });

  test("--quiet 输出行数与 rows 数一致", async () => {
    const jsonRun = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    const rows = parseStdoutJson<KbListResponse>(jsonRun.stdout).data.rows;
    const quietRun = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    const lines = quietRun.stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(rows.length);
  });

  test("--name 过滤 + --page-number/--page-size 分页", async () => {
    // P6: --name
    const jsonRun = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(jsonRun.exitCode, jsonRun.stderr).toBe(0);
    const allRows = parseStdoutJson<KbListResponse>(jsonRun.stdout).data.rows;
    if (allRows.length === 0) return;

    const firstName = allRows[0]!.name;
    const nameRun = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--name",
      firstName,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(nameRun.exitCode, nameRun.stderr).toBe(0);
    const nameData = parseStdoutJson<KbListResponse>(nameRun.stdout);
    expect(nameData.data.rows.some((row) => row.name === firstName)).toBe(true);

    // P6: --page-number + --page-size
    const pagedRun = await runCommandE2e(KNOWLEDGE_KB_LIST_ROUTES, [
      "knowledge",
      "list",
      "--page-number",
      "1",
      "--page-size",
      "1",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(pagedRun.exitCode, pagedRun.stderr).toBe(0);
    const pagedData = parseStdoutJson<KbListResponse>(pagedRun.stdout);
    expect(pagedData.data.rows.length).toBeLessThanOrEqual(1);
  });
});
