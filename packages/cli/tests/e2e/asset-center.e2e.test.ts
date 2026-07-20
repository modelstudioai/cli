import { describe, expect, test } from "vite-plus/test";
import { isConsoleE2EReady, isConsoleAuthFailure, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: asset-center", () => {
  test("asset-center 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["asset-center"]);
    expect(exitCode, stderr).toBe(0);
    const output = `${stdout}\n${stderr}`;
    expect(output).toContain("list");
    expect(output).toContain("storage");
    expect(output).toContain("oss");
  });

  test("asset-center list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--type");
    expect(stderr).toContain("--recycle-bin");
    expect(stderr).toContain("bl asset-center list");
  });

  test("asset-center get --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "get", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--asset-id");
  });

  test("asset-center favorite --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "favorite", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--id");
  });

  test("asset-center delete --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--permanent");
  });

  test("asset-center download --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "download", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--id");
    expect(stderr).not.toContain("--out");
  });

  test("asset-center stats --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "stats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--sync-failed");
  });

  test("asset-center storage --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "storage", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl asset-center storage");
  });

  test("asset-center oss bind --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "oss", "bind", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--bucket");
    expect(stderr).toContain("--policy");
  });

  test("asset-center transfer list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "transfer", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--status");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: asset-center（Console）", () => {
  test("asset-center get 缺少 --asset-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "get", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--asset-id|Missing required argument/i);
  });

  test("asset-center favorite 缺少 --id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "favorite", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--id|Missing required argument/i);
  });

  test("asset-center download 缺少 --id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli(["asset-center", "download", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--id|Missing required argument/i);
  });

  test("asset-center oss bind policy=BEFORE_DAYS 缺 --before-days 报错", async () => {
    const { stderr, exitCode } = await runCli([
      "asset-center",
      "oss",
      "bind",
      "--bucket",
      "b",
      "--region",
      "cn-hangzhou",
      "--path-prefix",
      "p/",
      "--policy",
      "BEFORE_DAYS",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--before-days");
  });

  test("asset-center list --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "asset-center",
      "list",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { deleteStatus?: string };
    }>(stdout);
    expect(data.api).toContain("listModelGeneratedAsset");
    expect(data.data?.deleteStatus).toBe("NORMAL");
  });

  test("asset-center stats --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "asset-center",
      "stats",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string }>(stdout);
    expect(data.api).toContain("countModelGeneratedAsset");
  });

  test("asset-center storage --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "asset-center",
      "storage",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string }>(stdout);
    expect(data.api).toContain("getStorageQuota");
  });

  test("asset-center oss slr authorize --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "asset-center",
      "oss",
      "slr",
      "authorize",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string }>(stdout);
    expect(data.api).toContain("createOssSLR");
  });

  test("【console】asset-center list 真实调用或鉴权失败优雅退出", async () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID;
    const args = ["asset-center", "list", "--output", "json", "--page-size", "1"];
    if (workspaceId) args.push("--workspace-id", workspaceId);

    const result = await runCli(args);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });
});
