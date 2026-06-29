import { createCli } from "bailian-cli-runtime";
import type { AnyCommand } from "bailian-cli-core";
import {
  authLogin,
  authStatus,
  authLogout,
  configShow,
  configSet,
  update,
  fileUpload,
  usageFree,
  usageFreetier,
  usageStats,
  quotaList,
  quotaRequest,
  quotaHistory,
  quotaCheck,
  knowledgeRetrieve,
} from "bailian-cli-commands";
import pkg from "../package.json" with { type: "json" };

// rag-cli: knowledge-base product. Ships the base infrastructure commands
// (auth, config, usage, quota, update, file upload) plus knowledge retrieval,
// remapped to a flat `rag retrieve` path. Routing is driven entirely by these
// keys, and usage/examples/errors render the path from the key — so the same
// shared command shows `rag retrieve` here and `bl knowledge retrieve` in bl.
const commands: Record<string, AnyCommand> = {
  "auth login": authLogin,
  "auth status": authStatus,
  "auth logout": authLogout,
  "config show": configShow,
  "config set": configSet,
  update,
  "file upload": fileUpload,
  "usage free": usageFree,
  "usage freetier": usageFreetier,
  "usage stats": usageStats,
  "quota list": quotaList,
  "quota request": quotaRequest,
  "quota history": quotaHistory,
  "quota check": quotaCheck,
  retrieve: knowledgeRetrieve,
};

void createCli(commands, {
  binName: "rag",
  version: pkg.version,
  clientName: "rag-cli",
  npmPackage: "bailian-cli-rag",
}).run();
