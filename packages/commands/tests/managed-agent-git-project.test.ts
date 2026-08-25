import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { createGitProject } from "../src/commands/managed-agent/_engine/git-project.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("managed-agent init --git project scaffolding", () => {
  test("creates a main-branch Git project without committing or configuring a remote", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "bailian-cli-git-project-"));
    temporaryDirectories.push(parentDirectory);
    const targetDirectory = join(parentDirectory, "agent-project");

    const result = await createGitProject(targetDirectory, {
      config: projectYaml(),
      cliVersion: "1.17.1",
    });

    expect(result.mode).toBe("created");
    expect(result.initializedGit).toBe(true);
    expect(result.createdFiles).toContain("agents.yaml");
    expect(await readFile(join(targetDirectory, "agents.yaml"), "utf8")).toContain("assistant:");
    expect(await readFile(join(targetDirectory, ".aoneci/bailian-cli.yml"), "utf8")).toContain(
      "agents:apply:ci",
    );
    expect(await readFile(join(targetDirectory, "README.md"), "utf8")).toContain(
      "Create the remote repository yourself",
    );
  });

  test("upgrades an initialized config directory without overwriting agents.yaml", async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), "bailian-cli-git-upgrade-"));
    temporaryDirectories.push(targetDirectory);
    const originalSource = projectYaml().replace("assistant", "reviewer");
    await writeFile(join(targetDirectory, "agents.yaml"), originalSource);

    const result = await createGitProject(targetDirectory, {
      config: projectYaml(),
      cliVersion: "1.17.1",
    });

    expect(result.mode).toBe("upgraded");
    expect(result.preservedFiles).toContain("agents.yaml");
    expect(await readFile(join(targetDirectory, "agents.yaml"), "utf8")).toBe(originalSource);
  });
});

function projectYaml(): string {
  return `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
defaults:
  provider: bailian
agents:
  assistant:
    model: qwen3.8-max
    instructions: You are helpful.
`;
}
