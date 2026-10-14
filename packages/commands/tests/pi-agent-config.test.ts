import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { AGENTS } from "../src/commands/config/agent/writers.ts";
import {
  connectMcpAgents,
  disconnectMcpAgents,
  resolveMcpAgentTargets,
} from "../src/commands/mcp/agent-config.ts";

let probeRoot: string;
let agentDir: string;
let previousAgentDir: string | undefined;

beforeEach(() => {
  probeRoot = mkdtempSync(join(tmpdir(), "bl-pi-agent-"));
  agentDir = join(probeRoot, "pi-agent");
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(probeRoot, { recursive: true, force: true });
});

function configurePi(
  model = "qwen3-coder-plus",
  baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1",
) {
  expect(AGENTS.pi, "Pi must be accepted by config agent").toBeDefined();
  return AGENTS.pi.write({ baseUrl, apiKey: "sk-pi-placeholder", model });
}

function readConfig(filename: string): Record<string, any> {
  return JSON.parse(readFileSync(join(agentDir, filename), "utf8"));
}

function connectPi(transport: "streamable-http" | "sse" = "streamable-http") {
  return connectMcpAgents({
    agents: ["pi"],
    home: probeRoot,
    configDir: join(probeRoot, "bailian"),
    cliVersion: "2.2.1",
    spec: {
      name: "TextGenerateImage",
      serverCode: "TextGenerateImage",
      transport,
      endpoint: "https://dashscope.aliyuncs.com/api/v1/mcps/TextGenerateImage/mcp",
      headers: { Authorization: "Bearer sk-pi-placeholder" },
    },
  });
}

describe("Pi model configuration", () => {
  test("writes a usable provider, private authentication, and startup model to Pi's custom directory", () => {
    const summary = configurePi();
    const models = readConfig("models.json");
    expect(models.providers["bailian-cli"]).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      api: "openai-completions",
      models: [{ id: "qwen3-coder-plus" }],
    });
    expect(readFileSync(join(agentDir, "models.json"), "utf8")).not.toContain("sk-pi-placeholder");
    expect(readConfig("auth.json")["bailian-cli"]).toEqual({
      type: "api_key",
      key: "sk-pi-placeholder",
    });
    expect(readConfig("settings.json")).toMatchObject({
      defaultProvider: "bailian-cli",
      defaultModel: "qwen3-coder-plus",
    });
    expect(summary.paths).toEqual([
      join(agentDir, "models.json"),
      join(agentDir, "auth.json"),
      join(agentDir, "settings.json"),
    ]);
    if (process.platform !== "win32")
      expect(statSync(join(agentDir, "auth.json")).mode & 0o777).toBe(0o600);
  });

  test("upserts models without losing other providers, credentials, or settings", () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({ providers: { other: { baseUrl: "https://example.com/v1" } } }),
    );
    writeFileSync(
      join(agentDir, "auth.json"),
      JSON.stringify({ other: { type: "oauth", access: "placeholder" } }),
    );
    writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ theme: "dark" }));
    configurePi();
    configurePi(
      "qwen3.8-max",
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
    configurePi(
      "qwen3.8-max",
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    );
    const models = readConfig("models.json");
    expect(models.providers.other.baseUrl).toBe("https://example.com/v1");
    expect(models.providers["bailian-cli"].models.map((model: { id: string }) => model.id)).toEqual(
      ["qwen3-coder-plus", "qwen3.8-max"],
    );
    expect(readConfig("auth.json").other.access).toBe("placeholder");
    expect(readConfig("settings.json")).toMatchObject({
      theme: "dark",
      defaultModel: "qwen3.8-max",
    });
  });

  test("uses Anthropic Messages for a compatible Anthropic endpoint", () => {
    configurePi("qwen3.8-max", "https://dashscope.aliyuncs.com/apps/anthropic");
    expect(readConfig("models.json").providers["bailian-cli"].api).toBe("anthropic-messages");
  });

  test("accepts native Pi comments and BOM while preserving other configuration", () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "models.json"),
      '\uFEFF{ // native Pi accepts comments\n"providers":{"other":{"baseUrl":"https://other.example/v1"}}}',
    );
    writeFileSync(
      join(agentDir, "auth.json"),
      '\uFEFF{"other":{"type":"api_key","key":"placeholder"}}',
    );
    writeFileSync(join(agentDir, "settings.json"), '\uFEFF{"theme":"dark"}');
    configurePi();
    expect(readConfig("models.json").providers.other.baseUrl).toBe("https://other.example/v1");
    expect(readConfig("auth.json").other.key).toBe("placeholder");
    expect(readConfig("settings.json").theme).toBe("dark");
  });

  test("reconfigures a model that previously overrode its provider endpoint and API", () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          "bailian-cli": {
            baseUrl: "https://old.example/v1",
            api: "anthropic-messages",
            models: [
              {
                id: "qwen3-coder-plus",
                name: "Custom name",
                contextWindow: 64000,
                baseUrl: "https://old-model.example/v1",
                api: "anthropic-messages",
              },
            ],
          },
        },
      }),
    );
    configurePi();
    const provider = readConfig("models.json").providers["bailian-cli"];
    expect(provider.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(provider.api).toBe("openai-completions");
    expect(provider.models[0]).toEqual({
      id: "qwen3-coder-plus",
      name: "Custom name",
      contextWindow: 64000,
    });
  });

  test("invalid existing configuration fails before any configuration is overwritten", () => {
    mkdirSync(agentDir, { recursive: true });
    const originalModels = '{"providers":{"keep":{"models":[{"id":"keep-model"}]}}}';
    writeFileSync(join(agentDir, "models.json"), originalModels);
    writeFileSync(join(agentDir, "auth.json"), "{invalid");
    expect(() => configurePi()).toThrow(/invalid|Invalid/);
    expect(readFileSync(join(agentDir, "models.json"), "utf8")).toBe(originalModels);
    expect(readFileSync(join(agentDir, "auth.json"), "utf8")).toBe("{invalid");
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false);
  });
});

describe("Pi MCP registration", () => {
  test("detects Pi's configured agent directory and completes an idempotent connect/disconnect cycle", () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ keep: true, mcpServers: { other: { command: "other-server" } } }),
    );
    expect(resolveMcpAgentTargets("all", probeRoot)).toContain("pi");
    expect(connectPi()[0]).toMatchObject({
      agent: "pi",
      status: "added",
      path: join(agentDir, "mcp.json"),
    });
    expect(connectPi()[0].status).toBe("unchanged");
    expect(readConfig("mcp.json")).toEqual({
      keep: true,
      mcpServers: {
        other: { command: "other-server" },
        TextGenerateImage: {
          url: "https://dashscope.aliyuncs.com/api/v1/mcps/TextGenerateImage/mcp",
          headers: { Authorization: "Bearer sk-pi-placeholder" },
        },
      },
    });
    const result = disconnectMcpAgents({
      agents: ["pi"],
      name: "TextGenerateImage",
      home: probeRoot,
      configDir: join(probeRoot, "bailian"),
    });
    expect(result[0].status).toBe("removed");
    expect(readConfig("mcp.json")).toEqual({
      keep: true,
      mcpServers: { other: { command: "other-server" } },
    });
  });

  test("rejects SSE before writing any MCP configuration or manifest", () => {
    expect(() => connectPi("sse")).toThrow(/pi.*SSE|SSE.*pi/i);
    expect(existsSync(join(agentDir, "mcp.json"))).toBe(false);
    expect(existsSync(join(probeRoot, "bailian", "mcp-registrations.json"))).toBe(false);
  });

  test("does not overwrite an unmanaged same-name MCP server", () => {
    mkdirSync(agentDir, { recursive: true });
    const original = JSON.stringify({
      mcpServers: { TextGenerateImage: { url: "https://user.example/mcp" } },
    });
    writeFileSync(join(agentDir, "mcp.json"), original);
    expect(() => connectPi()).toThrow(/not managed/);
    expect(readFileSync(join(agentDir, "mcp.json"), "utf8")).toBe(original);
  });
});
