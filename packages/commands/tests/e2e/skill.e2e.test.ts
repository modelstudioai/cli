import { existsSync, mkdtempSync } from "node:fs";
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

// Local-only cases: auth "none" + validation happens before any network access, no gating needed
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
