import { readFileSync } from "node:fs";
import chat from "../../../src/commands/knowledge/chat.ts";
const response = readFileSync(new URL("./rag-media-chat.sse", import.meta.url), "utf8");
if (!process.stdout.isTTY) throw new Error("PTY fixture requires a real terminal.");
await chat.run({
  flags: { message: ["hello"], agentId: "agent-fixture", workspaceId: "ws-fixture" },
  settings: { output: "text", quiet: process.argv.includes("--quiet") },
  localize: (text: string | { "en-US": string }) =>
    typeof text === "string" ? text : text["en-US"],
  client: { request: async () => new Response(response) },
} as unknown as Parameters<typeof chat.run>[0]);
