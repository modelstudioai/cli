import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "./helpers.ts";
import { CONFIG_ROUTES, MCP_ROUTES } from "./topic-routes.ts";

const PLACEHOLDER_KEY = "sk-pi-e2e-placeholder-secret";
let probeRoot: string;
let agentDir: string;
let probeEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  probeRoot = mkdtempSync(join(tmpdir(), "bl-pi-e2e-"));
  agentDir = join(probeRoot, "pi-agent");
  probeEnv = { PI_CODING_AGENT_DIR: agentDir, BAILIAN_CONFIG_DIR: join(probeRoot, "bailian") };
});

afterEach(() => rmSync(probeRoot, { recursive: true, force: true }));

const modelArgs = [
  "config",
  "agent",
  "--agent",
  "pi",
  "--region",
  "ap-southeast-1",
  "--api-key",
  PLACEHOLDER_KEY,
  "--model",
  "qwen3-coder-plus",
];
const mcpArgs = [
  "mcp",
  "connect",
  "--agent",
  "pi",
  "--server",
  "TextGenerateImage",
  "--transport",
  "streamable-http",
  "--api-key",
  PLACEHOLDER_KEY,
  "--output",
  "json",
];

describe("e2e: Pi Agent integration", () => {
  test("config agent and mcp connect/disconnect help expose Pi", async () => {
    for (const [routes, args] of [
      [CONFIG_ROUTES, ["config", "agent", "--help"]],
      [MCP_ROUTES, ["mcp", "connect", "--help"]],
      [MCP_ROUTES, ["mcp", "disconnect", "--help"]],
    ] as const) {
      const result = await runCommandHelp(routes, [...args]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toMatch(/\bpi\b/);
    }
  });

  test("model dry-run accepts Pi, redacts its key, and leaves its directory absent", async () => {
    const result = await runCommandE2e(
      CONFIG_ROUTES,
      [...modelArgs, "--dry-run", "--output", "json"],
      probeEnv,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const plan = parseStdoutJson<{
      agent: string;
      base_url: string;
      model: string;
      api_key: string;
    }>(result.stdout);
    expect(plan.agent).toBe("pi");
    expect(plan.base_url).toBe(
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
    expect(plan.model).toBe("qwen3-coder-plus");
    expect(plan.api_key).not.toBe(PLACEHOLDER_KEY);
    expect(result.stdout + result.stderr).not.toContain(PLACEHOLDER_KEY);
    expect(existsSync(agentDir)).toBe(false);
  });

  test("config agent writes Pi's native settings and private auth without disclosing credentials", async () => {
    const result = await runCommandE2e(CONFIG_ROUTES, modelArgs, probeEnv);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(PLACEHOLDER_KEY);
    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
    expect(settings).toMatchObject({
      defaultProvider: "bailian-cli",
      defaultModel: "qwen3-coder-plus",
    });
    const auth = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8"));
    expect(auth["bailian-cli"]).toEqual({ type: "api_key", key: PLACEHOLDER_KEY });
    expect(readFileSync(join(agentDir, "models.json"), "utf8")).not.toContain(PLACEHOLDER_KEY);
  });

  test("MCP dry-run reports only non-secret metadata without writing configuration", async () => {
    const result = await runCommandE2e(MCP_ROUTES, [...mcpArgs, "--dry-run"], probeEnv);
    expect(result.exitCode, result.stderr).toBe(0);
    const plan = parseStdoutJson<{ agents: string[]; endpoint: string; header_names: string[] }>(
      result.stdout,
    );
    expect(plan.agents).toEqual(["pi"]);
    expect(plan.endpoint).toBe("https://dashscope.aliyuncs.com/api/v1/mcps/TextGenerateImage/mcp");
    expect(plan.header_names).toContain("Authorization");
    expect(result.stdout + result.stderr).not.toContain(PLACEHOLDER_KEY);
    expect(existsSync(agentDir)).toBe(false);
  });

  test("MCP connect is idempotent and disconnect removes the managed entry without disclosing credentials", async () => {
    const first = await runCommandE2e(MCP_ROUTES, mcpArgs, probeEnv);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(first.stdout + first.stderr).not.toContain(PLACEHOLDER_KEY);
    expect(parseStdoutJson<{ results: { status: string }[] }>(first.stdout).results[0].status).toBe(
      "added",
    );
    const repeated = await runCommandE2e(MCP_ROUTES, mcpArgs, probeEnv);
    expect(repeated.exitCode, repeated.stderr).toBe(0);
    expect(
      parseStdoutJson<{ results: { status: string }[] }>(repeated.stdout).results[0].status,
    ).toBe("unchanged");
    const disconnected = await runCommandE2e(
      MCP_ROUTES,
      ["mcp", "disconnect", "--agent", "pi", "--server", "TextGenerateImage", "--output", "json"],
      probeEnv,
    );
    expect(disconnected.exitCode, disconnected.stderr).toBe(0);
    expect(
      parseStdoutJson<{ results: { status: string }[] }>(disconnected.stdout).results[0].status,
    ).toBe("removed");
    expect(JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf8")).mcpServers).toEqual({});
  });

  test("MCP SSE uses the shared adapter rejection before any Pi file is created", async () => {
    const sseArgs = mcpArgs.map((argument) => (argument === "streamable-http" ? "sse" : argument));
    const result = await runCommandE2e(MCP_ROUTES, sseArgs, probeEnv);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/pi.*SSE/i);
    expect(result.stdout + result.stderr).not.toContain(PLACEHOLDER_KEY);
    expect(existsSync(agentDir)).toBe(false);
  });
});
