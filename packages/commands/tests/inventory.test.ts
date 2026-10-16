import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { AGENT_ENV_KEYS } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import {
  listSkills,
  listMcpServers,
  listAgents,
  getSkillDetail,
} from "../src/commands/config/inventory.ts";
import { qwenworkMcpPath } from "../src/commands/mcp/agent-config.ts";

/**
 * Temp home plus cleared Agent/MCP override env vars.
 * Inventory takes an explicit home, but Claude/Hermes probes still read process.env.
 */
function withTempHomeDir(fn: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "bl-inv-"));
  const saved: Record<string, string | undefined> = {};
  for (const key of AGENT_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

function write(home: string, rel: string, content: string): void {
  const path = join(home, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

test("getSkillDetail 返回 SKILL.md 原文,未知 id 返回 null", () => {
  withTempHomeDir((home) => {
    write(
      home,
      ".agents/skills/demo/SKILL.md",
      "---\nname: demo-skill\ndescription: A demo skill.\n---\n# Body\nhello world\n",
    );

    const detail = getSkillDetail("demo", home);
    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("demo-skill");
    expect(detail?.content).toContain("hello world");
    expect(getSkillDetail("nope", home)).toBeNull();
  });
});

test("listSkills 解析 SKILL.md frontmatter 与文件数", () => {
  withTempHomeDir((home) => {
    write(
      home,
      ".agents/skills/demo/SKILL.md",
      '---\nname: demo-skill\nmetadata:\n  version: "2.1.0"\ndescription: A demo skill.\n---\n# Body\n',
    );
    write(home, ".agents/skills/demo/assets/a.md", "x");
    // Directory without SKILL.md is ignored.
    mkdirSync(join(home, ".agents/skills/not-a-skill"), { recursive: true });

    const skills = listSkills(home);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: "demo",
      name: "demo-skill",
      version: "2.1.0",
      description: "A demo skill.",
      sources: ["global"],
      origin: "local",
    });
    expect(skills[0].fileCount).toBe(2);
  });
});

test("listSkills 将 agent 目录下的软链接视为安装来源", () => {
  withTempHomeDir((home) => {
    write(home, ".agents/skills/bailian-cli/SKILL.md", "---\nname: bailian-cli\n---\n");
    // Mimic `skills add`: the agent copy is a symlink back to the global dir.
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    symlinkSync(join(home, ".agents/skills/bailian-cli"), join(home, ".claude/skills/bailian-cli"));

    const skills = listSkills(home);
    expect(skills).toHaveLength(1);
    expect(skills[0].sources).toEqual(["global", "claude-code"]);
  });
});

test("listSkills 跨 agent 模块聚合并记录来源", () => {
  withTempHomeDir((home) => {
    // Same skill installed in the global dir and two agent modules.
    const skillMd = "---\nname: bailian-cli\n---\n# B\n";
    write(home, ".agents/skills/bailian-cli/SKILL.md", skillMd);
    write(home, ".claude/skills/bailian-cli/SKILL.md", skillMd);
    write(home, ".qwen/skills/bailian-cli/SKILL.md", skillMd);
    // A skill only present in qwen.
    write(home, ".qwen/skills/spark-video/SKILL.md", "---\nname: spark-video\n---\n");

    const skills = listSkills(home);
    const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
    expect(byId["bailian-cli"].sources).toEqual(["global", "claude-code", "qwen-code"]);
    expect(byId["spark-video"].sources).toEqual(["qwen-code"]);
  });
});

test("listSkills 目录缺失时返回空数组", () => {
  withTempHomeDir((home) => {
    expect(listSkills(home)).toEqual([]);
  });
});

test("listMcpServers 汇总 codex(toml) 与 claude(json) 的 MCP 定义", () => {
  withTempHomeDir((home) => {
    write(home, ".codex/config.toml", '[mcp_servers.repl]\ncommand = "node"\nargs = ["repl.js"]\n');
    write(
      home,
      ".claude.json",
      JSON.stringify({
        mcpServers: { web: { url: "https://example.com/mcp", type: "sse" } },
        projects: {
          "/proj": {
            mcpServers: { local: { command: "python", args: ["s.py"] } },
          },
        },
      }),
    );

    const servers = listMcpServers(home);
    const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
    expect(byName.repl).toMatchObject({
      source: "codex",
      transport: "stdio",
      origin: "local",
    });
    expect(byName.repl.detail).toContain("node repl.js");
    expect(byName.web).toMatchObject({
      source: "claude-code",
      transport: "sse",
      scope: "global",
    });
    expect(byName.local).toMatchObject({
      source: "claude-code",
      transport: "stdio",
      scope: "/proj",
    });
  });
});

test("listMcpServers 无配置时返回空数组", () => {
  withTempHomeDir((home) => {
    expect(listMcpServers(home)).toEqual([]);
  });
});

test("listMcpServers 区分 Qoder、Qoder Work 与千问办公 QwenWork", () => {
  withTempHomeDir((home) => {
    write(
      home,
      ".qoder/mcp.json",
      JSON.stringify({ mcpServers: { qoder: { url: "https://qoder" } } }),
    );
    write(
      home,
      ".qoderwork/mcp.json",
      JSON.stringify({ mcpServers: { qoderwork: { url: "https://qoderwork" } } }),
    );
    write(
      home,
      relative(home, qwenworkMcpPath(home)),
      JSON.stringify({ mcpServers: { qwenwork: { type: "http", url: "https://qwenwork" } } }),
    );

    const servers = listMcpServers(home);
    const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
    expect(byName.qoder).toMatchObject({ source: "qoder" });
    expect(byName.qoderwork).toMatchObject({ source: "qoderwork" });
    expect(byName.qwenwork).toMatchObject({ source: "qwenwork" });
  });
});

test("listAgents 报告安装与已连接 bailian-cli 的状态", () => {
  withTempHomeDir((home) => {
    // Claude Code: installed + configured (base url present).
    write(
      home,
      ".claude/settings.json",
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: "https://x", ANTHROPIC_MODEL: "qwen3-max" },
      }),
    );
    // Codex: installed but NOT configured (no bailian-cli provider).
    write(home, ".codex/config.toml", 'model = "gpt-5"\n');
    // Qwen Code: configured via the new "[Bailian] <model>" display name.
    write(
      home,
      ".qwen/settings.json",
      JSON.stringify({
        modelProviders: {
          openai: [{ id: "qwen3-coder-plus", name: "[Bailian] qwen3-coder-plus" }],
        },
        model: { name: "qwen3-coder-plus" },
      }),
    );
    // Hermes: configured via the official flat model block (no custom_providers).
    write(
      home,
      ".hermes/config.yaml",
      [
        "model:",
        "  default: qwen3-max",
        "  provider: custom",
        "  base_url: https://dashscope.aliyuncs.com/compatible-mode/v1",
        "  api_key: sk-test",
      ].join("\n"),
    );

    const agents = listAgents(home);
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));

    expect(byId["claude-code"]).toMatchObject({
      installed: true,
      configured: true,
      model: "qwen3-max",
      origin: "local",
    });
    expect(byId.codex).toMatchObject({
      installed: true,
      configured: false,
      model: "gpt-5",
    });
    expect(byId["qwen-code"]).toMatchObject({
      installed: true,
      configured: true,
      model: "qwen3-coder-plus",
    });
    expect(byId.hermes).toMatchObject({
      installed: true,
      configured: true,
      model: "qwen3-max",
    });
    expect(byId.opencode).toMatchObject({
      installed: false,
      configured: false,
    });
    // Always reports all six known frameworks.
    expect(agents).toHaveLength(6);
  });
});

test("listAgents 通过 HERMES_HOME 探测 relocated 的 hermes 配置", () => {
  withTempHomeDir((home) => {
    // Hermes home relocated away from ~/.hermes via HERMES_HOME。
    // withTempHomeDir 已清空宿主 HERMES_HOME；本用例再显式注入。
    const hermesHome = join(home, "relocated-hermes");
    process.env.HERMES_HOME = hermesHome;
    write(
      hermesHome,
      "config.yaml",
      [
        "model:",
        "  default: qwen3-max",
        "  provider: custom",
        "  base_url: https://dashscope.aliyuncs.com/compatible-mode/v1",
        "  api_key: sk-test",
      ].join("\n"),
    );
    const byId = Object.fromEntries(listAgents(home).map((agent) => [agent.id, agent]));
    // Probe must follow HERMES_HOME, not the hard-coded ~/.hermes (issue #131).
    expect(byId.hermes).toMatchObject({
      installed: true,
      configured: true,
      model: "qwen3-max",
    });
  });
});

test("listAgents 不受宿主 CLAUDE_CONFIG_DIR 干扰", () => {
  const previousClaude = process.env.CLAUDE_CONFIG_DIR;
  const leaked = mkdtempSync(join(tmpdir(), "bl-inv-leaked-claude-"));
  try {
    process.env.CLAUDE_CONFIG_DIR = leaked;
    writeFileSync(
      join(leaked, "settings.json"),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: "https://leaked.example/anthropic",
          ANTHROPIC_MODEL: "leaked-model",
        },
      }),
    );
    withTempHomeDir((home) => {
      // helper 清空后，探测应只看传入的 home，而不是宿主 CLAUDE_CONFIG_DIR
      expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
      write(
        home,
        ".claude/settings.json",
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: "https://dashscope.aliyuncs.com/apps/anthropic",
            ANTHROPIC_MODEL: "qwen3-max",
          },
        }),
      );
      const byId = Object.fromEntries(listAgents(home).map((agent) => [agent.id, agent]));
      expect(byId["claude-code"]).toMatchObject({
        installed: true,
        configured: true,
        model: "qwen3-max",
      });
    });
  } finally {
    if (previousClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previousClaude;
    rmSync(leaked, { recursive: true, force: true });
  }
});
