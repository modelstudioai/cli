import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectConfig } from "@openagentpack/sdk";
import { afterEach, expect, test } from "vite-plus/test";
import { stringify } from "yaml";
import { resolveCandidateDeclaration } from "../src/commands/managed-agent/_engine/scoped-create.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function loadProject(content: string, group: "memory_stores" | "agents") {
  const directory = await mkdtemp(join(tmpdir(), "bl-scoped-create-"));
  directories.push(directory);
  const configPath = join(directory, "agents.yaml");
  await writeFile(join(directory, "existing.md"), content);
  await writeFile(
    configPath,
    stringify({
      version: "1",
      providers: { bailian: {} },
      defaults: { provider: "bailian" },
      [group]: {
        existing:
          group === "memory_stores"
            ? { description: "", entries: [{ key: "existing.md", content: "./existing.md" }] }
            : { model: "qwen3.8-max", instructions: "./existing.md" },
      },
    }),
  );
  const project = await resolveProjectConfig(configPath, { resolveEnv: false });
  return { directory, configPath, project };
}

test.each(["./missing.md", "../missing.md", "/missing.md"])(
  "scoped create preserves resolved Memory content %s and resolves only the new entry",
  async (content) => {
    const { directory, configPath, project } = await loadProject(content, "memory_stores");
    const originalConfig = structuredClone(project.config);
    const originalSource = await readFile(configPath, "utf8");
    const newContent = "./literal-new-entry.md";
    await writeFile(join(directory, "new.md"), newContent);

    const declaration = await resolveCandidateDeclaration({
      project,
      group: "memory_stores",
      rawDeclaration: {
        name: "New notes",
        description: "",
        entries: [{ key: "new.md", content: "./new.md" }],
      },
    });

    expect(declaration).toMatchObject({
      name: "New notes",
      entries: [{ key: "new.md", content: newContent }],
    });
    expect(project.config).toEqual(originalConfig);
    expect(await readFile(configPath, "utf8")).toBe(originalSource);
  },
);

test("scoped create preserves resolved Agent instructions and new resource references", async () => {
  const { directory, project } = await loadProject("./missing-instructions.md", "agents");
  const instructions = "../literal-new-instructions.md";
  await writeFile(join(directory, "new.md"), instructions);

  const declaration = await resolveCandidateDeclaration({
    project,
    group: "agents",
    rawDeclaration: {
      model: "qwen3.8-max",
      instructions: "./new.md",
      environment: "development",
      vault: "secrets",
      skills: ["report"],
    },
  });

  expect(declaration).toMatchObject({
    instructions,
    environment: "development",
    vault: "secrets",
    skills: ["report"],
  });
  expect(project.config.agents?.existing?.instructions).toBe("./missing-instructions.md");
});

test("scoped create still rejects missing new entry files", async () => {
  const { project } = await loadProject("Existing notes", "memory_stores");
  await expect(
    resolveCandidateDeclaration({
      project,
      group: "memory_stores",
      rawDeclaration: {
        description: "",
        entries: [{ key: "new.md", content: "./missing-new.md" }],
      },
    }),
  ).rejects.toThrow(/Memory entry file not found: .*missing-new\.md/);
});

test("scoped create still validates the new declaration schema", async () => {
  const { project } = await loadProject("Existing notes", "memory_stores");
  await expect(
    resolveCandidateDeclaration({
      project,
      group: "memory_stores",
      rawDeclaration: { description: "", entries: [{ key: "new.md", content: 123 }] },
    }),
  ).rejects.toThrow(/entries\.0\.content/);
});
