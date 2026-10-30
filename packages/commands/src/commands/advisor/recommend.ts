import {
  agentLoop,
  BailianError,
  createLLMClient,
  createReadlineInteraction,
  DEFAULT_LLM_MODEL,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  getCommandPrefix,
  type EngineRecommendResult,
  type Degradation,
  LLMError,
  loadCatalog,
  loadFamilies,
  maybeSyncWikiData,
  recommendEngine,
  type RecommendedModel,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { adaptCommandOutput } from "./recommend-adapter.ts";

const STAGE_LABEL: Record<string, string> = {
  intent: "intent analysis",
  "holistic-score": "holistic scoring",
  explain: "recommendation reasons",
  agent: "agent orchestration",
};

const DEGRADATION_EFFECT: Record<string, string> = {
  "holistic-score": "candidates were ranked by the rule-based formula instead",
  explain: "reasons below are generic model descriptions, not tailored to your request",
  agent: "the agent summary was skipped",
};

function describeDegradation(entry: Degradation): string {
  const tag = entry.status ? `${entry.status} ${entry.kind}` : entry.kind;
  const effect = DEGRADATION_EFFECT[entry.stage] ?? `fell back to ${entry.fallback}`;
  return `${STAGE_LABEL[entry.stage] ?? entry.stage} failed (${tag}); ${effect}. ${entry.message}`;
}

function emitDegradations(degradations: Degradation[]): void {
  for (const entry of degradations) {
    process.stderr.write(`Warning: ${describeDegradation(entry)}\n`);
  }
}

/** Map a classified engine LLM failure onto a CLI-native BailianError with an actionable hint. */
function toBailianError(err: LLMError, commandPrefix: string): { message: string; hint?: string } {
  const stage = STAGE_LABEL[err.stage ?? ""] ?? "LLM call";
  const requestId = err.requestId ? ` (request_id: ${err.requestId})` : "";
  const message = `Recommendation aborted: ${stage} failed — ${err.message}${requestId}`;
  switch (err.kind) {
    case "rate_limit":
      if (err.code === "insufficient_quota") {
        return {
          message,
          hint: 'The quota of this API key for the current model is exhausted; retrying will not help. Switch the model (e.g. --model qwen-plus), raise the quota or disable "stop after free quota" for this model in the Model Studio console, or use another API key. / 该 API Key 在当前模型上的免费额度已耗尽，重试无效。可更换模型（如 --model qwen-plus）、提升额度、在百炼控制台关闭该模型的“免费额度用尽即停”，或换用其他 API Key。',
        };
      }
      return {
        message,
        hint: "The API key hit its model rate limit. Wait a minute and retry, or use another API key. / API Key 触发模型限流，请稍后重试或更换 API Key。",
      };
    case "auth":
      return {
        message,
        hint: `The API key is invalid or lacks access to the model. Check DASHSCOPE_API_KEY / --api-key, or run \`${commandPrefix} auth login\`. / API Key 无效或无该模型访问权限，请检查 DASHSCOPE_API_KEY / --api-key 或执行 \`${commandPrefix} auth login\`。`,
      };
    case "timeout":
      return {
        message,
        hint: "The LLM did not respond in time. Retry, or check network connectivity. / 模型响应超时，请重试或检查网络连接。",
      };
    case "network":
      return {
        message,
        hint: "Could not reach the model endpoint. Check network and the configured base URL. / 无法连接模型服务端点，请检查网络与 base URL 配置。",
      };
    case "parse":
      return {
        message,
        hint: "The model did not return a parsable result. Rephrase your request and retry. / 模型返回结果无法解析，请换个说法重试。",
      };
    default:
      return { message };
  }
}

const flags = {
  message: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Describe your requirements", "zh-CN": "描述你的需求" },
    required: true,
  },
  top: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of recommendations (default: 3)",
      "zh-CN": "推荐结果数量（默认 3）",
    },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": `LLM used for every stage: agent/intent/scoring/explain (default: ${DEFAULT_LLM_MODEL})`,
      "zh-CN": `各阶段共用的 LLM：agent/意图/打分/解释（默认：${DEFAULT_LLM_MODEL}）`,
    },
  },
  noAgent: {
    type: "switch",
    description: {
      "en-US": "Skip the agent loop and run the deterministic engine directly",
      "zh-CN": "跳过 agent 循环，直接运行确定性推荐引擎",
    },
  },
  trace: {
    type: "switch",
    description: {
      "en-US": "Emit full routing/performance trace to stderr",
      "zh-CN": "向 stderr 输出完整路由与性能追踪",
    },
  },
  think: {
    type: "switch",
    description: {
      "en-US": "Show the engine decision process to stderr",
      "zh-CN": "在 stderr 展示引擎决策过程",
    },
  },
  noThinking: {
    type: "switch",
    description: {
      "en-US": "Disable thinking mode for intent analysis (on by default)",
      "zh-CN": "关闭意图分析的思考模式（默认开启）",
    },
  },
} as const;

export default defineCommand({
  description: {
    "en-US":
      "Recommend the best models for your use case (intent → routing → recall → score → rank, with agent clarification)",
    "zh-CN": "为你的使用场景推荐最佳模型（意图 → 路由 → 召回 → 打分 → 排序，支持 agent 澄清交互）",
  },
  auth: "apiKey",
  usageArgs: "--message <text> [flags]",
  flags,
  exampleArgs: [
    {
      "en-US": '--message "Recommend a model for writing code"',
      "zh-CN": '--message "帮我推荐个写代码的模型"',
    },
    {
      "en-US": '--message "Build a digital-human livestream" --no-agent',
      "zh-CN": '--message "做一个数字人直播" --no-agent',
    },
    {
      "en-US": '--message "qwen-max vs deepseek-v3, which is better"',
      "zh-CN": '--message "qwen-max 和 deepseek-v3 哪个好"',
    },
    {
      "en-US": '--message "Anything cheaper than qwen-plus" --output json',
      "zh-CN": '--message "有没有比 qwen-plus 更便宜的" --output json',
    },
  ],
  async run(ctx) {
    const { settings, flags: runtimeFlags } = ctx;
    const message = runtimeFlags.message;
    const top = runtimeFlags.top ?? 3;

    // Keep the local wiki catalog fresh: throttled (12h) version check against
    // the remote manifest, silently replaces data when a newer version exists.
    // Never throws — a sync failure must not block recommendation.
    await maybeSyncWikiData();

    const credential = ctx.client.exportApiCredential();
    if (!credential?.token.trim()) {
      throw new BailianError(
        "A Bailian API key is required. / 必须提供百炼 API Key。",
        ExitCode.AUTH,
        "Pass --api-key, set DASHSCOPE_API_KEY, or log in with auth login --api-key <key>. / 请传入 --api-key、设置 DASHSCOPE_API_KEY，或使用 auth login --api-key <key> 登录。",
      );
    }

    const think = runtimeFlags.think ?? false;
    const decisionLog: string[] = [];
    // Live output: decision lines print as they are pushed.
    // --think is strictly observational: it must NOT alter the LLM request
    // (no enable_thinking), otherwise the same command would return
    // different recommendations depending on whether the flag is set.
    const liveDecisionLog: string[] | undefined = think
      ? new Proxy(decisionLog, {
          get(target, prop, receiver) {
            if (prop === "push") {
              return (...items: string[]) => {
                for (const item of items) process.stderr.write(`  ${item}\n`);
                return target.push(...items);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        })
      : undefined;

    const deps = {
      llm: createLLMClient({
        baseUrl: ctx.client.baseUrl,
        apiKey: credential.token,
        defaultModel: runtimeFlags.model ?? DEFAULT_LLM_MODEL,
        // Intent analysis is the only LLM call that decides the slate, so it
        // gets thinking mode by default (--no-thinking to disable). Other
        // stages stay in plain mode: thinking tokens are billed per call.
        thinkingStages: runtimeFlags.noThinking ? [] : ["intent"],
      }),
      catalog: () => loadCatalog(),
      families: () => loadFamilies(),
      verbose: runtimeFlags.trace ?? false,
      decisionLog: liveDecisionLog,
      topN: top,
    };

    const isTTY = process.stdin.isTTY === true;
    const useAgent = !runtimeFlags.noAgent && isTTY;

    let result: EngineRecommendResult | undefined;
    let finalText = "";
    let agentDegradations: Degradation[] = [];
    try {
      if (useAgent) {
        const agentResult = await agentLoop(message, {
          ...deps,
          interaction: createReadlineInteraction(),
          // Real-time tool progress to stderr (always on, independent of --think)
          onProgress: (event) => process.stderr.write(`[agent] ${event}\n`),
        });
        result = agentResult.recommendResult;
        finalText = agentResult.finalText;
        agentDegradations = agentResult.degradations;
      } else {
        // Non-interactive: bare engine; clarify (if any) is reported, not asked
        result = await recommendEngine(message, deps);
      }
    } catch (err) {
      if (err instanceof LLMError) {
        const { message: errMessage, hint } = toBailianError(err, getCommandPrefix(ctx.identity));
        throw new BailianError(errMessage, ExitCode.GENERAL, hint);
      }
      throw err;
    }

    const degradations = [
      ...(result?.type === "result" ? result.degradations : []),
      ...agentDegradations,
    ];

    // Default to JSON for structured output; text rendering only when the
    // user explicitly asked for text output.
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    // Degradations go to stderr so stdout stays a clean result
    emitDegradations(degradations);

    // Non-interactive clarify: auto-apply defaultIfSkip so a single non-TTY run
    // still produces recommendations (advisor's single-shot contract), while
    // surfacing the question+options on stderr for visibility.
    if (result?.type === "need_clarify" && !useAgent) {
      process.stderr.write(
        `Clarification (auto-answered "${result.defaultIfSkip}"): ${result.question}\n`,
      );
      for (const opt of result.options) process.stderr.write(`  - ${opt}\n`);
      const retryResult = await recommendEngine(
        `${message}\n- ${result.question} → ${result.defaultIfSkip}`,
        deps,
      );
      if (retryResult.type === "need_clarify") {
        // Still ambiguous after one auto-answer: give up on clarification and
        // surface the second question; fall through to a bare result.
        process.stderr.write(
          `Warning: request still ambiguous after auto-clarification. / 自动澄清后仍存在歧义。\n`,
        );
        result = undefined;
      } else {
        result = retryResult;
      }
    }

    // Doc/lookup queries (use_skill path): the agent answered the question
    // directly without running the recommend engine. finalText is the answer;
    // there is no recommendation result and that is a valid terminal state.
    if (finalText && !result) {
      if (format === "text") {
        emitBare(finalText.trim());
      } else {
        emitResult({ final_text: finalText.trim() }, format);
      }
      return;
    }

    if (!result || result.type === "need_clarify") {
      // TTY agent loop ran out of clarification budget, or double-clarify above.
      if (result?.type === "need_clarify") {
        emitBare(`Clarification needed: ${result.question}`);
        for (const opt of result.options) emitBare(`  - ${opt}`);
        emitBare(
          `(If unanswered, defaults to "${result.defaultIfSkip}". Re-run with a more specific description of your need.)`,
        );
        return;
      }
      emitBare("No recommendation produced.");
      return;
    }

    const adapted = adaptCommandOutput(result);

    if (format !== "text") {
      emitResult(adapted, format);
      return;
    }

    if (finalText) {
      emitBare(finalText.trim());
      return;
    }

    if (adapted.result.type === "pipeline") {
      emitBare(
        formatPipelineResult(
          adapted.result.summary as string,
          adapted.result.steps as PipelineStepLocal[],
        ),
      );
    } else {
      emitBare(formatSingleResult(adapted.result.recommendations as RecommendedModel[]));
    }
  },
});

type PipelineStepLocal = { step: string; recommendations: RecommendedModel[] };

function formatSingleResult(recommendations: RecommendedModel[]): string {
  const lines: string[] = [];
  recommendations.forEach((rec, idx) => {
    lines.push(`#${idx + 1} ${rec.name} (${rec.model})`);
    lines.push(`  Why: ${rec.reason}`);
    if (rec.highlights.length) lines.push(`  Highlights: ${rec.highlights.join(" · ")}`);
    lines.push("");
  });
  return lines.join("\n");
}

function formatPipelineResult(summary: string, steps: PipelineStepLocal[]): string {
  const lines: string[] = [`Multi-step plan: ${summary}`, ""];
  for (const step of steps) {
    lines.push(`Step: ${step.step}`);
    step.recommendations.forEach((rec, idx) => {
      lines.push(`  ${idx === 0 ? "*" : "-"} ${rec.name} (${rec.model})`);
      lines.push(`    Why: ${rec.reason}`);
      if (rec.highlights.length) lines.push(`    Highlights: ${rec.highlights.join(" · ")}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}
