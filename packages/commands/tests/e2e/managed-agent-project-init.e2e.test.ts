import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandHelp } from "./helpers.ts";

const routes = {
  "managed-agent project init": "managedAgentProjectInit",
  "managed-agent project build": "managedAgentProjectBuild",
  "managed-agent project publish": "managedAgentProjectPublish",
  "managed-agent project validate": "managedAgentProjectValidate",
} as const;
const directories: string[] = [];

async function temporaryDirectory() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "bailian-project-init-")));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

function runInit(directory: string, args: string[] = []) {
  return runProject(directory, "init", args);
}

async function runProject(directory: string, subcommand: string, args: string[] = [], json = true) {
  const configRoot = await temporaryDirectory();
  return runNodeMain(
    fileURLToPath(new URL("./harness/main.ts", import.meta.url)),
    ["managed-agent", "project", subcommand, ...args, ...(json ? ["--output", "json"] : [])],
    {
      cwd: directory,
      env: {
        BAILIAN_CONFIG_DIR: configRoot,
        BAILIAN_E2E_ROUTES: JSON.stringify(
          Object.entries(routes).map(([path, exportName]) => ({ path, export: exportName })),
        ),
      },
    },
  );
}

describe("e2e: managed-agent project init directory defaults", () => {
  test("build links copied resources and reports ambiguous environment bindings without writing", async () => {
    const directory = await temporaryDirectory();
    const initialized = await runInit(directory);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    const root = join(directory, "managed-agent");
    for (const [section, id] of [
      ["skills", "example-skill"],
      ["files", "example-file"],
      ["environments", "example-env"],
      ["vaults", "example-vault"],
    ] as const) {
      await cp(
        join(root, "agents/assistant", section, "_examples", id),
        join(root, "agents/assistant", section, id),
        { recursive: true },
      );
    }
    const agentPath = join(root, "agents/assistant/agent.json");
    const original = await readFile(agentPath, "utf8");
    const preview = await runProject(root, "build", ["--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(parseStdoutJson<{ can_build: boolean }>(preview.stdout).can_build).toBe(true);
    expect(await readFile(agentPath, "utf8")).toBe(original);
    const built = await runProject(root, "build");
    expect(built.exitCode, built.stderr).toBe(0);
    const agent = JSON.parse(await readFile(agentPath, "utf8"));
    expect(agent).toMatchObject({
      environment: "example-env",
      vault: "example-vault",
      skills: ["example-skill"],
      files: [{ file: "example-file", mount_path: "/mnt/example.md" }],
    });
    const alternatePath = join(root, "agents/assistant/environments/alternate");
    await mkdir(alternatePath);
    await writeFile(
      join(alternatePath, "environment.json"),
      JSON.stringify({ id: "alternate", config: { type: "cloud" } }),
    );
    delete agent.environment;
    await writeFile(agentPath, JSON.stringify(agent));
    const beforeConflict = await readFile(agentPath, "utf8");
    const buildPath = join(root, ".openagentpack/build/agents.yaml");
    const beforeBuild = await readFile(buildPath, "utf8");
    for (const json of [false, true]) {
      const conflict = await runProject(root, "build", [], json);
      expect(conflict.exitCode).toBe(1);
      expect(conflict.stderr).toContain("multiple local environment resources");
      expect(conflict.stderr).toContain("Set 'environment' explicitly");
      expect(conflict.stderr).not.toMatch(/\p{Script=Han}/u);
    }
    expect(await readFile(agentPath, "utf8")).toBe(beforeConflict);
    expect(await readFile(buildPath, "utf8")).toBe(beforeBuild);
  });

  test("build checks directories and writes without confirmation while publish stays gated", async () => {
    const directory = await temporaryDirectory();
    const initialized = await runInit(directory);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    const root = join(directory, "managed-agent");
    const nested = join(root, "agents/assistant/skills");
    for (const args of [[], ["--dry-run"]]) {
      const result = await runProject(nested, "build", args, false);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("Not a project root:");
      expect(result.stderr).not.toMatch(/\p{Script=Han}/u);
      expect(result.stderr).toContain(`cd '${root}'`);
      expect(result.stderr).not.toContain("high-risk");
      expect(result.stderr).not.toContain("Usage:");
    }
    const explicit = await runProject(root, "build", ["--project", nested]);
    expect(explicit.exitCode).toBe(2);
    expect(explicit.stderr).toContain(`--project '${root}'`);
    const noMarker = await runProject(directory, "build", [], false);
    expect(noMarker.exitCode).toBe(2);
    expect(noMarker.stderr).toContain("project.json");
    expect(noMarker.stderr).not.toMatch(/\p{Script=Han}/u);
    expect(noMarker.stderr).not.toContain("high-risk");
    expect(await stat(join(nested, ".openagentpack")).catch(() => null)).toBeNull();

    const preview = await runProject(root, "build", ["--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(await stat(join(root, ".openagentpack/build")).catch(() => null)).toBeNull();
    const built = await runProject(root, "build");
    expect(built.exitCode, built.stderr).toBe(0);
    expect(built.stderr).not.toContain("requires_confirmation");
    expect((await stat(join(root, ".openagentpack/build/agents.yaml"))).isFile()).toBe(true);
    const explicitValid = await runProject(nested, "build", ["--project", root]);
    expect(explicitValid.exitCode, explicitValid.stderr).toBe(0);
    const storePath = join(root, ".openagentpack/versions/project/store.json");
    const beforePublish = await readFile(storePath, "utf8");
    const publish = await runProject(root, "publish");
    expect(publish.exitCode).toBe(7);
    expect(publish.stderr).toContain("requires_confirmation");
    expect(await readFile(storePath, "utf8")).toBe(beforePublish);
  });

  test("only publish help includes confirmation; build keeps dry-run", async () => {
    const build = await runCommandHelp(routes, ["managed-agent", "project", "build", "--help"]);
    expect(build.stderr).not.toContain("--yes");
    expect(build.stderr).toContain("--dry-run");
    const publish = await runCommandHelp(routes, ["managed-agent", "project", "publish", "--help"]);
    expect(publish.stderr).toContain("--yes");
    const directory = await temporaryDirectory();
    const removedFlag = await runProject(directory, "build", ["--yes"]);
    expect(removedFlag.exitCode).toBe(2);
    expect(removedFlag.stderr).toMatch(/Unknown flag.*--yes/);
  });

  test("nested build and validate explain the project root without changing directories", async () => {
    const directory = await temporaryDirectory();
    const initialized = await runInit(directory);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    const root = join(directory, "managed-agent");
    const nested = join(root, "agents/assistant/skills");
    for (const command of ["build", "validate"]) {
      const result = await runProject(nested, command, ["--dry-run"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Not a project root:");
      expect(result.stderr).not.toMatch(/\p{Script=Han}/u);
      expect(result.stderr).toContain(`cd '${root}'`);
      expect(result.stderr).toContain(`--project '${root}'`);
      expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    }
    expect(await stat(join(nested, ".openagentpack")).catch(() => null)).toBeNull();
    const corrected = await runProject(nested, "build", ["--project", root, "--dry-run"]);
    expect(corrected.exitCode, corrected.stderr).toBe(0);
  });

  test("help describes the subdirectory default and explicit in-place initialization", async () => {
    const result = await runCommandHelp(routes, ["managed-agent", "project", "init", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("./managed-agent");
    expect(result.stderr).toContain("--project .");
  });

  test("default dry-run reports the child directory without creating it", async () => {
    const directory = await temporaryDirectory();
    const result = await runInit(directory, ["--dry-run"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toEqual({ would_initialize_project: "./managed-agent" });
    expect(await stat(join(directory, "managed-agent")).catch(() => null)).toBeNull();
  });

  test("initializes only the child, ignores parent source, and rejects repeated init without overwriting", async () => {
    const directory = await temporaryDirectory();
    const parentYaml = "not a valid project declaration";
    await writeFile(join(directory, "agents.yaml"), parentYaml);
    if (process.platform !== "win32") {
      await symlink("missing-instructions.md", join(directory, "CLAUDE.md"));
    }
    const result = await runInit(directory);
    expect(result.exitCode, result.stderr).toBe(0);
    const projectRoot = join(directory, "managed-agent");
    const initialized = parseStdoutJson<{
      project_root: string;
      baseline_version: string;
      converted_from_yaml: boolean;
    }>(result.stdout);
    expect(initialized.project_root).toBe(projectRoot);
    expect(initialized.baseline_version).toHaveLength(64);
    expect(initialized.converted_from_yaml).toBe(false);
    expect(await stat(join(directory, "project.json")).catch(() => null)).toBeNull();
    expect(await readFile(join(directory, "agents.yaml"), "utf8")).toBe(parentYaml);
    expect((await stat(join(projectRoot, "agents/assistant/agent.json"))).isFile()).toBe(true);
    expect(
      (await stat(join(projectRoot, ".openagentpack/versions/project/store.json"))).isFile(),
    ).toBe(true);
    const instructions = join(projectRoot, "agents/assistant/instructions.md");
    await writeFile(instructions, "user changes");
    const repeated = await runInit(directory);
    expect(repeated.exitCode).not.toBe(0);
    expect(repeated.stderr).toContain("already exists");
    expect(await readFile(instructions, "utf8")).toBe("user changes");
  });

  test("explicit paths, including dot, remain exact project roots", async () => {
    for (const target of ["custom-agent", "."]) {
      const directory = await temporaryDirectory();
      const result = await runInit(directory, ["--project", target]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson<{ project_root: string }>(result.stdout).project_root).toBe(
        join(directory, target),
      );
      expect(await stat(join(directory, "managed-agent")).catch(() => null)).toBeNull();
    }
  });
});
