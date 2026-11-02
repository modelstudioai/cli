import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import * as core from "bailian-cli-core";
import {
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { E2E_HARNESS_IDENTITY } from "./harness/identity.ts";
import { ADVISOR_ROUTES } from "./topic-routes.ts";

describe("e2e: advisor recommend", () => {
  test("advisor recommend --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recommend|--message/i);
  });
});

describe("e2e: advisor recommend 传输（离线）", () => {
  beforeEach(() => {
    // 隔离目录、同步与原生网络，回归不读取真实目录或调用付费模型。
    vi.spyOn(core, "maybeSyncWikiData").mockResolvedValue(false);
    vi.spyOn(core, "loadCatalog").mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("禁止原生网络请求")));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test.each([true, false])(
    "真实命令注入统一传输且默认关闭 thinking，verbose=%s",
    async (verbose) => {
      const endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
      const requests: RequestInit[] = [];
      vi.spyOn(core.httpTransport, "fetch").mockImplementation(async (input, init) => {
        expect(input).toBe(endpoint);
        requests.push(init ?? {});
        const body = JSON.parse(init?.body as string);
        const content = JSON.stringify(
          requests.length === 1
            ? {
                taskSummary: "文本生成",
                inputModality: ["Text"],
                outputModality: ["Text"],
                requiredCapabilities: ["TG"],
                matchedScenes: [],
                sceneConfidence: 1,
              }
            : { scores: [] },
        );
        const headers = { "x-request-id": "advisor-success-request" };
        return body.stream
          ? new Response(
              `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
              { headers },
            )
          : Response.json({ choices: [{ message: { content } }] }, { headers });
      });
      const { stdout, stderr, exitCode } = await runCommandInProcess(
        ADVISOR_ROUTES,
        [
          "advisor",
          "recommend",
          "--message",
          "文本生成",
          "--no-agent",
          ...(verbose ? ["--verbose"] : ["--no-thinking"]),
        ],
        {
          DASHSCOPE_API_KEY: "test-advisor-secret-key",
          DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com",
          DO_NOT_TRACK: "1",
          NODE_OPTIONS: "",
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          http_proxy: "",
          https_proxy: "",
        },
      );
      expect(exitCode, stderr).toBe(0);
      expect(requests).toHaveLength(2);
      for (const request of requests) {
        const headers = new Headers(request.headers);
        expect(headers.get("authorization")).toBe("Bearer test-advisor-secret-key");
        expect(headers.get("user-agent")).toBe(
          `${E2E_HARNESS_IDENTITY.clientName}/${E2E_HARNESS_IDENTITY.version}`,
        );
        expect(headers.get("x-dashscope-source-config")).toBe(
          core.sourceConfig(E2E_HARNESS_IDENTITY),
        );
        expect(headers.get("x-dashscope-openapisource")).toBe("BailianCLI");
        expect(headers.get("x-dashscope-service")).toBe("bailian-cli");
        expect(JSON.parse(request.body as string).model).toBe(core.DEFAULT_LLM_MODEL);
      }
      expect(JSON.parse(requests[0].body as string).enable_thinking).toBeUndefined();
      expect(JSON.parse(requests[0].body as string).stream).toBeUndefined();
      expect(JSON.parse(requests[1].body as string).stream).toBeUndefined();
      expect(parseStdoutJson<{ intent: { taskSummary: string } }>(stdout).intent.taskSummary).toBe(
        "文本生成",
      );
      expect(stdout).not.toContain("request_id:");
      expect(stderr).not.toContain("test-advisor-secret-key");
      if (verbose) {
        const debugLines = stderr
          .trim()
          .split("\n")
          .filter((line) => line.startsWith('{"debug":'));
        expect(debugLines.length).toBeGreaterThanOrEqual(4);
        const requestDebug = JSON.parse(debugLines[0]!).debug;
        const responseDebug = JSON.parse(debugLines[1]!).debug;
        expect(requestDebug.details).toMatchObject({ method: "POST", url: endpoint });
        expect(responseDebug.details).toMatchObject({
          status: 200,
          request_id: "advisor-success-request",
        });
      } else {
        expect(stderr).not.toContain('{"debug":');
        expect(stderr).not.toContain("request_id:");
      }
    },
  );
});

describe.skipIf(!isDashScopeE2EReady())("e2e: advisor recommend (DashScope)", () => {
  test("advisor recommend without --message errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--message|Usage:/i);
  });

  test("advisor recommend full flow returns results in the legacy JSON contract", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "low-cost high-concurrency online customer service",
      "--output",
      "json",
      "--no-agent",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { taskSummary?: string; requiredCapabilities?: string[] };
      result?: {
        type?: string;
        recommendations?: Array<{
          model?: string;
          name?: string;
          reason?: string;
          highlights?: string[];
        }>;
      };
      candidates?: number;
    }>(stdout);
    // Legacy contract: top-level { intent, result, candidates }
    expect(data.intent?.taskSummary).toBeDefined();
    expect(data.result?.type).toBe("single");
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
    expect(data.result?.recommendations?.[0]?.reason).toBeDefined();
    expect(data.result?.recommendations?.[0]?.highlights?.length).toBeGreaterThan(0);
    expect(typeof data.candidates).toBe("number");
  }, 120_000);

  test("advisor recommend model comparison query returns recommendations", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "qwen-max 和 deepseek-v3 哪个好",
      "--output",
      "json",
      "--no-agent",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      result?: {
        type?: string;
        recommendations?: Array<{ model?: string; reason?: string }>;
      };
    }>(stdout);
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
  }, 120_000);

  test("advisor recommend --top limits single-result recommendations", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "general text generation",
      "--output",
      "json",
      "--no-agent",
      "--top",
      "2",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      result?: { recommendations?: unknown[] };
    }>(stdout);
    expect(data.result?.recommendations?.length).toBeLessThanOrEqual(2);
  }, 120_000);
});
