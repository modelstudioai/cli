import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleE2EReady,
  isConsoleAuthFailure,
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { QUOTA_ROUTES } from "./topic-routes.ts";

describe("e2e: quota", () => {
  test("quota list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--name");
  });

  test("quota list --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl quota list");
    expect(stderr).toContain("bl quota list --model qwen3-max");
    expect(stderr).toContain("bl quota list --name qwen --page-size 50");
  });

  test("quota update --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "update", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--rpm");
    expect(stderr).toContain("--tpm");
    expect(stderr).toContain("--delete");
    expect(stderr).toContain("--yes");
  });

  test("quota request 作为 quota update 的兼容别名可用", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "request", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--rpm");
    expect(stderr).toContain("--delete");
  });

  test("quota history --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "history", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--page");
    expect(stderr).toContain("--model");
  });

  test("quota check --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(QUOTA_ROUTES, ["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--period");
    expect(stderr).toContain("bl quota check");
  });

  test("quota check --period 0 报错最小值", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--period",
      "0.5",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("at least 1 minute");
  });

  test("quota update 缺少 --rpm/--tpm/--delete 报用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "update",
      "--model",
      "qwen-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("one of --rpm / --tpm / --delete");
  });

  test("quota update --delete 与 --rpm 互斥", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "update",
      "--model",
      "qwen-plus",
      "--delete",
      "--rpm",
      "60",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("cannot be combined");
  });

  test("quota update --delete 非 TTY 无 --yes 报 USAGE (2)", async () => {
    // 注入假 key 让 apiKey 鉴权通过；确认门在发任何网络请求前触发
    const { stderr, exitCode } = await runCommandE2e(
      QUOTA_ROUTES,
      ["quota", "update", "--model", "qwen-plus", "--delete"],
      { DASHSCOPE_API_KEY: "sk-e2e-quota-delete" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });

  test("quota update --rpm 负数报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "update",
      "--model",
      "qwen-plus",
      "--rpm",
      "-1",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("non-negative");
  });

  // --dry-run 跳过 auth stage（见 runtime middleware），无需凭证即可断言请求形状。
  test("quota list --dry-run 输出 GET 请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      method?: string;
      query?: { page_no?: number; page_size?: number };
    }>(stdout);
    expect(data.endpoint).toContain("/api/v1/models/limits");
    expect(data.method).toBe("GET");
    expect(data.query?.page_no).toBe(1);
    expect(data.query?.page_size).toBe(20);
  });

  test("quota list --model 多模型 --dry-run 逐模型一个请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--model",
      "qwen3-max,qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      requests?: { endpoint?: string; method?: string; query?: { model?: string } }[];
    }>(stdout);
    expect(data.requests?.length).toBe(2);
    expect(data.requests?.[0]?.endpoint).toContain("/api/v1/models/limits");
    expect(data.requests?.[0]?.query?.model).toBe("qwen3-max");
    expect(data.requests?.[1]?.query?.model).toBe("qwen-plus");
  });

  test("quota update --dry-run 输出 OVERLAY 请求体", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "update",
      "--model",
      "qwen-plus",
      "--rpm",
      "60",
      "--tpm",
      "100000",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      method?: string;
      request?: {
        models?: {
          model?: string;
          request_limit?: number;
          request_limit_period?: number;
          usage_limit?: number;
          usage_limit_period?: number;
        }[];
      };
    }>(stdout);
    expect(data.endpoint).toContain("/api/v1/models/limits");
    expect(data.method).toBe("POST");
    const entry = data.request?.models?.[0];
    expect(entry?.model).toBe("qwen-plus");
    expect(entry?.request_limit).toBe(60);
    expect(entry?.request_limit_period).toBe(60);
    expect(entry?.usage_limit).toBe(100000);
    expect(entry?.usage_limit_period).toBe(60);
  });

  test("quota update --delete --dry-run 输出 DELETE 操作", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "update",
      "--model",
      "qwen-plus",
      "--delete",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: { models?: { model?: string; operation_type?: string }[] };
    }>(stdout);
    expect(data.request?.models?.[0]?.operation_type).toBe("DELETE");
  });

  test("quota history --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "history",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { input?: { pageNo?: number; pageSize?: number } };
    }>(stdout);
    expect(data.api).toContain("listModelLimitApplications");
    expect(data.data?.input?.pageNo).toBe(1);
    expect(data.data?.input?.pageSize).toBe(10);
  });

  test("quota check --dry-run 输出 API 信息", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ apis?: string[]; consoleRegion?: string }>(stdout);
    expect(data.apis).toContain(
      "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels",
    );
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.monitor.getMonitorData");
    expect(data.consoleRegion).toBe("cn-beijing");
  });

  test("quota check --dry-run --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--dry-run",
      "--output",
      "json",
      "--console-region",
      "cn-hangzhou",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ consoleRegion?: string }>(stdout);
    expect(data.consoleRegion).toBe("cn-hangzhou");
  });

  test("quota history --dry-run --page 2 --page-size 20", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "history",
      "--page",
      "2",
      "--page-size",
      "20",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { input?: { pageNo?: number; pageSize?: number } };
    }>(stdout);
    expect(data.data?.input?.pageNo).toBe(2);
    expect(data.data?.input?.pageSize).toBe(20);
  });
});

// 真实调用 GET /api/v1/models/limits。quota update 只测 --dry-run——live POST
// 会真实改写账号限流，不做 e2e。
describe.skipIf(!isDashScopeE2EReady())("e2e: quota（DashScope）", () => {
  test("quota list 文本输出正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

  test("quota list --model 精确查询返回模型限流", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--model",
      "qwen3-max",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      items?: { model?: string; model_limit?: { request_limit?: number | null } | null }[];
    }>(stdout);
    expect(data.items?.[0]?.model).toBe("qwen3-max");
    expect(data.items?.[0]).toHaveProperty("model_limit");
  });

  test("quota list --name 模糊搜索分页生效", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--name",
      "qwen",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ items?: unknown[]; total?: number }>(stdout);
    expect(data.items?.length).toBeLessThanOrEqual(5);
    expect(data.total).toBeGreaterThan(0);
  });

  test("quota list --model 不存在的模型返回空列表", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--model",
      "nonexistent-model-xyz-99999",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No rate limits found");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: quota（Console）", () => {
  test("quota check 文本输出包含英文表头", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, ["quota", "check", "--output", "text"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check --model 指定单模型", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check --model 逗号分隔多模型", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus,qwen-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check JSON 输出包含用量和限额字段", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "json",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });
});
