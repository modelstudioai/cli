import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { SECURITY_ROUTES } from "./topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  method?: string;
}

describe("e2e: security overview", () => {
  test("--help 展示 --workspace-id", async () => {
    const { stderr, exitCode } = await runCommandHelp(SECURITY_ROUTES, [
      "security",
      "overview",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 workspace 时报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      SECURITY_ROUTES,
      ["security", "overview", "--api-key", "sk-fake", "--output", "json"],
      { BAILIAN_WORKSPACE_ID: "", BAILIAN_CONFIG_DIR: "/tmp" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/workspace.*required/i);
  });

  test("--dry-run 由 workspace 推导 AgentStudio 域名，不发请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SECURITY_ROUTES,
      ["security", "overview", "--dry-run", "--workspace-id", "ws_test", "--output", "json"],
      { BAILIAN_CONFIG_DIR: "/tmp", DASHSCOPE_BASE_URL: "" },
    ); // isolate dev config base_url
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.method).toBe("GET");
    expect(data.endpoint).toMatch(/ws_test\.cn-beijing\.maas\.aliyuncs\.com/);
    expect(data.endpoint).toMatch(/api\/v1\/agentstudio\/security\/overview/);
  });

  test("--dry-run --base-url 覆盖为自定义 origin，无需 workspace", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "overview",
      "--dry-run",
      "--base-url",
      "https://security.pre.example.com",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.method).toBe("GET");
    expect(data.endpoint).toBe(
      "https://security.pre.example.com/api/v1/agentstudio/security/overview",
    );
  });
});

describe("e2e: security alerts", () => {
  test("--help 展示筛选/分页/排序 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/--risk-level/i);
    expect(stderr).toMatch(/--page-size/i);
    expect(stderr).toMatch(/--asset-type/i);
    expect(stderr).toMatch(/--status-list/i);
    expect(stderr).toMatch(/--order-by/i);
    expect(stderr).toMatch(/--lang/i);
  });

  test("--dry-run 把筛选/分页参数落到 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--risk-level",
      "high",
      "--page-size",
      "50",
      "--page",
      "2",
      "--order",
      "asc",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.method).toBe("GET");
    expect(data.endpoint).toMatch(/api\/v1\/agentstudio\/security\/agent_logs/);
    expect(data.endpoint).toMatch(/risk_level=high/);
    expect(data.endpoint).toMatch(/page_size=50/);
    expect(data.endpoint).toMatch(/current_page=2/);
    expect(data.endpoint).toMatch(/order=asc/);
  });

  test("--status-list 可重复传参（数组展开为多个 query 值）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--status-list",
      "unhandled",
      "--status-list",
      "handling",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const { endpoint } = parseStdoutJson<DryRunBody>(stdout);
    expect(endpoint).toMatch(/status_list=unhandled/);
    expect(endpoint).toMatch(/status_list=handling/);
  });

  test("中文过滤值以 UTF-8 编码进入 query", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--app-name",
      "测试应用0",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const { endpoint } = parseStdoutJson<DryRunBody>(stdout);
    expect(endpoint).toMatch(/app_name=/);
    expect(decodeURIComponent(endpoint ?? "")).toContain("测试应用0");
  });

  test("非法 --risk-level 报 USAGE (2) 且零请求", async () => {
    const { exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--risk-level",
      "NOT_A_LEVEL",
    ]);
    expect(exitCode).toBe(2);
  });

  test("非法 --asset-type 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--dry-run",
      "--workspace-id",
      "ws_test",
      "--asset-type",
      "NOT_A_TYPE",
    ]);
    expect(exitCode).toBe(2);
  });
});

// Live: exercises the real envelope unwrap + Bearer injection. AgentStudio may
// require a service-linked role the test account lacks (errorCode 12000092 →
// AUTH exit 3), which is a correct server-driven outcome, so both 0 and 3 pass.
describe.skipIf(!isKbAdminE2EReady())("e2e: security (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("overview 返回解包后的 JSON 或权限错误", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "overview",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect([0, 3], stderr).toContain(exitCode);
    if (exitCode === 0) {
      const data = parseStdoutJson<Record<string, unknown>>(stdout);
      expect(data).toBeTypeOf("object");
    }
  });

  test("alerts 返回列表 JSON 或权限错误", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SECURITY_ROUTES, [
      "security",
      "alerts",
      "--workspace-id",
      workspaceId,
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect([0, 3], stderr).toContain(exitCode);
    if (exitCode === 0) {
      const data = parseStdoutJson<{ data?: unknown[] }>(stdout);
      expect(Array.isArray(data.data)).toBe(true);
    }
  });
});
