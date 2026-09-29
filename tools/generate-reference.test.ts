import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { writeReference } from "./generate-reference.ts";
import { knowledgeReferenceSchemas } from "./generate-knowledge-reference.ts";
import { renderKnowledgeReference } from "./knowledge-reference-renderer.ts";

test("the full generator migrates knowledge ownership and uses the introspection renderer for both products", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-reference-routing-"));
  try {
    const hub = join(directory, "bailian-cli", "reference");
    await mkdir(hub, { recursive: true });
    await writeFile(join(hub, "knowledge.md"), "stale hub reference");
    await writeFile(join(hub, "asset.txt"), "preserve");
    writeReference(directory);
    expect(await readdir(hub)).not.toContain("knowledge.md");
    expect(await readFile(join(hub, "asset.txt"), "utf8")).toBe("preserve");
    expect(await readFile(join(hub, "index.md"), "utf8")).not.toContain("knowledge.md");
    const knowledge = join(directory, "bailian-knowledge", "reference");
    expect((await readdir(knowledge)).sort()).toEqual(["index.md", "knowledge.md", "kscli.md"]);
    const schemas = knowledgeReferenceSchemas();
    expect(await readFile(join(knowledge, "knowledge.md"), "utf8")).toBe(
      renderKnowledgeReference(schemas.bl),
    );
    expect(await readFile(join(knowledge, "kscli.md"), "utf8")).toBe(
      renderKnowledgeReference(schemas.kscli),
    );
    expect(await readFile(join(hub, "config.md"), "utf8")).toContain("bl config");
    const firstIndex = await readFile(join(knowledge, "index.md"), "utf8");
    writeReference(directory);
    expect(await readFile(join(knowledge, "index.md"), "utf8")).toBe(firstIndex);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
