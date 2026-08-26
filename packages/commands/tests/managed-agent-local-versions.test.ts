import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitPreparedProjectVersion,
  disableProjectVersioning,
  enableProjectVersioning,
  getProjectVersionStatus,
  listProjectVersions,
  prepareProjectVersion,
  previewProjectVersion,
  restoreProjectVersion,
} from "@openagentpack/project-versions";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { playgroundBrowserTargetFromSummary } from "../src/commands/managed-agent/_engine/playground-launcher.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("managed-agent local snapshot versions", () => {
  test("uses the shared path-scoped switch and stores full YAML outside store.json", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    const siblingDirectory = join(root, "nested");
    const siblingConfigPath = join(siblingDirectory, "agents.yaml");
    await mkdir(siblingDirectory);
    await writeFile(configPath, projectYaml("First"));
    await writeFile(siblingConfigPath, projectYaml("Second"));

    const enabled = await enableProjectVersioning(configPath, "Enable Bailian CLI versioning");

    expect(enabled.versioning.enabled).toBe(true);
    expect(enabled.version?.message).toBe("Enable Bailian CLI versioning");
    expect((await getProjectVersionStatus(siblingConfigPath)).enabled).toBe(false);
    const storeSource = await readFile(join(root, ".openagentpack/versions/store.json"), "utf8");
    expect(storeSource).not.toContain("instructions: First");
    const snapshotSource = await readFile(
      join(root, ".openagentpack/versions/blobs", `${enabled.version!.source_hash}.yaml`),
      "utf8",
    );
    expect(snapshotSource).toContain("instructions: First");

    await writeFile(configPath, projectYaml("First updated"));
    const repeated = await enableProjectVersioning(configPath, "Enable Bailian CLI versioning");
    expect(repeated.version?.message).toBe("Enable Bailian CLI versioning");
    expect((await listProjectVersions(configPath)).versions).toHaveLength(2);

    const disabled = await disableProjectVersioning(configPath);
    expect(disabled.enabled).toBe(false);
  });

  test("auto-snapshots after success and restores without changing history or permissions", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    await writeFile(configPath, projectYaml("Version one"));
    await chmod(configPath, 0o640);
    const enabled = await enableProjectVersioning(configPath, "Enable Bailian CLI versioning");
    const firstVersion = enabled.version!.version_id;
    const secondSource = projectYaml("Version two");
    await writeFile(configPath, secondSource);

    const prepared = await prepareProjectVersion(configPath, secondSource);
    const version = await commitPreparedProjectVersion(prepared!);
    const currentVersionBeforeRestore = (await getProjectVersionStatus(configPath)).head_version;
    expect(version?.message).toBe("Apply agents.yaml");

    const preview = await previewProjectVersion(configPath, firstVersion);
    expect(preview.can_restore).toBe(true);
    expect(preview.after_yaml).toContain("Version one");
    await restoreProjectVersion(configPath, firstVersion, {
      headVersion: preview.base_head_version,
      sourceRevision: preview.base_source_revision,
    });

    expect(await readFile(configPath, "utf8")).toContain("Version one");
    expect((await getProjectVersionStatus(configPath)).head_version).toBe(
      currentVersionBeforeRestore,
    );
    expect((await stat(configPath)).mode & 0o777).toBe(0o640);
  });

  test("rejects abbreviated version IDs and plaintext credentials", async () => {
    const root = await temporaryDirectory();
    const configPath = join(root, "agents.yaml");
    await writeFile(configPath, projectYaml("Safe"));
    const enabled = await enableProjectVersioning(configPath, "Enable Bailian CLI versioning");
    await expect(previewProjectVersion(configPath, enabled.version!.short_version)).rejects.toThrow(
      /full 64-character hexadecimal/i,
    );

    await disableProjectVersioning(configPath);
    await writeFile(
      configPath,
      projectYaml("Unsafe").replace("qoder: {}", "qoder:\n    api_key: plaintext-secret"),
    );
    await expect(
      enableProjectVersioning(configPath, "Enable Bailian CLI versioning"),
    ).rejects.toThrow(/environment variable reference/i);
  });
});

describe("managed-agent Workbench policy", () => {
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
  const directory = await mkdtemp(join(tmpdir(), "bailian-cli-local-versions-"));
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
