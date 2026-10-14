import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "./helpers.ts";
import { DECISION_ROUTES } from "./topic-routes.ts";

let isolatedDirectory: string;

beforeEach(() => {
  isolatedDirectory = mkdtempSync(join(tmpdir(), "bl-decision-e2e-"));
  writeFileSync(join(isolatedDirectory, "config.json"), "{}");
});

afterEach(() => {
  rmSync(isolatedDirectory, { recursive: true, force: true });
});

const EMPTY_MODEL_ENV = {
  DASHSCOPE_API_KEY: "",
  DASHSCOPE_BASE_URL: "",
  BAILIAN_WORKSPACE_ID: "",
};

function runIsolatedDecision(args: string[], envOverrides: NodeJS.ProcessEnv = {}) {
  return runCommandE2e(DECISION_ROUTES, ["decision", ...args], {
    BAILIAN_CONFIG_DIR: isolatedDirectory,
    HOME: isolatedDirectory,
    USERPROFILE: isolatedDirectory,
    ...EMPTY_MODEL_ENV,
    ...envOverrides,
  });
}

const REFUND_QUESTIONS = JSON.stringify({
  refund: { type: "noul", instructions: "是否在索要退款？" },
});

interface DryRunOutput {
  endpoint?: string;
  request?: {
    model?: string;
    state?: unknown;
    questions?: Record<string, Record<string, unknown>>;
  };
}

/** 决策模型推理：help / 缺参 / 本地校验 / dry-run 均离线。 */
describe("e2e: decision", () => {
  test("decision --help 列出输入与地域 flag", async () => {
    const { stderr, exitCode } = await runCommandHelp(DECISION_ROUTES, ["decision", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--request-file/);
    expect(stderr).toMatch(/--questions-file/);
    expect(stderr).toMatch(/--workspace-id/);
    expect(stderr).toMatch(/--region/);
  });

  test("缺少 state 时报参数错误", async () => {
    const { stderr, exitCode } = await runIsolatedDecision(["--questions", REFUND_QUESTIONS]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--state|--request-file/);
  });

  test("--request-file 不能与 --state 混用", async () => {
    const { stderr, exitCode } = await runIsolatedDecision([
      "--request-file",
      "sample.json",
      "--state",
      "x",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--request-file/);
  });

  test("本地校验拒绝非法问题定义", async () => {
    const { stderr, exitCode } = await runIsolatedDecision([
      "--state",
      "x",
      "--questions",
      JSON.stringify({ severity: { type: "score", criteria: ["only"] } }),
      "--workspace-id",
      "ws_test",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/criteria/);
  });

  test("默认 Base URL 下要求 workspace", async () => {
    const { stderr, exitCode } = await runIsolatedDecision([
      "--state",
      "x",
      "--questions",
      REFUND_QUESTIONS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Workspace ID/i);
  });

  test("dry-run 输出 workspace Endpoint 与请求体", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedDecision([
      "--workspace-id",
      "ws_test",
      "--state",
      "这段评论是否在索要退款？",
      "--questions",
      REFUND_QUESTIONS,
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunOutput>(stdout);
    expect(data.endpoint).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/systemone",
    );
    expect(data.request?.model).toBe("decision-model-preview");
    expect(data.request?.state).toBe("这段评论是否在索要退款？");
  });

  test("dry-run 支持新加坡地域与 BAILIAN_WORKSPACE_ID", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedDecision(
      [
        "--region",
        "ap-southeast-1",
        "--state",
        "x",
        "--questions",
        REFUND_QUESTIONS,
        "--dry-run",
        "--output",
        "json",
      ],
      { BAILIAN_WORKSPACE_ID: "ws_env" },
    );
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson<DryRunOutput>(stdout).endpoint).toBe(
      "https://ws_env.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/systemone",
    );
  });

  test("显式 Base URL 优先于 workspace 域名", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedDecision([
      "--base-url",
      "https://example.test",
      "--state",
      "x",
      "--questions",
      REFUND_QUESTIONS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson<DryRunOutput>(stdout).endpoint).toBe(
      "https://example.test/compatible-mode/v1/systemone",
    );
  });

  test("--request-file 复用训练样本并去掉 label/target", async () => {
    const samplePath = join(isolatedDirectory, "sample.json");
    writeFileSync(
      samplePath,
      JSON.stringify({
        state: { content: "订单支付后超过 24 小时仍未到账" },
        questions: {
          department: {
            type: "choice",
            instructions: "应该由哪个团队处理？",
            criteria: { billing: "支付和账单问题", technical: "产品故障问题" },
            label: "billing",
            target: { billing: 0.96, technical: 0.04 },
          },
        },
      }),
    );
    const { stdout, stderr, exitCode } = await runIsolatedDecision([
      "--workspace-id",
      "ws_test",
      "--request-file",
      samplePath,
      "--model",
      "my-decision-ft",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunOutput>(stdout);
    expect(data.request?.model).toBe("my-decision-ft");
    expect(data.request?.state).toEqual({ content: "订单支付后超过 24 小时仍未到账" });
    expect(data.request?.questions?.department).not.toHaveProperty("label");
    expect(data.request?.questions?.department).not.toHaveProperty("target");
  });
});
