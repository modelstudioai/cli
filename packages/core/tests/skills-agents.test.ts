import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import {
  detectInstalledAgents,
  getAgentTargets,
  linkSkillToAgents,
  unlinkSkillFromAgents,
} from "../src/skills/agents.ts";
import { getSkillsDir } from "../src/skills/lock.ts";

/**
 * Isolated environment: HOME/XDG_CONFIG_HOME/BAILIAN_CONFIG_DIR all point to a temp dir,
 * so agent detection and the canonical dir never touch the real home.
 */
async function inFakeHome(fn: (home: string) => Promise<void>): Promise<void> {
  const saved = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    BAILIAN_CONFIG_DIR: process.env.BAILIAN_CONFIG_DIR,
  };
  const home = mkdtempSync(join(tmpdir(), "bl-skill-agents-"));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.BAILIAN_CONFIG_DIR = join(home, ".bailian");
  try {
    await fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

/** Create an installed skill in canonical */
function seedCanonicalSkill(name: string): string {
  const dir = join(getSkillsDir(), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: x\ndescription: y\n---\n");
  return dir;
}

test("agents: registry has universal + 11 agents, only detects those whose config dir exists", async () => {
  await inFakeHome(async (home) => {
    expect(getAgentTargets().map((a) => a.id)).toContain("universal");
    expect(getAgentTargets()).toHaveLength(11);
    expect(detectInstalledAgents()).toEqual([]);

    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".qoder"), { recursive: true });
    expect(detectInstalledAgents().map((a) => a.id)).toEqual(["claude-code", "qoder"]);

    // Cline config dir exists → hits the universal pseudo-agent
    mkdirSync(join(home, ".cline"), { recursive: true });
    expect(detectInstalledAgents().map((a) => a.id)).toEqual(["universal", "claude-code", "qoder"]);
  });
});

test("agents: fan-out creates symlink to canonical; does not create dirs for uninstalled agents", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const target = seedCanonicalSkill("demo");

    const results = linkSkillToAgents("demo");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ agent: "claude-code", mode: "symlink" });

    const linkPath = join(home, ".claude", "skills", "demo");
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(linkPath)).toBe(target);
    // Real content is readable through the link
    expect(readFileSync(join(linkPath, "SKILL.md"), "utf-8")).toContain("name: x");
    // Uninstalled agent dir was not created out of thin air
    expect(existsSync(join(home, ".cursor"))).toBe(false);
  });
});

test("agents: existing unmanaged dir is skipped; managed stale link is rebuilt", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    seedCanonicalSkill("demo");

    // Real dir placed by the user → skipped, not cleared
    const foreign = join(home, ".claude", "skills", "demo");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "user.txt"), "mine");
    const first = linkSkillToAgents("demo");
    expect(first[0].mode).toBe("skipped");
    expect(readFileSync(join(foreign, "user.txt"), "utf-8")).toBe("mine");

    // Replace with our own stale link → rebuilt successfully
    rmSync(foreign, { recursive: true, force: true });
    const again = linkSkillToAgents("demo");
    expect(again[0].mode).toBe("symlink");
    const rebuilt = linkSkillToAgents("demo");
    expect(rebuilt[0].mode).toBe("symlink");
  });
});

test("agents: unlink reclaims managed links, leaves foreign content untouched", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".agents"), { recursive: true });
    seedCanonicalSkill("demo");
    const links = linkSkillToAgents("demo");
    expect(links.filter((l) => l.mode === "symlink")).toHaveLength(2);

    // Foreign file with the same name placed in cursor (should be unaffected even if not detected)
    const removed = unlinkSkillFromAgents(
      "demo",
      links.map((l) => l.path),
    );
    expect(removed.sort()).toEqual(links.map((l) => l.path).sort());
    expect(existsSync(join(home, ".claude", "skills", "demo"))).toBe(false);
    expect(existsSync(join(home, ".agents", "skills", "demo"))).toBe(false);
  });
});
