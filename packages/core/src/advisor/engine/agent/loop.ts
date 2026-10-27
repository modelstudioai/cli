import type { Degradation, Message, RecommendResult } from "../types.ts";
import { throwIfCancelled, toDegradation, toLLMError } from "../llm/errors.ts";
import {
  RECOMMEND_TOOLS,
  buildEngineInput,
  createSession,
  dispatchTool,
  type ToolDeps,
} from "../tools.ts";
import { recommend } from "../pipeline.ts";
import { buildSkillRegistryPrompt, loadSkillRegistry } from "../skills/loader.ts";

/**
 * Build the agent system prompt, injecting the skill registry dynamically.
 * The prompt defines the agent's role, tool selection logic, and discipline.
 */
function buildAgentSystemPrompt(): string {
  const registry = buildSkillRegistryPrompt(loadSkillRegistry());
  return `You are an AI model selection assistant for Alibaba Cloud Model Studio. You help users find the best model via tools.

## Workflow
1. FIRST, classify the request type:
   - **Documentation/usage query**: the user mentions a SPECIFIC MODEL NAME (e.g. "qwen-max", "Wan2.0-T2I-Turbo", "cosyvoice-v3-flash", "qwen-image系列") AND asks about that model's info/price/usage/calling examples/API parameters → call use_skill("bailian-docs-llm-wiki"), then use read_file/search_files to find the answer. NEVER call recommend for this type. IMPORTANT: if no specific model name is mentioned, this is NOT a doc query.
   - **Recommendation query** (user describes a need or task, possibly vague, wants model suggestions): 推荐, 选, 有没有, 哪个好, 对比, 更便宜, 做个XX, 帮我XX, 用什么模型 → call recommend. This includes ALL vague/short requests like "推荐一个", "做个视频", "做个电商商品主图" — these are recommendation requests, NOT documentation queries.
   - **CRITICAL**: this agent IS the model-recommendation capability itself. For recommendation-type requests you MUST call the recommend tool — NEVER call use_skill for a skill whose description mentions model recommendation/selection/comparison, even if the user's request matches that skill's description. use_skill is only for documentation/data lookup (see below).
   - If truly ambiguous → prefer recommend
   - CRITICAL: for ANY request that describes a task or need (even extremely short ones like "推荐一个" or "做个视频"), you MUST call recommend as your FIRST action. Do NOT answer directly, do NOT ask the user yourself, do NOT call ask_user before recommend — the recommend tool itself decides whether clarification is needed and returns need_clarify if so. Answering a recommendation request without calling recommend is always wrong.
2. Decide next step based on the result:
   - type: "need_clarify" → call ask_user (pass through question/options/default_if_skip), then call recommend again with no arguments; the recorded answer is applied automatically (max 2 clarifications per session)
   - type: "result" → output the final answer directly. Calling recommend again without a new ask_user answer returns the same result, so never re-call it just to retry
   - type: "skill_loaded" → read the instructions carefully, then use read_file to access the referenced data files. Follow the skill's lookup flow step by step
   - type: "file_content" → use the content to answer the user's question
3. Final answer: summarize in Simplified Chinese. Do NOT repeat raw tool JSON. If confidence is "low", say so briefly
   - If the result has "steps" (a multi-step plan): present it step by step in order — for each step give the primary model and its alternative with the trade-off, and pass on any "warnings" about hand-offs between steps

## Skill usage rules
- use_skill is ONLY for documentation/data lookup skills (e.g. bailian-docs-llm-wiki). Never activate skills that overlap with your own capabilities — model recommendation, selection, comparison, or "what model to use" decisions are always handled by the recommend tool, not by a skill
- After use_skill returns, you MUST follow the skill's instructions to locate information — do NOT guess file paths or fabricate content
- Use read_file with relative paths as directed by the skill (e.g. "models/models.jsonl", "groups/wan-text-to-image.json")
- For large data files (models.jsonl, families.jsonl), ALWAYS use search_files with a keyword instead of read_file — read_file truncates large files and will miss entries; search_files scans the full file and returns matching lines
- NEVER fabricate API code, parameter names, or pricing. Only report what you find in the files
- If the skill's data doesn't contain the answer, say so honestly and suggest the user check the official docs

${registry ? registry + "\n\n" : ""}## Discipline
- Only ask a question if it significantly narrows the candidate pool
- Ask about business scenarios, NOT technical parameters (e.g. never ask "how many tokens of context do you need")
- Never fabricate model names not returned by tools
- If the input is NOT a model request (greetings, jokes, casual chat), do NOT call any tool: respond naturally and briefly in Simplified Chinese, then introduce yourself in one sentence as the Bailian model selection assistant — mention that you can recommend models for any scenario (text/image/video/audio, single model or multi-step pipelines), compare models, look up specific models, and find cheaper alternatives — and guide the user with one concrete example question (e.g. "你可以试试问我：推荐一个写代码的模型")
- Everything else — including vague requests like "推荐一个", "有什么好模型", "帮我选个模型" — MUST go through the recommend tool`;
}

/** One recorded agent action, used by the eval harness for trajectory assertions. */
export interface TrajectoryEvent {
  turn: number;
  type: "tool_call" | "tool_result" | "final_answer" | "fallback" | "cancelled" | "error";
  tool?: string;
  callId?: string;
  status?: "success" | "error" | "rejected" | "cancelled";
  reason?: string;
  result?: Record<string, unknown>;
  degradations?: Degradation[];
  /** Parsed tool arguments (verbatim from the model). */
  args?: Record<string, unknown>;
  /** The "type" field of the tool result JSON, when present. */
  resultType?: string;
}

export interface AgentResult {
  finalText: string;
  recommendResult?: RecommendResult;
  turns: number;
  /** Agent-layer fallbacks (engine-stage fallbacks live on recommendResult.degradations). */
  degradations: Degradation[];
  /** Full action trace for evaluation (tool calls in order + terminal event). */
  trajectory: TrajectoryEvent[];
}

const MAX_TURNS = 10; // enough for skill lookups: decide + load skill + read files + summarize

/**
 * Bounded tool-call loop (NOT an autonomous agent): the LLM may only call
 * pre-registered tools; all branching and termination is code-controlled.
 * Degrades to the bare engine when the tool-calling LLM fails.
 */
export async function agentLoop(
  input: string,
  deps: ToolDeps,
  onTrajectory?: (event: TrajectoryEvent) => void,
): Promise<AgentResult> {
  const messages: Message[] = [
    { role: "system", content: buildAgentSystemPrompt() },
    { role: "user", content: input },
  ];

  // Code-owned state: engine input = original wording + recorded clarification answers
  const session = createSession(input);
  const trajectory: TrajectoryEvent[] = [];
  let lastRecommend: RecommendResult | undefined;
  let clarifyCount = 0;
  let currentTurn = 0;
  const record = (event: TrajectoryEvent) => {
    trajectory.push(event);
    onTrajectory?.(event);
  };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      currentTurn = turn;
      throwIfCancelled(deps.signal);
      let response;
      try {
        response = await deps.llm.chatWithTools(messages, RECOMMEND_TOOLS, {
          stage: "agent",
          signal: deps.signal,
        });
        throwIfCancelled(deps.signal);
      } catch (err) {
        throwIfCancelled(deps.signal);
        const llmErr = toLLMError(err, "agent");
        if (llmErr.kind === "cancelled") throw llmErr;
        if (llmErr.fatal) {
          // Quota/auth errors: re-running the engine would hit the same wall and
          // burn more quota. Use the result we already have, or surface the error.
          if (!lastRecommend) throw llmErr;
          const fallback = toDegradation("agent", "agent-summary→engine-result", llmErr);
          process.stderr.write(
            `[recommend] agent loop failed (${llmErr.tag}), using the recommendation already computed\n`,
          );
          record({ turn, type: "fallback", reason: "agent_error_existing_result" });
          return {
            finalText: "",
            recommendResult: lastRecommend,
            turns: turn,
            degradations: [fallback],
            trajectory,
          };
        }
        // transient failure → degrade to a direct engine run
        process.stderr.write(
          `[recommend] agent loop failed (${llmErr.tag}), falling back to engine: ${llmErr.message}\n`,
        );
        const result = await recommend(buildEngineInput(session), deps);
        record({ turn, type: "fallback", reason: "agent_error_engine_rerun" });
        return {
          finalText: "",
          recommendResult: result,
          turns: turn,
          degradations: [toDegradation("agent", "agent→engine-rerun", llmErr)],
          trajectory,
        };
      }

      if (!response.toolCalls.length) {
        record({
          turn,
          type: "final_answer",
          reason: response.content.trim() ? "completed" : "empty_answer",
        });
        return {
          finalText: response.content,
          recommendResult: lastRecommend,
          turns: turn + 1,
          degradations: [],
          trajectory,
        };
      }

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls,
      });

      // 先记录模型提出的全部请求；预算拒绝和执行异常也必须有对应结果。
      for (const call of response.toolCalls) {
        let args: Record<string, unknown> | undefined;
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* 分发器返回参数错误。 */
        }
        record({ turn, type: "tool_call", callId: call.id, tool: call.function.name, args });
      }
      for (const call of response.toolCalls) {
        try {
          throwIfCancelled(deps.signal);
          // enforce the clarify budget in code, not just in the prompt
          if (call.function.name === "ask_user" && clarifyCount >= 2) {
            const result = { error: "clarify budget exhausted; proceed with defaults" };
            record({
              turn,
              type: "tool_result",
              callId: call.id,
              tool: call.function.name,
              status: "rejected",
              reason: "clarify_budget",
              result,
            });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
            continue;
          }
          const execution = await dispatchTool(call, deps, session);
          throwIfCancelled(deps.signal);
          if (execution.recommendResult) lastRecommend = execution.recommendResult;
          const result = JSON.parse(execution.result) as Record<string, unknown>;
          const status = result.error ? "error" : "success";
          if (call.function.name === "ask_user" && status === "success") clarifyCount++;
          record({
            turn,
            type: "tool_result",
            callId: call.id,
            tool: call.function.name,
            status,
            result,
            resultType: typeof result.type === "string" ? result.type : undefined,
            degradations:
              execution.recommendResult?.type === "result"
                ? execution.recommendResult.degradations
                : undefined,
          });
          messages.push({ role: "tool", tool_call_id: call.id, content: execution.result });
        } catch (err) {
          const cancelled = deps.signal?.aborted || toLLMError(err, "agent").kind === "cancelled";
          record({
            turn,
            type: "tool_result",
            callId: call.id,
            tool: call.function.name,
            status: cancelled ? "cancelled" : "error",
            reason: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
    }

    // turn budget exhausted: return the best result we have
    currentTurn = MAX_TURNS;
    throwIfCancelled(deps.signal);
    record({ turn: MAX_TURNS, type: "fallback", reason: "turn_budget" });
    if (lastRecommend) {
      return {
        finalText: "",
        recommendResult: lastRecommend,
        turns: MAX_TURNS,
        degradations: [],
        trajectory,
      };
    }
    const fallback = await recommend(buildEngineInput(session), deps);
    return {
      finalText: "",
      recommendResult: fallback,
      turns: MAX_TURNS,
      degradations: [],
      trajectory,
    };
  } catch (err) {
    const cancelled = deps.signal?.aborted || toLLMError(err, "agent").kind === "cancelled";
    const completedCalls = new Set(
      trajectory
        .filter((event) => event.type === "tool_result")
        .map((event) => `${event.turn}:${event.callId}`),
    );
    for (const event of trajectory.filter(
      (entry) => entry.type === "tool_call" && !completedCalls.has(`${entry.turn}:${entry.callId}`),
    )) {
      record({
        turn: event.turn,
        type: "tool_result",
        tool: event.tool,
        callId: event.callId,
        status: cancelled ? "cancelled" : "rejected",
        reason: "run_terminated",
      });
    }
    record({
      turn: currentTurn,
      type: cancelled ? "cancelled" : "error",
      reason: err instanceof Error ? err.message : String(err),
    });
    throwIfCancelled(deps.signal);
    throw err;
  }
}
