import type { AnyCommand } from "bailian-cli-core";
import {
  configShow,
  configSet,
  update,
  knowledgeRetrieve,
  knowledgeSearch,
  knowledgeChat,
} from "bailian-cli-commands";

// kscli (Knowledge Studio CLI): lightweight RAG product. Ships config/update
// plus the knowledge commands, remapped to flat paths. Routing is driven
// entirely by these keys, and usage/examples/errors render the path from the
// key — so the same shared command shows `kscli search` here and
// `bl knowledge search` in bl.
export const commands: Record<string, AnyCommand> = {
  "config show": configShow,
  "config set": configSet,
  update,
  retrieve: knowledgeRetrieve,
  search: knowledgeSearch,
  chat: knowledgeChat,
};
