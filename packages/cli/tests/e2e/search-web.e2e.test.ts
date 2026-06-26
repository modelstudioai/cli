import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

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
  test("search 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["search"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/search|web/i);
  });

  test("search web --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["search", "web", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/web|--query|list-tools|count/i);
  });

  test("search web --dry-run --list-tools 无需 --query 也无需凭证即可干跑", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      ["search", "web", "--dry-run", "--list-tools", "--non-interactive", "--output", "json"],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action?: string }>(stdout);
    expect(data.action).toBe("tools/list");
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: search web", () => {
  test("search web 缺少 --query 时打印子命令帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli(["search", "web", "--non-interactive"]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--query|Usage:/i);
  });

  test("search web --dry-run 仅输出计划且不调 MCP", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "search",
      "web",
      "--dry-run",
      "--non-interactive",
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

  test("联网搜索返回 JSON 且含搜索结果", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "search",
      "web",
      "--query",
      "阿里云百炼",
      "--count",
      "3",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const pages = pagesFromSearchWebStdout(stdout);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.url).toBeDefined();
  }, 120_000);
});
