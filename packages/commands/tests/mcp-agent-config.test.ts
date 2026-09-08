import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  connectMcpAgents,
  disconnectMcpAgents,
  resolveMcpAgentTargets,
  type McpConnectionSpec,
} from "../src/commands/mcp/agent-config.ts";

let home = "";
let configDir = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bl-mcp-agent-"));
  configDir = join(home, ".bailian");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function spec(transport: "streamable-http" | "sse" = "streamable-http"): McpConnectionSpec {
  return {
    name: "ImageGenerate",
    serverCode: "ImageGenerate",
    transport,
    endpoint: `https://dashscope.aliyuncs.com/api/v1/mcps/ImageGenerate/${transport === "sse" ? "sse" : "mcp"}`,
    headers: {
      Authorization: "Bearer sk-test-secret",
      "x-dashscope-openapisource": "BailianCLI",
      "x-dashscope-source-config":
        '{"channel":"bailian-cli","tags":{"t1":"public","t2":"bl","t3":"1.18.2"}}',
    },
  };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("MCP Agent registration", () => {
  test("Codex writes a Streamable HTTP server without a type field", () => {
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), 'model = "gpt-5"\n\n[features]\nfoo = true\n');

    const [result] = connectMcpAgents({
      agents: ["codex"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });

    expect(result.status).toBe("added");
    const config = parseToml(readFileSync(join(codexDir, "config.toml"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.model).toBe("gpt-5");
    expect(config.features).toEqual({ foo: true });
    const entry = (config.mcp_servers as Record<string, Record<string, unknown>>).ImageGenerate;
    expect(entry).toEqual({
      url: "https://dashscope.aliyuncs.com/api/v1/mcps/ImageGenerate/mcp",
      http_headers: spec().headers,
    });
    expect(entry.type).toBeUndefined();
  });

  test("Codex rejects SSE before changing its config", () => {
    const codexDir = join(home, ".codex");
    const configPath = join(codexDir, "config.toml");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(configPath, 'model = "gpt-5"\n');

    expect(() =>
      connectMcpAgents({
        agents: ["codex"],
        spec: spec("sse"),
        cliVersion: "1.18.2",
        home,
        configDir,
      }),
    ).toThrow(/Codex.*SSE|SSE.*Codex/);
    expect(readFileSync(configPath, "utf8")).toBe('model = "gpt-5"\n');
  });

  test.each([
    {
      agent: "claude-code" as const,
      path: [".claude.json"],
      streamable: { type: "http", url: spec().endpoint, headers: spec().headers },
      sse: { type: "sse", url: spec("sse").endpoint, headers: spec("sse").headers },
    },
    {
      agent: "qwen-code" as const,
      path: [".qwen", "settings.json"],
      streamable: { httpUrl: spec().endpoint, headers: spec().headers },
      sse: { url: spec("sse").endpoint, headers: spec("sse").headers },
    },
    {
      agent: "gemini" as const,
      path: [".gemini", "settings.json"],
      streamable: { httpUrl: spec().endpoint, headers: spec().headers },
      sse: { url: spec("sse").endpoint, headers: spec("sse").headers },
    },
  ])(
    "$agent maps both remote transports to its native JSON format",
    ({ agent, path, streamable, sse }) => {
      const configPath = join(home, ...path);
      mkdirSync(join(configPath, ".."), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ keep: { user: true } }));

      connectMcpAgents({
        agents: [agent],
        spec: spec(),
        cliVersion: "1.18.2",
        home,
        configDir,
      });
      expect(readJson(configPath)).toMatchObject({
        keep: { user: true },
        mcpServers: { ImageGenerate: streamable },
      });

      connectMcpAgents({
        agents: [agent],
        spec: spec("sse"),
        cliVersion: "1.18.2",
        home,
        configDir,
      });
      expect(readJson(configPath)).toMatchObject({
        keep: { user: true },
        mcpServers: { ImageGenerate: sse },
      });
    },
  );

  test("reconnect is idempotent and an unmanaged same-name server is never overwritten", () => {
    const first = connectMcpAgents({
      agents: ["claude-code"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    const second = connectMcpAgents({
      agents: ["claude-code"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(first[0].status).toBe("added");
    expect(second[0].status).toBe("unchanged");

    const otherHome = mkdtempSync(join(tmpdir(), "bl-mcp-agent-unmanaged-"));
    try {
      writeFileSync(
        join(otherHome, ".claude.json"),
        JSON.stringify({ mcpServers: { ImageGenerate: { type: "http", url: "https://user" } } }),
      );
      expect(() =>
        connectMcpAgents({
          agents: ["claude-code"],
          spec: spec(),
          cliVersion: "1.18.2",
          home: otherHome,
          configDir: join(otherHome, ".bailian"),
        }),
      ).toThrow(/not managed|conflict/i);
      expect(
        (readJson(join(otherHome, ".claude.json")).mcpServers as Record<string, unknown>)
          .ImageGenerate,
      ).toEqual({ type: "http", url: "https://user" });
    } finally {
      rmSync(otherHome, { recursive: true, force: true });
    }
  });

  test("disconnect removes only an unchanged managed entry and never stores the API key in manifest", () => {
    const claudePath = join(home, ".claude.json");
    writeFileSync(
      claudePath,
      JSON.stringify({ mcpServers: { userServer: { type: "http", url: "https://user" } } }),
    );
    connectMcpAgents({
      agents: ["claude-code"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });

    const manifestPath = join(configDir, "mcp-registrations.json");
    expect(readFileSync(manifestPath, "utf8")).not.toContain("sk-test-secret");

    const [removed] = disconnectMcpAgents({
      agents: ["claude-code"],
      name: "ImageGenerate",
      home,
      configDir,
    });
    expect(removed.status).toBe("removed");
    const servers = readJson(claudePath).mcpServers as Record<string, unknown>;
    expect(servers.ImageGenerate).toBeUndefined();
    expect(servers.userServer).toEqual({ type: "http", url: "https://user" });
  });

  test("all targets only installed supported agents", () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    mkdirSync(join(home, ".gemini"), { recursive: true });

    expect(resolveMcpAgentTargets("all", home)).toEqual(["codex", "gemini"]);
    expect(resolveMcpAgentTargets("qwen-code", home)).toEqual(["qwen-code"]);
    expect(existsSync(join(home, ".qwen"))).toBe(false);
  });

  test("disconnecting an unmanaged absent server does not create a manifest", () => {
    const [result] = disconnectMcpAgents({
      agents: ["codex"],
      name: "NotRegistered",
      home,
      configDir,
    });

    expect(result.status).toBe("absent");
    expect(existsSync(join(configDir, "mcp-registrations.json"))).toBe(false);
  });
});
