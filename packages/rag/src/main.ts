import { createCli } from "bailian-cli-runtime";
import { baseCommands, knowledgeCommands } from "bailian-cli-commands";
import pkg from "../package.json" with { type: "json" };

// rag-cli: knowledge-base product. Ships only the base infrastructure commands
// (auth, config, usage, quota, update, file upload) plus the knowledge commands —
// no model/app capabilities. Command paths are kept as-is (e.g. `rag knowledge retrieve`).
createCli(
  { ...baseCommands, ...knowledgeCommands },
  {
    binName: "rag",
    version: pkg.version,
    clientName: "rag-cli",
    npmPackage: "bailian-cli-rag",
  },
).run();
