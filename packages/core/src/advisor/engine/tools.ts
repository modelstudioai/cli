import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Recommendation, RecommendDeps, RecommendResult, ToolCall, ToolDef } from "./types.ts";
import type { Interaction } from "./interaction/index.ts";
import { recommend } from "./pipeline.ts";
import { loadSkillRegistry, type SkillMeta } from "./skills/loader.ts";
import { sandboxedReadFile, sandboxedSearch } from "./skills/fs.ts";
import { throwIfCancelled } from "./llm/errors.ts";

export interface ToolDeps extends RecommendDeps {
  interaction: Interaction;
  /** Real-time progress events (skill matched/loaded, files read) surfaced to the user. */
  onProgress?: (event: string) => void;
}

/** One answered clarification question. */
export interface Clarification {
  question: string;
  answer: string;
}

/**
 * Per-run state owned by code, not by the LLM. The engine input is always
 * rebuilt from the user's original wording plus recorded clarification
 * answers, so the agent can never paraphrase away the user's constraints.
 */
export interface RecommendSession {
  /** The user's original request, verbatim. */
  originalInput: string;
  clarifications: Clarification[];
  /** Currently active skill (set by use_skill, used by read_file for path resolution). */
  activeSkill?: SkillMeta;
}

export function createSession(originalInput: string): RecommendSession {
  return { originalInput, clarifications: [] };
}

/** Deterministic engine input: original wording + clarification answers (if any). */
export function buildEngineInput(session: RecommendSession): string {
  if (session.clarifications.length === 0) return session.originalInput;
  const lines = session.clarifications.map((item) => `- ${item.question} → ${item.answer}`);
  return `${session.originalInput}\n\n补充说明：\n${lines.join("\n")}`;
}

/**
 * Capability-level tools exposed to the agent loop.
 * Granularity rule: expose only points where the agent has genuinely
 * different next actions; internals (filters, formulas) stay hidden.
 */
export const RECOMMEND_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "recommend",
      description:
        "Recommend models for the user's request. Takes no arguments: the system automatically passes the user's original request plus every answer collected via ask_user. Returns top-N recommendations + decision signals (confidence/candidatePool), or need_clarify (user clarification required). Also covers comparison/alternative requests.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "use_skill",
      description:
        "Load a skill's full instructions (SKILL.md) by name. Use this when the user's request matches a skill in the Available Skills list — e.g. asking about a specific model's usage, API parameters, calling examples, pricing details, or any documentation lookup. Returns the skill's instructions and its base path; then follow those instructions using read_file.",
      parameters: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "The skill name from the Available Skills list",
          },
        },
        required: ["skill"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search a file inside the loaded skill for a keyword (case-insensitive substring) and return the matching lines. PREFERRED over read_file for large data files like models.jsonl or families.jsonl — those are truncated when read whole, but search scans the full file. Example: search_files(path='models/models.jsonl', pattern='qwen-image').",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to the skill's base path" },
          pattern: {
            type: "string",
            description: "Keyword to search for (case-insensitive substring)",
          },
        },
        required: ["path", "pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file inside the loaded skill's directory (or the skills root). Use relative paths as instructed by the skill's SKILL.md (e.g. 'models/models.jsonl', 'wiki/index.md'). Only use after loading a skill via use_skill.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the skill's base path",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a multiple-choice question to resolve ambiguity. Only use when different choices lead to completely different recommendations; max 2 rounds.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, maxItems: 4 },
          default_if_skip: { type: "string" },
        },
        required: ["question", "options", "default_if_skip"],
      },
    },
  },
];

export interface ToolExecution {
  /** JSON payload fed back to the LLM. */
  result: string;
  /** Set when the recommend tool produced a final result (for output). */
  recommendResult?: RecommendResult;
}

/**
 * Execute one tool call. Unknown tools return an error payload (agent self-corrects).
 * ask_user answers are recorded on the session; recommend ignores any LLM-supplied
 * arguments and runs on buildEngineInput(session).
 */
export async function dispatchTool(
  call: ToolCall,
  deps: ToolDeps,
  session: RecommendSession,
): Promise<ToolExecution> {
  throwIfCancelled(deps.signal);
  let args: Record<string, unknown>;
  try {
    args = call.function.arguments.trim()
      ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
      : {};
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("参数必须是对象");
  } catch {
    return { result: JSON.stringify({ error: "invalid tool arguments" }) };
  }

  switch (call.function.name) {
    case "recommend": {
      deps.onProgress?.("running recommendation engine");
      const result = await recommend(buildEngineInput(session), deps);
      if (result.type === "need_clarify") {
        return {
          recommendResult: result,
          result: JSON.stringify({
            type: "need_clarify",
            question: result.question,
            options: result.options,
            default_if_skip: result.defaultIfSkip,
            impact: result.impact,
          }),
        };
      }
      const brief = (rec: Recommendation) => ({
        model: rec.model,
        name: rec.name,
        reason: rec.reason,
        highlights: rec.highlights,
        slot: rec.slot,
      });
      // Multi-step plans: send the per-step structure only (the flat list duplicates it)
      const body = result.steps
        ? {
            steps: result.steps.map((step) => ({
              index: step.index,
              step: step.step,
              io: `${step.inputModality.join("/")} → ${step.outputModality.join("/")}`,
              confidence: step.confidence,
              recommendations: step.recommendations.map(brief),
            })),
            warnings: result.warnings?.length ? result.warnings : undefined,
          }
        : { recommendations: result.recommendations.map(brief) };
      return {
        result: JSON.stringify({
          type: "result",
          confidence: result.confidence,
          routingReason: result.routingReason,
          candidatePool: result.candidatePool,
          ...body,
        }),
        recommendResult: result,
      };
    }

    case "use_skill": {
      const skillName = typeof args.skill === "string" ? args.skill.trim() : "";
      if (!skillName) return { result: JSON.stringify({ error: "missing skill name" }) };
      const registry = loadSkillRegistry();
      const skill = registry.find((s) => s.name === skillName);
      if (!skill) {
        const available = registry.map((s) => s.name);
        return {
          result: JSON.stringify({
            error: `Skill "${skillName}" not found. Available skills: ${available.join(", ") || "(none)"}`,
          }),
        };
      }
      // Track active skill for read_file path resolution
      deps.onProgress?.(`matched skill "${skill.name}"`);
      let content: string;
      try {
        content = readFileSync(join(skill.basePath, "SKILL.md"), "utf-8");
      } catch (err) {
        return {
          result: JSON.stringify({ error: `Failed to read SKILL.md: ${(err as Error).message}` }),
        };
      }
      session.activeSkill = skill;
      deps.onProgress?.(`loaded skill "${skill.name}" (SKILL.md, ${content.length} chars)`);
      return {
        result: JSON.stringify({
          type: "skill_loaded",
          skill: skill.name,
          basePath: skill.basePath,
          instructions: content,
        }),
      };
    }

    case "read_file": {
      const path = typeof args.path === "string" ? args.path.trim() : "";
      if (!path) return { result: JSON.stringify({ error: "missing file path" }) };
      const basePath = session.activeSkill?.basePath;
      deps.onProgress?.(`reading ${path}`);
      const result = sandboxedReadFile(path, basePath);
      if (!result.ok) {
        deps.onProgress?.(`read failed: ${result.error}`);
        return { result: JSON.stringify({ error: result.error }) };
      }
      deps.onProgress?.(
        `read ${path} (${result.content?.length ?? 0} chars${result.truncated ? ", truncated" : ""})`,
      );
      return {
        result: JSON.stringify({
          type: "file_content",
          path,
          truncated: result.truncated ?? false,
          content: result.content,
        }),
      };
    }

    case "search_files": {
      const path = typeof args.path === "string" ? args.path.trim() : "";
      const pattern = typeof args.pattern === "string" ? args.pattern.trim() : "";
      if (!path || !pattern)
        return { result: JSON.stringify({ error: "missing path or pattern" }) };
      deps.onProgress?.(`searching ${path} for "${pattern}"`);
      const searchResult = sandboxedSearch(path, pattern, session.activeSkill?.basePath);
      if (!searchResult.ok) {
        deps.onProgress?.(`search failed: ${searchResult.error}`);
        return { result: JSON.stringify({ error: searchResult.error }) };
      }
      deps.onProgress?.(`search ${path}: ${searchResult.totalMatches} match(es)`);
      return {
        result: JSON.stringify({
          type: "search_results",
          path,
          pattern,
          totalMatches: searchResult.totalMatches,
          returned: searchResult.matches?.length ?? 0,
          matches: searchResult.matches,
        }),
      };
    }

    case "ask_user": {
      const question = typeof args.question === "string" ? args.question : "";
      if (
        !question.trim() ||
        !Array.isArray(args.options) ||
        !args.options.every((option) => typeof option === "string") ||
        typeof args.default_if_skip !== "string"
      ) {
        return {
          result: JSON.stringify({ error: "invalid clarification question/options/default" }),
        };
      }
      const answer = await deps.interaction.ask({
        signal: deps.signal,
        question,
        options: Array.isArray(args.options) ? (args.options as string[]) : [],
        defaultIfSkip: typeof args.default_if_skip === "string" ? args.default_if_skip : "",
      });
      throwIfCancelled(deps.signal);
      if (answer.trim()) session.clarifications.push({ question, answer: answer.trim() });
      return {
        result: JSON.stringify({
          type: "user_answer",
          answer,
          note: "Recorded. Call recommend again (no arguments) to apply it.",
        }),
      };
    }

    default:
      return { result: JSON.stringify({ error: `unknown tool: ${call.function.name}` }) };
  }
}
