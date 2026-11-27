import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateSkillDir } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { parse } from "yaml";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const opdSkillDirectory = join(repositoryRoot, "skills/bailian-opd");
const scriptsDirectory = join(opdSkillDirectory, "scripts");
const assetsDirectory = join(opdSkillDirectory, "assets");

function readAsset(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(assetsDirectory, name), "utf8")) as Record<string, unknown>;
}

test("OPD is a valid standalone skill aligned with the CLI version", () => {
  const metadata = validateSkillDir(opdSkillDirectory, "bailian-opd");
  expect(metadata.name).toBe("bailian-opd");

  const skillMarkdown = readFileSync(join(opdSkillDirectory, "SKILL.md"), "utf8");
  const frontmatter = parse(skillMarkdown.split(/^---\s*$/m)[1]) as {
    metadata: { version: string; requires?: { bins?: string[] } };
  };
  const cliPackage = JSON.parse(
    readFileSync(join(repositoryRoot, "packages/cli/package.json"), "utf8"),
  ) as { version: string };
  expect(frontmatter.metadata.version).toBe(cliPackage.version);
  expect(frontmatter.metadata.requires?.bins).toEqual(["bl", "node"]);

  for (const document of ["SKILL.md", "README.md", "README.zh.md"]) {
    const text = readFileSync(join(opdSkillDirectory, document), "utf8");
    for (const link of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = link[1].split("#")[0];
      if (/^https?:/.test(target)) continue;
      expect(existsSync(join(opdSkillDirectory, target)), `${document} → ${target}`).toBe(true);
    }
  }
});

// Syntax check of the shipped .mjs assets runs in a child process because
// `node --check` is the only parser that validates them as Node ESM without
// executing their top-level gates.
test("OPD scripts pass node --check", () => {
  const scripts = readdirSync(scriptsDirectory).filter((name) => name.endsWith(".mjs"));
  expect(scripts.sort()).toEqual([
    "lib.mjs",
    "opd-preflight.mjs",
    "opd-submit.mjs",
    "opd-wait.mjs",
  ]);
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ["--check", join(scriptsDirectory, script)], {
      encoding: "utf8",
    });
    expect(result.status, `${script}: ${result.stderr}`).toBe(0);
  }
});

test("OPD baselines match the verified request snapshots", () => {
  const flashHyper = readAsset("baseline-9b-from-flash.hyper_parameters.json");
  const fixtureHyper = JSON.parse(
    readFileSync(
      join(repositoryRoot, "packages/commands/tests/e2e/fixtures/opd-hyper-parameters.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  expect(Object.keys(flashHyper).sort()).toEqual(Object.keys(fixtureHyper).sort());
  for (const key of Object.keys(fixtureHyper)) {
    const expected = fixtureHyper[key];
    const actual = flashHyper[key];
    const bothNumeric =
      expected !== "" &&
      actual !== "" &&
      Number.isFinite(Number(expected)) &&
      Number.isFinite(Number(actual));
    if (bothNumeric) {
      expect(Number(actual), key).toBe(Number(expected));
    } else {
      expect(actual, key).toEqual(expected);
    }
  }

  const explicitHyper = readAsset("baseline-9b-from-397b.hyper_parameters.json");
  expect(Object.keys(explicitHyper)).toHaveLength(29);
  const teacherKeys = Object.keys(explicitHyper).filter((key) => key.startsWith("opd_teacher_"));
  expect(teacherKeys.sort()).toEqual(
    [
      "opd_teacher_gpu_memory_utilization",
      "opd_teacher_infer_tp",
      "opd_teacher_max_model_len",
      "opd_teacher_max_num_batched_tokens",
      "opd_teacher_max_num_seqs",
      "opd_teacher_n_gpus_per_node",
      "opd_teacher_nnodes",
      "opd_teacher_num_replicas",
    ].sort(),
  );
  expect(explicitHyper.opd_teacher_infer_tp).toBe(explicitHyper.opd_teacher_n_gpus_per_node);

  for (const [name, capacity] of [
    ["baseline-9b-from-flash.resource_config.json", 16],
    ["baseline-9b-from-397b.resource_config.json", 24],
  ] as const) {
    const resource = readAsset(name);
    expect(resource).toEqual({
      charge_type: "mtu_postpaid",
      mtu_spec_code: "MTU4",
      mtu_capacity: capacity,
    });
  }
});

test("OPD capacity formulas reproduce the baseline sizing", async () => {
  const lib = (await import(pathToFileURL(join(scriptsDirectory, "lib.mjs")).href)) as {
    computeCapacity: (hyperParameters: Record<string, unknown>) => {
      complete: boolean;
      studentExternal?: number;
      studentInternal?: number;
      teacherGpus?: number;
      totalExternal?: number;
      totalInternal?: number;
    };
  };

  // Flash baseline: external teacher, teacher fields omitted (server defaults).
  // Student external = (1 + 1) * 4 = 8; Flash teacher occupies 8 GPUs → 16.
  const flash = lib.computeCapacity(readAsset("baseline-9b-from-flash.hyper_parameters.json"));
  expect(flash.studentExternal).toBe(8);
  expect(flash.studentInternal).toBe(6);
  expect(flash.complete).toBe(false);
  const flashResource = readAsset("baseline-9b-from-flash.resource_config.json");
  expect((flash.studentExternal as number) + 8).toBe(flashResource.mtu_capacity);

  // 397B baseline: all teacher fields explicit → fully computable.
  // Internal student = 1*8 + 1*8 = 16; teacher = 1*1*8 = 8 → 24.
  const explicit = lib.computeCapacity(readAsset("baseline-9b-from-397b.hyper_parameters.json"));
  expect(explicit.complete).toBe(true);
  expect(explicit.studentInternal).toBe(16);
  expect(explicit.teacherGpus).toBe(8);
  expect(explicit.totalInternal).toBe(24);
  const explicitResource = readAsset("baseline-9b-from-397b.resource_config.json");
  expect(explicit.totalInternal).toBe(explicitResource.mtu_capacity);
});

test("OPD batch-fit helpers mirror the CLI zero-step gate", async () => {
  const lib = (await import(pathToFileURL(join(scriptsDirectory, "lib.mjs")).href)) as {
    computeBatchFit: (
      hyperParameters: Record<string, unknown>,
      recordCount?: number,
    ) => { steps?: number; requiredSamples?: number };
    miniBatchLimit: (
      hyperParameters: Record<string, unknown>,
    ) => { miniBatchSize: number; limit: number } | undefined;
  };
  expect(lib.computeBatchFit({ batch_size: 64, n_epochs: 1 }, 12)).toMatchObject({
    steps: 0,
    requiredSamples: 64,
  });
  expect(lib.computeBatchFit({ batch_size: 64, n_epochs: 1 }, 96).steps).toBe(1);
  expect(lib.computeBatchFit({ batch_size: 64, n_epochs: 3 }, 22)).toMatchObject({
    steps: 1,
    requiredSamples: 22,
  });
  expect(lib.computeBatchFit({ batch_size: 64 }, 96).steps).toBeUndefined();
  expect(lib.computeBatchFit({ batch_size: 64, n_epochs: 1 }).steps).toBeUndefined();
  expect(lib.miniBatchLimit({ ppo_mini_batch_size: 16, batch_size: 64, n_rollouts: 4 })).toEqual({
    miniBatchSize: 16,
    limit: 256,
  });
  expect(lib.miniBatchLimit({ ppo_mini_batch_size: 16 })).toBeUndefined();

  const preflightSource = readFileSync(join(scriptsDirectory, "opd-preflight.mjs"), "utf8");
  expect(preflightSource).toContain('addStage("batch-fit"');
});

test("OPD skill ships no real IDs, credentials, or internal references", () => {
  const files = [
    "SKILL.md",
    "README.md",
    "README.zh.md",
    ...readdirSync(scriptsDirectory).map((name) => join("scripts", name)),
    ...readdirSync(assetsDirectory).map((name) => join("assets", name)),
  ];
  const forbidden = [
    /\b(?:file|ft|ws)-[0-9a-f]{10,}/i,
    /sk-[A-Za-z0-9]{16,}/,
    /model-opd-bl-cli-handoff|opd-handoff|Desktop\//,
    /alibaba-inc\.com|aliyun-inc\.com/,
  ];
  for (const file of files) {
    const text = readFileSync(join(opdSkillDirectory, file), "utf8");
    for (const pattern of forbidden) {
      expect(pattern.test(text), `${file} matches ${pattern}`).toBe(false);
    }
  }
});

test("OPD consent and read-only gates are enforced in the shipped sources", () => {
  const skillMarkdown = readFileSync(join(opdSkillDirectory, "SKILL.md"), "utf8");
  expect(skillMarkdown).toContain("../bailian-protocol/SKILL.md");
  expect(skillMarkdown).toContain("Never add `--yes` or `--confirmed` automatically.");

  const submitSource = readFileSync(join(scriptsDirectory, "opd-submit.mjs"), "utf8");
  const consentGate = submitSource.indexOf("if (!flags.confirmed)");
  const firstSpawn = submitSource.indexOf("runBl(");
  expect(consentGate).toBeGreaterThan(-1);
  expect(firstSpawn).toBeGreaterThan(consentGate);
  expect(submitSource).toContain("usageError(");

  const preflightSource = readFileSync(join(scriptsDirectory, "opd-preflight.mjs"), "utf8");
  expect(preflightSource).toContain('"authorize", "--yes"');
  expect(preflightSource).not.toMatch(/runBl\(\s*\[[^\]]*--authorize/);

  const waitSource = readFileSync(join(scriptsDirectory, "opd-wait.mjs"), "utf8");
  expect(waitSource).toContain("export function waitForJob");
  expect(waitSource).not.toContain('"--follow"');
  expect(waitSource).toContain("realpathSync(process.argv[1])");
});

// runBl spawns a real child process: the fake bl entry exercises the spawn /
// env / stdout-parse boundary that unit-level JSON parsing cannot cover.
test("OPD runBl parses pretty-printed and line-based bl JSON contracts", async () => {
  const lib = (await import(pathToFileURL(join(scriptsDirectory, "lib.mjs")).href)) as {
    runBl: (
      args: string[],
      options?: { callerName?: string },
    ) => {
      exitCode: number;
      json?: Record<string, unknown>;
      warnings: { code: string }[];
      error?: { message: string };
    };
  };
  const previousEntry = process.env.BAILIAN_BL_ENTRY;
  process.env.BAILIAN_BL_ENTRY = join(
    repositoryRoot,
    "packages/cli/tests/fixtures/opd-fake-bl.mjs",
  );
  try {
    const pretty = lib.runBl(["pretty"], { callerName: "test" });
    expect(pretty.exitCode).toBe(0);
    expect(pretty.json).toEqual({ output: { job_id: "job-1", status: "PENDING" } });

    const warned = lib.runBl(["warn"], { callerName: "test" });
    expect(warned.exitCode).toBe(0);
    expect(warned.json).toEqual({ ok: true });
    expect(warned.warnings.map((warning) => warning.code)).toEqual(["OPD_PAIR_NOT_PUBLISHED"]);

    const mixed = lib.runBl(["mixed"], { callerName: "test" });
    expect(mixed.json).toEqual({ file_id: "file-1" });

    const failed = lib.runBl(["error"], { callerName: "test" });
    expect(failed.exitCode).toBe(1);
    expect(failed.error?.message).toBe("boom");
  } finally {
    if (previousEntry === undefined) delete process.env.BAILIAN_BL_ENTRY;
    else process.env.BAILIAN_BL_ENTRY = previousEntry;
  }
});
