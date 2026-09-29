import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { commands as blCommands } from "../packages/cli/src/commands.ts";
import { commands as kscliCommands } from "../packages/kscli/src/commands.ts";
import {
  knowledgeReferenceSchemas,
  writeKnowledgeReferences,
} from "./generate-knowledge-reference.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
test("generation selects the actual knowledge scope and retains all kscli utility commands", () => {
  const schemas = knowledgeReferenceSchemas();
  expect(schemas.bl.scope).toEqual(["knowledge"]);
  expect(schemas.bl.commands.map((command) => command.path.join(" "))).toEqual(
    Object.keys(blCommands)
      .filter((path) => path.startsWith("knowledge "))
      .sort(),
  );
  expect(schemas.kscli.commands.map((command) => command.path.join(" "))).toEqual(
    Object.keys(kscliCommands).sort(),
  );
  expect(schemas.kscli.commands.some((command) => command.path[0] === "config")).toBe(true);
  expect(
    schemas.bl.commands.find((command) => command.path.join(" ") === "knowledge init")?.preparation,
  ).toBe("read-only");
});
test("writes exactly three stable reference artifacts and preserves non-generated files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-reference-"));
  directories.push(directory);
  writeKnowledgeReferences(directory);
  const names = (await readdir(directory)).sort();
  expect(names).toEqual(["index.md", "knowledge.md", "kscli.md"]);
  const first = await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")));
  await writeFile(join(directory, "asset.txt"), "preserve");
  writeKnowledgeReferences(directory);
  expect(await readFile(join(directory, "asset.txt"), "utf8")).toBe("preserve");
  expect(await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))).toEqual(
    first,
  );
  expect(first[1]).toContain("bl knowledge init");
  expect(first[2]).toContain("kscli init");
  expect(first[2]).toContain("product utility commands");
});
