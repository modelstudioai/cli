/**
 * Silent auxiliary LLM curator on agent/turn-stopping (session-title-llm pattern).
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
  BlockAssembler,
  createUserMessage,
  type FinishReason,
  type GenerateOptions,
  type Message,
} from "@deepseek-ai/dsh-llm";
import { deadline, MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
import type { ResolvedConfig } from "./config.js";
import type { MemoryClient } from "./memory-client.js";
import {
  isAutomaticOpsAllowed,
  readPersonalMemoryConfig,
  type PersonalMemoryConfig,
} from "./personal-config.js";
import { filterForUpload, quotesMatchSource } from "./sensitive.js";
import { isSubagentSession } from "./recall.js";
import { submitAddIntent, type TaskStore } from "./task-store.js";

export const CURATOR_TIMEOUT_CODE = "BAILIAN_MEMO_CURATOR_TIMEOUT";

export interface CuratorDecision {
  action: "commit" | "skip";
  reason?: string;
  quotes?: string[];
  memoryText?: string;
  includeProfile?: boolean;
  allowSensitive?: boolean;
}

export interface CuratorDeps {
  client: MemoryClient;
  store: TaskStore;
  resolveConfig: () => ResolvedConfig;
  readConfig?: () => Promise<PersonalMemoryConfig>;
}

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    "bailian-memo-curator": { kind: "bailian-memo-curator" };
  }
}

function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case "stop":
      return undefined;
    case "error":
    case "aborted": {
      const error = new Error(finish.failure.message) as Error & { code?: string };
      error.code = finish.failure.code;
      return error;
    }
    case "max-tokens":
      return new Error("bailian-memo curator: output reached maxOutputTokens");
    case "tool-calls":
      return new Error("bailian-memo curator: unexpected tool call");
    default:
      return new Error("bailian-memo curator: unsupported finish reason");
  }
}

export function parseCuratorDecision(text: string): CuratorDecision {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return { action: "skip", reason: "non-json curator output" };
  }
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as CuratorDecision;
    if (parsed.action !== "commit" && parsed.action !== "skip") {
      return { action: "skip", reason: "invalid action" };
    }
    return parsed;
  } catch {
    return { action: "skip", reason: "invalid json" };
  }
}

export function validateCuratorDecision(
  decision: CuratorDecision,
  sourceTexts: readonly string[],
): { ok: true; text: string; includeProfile: boolean } | { ok: false; reason: string } {
  if (decision.action === "skip") {
    return { ok: false, reason: decision.reason ?? "skip" };
  }
  const memoryText = decision.memoryText?.trim() ?? "";
  if (!memoryText) return { ok: false, reason: "empty memoryText" };
  const quotes = decision.quotes ?? [];
  if (quotes.length === 0) return { ok: false, reason: "missing quotes" };
  for (const quote of quotes) {
    if (!quotesMatchSource(quote, sourceTexts)) {
      return { ok: false, reason: "quote not found in sources" };
    }
  }
  const filtered = filterForUpload(memoryText, {
    allowSensitive: decision.allowSensitive === true,
  });
  if (!filtered.safeText) {
    return {
      ok: false,
      reason: filtered.blockedCredential
        ? "credential blocked"
        : "sensitive blocked without explicit grant",
    };
  }
  return {
    ok: true,
    text: filtered.safeText,
    includeProfile: decision.includeProfile === true,
  };
}

interface TurnUtterance {
  seq: number;
  role: "user" | "assistant";
  text: string;
}

function collectTurnUtterances(agent: Agent, turn: number): TurnUtterance[] {
  const utterances: TurnUtterance[] = [];
  let inTurn = false;
  for (const event of agent.session.snapshotEvents()) {
    if (event.type === "turn/start") {
      inTurn = (event.data as { turn: number }).turn === turn;
      continue;
    }
    if (event.type === "turn/end") {
      if ((event.data as { turn: number }).turn === turn) break;
      continue;
    }
    if (!inTurn) continue;
    if (event.type === "user/message") {
      const data = event.data as unknown as {
        source?: { kind?: string };
        content: ReadonlyArray<{ type: string; text?: string }>;
      };
      if (data.source?.kind && data.source.kind !== "user") continue;
      const text = data.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("\n")
        .trim();
      if (text) utterances.push({ seq: event.seq, role: "user", text });
    }
    if (event.type === "assistant/message") {
      const data = event.data as unknown as {
        message: { content: ReadonlyArray<{ type: string; text?: string }> };
      };
      const text = data.message.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("\n")
        .trim();
      if (text) utterances.push({ seq: event.seq, role: "assistant", text });
    }
  }
  return utterances;
}

function systemPrompt(): string {
  return [
    "You are a silent personal-memory curator for Bailian.",
    "Decide whether the latest turn contains durable personal facts worth storing.",
    "Return ONLY one JSON object:",
    '{"action":"commit"|"skip","reason":"...","quotes":["verbatim user/assistant substrings"],"memoryText":"...","includeProfile":boolean,"allowSensitive":boolean}',
    "Rules:",
    "- Prefer user statements over assistant guesses.",
    "- Do not store passwords, API keys, secrets, or private keys.",
    "- Sensitive health/finance/precise-address data only if the user explicitly asked to remember it (set allowSensitive=true).",
    "- quotes must be exact substrings from the provided turn texts.",
    "- Skip temporary task details, hypotheticals, and third-party facts.",
    "- memoryText should be concise Chinese or English matching the user language.",
  ].join("\n");
}

function resolveRoute(
  config: ResolvedConfig,
  agent: Agent,
): { provider: string; model: string } | undefined {
  if (config.curatorProvider && config.curatorModel) {
    return { provider: config.curatorProvider, model: config.curatorModel };
  }
  const requestContext = agent.session.requestContext?.();
  if (requestContext?.provider && requestContext?.model) {
    return { provider: requestContext.provider, model: requestContext.model };
  }
  const options = agent.options as { provider?: string; model?: string };
  if (options.provider && options.model) {
    return { provider: options.provider, model: options.model };
  }
  return undefined;
}

export function installAuxiliaryCurator(ctx: Context, deps: CuratorDeps): void {
  const readConfig = deps.readConfig ?? (() => readPersonalMemoryConfig());

  ctx.on("agent/turn-stopping", async ({ agent, turn, signal }) => {
    if (isSubagentSession(agent)) return;
    const pluginConfig = deps.resolveConfig();
    if (!pluginConfig.enabled || !pluginConfig.autoCurate) return;

    let personal: PersonalMemoryConfig;
    try {
      personal = await readConfig();
    } catch {
      return;
    }
    if (!isAutomaticOpsAllowed(personal)) return;

    const projection = ctx.get("sessionProjections")?.stateOf(agent.session, "bailianMemo");
    if (projection?.lastCurateTurn === turn) return;

    const utterances = collectTurnUtterances(agent, turn);
    if (utterances.length === 0) return;

    const route = resolveRoute(pluginConfig, agent);
    if (!route) {
      agent.session.append("bailian-memo/curator-finished", {
        turn,
        committed: false,
        reason: "no model route",
      });
      return;
    }

    const timeoutMs = Math.min(pluginConfig.curatorTimeoutMs, MAX_TIMER_DELAY_MS);
    const framed = JSON.stringify(
      utterances.map((utterance) => ({
        seq: utterance.seq,
        role: utterance.role,
        text: utterance.text.slice(0, 2000),
      })),
    );
    const system = systemPrompt();
    const messages: Message[] = [
      createUserMessage({
        content: [
          {
            type: "text",
            text: `Curate durable personal memory from this turn JSON:\n${framed}`,
          },
        ],
        source: { kind: "bailian-memo-curator" },
      }),
    ];

    agent.session.append("bailian-memo/curator-request", {
      turn,
      messageSeqs: utterances.map((utterance) => utterance.seq),
      route,
      system,
      messages,
      maxTokens: pluginConfig.curatorMaxOutputTokens,
    });

    try {
      using callDeadline = deadline(signal, timeoutMs, CURATOR_TIMEOUT_CODE);
      // purpose is transport metadata; session-title is the closest built-in
      // auxiliary bucket until dsh adds a memo-specific purpose.
      const options: GenerateOptions = deepFreeze({
        provider: route.provider,
        model: route.model,
        messages,
        system,
        maxTokens: pluginConfig.curatorMaxOutputTokens,
        sessionId: agent.session.id,
        purpose: "session-title",
        signal: callDeadline.signal,
      });
      const assembler = new BlockAssembler();
      for await (const chunk of ctx.llm.stream(options)) {
        callDeadline.signal.throwIfAborted();
        assembler.push(chunk);
      }
      callDeadline.signal.throwIfAborted();
      const terminalError = finishError(assembler.finish);
      if (terminalError) throw terminalError;
      const text = assembler
        .blocks()
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join(" ");
      const decision = parseCuratorDecision(text);
      const validated = validateCuratorDecision(
        decision,
        utterances.map((utterance) => utterance.text),
      );
      if (!validated.ok) {
        agent.session.append("bailian-memo/curator-finished", {
          turn,
          committed: false,
          reason: validated.reason,
        });
        return;
      }
      await submitAddIntent({
        store: deps.store,
        client: deps.client,
        userId: personal.user_id!,
        messages: [{ role: "user", content: validated.text }],
        profileSchema: validated.includeProfile
          ? (personal.profile_schema_id ?? undefined)
          : undefined,
        note: `turn:${turn}`,
      });
      agent.session.append("bailian-memo/curator-finished", {
        turn,
        committed: true,
      });
    } catch (error) {
      agent.session.append("bailian-memo/curator-finished", {
        turn,
        committed: false,
        reason: error instanceof Error ? error.message : "curator failed",
      });
    }
  });
}
