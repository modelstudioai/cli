import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  listSkills,
  listMcpServers,
  listAgents,
  getSkillDetail,
} from "../src/commands/config/inventory.ts";

/** Build an isolated fake $HOME and clean it up afterwards. */
function withHome(fn: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "bl-inv-"));
  try {
    fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function write(home: string, rel: string, content: string): void {
  const path = join(home, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

test("getSkillDetail 返回 SKILL.md 原文,未知 id 返回 null", () => {
  withHome((home) => {
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
  withHome((home) => {
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
  withHome((home) => {
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
  withHome((home) => {
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
  withHome((home) => {
    expect(listSkills(home)).toEqual([]);
  });
});

test("listMcpServers 汇总 codex(toml) 与 claude(json) 的 MCP 定义", () => {
  withHome((home) => {
    write(home, ".codex/config.toml", '[mcp_servers.repl]\ncommand = "node"\nargs = ["repl.js"]\n');
    write(
      home,
      ".claude.json",
      JSON.stringify({
        mcpServers: { web: { url: "https://example.com/mcp", type: "sse" } },
        projects: { "/proj": { mcpServers: { local: { command: "python", args: ["s.py"] } } } },
      }),
    );

    const servers = listMcpServers(home);
    const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
    expect(byName.repl).toMatchObject({ source: "codex", transport: "stdio", origin: "local" });
    expect(byName.repl.detail).toContain("node repl.js");
    expect(byName.web).toMatchObject({ source: "claude-code", transport: "sse", scope: "global" });
    expect(byName.local).toMatchObject({
      source: "claude-code",
      transport: "stdio",
      scope: "/proj",
    });
  });
});

test("listMcpServers 无配置时返回空数组", () => {
  withHome((home) => {
    expect(listMcpServers(home)).toEqual([]);
  });
});

test("listAgents 报告安装与已连接 bailian-cli 的状态", () => {
  withHome((home) => {
    // Claude Code: installed + configured (base url present).
    write(
      home,
      ".claude/settings.json",
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://x", ANTHROPIC_MODEL: "qwen3-max" } }),
    );
    // Codex: installed but NOT configured (no bailian-cli provider).
    write(home, ".codex/config.toml", 'model = "gpt-5"\n');

    const agents = listAgents(home);
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));

    expect(byId["claude-code"]).toMatchObject({
      installed: true,
      configured: true,
      model: "qwen3-max",
    });
    expect(byId.codex).toMatchObject({ installed: true, configured: false, model: "gpt-5" });
    expect(byId.opencode).toMatchObject({ installed: false, configured: false });
    // Always reports all six known frameworks.
    expect(agents).toHaveLength(6);
  });
});
