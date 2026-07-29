export type { WriteParams, WriteSummary, AgentDef } from "./writers/utils.ts";

import type { AgentDef } from "./writers/utils.ts";
import claudeCode from "./writers/claude-code.ts";
import qwenCode from "./writers/qwen-code.ts";
import opencode from "./writers/opencode.ts";
import openclaw from "./writers/openclaw.ts";
import hermes from "./writers/hermes.ts";
import codex from "./writers/codex.ts";

export const AGENTS: Record<string, AgentDef> = {
  "claude-code": claudeCode,
  "qwen-code": qwenCode,
  opencode,
  openclaw,
  hermes,
  codex,
};

export const VALID_AGENT_NAMES = Object.keys(AGENTS) as [string, ...string[]];
