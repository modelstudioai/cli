import { createCli } from "bailian-cli-runtime";
import type { Command } from "bailian-cli-core";
import {
  configShow,
  configSet,
  update,
  knowledgeRetrieve,
  knowledgeSearch,
  knowledgeChat,
} from "bailian-cli-commands";
import pkg from "../package.json" with { type: "json" };

const commands: Record<string, Command> = {
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
