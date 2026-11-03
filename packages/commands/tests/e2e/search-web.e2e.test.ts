import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { SEARCH_WEB_ROUTES } from "./topic-routes.ts";

function pagesFromSearchWebStdout(stdout: string): Array<{ title?: string; url?: string }> {
  const envelope = parseStdoutJson<{ content?: Array<{ type?: string; text?: string }> }>(stdout);
  const block = envelope.content?.find((c) => c.type === "text" && c.text);
  expect(block?.text, "MCP content[].text 缺失").toBeDefined();
  const text = block!.text as string;
  const inner = JSON.parse(text) as { pages?: Array<{ title?: string; url?: string }> };
  return inner.pages ?? [];
}

/**
 * Search web E2E
 */

describe("e2e: search web", () => {
  test("search web --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/web|--query|list-tools|count|--mode/i);
  });

  test("search web --dry-run --list-tools 无需 --query 也无需凭证即可干跑", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SEARCH_WEB_ROUTES,
      ["search", "web", "--dry-run", "--list-tools", "--output", "json"],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action?: string }>(stdout);
    expect(data.action).toBe("tools/list");
  });

  test("search web --mode model --dry-run 生成 enable_search 对话请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SEARCH_WEB_ROUTES,
      ["search", "web", "--mode", "model", "--dry-run", "--output", "json", "--query", "干跑校验"],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      request?: {
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
        enable_search?: boolean;
        stream?: boolean;
      };
    }>(stdout);
    expect(data.endpoint).toMatch(/\/chat\/completions$/);
    expect(data.request?.model).toBe("qwen3.8-max");
    expect(data.request?.messages).toEqual([{ role: "user", content: "干跑校验" }]);
    expect(data.request?.enable_search).toBe(true);
    expect(data.request?.stream).toBe(false);
  });

  test("search web --mode model 可用 --model 指定模型", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SEARCH_WEB_ROUTES,
      [
        "search",
        "web",
        "--mode",
        "model",
        "--model",
        "qwen-max",
        "--dry-run",
        "--output",
        "json",
        "--query",
        "干跑校验",
      ],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { model?: string } }>(stdout);
    expect(data.request?.model).toBe("qwen-max");
  });

  test("search web --mode model 拒绝 --list-tools 与 --count", async () => {
    const listTools = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "model",
      "--list-tools",
    ]);
    expect(listTools.exitCode).toBe(2);
    expect(listTools.stderr).toMatch(/--list-tools.*MCP/i);

    const count = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "model",
      "--query",
      "hello",
      "--count",
      "3",
    ]);
    expect(count.exitCode).toBe(2);
    expect(count.stderr).toMatch(/--count.*MCP/i);
  });

  test("search web 拒绝未知的 --mode 值", async () => {
    const { stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "legacy",
      "--query",
      "hello",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--mode|mcp.*model/i);
  });

  test("search web 默认走 model：--dry-run 生成 enable_search 对话请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SEARCH_WEB_ROUTES,
      ["search", "web", "--dry-run", "--output", "json", "--query", "干跑校验"],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      request?: { model?: string; enable_search?: boolean };
    }>(stdout);
    expect(data.endpoint).toMatch(/\/chat\/completions$/);
    expect(data.request?.model).toBe("qwen3.8-max");
    expect(data.request?.enable_search).toBe(true);
  });

  test("search web 默认 model 模式拒绝 --count", async () => {
    const { stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--query",
      "hello",
      "--count",
      "3",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--count.*MCP/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: search web", () => {
  test("search web 缺少 --query 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--query|Usage:/i);
  });

  test("search web --mode mcp --dry-run 仅输出 tools/call 计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "mcp",
      "--dry-run",
      "--output",
      "json",
      "--query",
      "干跑校验",
      "--count",
      "5",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      tool?: string;
      arguments?: { query?: string; count?: number };
    }>(stdout);
    expect(data.action).toBe("tools/call");
    expect(data.tool).toBe("bailian_web_search");
    expect(data.arguments?.query).toBe("干跑校验");
    expect(data.arguments?.count).toBe(5);
  });

  test("MCP 联网搜索返回 JSON 且含 pages", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "mcp",
      "--query",
      "阿里云百炼",
      "--count",
      "3",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const pages = pagesFromSearchWebStdout(stdout);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.url).toBeDefined();
  }, 120_000);

  test("--list-tools 真实拉取 WebSearch MCP 工具列表并正常退出", async () => {
    // The --list-tools branch opens its own MCP session; a leaked transport
    // would hang the subprocess, so a clean exit is part of the contract.
    const { stdout, stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--list-tools",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ tools?: Array<{ name?: string }> }>(stdout);
    expect(data.tools?.some((tool) => tool.name === "bailian_web_search")).toBe(true);
  }, 60_000);

  test("--mode model 真实调用模型联网搜索并返回 content 信封", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SEARCH_WEB_ROUTES, [
      "search",
      "web",
      "--mode",
      "model",
      "--query",
      "阿里云百炼是什么？一句话回答",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    // 模型模式无 pages；content[].text 直接承载模型回答纯文本（非 JSON）。
    const envelope = parseStdoutJson<{ content?: Array<{ type?: string; text?: string }> }>(stdout);
    const text = envelope.content?.find((block) => block.type === "text")?.text ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(() => JSON.parse(text)).toThrow();
  }, 120_000);
});
