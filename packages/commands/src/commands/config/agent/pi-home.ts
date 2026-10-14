import { homedir } from "node:os";
import { join } from "node:path";

/** Pi's official config directory override, shared by model and MCP writers. */
export function getPiAgentDir(home: string = homedir()): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (!configured) return join(home, ".pi", "agent");
  if (configured === "~") return home;
  if (configured.startsWith("~/") || configured.startsWith("~\\")) {
    return join(home, configured.slice(2));
  }
  return configured;
}
