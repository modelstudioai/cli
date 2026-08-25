import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PlannedAction } from "@openagentpack/sdk";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  commitAutomaticVersion,
  disableLocalVersioning,
  enableLocalVersioning,
  getLocalVersionStatus,
  prepareAutomaticVersion,
  previewLocalVersion,
  restoreLocalVersion,
} from "@openagentpack/local-git";
import { playgroundBrowserTargetFromSummary } from "../src/commands/managed-agent/_engine/playground-launcher.ts";
import { assertCiApplyPolicy } from "../src/commands/managed-agent/apply.ts";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const gitIdentity = {
  GIT_AUTHOR_NAME: "Bailian CLI Test",
  GIT_AUTHOR_EMAIL: "bailian-cli@example.com",
  GIT_COMMITTER_NAME: "Bailian CLI Test",
  GIT_COMMITTER_EMAIL: "bailian-cli@example.com",
};

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("managed-agent local Git versions", () => {
  test("uses the shared path-scoped switch and commits only agents.yaml", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    const nestedDirectory = join(root, "nested");
    const nestedConfigPath = join(nestedDirectory, "agents.yaml");
    await mkdir(nestedDirectory);
    await writeFile(configPath, projectYaml("First"));
    await writeFile(nestedConfigPath, projectYaml("Second"));
    await git(root, ["init", "--initial-branch", "main"]);
    await writeFile(join(root, "staged.txt"), "staged\n");
    await git(root, ["add", "staged.txt"]);
    const stagedBefore = await git(root, ["status", "--porcelain=v1", "--", "staged.txt"]);

    const enabled = await withGitIdentity(() =>
      enableLocalVersioning(configPath, "Enable Bailian CLI versioning"),
    );

    expect(enabled.git.enabled).toBe(true);
    expect((await getLocalVersionStatus(nestedConfigPath)).enabled).toBe(false);
    expect((await git(root, ["show", "--pretty=", "--name-only", "HEAD"])).trim()).toBe(
      "agents.yaml",
    );
    expect(await git(root, ["status", "--porcelain=v1", "--", "staged.txt"])).toBe(stagedBefore);
    expect(
      await git(root, ["rev-parse", "--git-path", "openagentpack/local-git/versions"]),
    ).toContain("openagentpack/local-git/versions");

    await writeFile(configPath, projectYaml("First updated"));
    const repeated = await withGitIdentity(() =>
      enableLocalVersioning(configPath, "Enable Bailian CLI versioning"),
    );
    expect(repeated.version?.message).toBe("Enable Bailian CLI versioning");
    expect(await git(root, ["status", "--porcelain=v1", "--", "staged.txt"])).toBe(stagedBefore);

    const disabled = await disableLocalVersioning(configPath);
    expect(disabled.enabled).toBe(false);
  });

  test("auto-commits after success and restores without moving HEAD or changing permissions", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    await writeFile(configPath, projectYaml("Version one"));
    await chmod(configPath, 0o640);
    const enabled = await withGitIdentity(() =>
      enableLocalVersioning(configPath, "Enable Bailian CLI versioning"),
    );
    const firstCommit = enabled.version!.commit;
    const secondSource = projectYaml("Version two");
    await writeFile(configPath, secondSource);

    const prepared = await withGitIdentity(() => prepareAutomaticVersion(configPath, secondSource));
    const version = await withGitIdentity(() => commitAutomaticVersion(prepared!));
    const headBeforeRestore = (await git(root, ["rev-parse", "HEAD"])).trim();
    expect(version?.message).toBe("Apply agents.yaml");

    const preview = await previewLocalVersion(configPath, firstCommit);
    expect(preview.can_restore).toBe(true);
    expect(preview.after_yaml).toContain("Version one");
    await restoreLocalVersion(configPath, firstCommit, {
      head: preview.base_head,
      sourceRevision: preview.base_source_revision,
    });

    expect(await readFile(configPath, "utf8")).toContain("Version one");
    expect((await git(root, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRestore);
    expect((await stat(configPath)).mode & 0o777).toBe(0o640);
  });

  test("rejects short SHAs and plaintext credentials", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    await writeFile(configPath, projectYaml("Safe"));
    const enabled = await withGitIdentity(() =>
      enableLocalVersioning(configPath, "Enable Bailian CLI versioning"),
    );
    await expect(previewLocalVersion(configPath, enabled.version!.short_commit)).rejects.toThrow(
      /full hexadecimal commit SHA/i,
    );

    await disableLocalVersioning(configPath);
    await writeFile(
      configPath,
      projectYaml("Unsafe").replace("qoder: {}", "qoder:\n    api_key: plaintext-secret"),
    );
    await expect(
      withGitIdentity(() => enableLocalVersioning(configPath, "Enable Bailian CLI versioning")),
    ).rejects.toThrow(/environment variable reference/i);
  });
});

describe("managed-agent CI and Workbench policies", () => {
  test("CI blocks delete actions and remote drift", () => {
    expect(() => assertCiApplyPolicy([plannedAction("delete")])).toThrow(/blocked.*delete/i);
    expect(() => assertCiApplyPolicy([plannedAction("update", "remote")])).toThrow(
      /blocked.*remote drift/i,
    );
    expect(() => assertCiApplyPolicy([plannedAction("update", "local")])).not.toThrow();
  });

  test("Session Preview opens the requested Agent or falls back to Workbench", () => {
    const summary = {
      status: "valid",
      agents: [{ agent: { id: "assistant" } }, { agent: { id: "reviewer" } }],
    };
    expect(
      playgroundBrowserTargetFromSummary("http://localhost:4848", summary, "reviewer"),
    ).toEqual({ url: "http://localhost:4848/agents/reviewer/preview" });
    expect(playgroundBrowserTargetFromSummary("http://localhost:4848", summary)).toEqual(
      expect.objectContaining({ url: "http://localhost:4848", warning: expect.any(String) }),
    );
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bailian-cli-local-git-"));
  temporaryDirectories.push(directory);
  return directory;
}

function projectYaml(instructions: string): string {
  return `version: "1"
providers:
  qoder: {}
defaults:
  provider: qoder
agents:
  assistant:
    model: ultimate
    instructions: ${instructions}
`;
}

function plannedAction(
  action: "create" | "update" | "delete",
  driftKind: "none" | "local" | "remote" | "both" = "none",
): PlannedAction {
  return {
    action,
    driftKind,
    address: { provider: "bailian", type: "agent", name: "assistant" },
  } as PlannedAction;
}

async function git(workingDirectory: string, arguments_: string[]): Promise<string> {
  const result = await execFileAsync("git", arguments_, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: { ...process.env, ...gitIdentity },
  });
  return result.stdout;
}

async function withGitIdentity<Result>(operation: () => Promise<Result>): Promise<Result> {
  const previousEnvironment = Object.fromEntries(
    Object.keys(gitIdentity).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, gitIdentity);
  try {
    return await operation();
  } finally {
    for (const key of Object.keys(gitIdentity)) {
      const value = previousEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
