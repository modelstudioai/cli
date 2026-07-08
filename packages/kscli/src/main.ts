import { createCli } from "bailian-cli-runtime";
import type { AnyCommand } from "bailian-cli-core";
import {
  configShow,
  configSet,
  update,
  knowledgeRetrieve,
  knowledgeSearch,
  knowledgeChat,
} from "bailian-cli-commands";
import pkg from "../package.json" with { type: "json" };

// kscli (Knowledge Studio CLI): lightweight RAG product. Ships config/update
// plus the knowledge commands, remapped to flat paths. Routing is driven
// entirely by these keys, and usage/examples/errors render the path from the
// key — so the same shared command shows `kscli search` here and
// `bl knowledge search` in bl.
const commands: Record<string, AnyCommand> = {
  "config show": configShow,
  "config set": configSet,
  update,
  retrieve: knowledgeRetrieve,
  search: knowledgeSearch,
  chat: knowledgeChat,
};

void createCli(commands, {
  binName: "kscli",
  version: pkg.version,
  clientName: "knowledge-studio-cli",
  npmPackage: "knowledge-studio-cli",
}).run();
