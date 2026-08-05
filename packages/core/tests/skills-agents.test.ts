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
  fanOutSkillToAgents,
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
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    VIBE_HOME: process.env.VIBE_HOME,
    HERMES_HOME: process.env.HERMES_HOME,
    AUTOHAND_HOME: process.env.AUTOHAND_HOME,
    GROK_HOME: process.env.GROK_HOME,
    APPDATA: process.env.APPDATA,
    FLATPAK_XDG_CONFIG_HOME: process.env.FLATPAK_XDG_CONFIG_HOME,
  };
  const home = mkdtempSync(join(tmpdir(), "bl-skill-agents-"));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.BAILIAN_CONFIG_DIR = join(home, ".bailian");
  // Agent config-dir overrides must not leak in from the dev machine
  for (const key of [
    "CLAUDE_CONFIG_DIR",
    "CODEX_HOME",
    "VIBE_HOME",
    "HERMES_HOME",
    "AUTOHAND_HOME",
    "GROK_HOME",
    "APPDATA",
    "FLATPAK_XDG_CONFIG_HOME",
  ]) {
    delete process.env[key];
  }
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

test("agents: registry mirrors upstream agent list minus non-symlinkable agents", async () => {
  await inFakeHome(async (home) => {
    const ids = getAgentTargets().map((agent) => agent.id);
    expect(ids).toContain("universal");
    expect(ids).toContain("universal-xdg");
    expect(getAgentTargets()).toHaveLength(65);
    // eve (no global dir, upstream forces direct writes) and promptscript (project-only)
    // cannot participate in global symlink fan-out
    expect(ids).not.toContain("eve");
    expect(ids).not.toContain("promptscript");
    expect(detectInstalledAgents()).toEqual([]);

    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".qoder"), { recursive: true });
    expect(detectInstalledAgents().map((a) => a.id)).toEqual(["claude-code", "qoder"]);

    // Cline config dir exists → hits the universal pseudo-agent
    mkdirSync(join(home, ".cline"), { recursive: true });
    expect(detectInstalledAgents().map((a) => a.id)).toEqual(["universal", "claude-code", "qoder"]);
  });
});

test("agents: expanded registry detects per-agent config dirs", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".roo"), { recursive: true });
    mkdirSync(join(home, ".trae"), { recursive: true });
    mkdirSync(join(home, ".gemini"), { recursive: true });
    mkdirSync(join(home, ".codeium", "windsurf"), { recursive: true });
    mkdirSync(join(home, ".snowflake", "cortex"), { recursive: true });

    const detected = detectInstalledAgents().map((agent) => agent.id);
    expect(detected).toEqual(["cortex", "gemini-cli", "roo", "trae", "windsurf"]);

    // skills dirs follow each agent's own convention
    const targets = getAgentTargets();
    expect(targets.find((agent) => agent.id === "windsurf")?.skillsDir).toBe(
      join(home, ".codeium", "windsurf", "skills"),
    );
    expect(targets.find((agent) => agent.id === "cortex")?.skillsDir).toBe(
      join(home, ".snowflake", "cortex", "skills"),
    );
  });
});

test("agents: shared-dir agents (Warp/Zed/Kimi/…) light up the universal target", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".warp"), { recursive: true });
    mkdirSync(join(home, ".config", "zed"), { recursive: true });

    const detected = detectInstalledAgents();
    expect(detected.map((agent) => agent.id)).toEqual(["universal"]);
    expect(detected[0].skillsDir).toBe(join(home, ".agents", "skills"));

    seedCanonicalSkill("demo");
    linkSkillToAgents("demo");
    expect(lstatSync(join(home, ".agents", "skills", "demo")).isSymbolicLink()).toBe(true);
    // No per-agent dirs were invented for shared-dir agents
    expect(existsSync(join(home, ".warp", "skills"))).toBe(false);
  });
});

test("agents: Replit project marker in cwd lights up universal-xdg", async () => {
  await inFakeHome(async (home) => {
    const previousCwd = process.cwd();
    process.chdir(home);
    try {
      expect(detectInstalledAgents()).toEqual([]);
      mkdirSync(join(home, ".replit"), { recursive: true });
      const detected = detectInstalledAgents();
      expect(detected.map((agent) => agent.id)).toEqual(["universal-xdg"]);
      expect(detected[0].skillsDir).toBe(join(home, ".config", "agents", "skills"));
    } finally {
      process.chdir(previousCwd);
    }
  });
});

test("agents: OpenClaw historical alias dirs are detected and link into the existing home", async () => {
  await inFakeHome(async (home) => {
    // Only the legacy .clawdbot home exists → links must land there, not in .openclaw
    mkdirSync(join(home, ".clawdbot"), { recursive: true });
    const openclaw = detectInstalledAgents().find((agent) => agent.id === "openclaw");
    expect(openclaw?.skillsDir).toBe(join(home, ".clawdbot", "skills"));

    seedCanonicalSkill("demo");
    linkSkillToAgents("demo");
    expect(lstatSync(join(home, ".clawdbot", "skills", "demo")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(home, ".openclaw"))).toBe(false);
  });
});

test("agents: VIBE_HOME/HERMES_HOME/AUTOHAND_HOME/GROK_HOME relocate their agents", async () => {
  await inFakeHome(async (home) => {
    const customDirs = {
      "mistral-vibe": join(home, "custom-vibe"),
      hermes: join(home, "custom-hermes"),
      "autohand-code": join(home, "custom-autohand"),
      grok: join(home, "custom-grok"),
    };
    process.env.VIBE_HOME = customDirs["mistral-vibe"];
    process.env.HERMES_HOME = customDirs.hermes;
    process.env.AUTOHAND_HOME = customDirs["autohand-code"];
    process.env.GROK_HOME = customDirs.grok;
    for (const dir of Object.values(customDirs)) {
      mkdirSync(dir, { recursive: true });
    }

    const targets = getAgentTargets();
    for (const [id, baseDir] of Object.entries(customDirs)) {
      const target = targets.find((agent) => agent.id === id);
      expect(target?.skillsDir).toBe(join(baseDir, "skills"));
      expect(detectInstalledAgents().map((agent) => agent.id)).toContain(id);
    }
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

test("agents: official config-dir env vars relocate detection and fan-out", async () => {
  await inFakeHome(async (home) => {
    const customClaude = join(home, "relocated-claude");
    const customCodex = join(home, "relocated-codex");
    mkdirSync(customClaude, { recursive: true });
    mkdirSync(customCodex, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = customClaude;
    process.env.CODEX_HOME = customCodex;

    const targets = getAgentTargets();
    const claude = targets.find((agent) => agent.id === "claude-code");
    const codex = targets.find((agent) => agent.id === "codex");
    expect(claude?.skillsDir).toBe(join(customClaude, "skills"));
    expect(codex?.detectDirs).toEqual([customCodex, "/etc/codex"]);

    // Detected via the relocated dirs even though default ~/.claude and ~/.codex are absent
    const detected = detectInstalledAgents().map((agent) => agent.id);
    expect(detected).toContain("claude-code");
    expect(detected).toContain("codex");
    expect(existsSync(join(home, ".claude"))).toBe(false);

    // Fan-out lands in the relocated config dir, not the default location
    seedCanonicalSkill("demo");
    const results = linkSkillToAgents("demo");
    const claudeLink = results.find((link) => link.agent === "claude-code");
    expect(claudeLink?.path).toBe(join(customClaude, "skills", "demo"));
    expect(lstatSync(claudeLink!.path).isSymbolicLink()).toBe(true);
  });
});

test("agents: Amp-style XDG config dir lights up the universal-xdg shared target", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".config", "amp"), { recursive: true });
    const xdg = detectInstalledAgents().find((agent) => agent.id === "universal-xdg");
    expect(xdg?.skillsDir).toBe(join(home, ".config", "agents", "skills"));

    seedCanonicalSkill("demo");
    linkSkillToAgents("demo");
    const sharedLink = join(home, ".config", "agents", "skills", "demo");
    expect(lstatSync(sharedLink).isSymbolicLink()).toBe(true);
  });
});

test("agents: recorded copy-fallback artifact is replaced; unrecorded dir stays skipped", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const canonical = seedCanonicalSkill("demo");
    const copyPath = join(home, ".claude", "skills", "demo");

    // Simulate a previous install that fell back to copy (no symlink permission, e.g. Windows)
    mkdirSync(copyPath, { recursive: true });
    writeFileSync(join(copyPath, "SKILL.md"), "stale copy");

    // Without a lock record the dir is foreign → skipped, content untouched
    const unrecorded = linkSkillToAgents("demo");
    expect(unrecorded[0].mode).toBe("skipped");
    expect(readFileSync(join(copyPath, "SKILL.md"), "utf-8")).toBe("stale copy");

    // With the recorded link the artifact is rebuilt and points at canonical again
    const recorded = linkSkillToAgents("demo", detectInstalledAgents(), [copyPath]);
    expect(recorded[0]).toMatchObject({ agent: "claude-code", mode: "symlink" });
    expect(lstatSync(copyPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(copyPath)).toBe(canonical);

    // Subsequent runs keep refreshing through the rebuilt link
    writeFileSync(join(canonical, "SKILL.md"), "---\nname: x\ndescription: y\n---\nv2\n");
    const refreshed = linkSkillToAgents("demo", detectInstalledAgents(), [copyPath]);
    expect(refreshed[0].mode).toBe("symlink");
    expect(readFileSync(join(copyPath, "SKILL.md"), "utf-8")).toContain("v2");
  });
});

test("agents: recorded plain file (not a copy dir) is never replaced", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    seedCanonicalSkill("demo");
    const filePath = join(home, ".claude", "skills", "demo");
    writeFileSync(filePath, "user file");

    // Even when (erroneously) recorded, a non-directory never qualifies as a copy artifact
    const results = linkSkillToAgents("demo", detectInstalledAgents(), [filePath]);
    expect(results[0].mode).toBe("skipped");
    expect(readFileSync(filePath, "utf-8")).toBe("user file");
  });
});

test("agents: unlink removes recorded copy-fallback directories", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    seedCanonicalSkill("demo");
    const copyPath = join(home, ".claude", "skills", "demo");
    mkdirSync(copyPath, { recursive: true });
    writeFileSync(join(copyPath, "SKILL.md"), "copy");

    const removed = unlinkSkillFromAgents("demo", [copyPath]);
    expect(removed).toEqual([copyPath]);
    expect(existsSync(copyPath)).toBe(false);
  });
});

test("fanout: recorded path of an unvisited agent stays in the ledger", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    seedCanonicalSkill("demo");
    // Simulate a copy artifact left by an agent that is no longer detected (e.g. uninstalled
    // Qoder): its recorded path must survive the merge so bl skill remove can still reclaim it
    const orphanPath = join(home, ".qoder", "skills", "demo");

    const fanout = fanOutSkillToAgents("demo", detectInstalledAgents(), [orphanPath]);

    expect(fanout.linkedAgents).toEqual(["claude-code"]);
    const claudeLink = join(home, ".claude", "skills", "demo");
    expect(fanout.links).toContain(claudeLink);
    expect(fanout.links).toContain(orphanPath);
  });
});

test("fanout: recorded path confirmed foreign this run is dropped from the ledger", async () => {
  await inFakeHome(async (home) => {
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    seedCanonicalSkill("demo");
    // User replaced our artifact with their own plain file → scanned, skipped as unmanaged;
    // keeping the record would let bl skill remove delete user content
    const foreignPath = join(home, ".claude", "skills", "demo");
    writeFileSync(foreignPath, "user file");

    const fanout = fanOutSkillToAgents("demo", detectInstalledAgents(), [foreignPath]);

    expect(fanout.linkedAgents).toEqual([]);
    expect(fanout.links).not.toContain(foreignPath);
    expect(readFileSync(foreignPath, "utf-8")).toBe("user file");
  });
});
