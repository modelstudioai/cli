import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isBailianE2EEnabled, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { SKILL_ROUTES } from "./topic-routes.ts";

/** Canonical always-published skill; also the backbone of advisor wiki sync */
const WIKI_SKILL = "bailian-docs-llm-wiki";

/** Redirect ~/.bailian into a throwaway dir so lock/skill writes never touch the real user config */
function makeTempConfigDir(): string {
  return mkdtempSync(join(tmpdir(), "bl-skill-e2e-"));
}

/** 在隔离 configDir 里种一个假 skill + lock，供 remove --dry-run 本地断言 */
function seedInstalledSkill(configDir: string, skillName: string, links: string[]): void {
  const skillDir = join(configDir, "skills", skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: seeded\n---\n");
  writeFileSync(
    join(configDir, "skills", "skill-lock.json"),
    `${JSON.stringify(
      {
        version: 1,
        skills: {
          [skillName]: {
            contentHash: "sha256:seeded-for-dry-run",
            installedAt: new Date().toISOString(),
            sourceType: "oss",
            links,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

describe("e2e: skill", () => {
  test("skill add --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(SKILL_ROUTES, ["skill", "add", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--all/);
    expect(stderr).toMatch(/--name/);
  });

  test("skill update --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(SKILL_ROUTES, ["skill", "update", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--all/);
    expect(stderr).toMatch(/--name/);
  });

  test("skill remove --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(SKILL_ROUTES, ["skill", "remove", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--name/);
  });

  test("skill list --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(SKILL_ROUTES, ["skill", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/list|registry/i);
  });

  test("skill init --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(SKILL_ROUTES, ["skill", "init", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/bailian/i);
  });
});

// Local-only cases: auth "none" + validation / remove dry-run need no registry
describe("e2e: skill (local, no credentials)", () => {
  test("skill add without --all or --name errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SKILL_ROUTES, [
      "skill",
      "add",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--all|--name|Usage:/i);
  });

  test("skill add with both --all and --name errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SKILL_ROUTES, [
      "skill",
      "add",
      "--all",
      "--name",
      "spark-video",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--all|--name|either/i);
  });

  test("skill remove without --name errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SKILL_ROUTES, [
      "skill",
      "remove",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--name|Usage:/i);
  });

  test("skill remove of a not-installed skill fails with reason (1)", async () => {
    const configDir = makeTempConfigDir();
    const { stdout, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "remove", "--name", "definitely-not-installed", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir },
    );
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      skills?: Array<{ name?: string; status?: string; reason?: string }>;
    }>(stdout);
    expect(data.skills?.[0]?.status).toBe("failed");
    expect(data.skills?.[0]?.reason).toMatch(/not installed/i);
  });

  test("skill remove --dry-run 未安装时退出码与真实一致 (1)", async () => {
    const configDir = makeTempConfigDir();
    const { stdout, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "remove", "--name", "definitely-not-installed", "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir },
    );
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      action?: string;
      skills?: Array<{ name?: string; status?: string; reason?: string }>;
    }>(stdout);
    expect(data.action).toBe("skill.remove");
    expect(data.skills?.[0]?.status).toBe("failed");
    expect(data.skills?.[0]?.reason).toMatch(/not installed/i);
  });

  test("skill remove --dry-run 仅输出计划且不删盘", async () => {
    const configDir = makeTempConfigDir();
    const fakeHome = makeTempConfigDir();
    const recordedLink = join(fakeHome, ".claude", "skills", "seeded-skill");
    const historicalLink = join(fakeHome, ".agents", "skills", "seeded-skill");
    seedInstalledSkill(configDir, "seeded-skill", [recordedLink]);
    mkdirSync(join(fakeHome, ".claude", "skills"), { recursive: true });
    mkdirSync(join(fakeHome, ".agents", "skills"), { recursive: true });
    // recorded：普通占位文件；historical：指向 canonical 的托管 symlink（不在 lock 里）
    writeFileSync(recordedLink, "link-placeholder");
    symlinkSync(join(configDir, "skills", "seeded-skill"), historicalLink, "dir");

    const { stdout, stderr, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "remove", "--name", "seeded-skill", "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      skills?: Array<{
        name?: string;
        status?: string;
        canonical?: string;
        links?: string[];
      }>;
    }>(stdout);
    expect(data.action).toBe("skill.remove");
    expect(data.skills?.[0]?.status).toBe("remove");
    expect(data.skills?.[0]?.name).toBe("seeded-skill");
    expect(data.skills?.[0]?.canonical).toBe(join(configDir, "skills", "seeded-skill"));
    expect(data.skills?.[0]?.links?.sort()).toEqual([recordedLink, historicalLink].sort());
    expect(existsSync(join(configDir, "skills", "seeded-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(configDir, "skills", "skill-lock.json"))).toBe(true);
    expect(existsSync(recordedLink)).toBe(true);
    expect(existsSync(historicalLink)).toBe(true);
  });

  test("skill update --dry-run 未安装时退出码与真实一致 (1)", async () => {
    const configDir = makeTempConfigDir();
    const fakeHome = makeTempConfigDir();
    const { stdout, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "update", "--name", "definitely-not-installed", "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome },
    );
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      action?: string;
      skills?: Array<{ name?: string; status?: string; reason?: string }>;
    }>(stdout);
    expect(data.action).toBe("skill.update");
    expect(data.skills?.[0]?.status).toBe("failed");
    expect(data.skills?.[0]?.reason).toMatch(/not installed/i);
  }, 60_000);
});

describe.skipIf(!isBailianE2EEnabled())("e2e: skill (real registry)", () => {
  test("skill list --output json returns registry and status rows", async () => {
    const configDir = makeTempConfigDir();
    const { stdout, stderr, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "list", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      registry?: string;
      skills?: Array<{ name?: string; status?: string }>;
    }>(stdout);
    expect(data.registry).toMatch(/^https?:\/\//);
    expect(Array.isArray(data.skills)).toBe(true);
  }, 60_000);

  test("skill add --dry-run 输出路径计划且不写盘", async () => {
    const configDir = makeTempConfigDir();
    const fakeHome = makeTempConfigDir();
    // 造一个可检测的 agent 目录，便于断言 skillsDir / link path
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });

    const { stdout, stderr, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "add", "--name", WIKI_SKILL, "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      agents?: Array<{ id?: string; skillsDir?: string }>;
      skills?: Array<{
        name?: string;
        status?: string;
        links?: Array<{
          path?: string;
          exists?: boolean;
          kind?: string;
          hasSkillMd?: boolean;
        }>;
      }>;
    }>(stdout);
    expect(data.action).toBe("skill.add");
    expect(data.skills?.[0]?.name).toBe(WIKI_SKILL);
    expect(data.skills?.[0]?.status).toBe("install");
    expect(data.agents?.some((agent) => agent.id === "claude-code")).toBe(true);
    const wikiLinks = data.skills?.[0]?.links ?? [];
    expect(wikiLinks.length).toBeGreaterThan(0);
    expect(wikiLinks.every((link) => typeof link.path === "string")).toBe(true);
    expect(wikiLinks.every((link) => typeof link.exists === "boolean")).toBe(true);
    expect(existsSync(join(configDir, "skills", WIKI_SKILL))).toBe(false);
    expect(existsSync(join(configDir, "skills", "skill-lock.json"))).toBe(false);
  }, 60_000);

  test("skill add --dry-run 对不存在的 skill 退出码与真实一致 (1)", async () => {
    const configDir = makeTempConfigDir();
    const fakeHome = makeTempConfigDir();
    const { stdout, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "add", "--name", "definitely-not-in-registry", "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome },
    );
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      action?: string;
      skills?: Array<{ name?: string; status?: string; reason?: string }>;
    }>(stdout);
    expect(data.action).toBe("skill.add");
    expect(data.skills?.[0]?.status).toBe("failed");
    expect(data.skills?.[0]?.reason).toMatch(/not found/i);
  }, 60_000);

  test("skill init --dry-run 输出路径计划且不写盘", async () => {
    const configDir = makeTempConfigDir();
    const fakeHome = makeTempConfigDir();
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });

    const { stdout, stderr, exitCode } = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "init", "--dry-run", "--output", "json"],
      { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      agents?: Array<{ id?: string; skillsDir?: string }>;
      skills?: Array<{
        name?: string;
        links?: Array<{ path?: string; exists?: boolean }>;
      }>;
    }>(stdout);
    expect(data.action).toBe("skill.init");
    expect(data.skills?.some((skill) => skill.name?.startsWith("bailian-"))).toBe(true);
    expect(data.agents?.some((agent) => typeof agent.skillsDir === "string")).toBe(true);
    const firstLinks = data.skills?.[0]?.links ?? [];
    expect(firstLinks.length).toBeGreaterThan(0);
    expect(existsSync(join(configDir, "skills"))).toBe(false);
  }, 60_000);

  test("skill add + remove full lifecycle in isolated dirs", async () => {
    const configDir = makeTempConfigDir();
    // Empty fake home → no agents detected → fan-out never leaves the sandbox
    const fakeHome = makeTempConfigDir();
    const env = { BAILIAN_CONFIG_DIR: configDir, HOME: fakeHome, USERPROFILE: fakeHome };

    const added = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "add", "--name", WIKI_SKILL, "--output", "json"],
      env,
    );
    expect(added.exitCode, added.stderr).toBe(0);
    const addData = parseStdoutJson<{ skills?: Array<{ name?: string; status?: string }> }>(
      added.stdout,
    );
    expect(addData.skills?.[0]?.status).toBe("installed");
    expect(existsSync(join(configDir, "skills", WIKI_SKILL, "SKILL.md"))).toBe(true);

    const removed = await runCommandE2e(
      SKILL_ROUTES,
      ["skill", "remove", "--name", WIKI_SKILL, "--output", "json"],
      env,
    );
    expect(removed.exitCode, removed.stderr).toBe(0);
    const removeData = parseStdoutJson<{ skills?: Array<{ name?: string; status?: string }> }>(
      removed.stdout,
    );
    expect(removeData.skills?.[0]?.status).toBe("removed");
    expect(existsSync(join(configDir, "skills", WIKI_SKILL))).toBe(false);
  }, 300_000);
});
