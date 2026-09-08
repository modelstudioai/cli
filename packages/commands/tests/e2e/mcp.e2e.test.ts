import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { MCP_ROUTES } from "./topic-routes.ts";

/**
 * `bl mcp` E2E.
 *
 * Always-run group:
 *   - `--help` for the `mcp` group and each leaf command (no auth, no network)
 *   - `--dry-run --output json` shape checks for `mcp list`, `mcp tools`, `mcp call`
 *   - argument-validation paths for `mcp call`
 *
 * DashScope-gated group (only with `BAILIAN_E2E=1` + sk-key):
 *   - real `mcp tools WebSearch` end-to-end (built-in WebSearch MCP is the
 *     only Bailian server guaranteed to be reachable with just a sk-key);
 *     this also regression-guards the URL convention.
 */

describe("e2e: mcp", () => {
  test("mcp list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(MCP_ROUTES, ["mcp", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/list|--name|--type|--page/i);
  });

  test("mcp tools --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(MCP_ROUTES, ["mcp", "tools", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/tools|--server|--url/i);
  });

  test("mcp call --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(MCP_ROUTES, ["mcp", "call", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/call|--target|--arg|--json/i);
  });

  test("mcp connect/disconnect --help 展示原生 Agent 注册参数", async () => {
    const connect = await runCommandHelp(MCP_ROUTES, ["mcp", "connect", "--help"]);
    expect(connect.exitCode, connect.stderr).toBe(0);
    expect(connect.stderr).toMatch(/--server|--transport|streamable-http|--agent/i);

    const disconnect = await runCommandHelp(MCP_ROUTES, ["mcp", "disconnect", "--help"]);
    expect(disconnect.exitCode, disconnect.stderr).toBe(0);
    expect(disconnect.stderr).toMatch(/--server|--agent/i);
  });

  test("mcp connect 缺少必填参数时退出为用法错误 (2)", async () => {
    for (const args of [
      ["mcp", "connect", "--transport", "streamable-http", "--agent", "codex"],
      ["mcp", "connect", "--server", "ImageGenerate", "--agent", "codex"],
      ["mcp", "connect", "--server", "ImageGenerate", "--transport", "streamable-http"],
    ]) {
      const { exitCode } = await runCommandE2e(MCP_ROUTES, [...args, "--quiet"]);
      expect(exitCode).toBe(2);
    }
  });

  test("mcp connect --dry-run 输出端点和 Header 名但不写配置", async () => {
    const tempHome = mkdtempSync(join(tmpdir(), "bl-mcp-connect-dry-"));
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        MCP_ROUTES,
        [
          "mcp",
          "connect",
          "--server",
          "ImageGenerate",
          "--transport",
          "streamable-http",
          "--agent",
          "codex",
          "--base-url",
          "https://custom-model-gateway.example.com",
          "--dry-run",
          "--output",
          "json",
        ],
        {
          HOME: tempHome,
          CODEX_HOME: join(tempHome, ".codex"),
          BAILIAN_CONFIG_DIR: join(tempHome, ".bailian"),
        },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        server?: string;
        transport?: string;
        endpoint?: string;
        header_names?: string[];
      }>(stdout);
      expect(data.server).toBe("ImageGenerate");
      expect(data.transport).toBe("streamable-http");
      expect(data.endpoint).toBe("https://dashscope.aliyuncs.com/api/v1/mcps/ImageGenerate/mcp");
      expect(data.header_names).toEqual(
        expect.arrayContaining([
          "Authorization",
          "x-dashscope-openapisource",
          "x-dashscope-source-config",
        ]),
      );
      expect(existsSync(join(tempHome, ".codex", "config.toml"))).toBe(false);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("mcp connect/disconnect 可在隔离 HOME 内完成 Codex 配置闭环", async () => {
    const tempHome = mkdtempSync(join(tmpdir(), "bl-mcp-connect-write-"));
    const codexDir = join(tempHome, ".codex");
    const configDir = join(tempHome, ".bailian");
    const configPath = join(codexDir, "config.toml");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(configPath, 'model = "gpt-5"\n');
    const env = { HOME: tempHome, CODEX_HOME: codexDir, BAILIAN_CONFIG_DIR: configDir };

    try {
      const connected = await runCommandE2e(
        MCP_ROUTES,
        [
          "mcp",
          "connect",
          "--server",
          "ImageGenerate",
          "--transport",
          "streamable-http",
          "--agent",
          "codex",
          "--api-key",
          "sk-test-secret",
          "--base-url",
          "https://dashscope.aliyuncs.com",
          "--output",
          "json",
        ],
        env,
      );
      expect(connected.exitCode, connected.stderr).toBe(0);
      const config = parseToml(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      expect(config.model).toBe("gpt-5");
      expect((config.mcp_servers as Record<string, unknown>).ImageGenerate).toBeDefined();
      expect(readFileSync(join(configDir, "mcp-registrations.json"), "utf8")).not.toContain(
        "sk-test-secret",
      );

      const preview = await runCommandE2e(
        MCP_ROUTES,
        [
          "mcp",
          "disconnect",
          "--server",
          "ImageGenerate",
          "--agent",
          "codex",
          "--dry-run",
          "--output",
          "json",
        ],
        env,
      );
      expect(preview.exitCode, preview.stderr).toBe(0);
      expect(
        (parseToml(readFileSync(configPath, "utf8")).mcp_servers as Record<string, unknown>)
          .ImageGenerate,
      ).toBeDefined();

      const disconnected = await runCommandE2e(
        MCP_ROUTES,
        ["mcp", "disconnect", "--server", "ImageGenerate", "--agent", "codex", "--output", "json"],
        env,
      );
      expect(disconnected.exitCode, disconnected.stderr).toBe(0);
      const after = parseToml(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      expect((after.mcp_servers as Record<string, unknown>).ImageGenerate).toBeUndefined();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("mcp list --help 不暴露 --all 入口（市场全量已下线）", async () => {
    const { stderr, exitCode } = await runCommandHelp(MCP_ROUTES, ["mcp", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).not.toMatch(/--all/);
  });

  test("mcp list --dry-run 仅打印计划且固定 activated=1", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "list",
      "--dry-run",
      "--output",
      "json",
      "--name",
      "金融",
      "--page",
      "2",
      "--page-size",
      "5",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      consoleRegion?: string;
      data?: {
        reqDTO?: {
          type?: string;
          activated?: number;
          serverName?: string;
          pageNo?: number;
          pageSize?: number;
          displayTools?: boolean;
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.broadscope-bailian.mcp-server.PageList");
    expect(data.data?.reqDTO?.activated).toBe(1);
    expect(data.data?.reqDTO?.displayTools).toBe(false);
    expect(data.data?.reqDTO?.type).toBe("OFFICIAL");
    expect(data.data?.reqDTO?.serverName).toBe("金融");
    expect(data.data?.reqDTO?.pageNo).toBe(2);
    expect(data.data?.reqDTO?.pageSize).toBe(5);
  });

  test("mcp list --dry-run 自定义 --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "list",
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

  test("mcp tools --server <code> --dry-run 输出 /api/v1/mcps/<code>/mcp 形态 URL", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "tools",
      "--server",
      "market-cmapi00073529",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ server?: string; url?: string; action?: string }>(stdout);
    expect(data.server).toBe("market-cmapi00073529");
    expect(data.action).toBe("tools/list");
    expect(data.url).toMatch(/\/api\/v1\/mcps\/market-cmapi00073529\/mcp$/);
    // Guard against the historical AliyunBailianMCP_ prefix regression.
    expect(data.url).not.toMatch(/AliyunBailianMCP_/);
  });

  test("mcp tools --url 覆盖 baseUrl 约定", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "tools",
      "--server",
      "my-server",
      "--url",
      "https://example.com/custom/mcp",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ server?: string; url?: string }>(stdout);
    expect(data.server).toBe("my-server");
    expect(data.url).toBe("https://example.com/custom/mcp");
  });

  test("mcp tools 缺少 --server 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MCP_ROUTES, ["mcp", "tools", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--server|Usage:/i);
  });

  test("mcp call --target <server.tool> --dry-run 输出工具调用计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "call",
      "--target",
      "market-cmapi00073529.SmartStockSelection",
      "--query",
      "筛选ROE>15%的消费股",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      server?: string;
      url?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
    }>(stdout);
    expect(data.server).toBe("market-cmapi00073529");
    expect(data.tool).toBe("SmartStockSelection");
    expect(data.url).toMatch(/\/api\/v1\/mcps\/market-cmapi00073529\/mcp$/);
    expect(data.url).not.toMatch(/AliyunBailianMCP_/);
    expect(data.arguments?.query).toBe("筛选ROE>15%的消费股");
  });

  test("mcp call --json 与 --arg 合并(arg 覆盖 json),--query 等价 arg.query", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "call",
      "--target",
      "market-cmapi00073529.FinQuery",
      "--json",
      '{"q":"贵州茅台","limit":5,"riskLevel":"R2"}',
      "--arg",
      "limit=10",
      "--arg",
      'extra={"page":2}',
      "--query",
      "招商银行",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      tool?: string;
      arguments?: Record<string, unknown>;
    }>(stdout);
    expect(data.tool).toBe("FinQuery");
    // q from --json preserved
    expect(data.arguments?.q).toBe("贵州茅台");
    // riskLevel from --json preserved
    expect(data.arguments?.riskLevel).toBe("R2");
    // limit overridden by --arg (numeric JSON value)
    expect(data.arguments?.limit).toBe(10);
    // --arg with JSON object value
    expect(data.arguments?.extra).toEqual({ page: 2 });
    // --query overrides into .query
    expect(data.arguments?.query).toBe("招商银行");
  });

  test("mcp call --target 缺少 . 时报错且非零退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "call",
      "--target",
      "no-dot-target",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/<server-code>\.<tool>|target must be/i);
  });

  test("mcp call --arg 非 K=V 形式时报错且非零退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "call",
      "--target",
      "srv.tool",
      "--arg",
      "no-equals-sign",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/--arg must be in K=V/);
  });

  test("mcp call --json 无效 JSON 报错且非零退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "call",
      "--target",
      "srv.tool",
      "--json",
      "{not-json",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/--json is not valid JSON|--json must decode/);
  });

  test("mcp call 缺少 --target 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MCP_ROUTES, ["mcp", "call", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--target|Usage:/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: mcp (live)", () => {
  test("mcp tools WebSearch 走 URL 约定拉取内置 WebSearch MCP 工具列表", async () => {
    // Regression: bailianMcpUrl previously added an `AliyunBailianMCP_` prefix,
    // which made every real call 500. This test asserts the convention-built URL
    // (no --url override) actually reaches a live MCP server end-to-end.
    const { stdout, stderr, exitCode } = await runCommandE2e(MCP_ROUTES, [
      "mcp",
      "tools",
      "--server",
      "WebSearch",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      tools?: Array<{ name?: string; description?: string }>;
    }>(stdout);
    expect(Array.isArray(data.tools)).toBe(true);
    expect(data.tools?.length ?? 0).toBeGreaterThan(0);
    expect(data.tools?.some((t) => t.name === "bailian_web_search")).toBe(true);
  }, 60_000);
});
