import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { PERMISSION_ROUTES } from "./topic-routes.ts";

describe("e2e: permission", () => {
  test("permission list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(PERMISSION_ROUTES, [
      "permission",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--scope");
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--name");
    expect(stderr).toContain("--page-size");
  });

  test("permission grant --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--action");
    expect(stderr).toContain("--all");
  });

  test("permission revoke --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(PERMISSION_ROUTES, [
      "permission",
      "revoke",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--yes");
  });

  test("permission grant 缺少 --model/--all 报用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("one of --model / --all");
  });

  test("permission grant --all 与 --model 互斥", async () => {
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--all",
      "--model",
      "qwen-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("cannot be combined");
  });

  test("permission grant --action 非法值报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--model",
      "qwen-plus",
      "--action",
      "training",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("invalid");
  });

  test("permission grant --all 仅支持 inference", async () => {
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--all",
      "--action",
      "finetune",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("only supports the inference action");
  });

  test("permission grant --model 超过 20 个报错", async () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => `model-${index}`).join(",");
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--model",
      tooMany,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("at most 20");
  });

  test("permission revoke --all 缺 --yes 拒绝执行", async () => {
    // --yes 护栏在 run() 开头、任何网络调用之前抛出；带 dummy key 让用例不依赖环境凭证（否则 auth stage 先报 AUTH(3)）。
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "revoke",
      "--all",
      "--api-key",
      "e2e-dummy-key",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Refusing");
    expect(stderr).toContain("--yes");
  });

  // --dry-run 跳过 auth stage（见 runtime middleware），无需凭证即可断言请求形状。
  // 不传 --output：permission 命令组默认 JSON 输出。
  test("permission list --dry-run 输出 GET 请求（默认 AUTHORIZABLE + JSON）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "list",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      method?: string;
      query?: { authorization_scope?: string; page_no?: number; page_size?: number };
    }>(stdout);
    expect(data.endpoint).toContain("/api/v1/models/permissions");
    expect(data.method).toBe("GET");
    expect(data.query?.authorization_scope).toBe("AUTHORIZABLE");
    expect(data.query?.page_no).toBe(1);
    expect(data.query?.page_size).toBe(20);
  });

  test("permission list --scope authorized --dry-run 透传 scope", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "list",
      "--scope",
      "authorized",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ query?: { authorization_scope?: string } }>(stdout);
    expect(data.query?.authorization_scope).toBe("AUTHORIZED");
  });

  test("permission grant --dry-run 输出逐模型 POST 请求体（默认 JSON）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--model",
      "qwen-plus,qwen3-max",
      "--action",
      "inference,finetune",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      method?: string;
      request?: { models?: { model?: string; inference?: boolean; finetune?: boolean }[] };
    }>(stdout);
    expect(data.endpoint).toContain("/api/v1/models/permissions");
    expect(data.method).toBe("POST");
    expect(data.request?.models?.length).toBe(2);
    expect(data.request?.models?.[0]).toEqual({
      model: "qwen-plus",
      inference: true,
      finetune: true,
    });
  });

  test("permission revoke --dry-run 输出取消授权请求体", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "revoke",
      "--model",
      "qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: { models?: { model?: string; inference?: boolean }[] };
    }>(stdout);
    expect(data.request?.models?.[0]).toEqual({ model: "qwen-plus", inference: false });
  });

  test("permission grant --all --dry-run 输出一键授权 OPEN", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "grant",
      "--all",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { access_all_entities?: string } }>(stdout);
    expect(data.request?.access_all_entities).toBe("OPEN");
  });

  test("permission revoke --all --dry-run 免 --yes 输出 CLOSE", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "revoke",
      "--all",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { access_all_entities?: string } }>(stdout);
    expect(data.request?.access_all_entities).toBe("CLOSE");
  });
});

// 真实调用 GET /api/v1/models/permissions。grant/revoke 只测 --dry-run——live POST
// 会真实改写业务空间的模型授权，不做 e2e。
describe.skipIf(!isDashScopeE2EReady())("e2e: permission（DashScope）", () => {
  test("permission list JSON 输出返回授权列表（默认 JSON）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "list",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ items?: unknown[]; total?: number }>(stdout);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
  });

  test("permission list --scope authorizable 分页生效", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "list",
      "--scope",
      "authorizable",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      items?: { model?: string; permissions?: Record<string, unknown> }[];
      total?: number;
    }>(stdout);
    expect(data.items?.length).toBeLessThanOrEqual(5);
    expect(data.total).toBeGreaterThan(0);
    expect(data.items?.[0]).toHaveProperty("permissions");
  });

  test("permission list 文本输出正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(PERMISSION_ROUTES, [
      "permission",
      "list",
      "--scope",
      "authorizable",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
  });
});
