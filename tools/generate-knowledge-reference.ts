import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commands as blCommands } from "../packages/cli/src/commands.ts";
import { commands as kscliCommands } from "../packages/kscli/src/commands.ts";
import blPackage from "../packages/cli/package.json" with { type: "json" };
import kscliPackage from "../packages/kscli/package.json" with { type: "json" };
import { CommandRegistry } from "../packages/runtime/src/registry.ts";
import { buildCommandSchema } from "../packages/runtime/src/introspect.ts";
import {
  renderKnowledgeReference,
  renderKnowledgeReferenceIndex,
} from "./knowledge-reference-renderer.ts";

/** Import maps only, never product main modules or an initialized CLI. */
export function knowledgeReferenceSchemas() {
  return {
    bl: buildCommandSchema(
      new CommandRegistry(blCommands, "bl"),
      {
        binName: "bl",
        version: blPackage.version,
        npmPackage: blPackage.name,
        clientName: blPackage.name,
      },
      ["knowledge"],
    ),
    kscli: buildCommandSchema(new CommandRegistry(kscliCommands, "kscli"), {
      binName: "kscli",
      version: kscliPackage.version,
      npmPackage: kscliPackage.name,
      clientName: kscliPackage.name,
    }),
  };
}

export function writeKnowledgeReferences(referenceDirectory: string): void {
  const schemas = knowledgeReferenceSchemas();
  mkdirSync(referenceDirectory, { recursive: true });
  writeFileSync(join(referenceDirectory, "index.md"), renderKnowledgeReferenceIndex());
  writeFileSync(join(referenceDirectory, "knowledge.md"), renderKnowledgeReference(schemas.bl));
  writeFileSync(join(referenceDirectory, "kscli.md"), renderKnowledgeReference(schemas.kscli));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeKnowledgeReferences(
    join(dirname(fileURLToPath(import.meta.url)), "../skills/bailian-knowledge/reference"),
  );
}
