import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  connectMcpAgents,
  disconnectMcpAgents,
  dshMcpPath,
  opencodeMcpPath,
  openclawMcpPath,
  qwenworkMcpPath,
  resolveMcpAgentTargets,
  workbuddyMcpPaths,
  zcodeMcpPath,
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
    {
      agent: "cursor" as const,
      path: [".cursor", "mcp.json"],
      streamable: { url: spec().endpoint, headers: spec().headers },
      sse: { url: spec("sse").endpoint, headers: spec("sse").headers },
    },
    {
      agent: "qoder" as const,
      path: [".qoder", "mcp.json"],
      streamable: { url: spec().endpoint, headers: spec().headers },
      sse: { url: spec("sse").endpoint, headers: spec("sse").headers },
    },
    {
      agent: "qoderwork" as const,
      path: [".qoderwork", "mcp.json"],
      streamable: { url: spec().endpoint, headers: spec().headers },
      sse: { url: spec("sse").endpoint, headers: spec("sse").headers },
    },
    {
      agent: "qwenwork" as const,
      path:
        process.platform === "darwin"
          ? ["Library", "Application Support", "QwenWorkCN", "mcp.json"]
          : process.platform === "win32"
            ? ["AppData", "Roaming", "QwenWorkCN", "mcp.json"]
            : [".config", "QwenWorkCN", "mcp.json"],
      streamable: { type: "http", url: spec().endpoint, headers: spec().headers },
      sse: { type: "sse", url: spec("sse").endpoint, headers: spec("sse").headers },
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
    mkdirSync(join(home, ".cursor"), { recursive: true });
    mkdirSync(join(home, ".qoderwork"), { recursive: true });

    expect(resolveMcpAgentTargets("all", home)).toEqual(["codex", "cursor", "qoderwork", "gemini"]);
    expect(resolveMcpAgentTargets("qwen-code", home)).toEqual(["qwen-code"]);
    expect(existsSync(join(home, ".qwen"))).toBe(false);

    mkdirSync(join(qwenworkMcpPath(home), ".."), { recursive: true });
    expect(resolveMcpAgentTargets("all", home)).toEqual([
      "codex",
      "cursor",
      "qoderwork",
      "qwenwork",
      "gemini",
    ]);
  });

  test("qoderwork writes ~/.qoderwork/mcp.json", () => {
    mkdirSync(join(home, ".qoderwork"), { recursive: true });
    const [result] = connectMcpAgents({
      agents: ["qoderwork"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.status).toBe("added");
    expect(result.path).toBe(join(home, ".qoderwork", "mcp.json"));
    expect(readJson(result.path)).toMatchObject({
      mcpServers: { ImageGenerate: { url: spec().endpoint, headers: spec().headers } },
    });
  });

  test("qwenwork writes Electron userData mcp.json and never uses Qoder Work", () => {
    mkdirSync(join(home, ".qoderwork"), { recursive: true });
    const [result] = connectMcpAgents({
      agents: ["qwenwork"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.status).toBe("added");
    expect(result.path).toBe(qwenworkMcpPath(home));
    expect(result.path).not.toContain(".qoderwork");
    expect(existsSync(join(home, ".qoderwork", "mcp.json"))).toBe(false);
    expect(readJson(result.path)).toMatchObject({
      mcpServers: {
        ImageGenerate: { type: "http", url: spec().endpoint, headers: spec().headers },
      },
    });
  });

  test("qwenwork prefers an existing QwenWork mcp.json over creating QwenWorkCN", () => {
    const intlPath =
      process.platform === "darwin"
        ? join(home, "Library", "Application Support", "QwenWork", "mcp.json")
        : process.platform === "win32"
          ? join(home, "AppData", "Roaming", "QwenWork", "mcp.json")
          : join(home, ".config", "QwenWork", "mcp.json");
    mkdirSync(join(intlPath, ".."), { recursive: true });
    writeFileSync(intlPath, JSON.stringify({ keep: true }));

    const [result] = connectMcpAgents({
      agents: ["qwenwork"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.path).toBe(intlPath);
    expect(readJson(intlPath)).toMatchObject({
      keep: true,
      mcpServers: {
        ImageGenerate: { type: "http", url: spec().endpoint, headers: spec().headers },
      },
    });
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

  test("opencode writes remote MCP entries under mcp", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    const [result] = connectMcpAgents({
      agents: ["opencode"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.status).toBe("added");
    expect(result.path).toBe(opencodeMcpPath(home));
    expect(readJson(result.path)).toMatchObject({
      mcp: {
        ImageGenerate: {
          type: "remote",
          url: spec().endpoint,
          enabled: true,
          oauth: false,
          headers: spec().headers,
        },
      },
    });
  });

  test("openclaw writes mcp.servers with native transport names", () => {
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    connectMcpAgents({
      agents: ["openclaw"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(readJson(openclawMcpPath(home))).toMatchObject({
      mcp: {
        servers: {
          ImageGenerate: {
            url: spec().endpoint,
            transport: "streamable-http",
            headers: spec().headers,
          },
        },
      },
    });
    connectMcpAgents({
      agents: ["openclaw"],
      spec: spec("sse"),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(readJson(openclawMcpPath(home))).toMatchObject({
      mcp: {
        servers: {
          ImageGenerate: {
            url: spec("sse").endpoint,
            transport: "sse",
            headers: spec("sse").headers,
          },
        },
      },
    });
  });

  test("zcode writes mcp.servers with http and sse types", () => {
    mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
    const [result] = connectMcpAgents({
      agents: ["zcode"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.path).toBe(zcodeMcpPath(home));
    expect(readJson(result.path)).toMatchObject({
      mcp: {
        servers: {
          ImageGenerate: {
            type: "http",
            url: spec().endpoint,
            enabled: true,
            headers: spec().headers,
          },
        },
      },
    });
  });

  test("workbuddy writes mcp.json into each installed product directory", () => {
    mkdirSync(join(home, ".workbuddy"), { recursive: true });
    mkdirSync(join(home, ".codebuddy"), { recursive: true });
    const [result] = connectMcpAgents({
      agents: ["workbuddy"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.status).toBe("added");
    const paths = workbuddyMcpPaths(home);
    expect(paths).toEqual([
      join(home, ".workbuddy", "mcp.json"),
      join(home, ".codebuddy", "mcp.json"),
    ]);
    for (const path of paths) {
      expect(readJson(path)).toMatchObject({
        mcpServers: {
          ImageGenerate: { type: "http", url: spec().endpoint, headers: spec().headers },
        },
      });
    }
    expect(existsSync(join(home, ".workbuddy-ai"))).toBe(false);

    const [removed] = disconnectMcpAgents({
      agents: ["workbuddy"],
      name: "ImageGenerate",
      home,
      configDir,
    });
    expect(removed.status).toBe("removed");
    for (const path of paths) {
      expect(readJson(path).mcpServers).toEqual({});
    }
  });

  test("deepseek-harness injects a streamable-http MCP client patch and preserves other inserts", () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    writeFileSync(
      dshMcpPath(home),
      ["- insert:", "    - id: tool-other", "      name: other-plugin", ""].join("\n"),
    );
    const [result] = connectMcpAgents({
      agents: ["deepseek-harness"],
      spec: spec(),
      cliVersion: "1.18.2",
      home,
      configDir,
    });
    expect(result.status).toBe("added");
    const content = readFileSync(dshMcpPath(home), "utf8");
    expect(content).toContain("tool-other");
    expect(content).toContain("@deepseek-ai/dsh-mcp-client");
    expect(content).toContain("streamable-http");
    expect(content).toContain(spec().endpoint);
    expect(() =>
      connectMcpAgents({
        agents: ["deepseek-harness"],
        spec: spec("sse"),
        cliVersion: "1.18.2",
        home,
        configDir,
      }),
    ).toThrow(/DeepSeek Harness.*SSE|SSE.*DeepSeek Harness/);
  });

  test("all targets include newly supported agents when installed", () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    mkdirSync(join(home, ".dsh"), { recursive: true });
    mkdirSync(join(home, ".zcode"), { recursive: true });
    mkdirSync(join(home, ".workbuddy-ai"), { recursive: true });
    expect(resolveMcpAgentTargets("all", home)).toEqual([
      "opencode",
      "openclaw",
      "deepseek-harness",
      "zcode",
      "workbuddy",
    ]);
  });
});
