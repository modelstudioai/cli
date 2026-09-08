import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson } from "./helpers.ts";

const directories: string[] = [];

async function temporaryDirectory() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "bailian-yaml-init-")));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function runInit(directory: string, args: string[] = []) {
  return runNodeMain(
    fileURLToPath(new URL("./harness/main.ts", import.meta.url)),
    ["managed-agent", "init", ...args],
    {
      cwd: directory,
      env: {
        BAILIAN_CONFIG_DIR: await temporaryDirectory(),
        BAILIAN_E2E_ROUTES: JSON.stringify([
          { path: "managed-agent init", export: "managedAgentInit" },
        ]),
      },
    },
  );
}

describe("e2e: managed-agent init output path", () => {
  test.each(["default", "relative", "absolute"] as const)(
    "reports the absolute YAML path for a %s output path",
    async (pathKind) => {
      const directory = await temporaryDirectory();
      const relativePath =
        pathKind === "default" ? "agents.yaml" : join("config files", "custom agents.yaml");
      const outputPath = join(directory, relativePath);
      await mkdir(dirname(outputPath), { recursive: true });
      const args =
        pathKind === "default"
          ? []
          : ["--file", pathKind === "absolute" ? outputPath : relativePath];

      const result = await runInit(directory, args);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout.split(/\r?\n/)[0]).toBe(`Created ${outputPath}`);
      expect(await readFile(outputPath, "utf8")).toContain("agents:");
    },
  );

  test("preserves the JSON output contract", async () => {
    const directory = await temporaryDirectory();
    const result = await runInit(directory, ["--file", "custom.yaml", "--output", "json"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toEqual({
      created: "custom.yaml",
      provider: "bailian",
      agent: "assistant",
    });
    expect((await stat(join(directory, "custom.yaml"))).isFile()).toBe(true);
  });

  test("keeps dry-run read-only without reporting a created file", async () => {
    const directory = await temporaryDirectory();
    const result = await runInit(directory, ["--dry-run", "--output", "json"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toEqual({
      would_create: "agents.yaml",
      provider: "bailian",
      agent: "assistant",
      would_update_gitignore: true,
    });
    expect(await stat(join(directory, "agents.yaml")).catch(() => null)).toBeNull();
    expect(await stat(join(directory, ".gitignore")).catch(() => null)).toBeNull();
  });

  test.each(["default", "relative", "absolute"] as const)(
    "reports the absolute existing %s path without overwriting the YAML",
    async (pathKind) => {
      const directory = await temporaryDirectory();
      const relativePath =
        pathKind === "default" ? "agents.yaml" : join("config files", "custom agents.yaml");
      const outputPath = join(directory, relativePath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, "Keep user configuration.\n");
      const args =
        pathKind === "default"
          ? []
          : ["--file", pathKind === "absolute" ? outputPath : relativePath];

      const result = await runInit(directory, args);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(`${outputPath} already exists.`);
      expect(result.stderr).toContain("Pass --force to overwrite.");
      expect(result.stdout).not.toContain("Created ");
      expect(await readFile(outputPath, "utf8")).toBe("Keep user configuration.\n");
    },
  );
});
