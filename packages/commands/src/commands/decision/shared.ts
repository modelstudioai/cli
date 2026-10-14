import { extname } from "path";
import {
  BailianError,
  ExitCode,
  decisionPath,
  inspectDecisionQuestions,
  inspectDecisionState,
  isDecisionObject,
  readTextFromPathOrStdin,
  stripDecisionTrainingFields,
  unwrapDecisionQuestions,
  workspaceMaaSBaseUrl,
  type Client,
  type DecisionAnswer,
  type DecisionQuestion,
  type DecisionResponse,
  type DecisionState,
  type LocalizedText,
} from "bailian-cli-core";

type Localize = (text: LocalizedText) => string;

export interface DecisionInputFlags {
  state?: string;
  stateFile?: string;
  questions?: string;
  questionsFile?: string;
  requestFile?: string;
}

export interface DecisionInput {
  state: DecisionState;
  questions: Record<string, DecisionQuestion>;
  /** `--request-file` 内携带的 model，`--model` 未指定时使用。 */
  model?: string;
}

function usageError(localize: Localize, text: LocalizedText, hint?: LocalizedText): BailianError {
  return new BailianError(localize(text), ExitCode.USAGE, hint ? localize(hint) : undefined);
}

function parseJson(raw: string, source: string, localize: Localize): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw usageError(localize, {
      "en-US": `${source} is not valid JSON: ${reason}`,
      "zh-CN": `${source} 不是合法的 JSON：${reason}`,
    });
  }
}

function countProvided(...values: Array<string | undefined>): number {
  return values.filter((value) => value !== undefined).length;
}

/** 返回输入来源组合错误；供 command validate 在鉴权前执行。 */
export function decisionInputFlagsError(flags: DecisionInputFlags): LocalizedText | undefined {
  if (flags.requestFile !== undefined) {
    if (countProvided(flags.state, flags.stateFile, flags.questions, flags.questionsFile) > 0) {
      return {
        "en-US":
          "--request-file cannot be combined with --state, --state-file, --questions, or --questions-file.",
        "zh-CN":
          "--request-file 不能与 --state、--state-file、--questions、--questions-file 同时使用。",
      };
    }
    return undefined;
  }

  const stateSources = countProvided(flags.state, flags.stateFile);
  if (stateSources !== 1) {
    return {
      "en-US":
        stateSources === 0
          ? "Provide --state, --state-file, or --request-file."
          : "Use only one of --state or --state-file.",
      "zh-CN":
        stateSources === 0
          ? "请提供 --state、--state-file 或 --request-file。"
          : "--state 与 --state-file 只能选择一个。",
    };
  }

  const questionSources = countProvided(flags.questions, flags.questionsFile);
  if (questionSources !== 1) {
    return {
      "en-US":
        questionSources === 0
          ? "Provide --questions or --questions-file."
          : "Use only one of --questions or --questions-file.",
      "zh-CN":
        questionSources === 0
          ? "请提供 --questions 或 --questions-file。"
          : "--questions 与 --questions-file 只能选择一个。",
    };
  }
  return undefined;
}

/** 校验输入来源组合：--request-file 独占；否则 state 与 questions 各选一种来源。 */
export function validateDecisionInputFlags(flags: DecisionInputFlags, localize: Localize): void {
  const inputError = decisionInputFlagsError(flags);
  if (inputError) throw usageError(localize, inputError);
}

function readStateFile(path: string, localize: Localize): unknown {
  const raw = readTextFromPathOrStdin(path);
  return extname(path).toLowerCase() === ".json" ? parseJson(raw, path, localize) : raw;
}

function readRawInput(
  flags: DecisionInputFlags,
  localize: Localize,
): { state: unknown; questions: unknown; model?: string } {
  if (flags.requestFile !== undefined) {
    const parsed = parseJson(
      readTextFromPathOrStdin(flags.requestFile),
      flags.requestFile,
      localize,
    );
    if (!isDecisionObject(parsed)) {
      throw usageError(localize, {
        "en-US": `${flags.requestFile} must be a JSON object with "state" and "questions".`,
        "zh-CN": `${flags.requestFile} 必须是包含 "state" 和 "questions" 的 JSON 对象。`,
      });
    }
    return {
      state: parsed.state,
      questions: parsed.questions,
      model: typeof parsed.model === "string" && parsed.model ? parsed.model : undefined,
    };
  }

  const state =
    flags.stateFile !== undefined ? readStateFile(flags.stateFile, localize) : flags.state;
  const questions =
    flags.questionsFile !== undefined
      ? parseJson(readTextFromPathOrStdin(flags.questionsFile), flags.questionsFile, localize)
      : parseJson(flags.questions ?? "", "--questions", localize);
  return { state, questions: unwrapDecisionQuestions(questions) };
}

/**
 * 按 flag 组装推理输入：读取文件、解包问题文件、去掉训练字段（label / target），
 * 再按决策模型 API 规则做本地结构校验；不通过时抛 USAGE 错误，不发请求。
 */
export function buildDecisionInput(flags: DecisionInputFlags, localize: Localize): DecisionInput {
  validateDecisionInputFlags(flags, localize);
  const raw = readRawInput(flags, localize);
  const questions = stripDecisionTrainingFields(raw.questions);

  const issues = [...inspectDecisionState(raw.state), ...inspectDecisionQuestions(questions)];
  if (issues.length > 0) {
    throw usageError(
      localize,
      {
        "en-US": "Invalid decision request:",
        "zh-CN": "决策请求不合法：",
      },
      {
        "en-US": issues.map((issue) => `- ${issue.message["en-US"]}`).join("\n"),
        "zh-CN": issues.map((issue) => `- ${issue.message["zh-CN"]}`).join("\n"),
      },
    );
  }

  return {
    state: raw.state as DecisionState,
    questions: questions as Record<string, DecisionQuestion>,
    model: raw.model,
  };
}

/**
 * 解析请求地址：显式配置的 Base URL（--base-url / DASHSCOPE_BASE_URL / Profile base_url）优先；
 * 否则按 --workspace-id → BAILIAN_WORKSPACE_ID → 配置项 workspace_id 拼 workspace 域名。
 */
export function resolveDecisionEndpoint(ctx: {
  workspaceId?: string;
  region: string;
  binName: string;
  client: Pick<Client, "url">;
  localize: Localize;
}): string {
  return ctx.client.url(decisionPath(), () => {
    if (!ctx.workspaceId) {
      throw usageError(
        ctx.localize,
        {
          "en-US": "Workspace ID is required for the decision model endpoint.",
          "zh-CN": "调用决策模型需要 Workspace ID。",
        },
        {
          "en-US": `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.binName} config set workspace_id <id>. You can also override the endpoint with --base-url.`,
          "zh-CN": `请传入 --workspace-id、设置环境变量 BAILIAN_WORKSPACE_ID，或执行：${ctx.binName} config set workspace_id <id>。也可以用 --base-url 覆盖请求地址。`,
        },
      );
    }
    return workspaceMaaSBaseUrl(ctx.workspaceId, ctx.region);
  });
}

function formatProbability(value: unknown): string {
  return typeof value === "number" ? String(Number(value.toFixed(4))) : String(value);
}

function formatProbabilities(probabilities: Record<string, number> | undefined): string {
  if (!probabilities) return "";
  return Object.entries(probabilities)
    .map(([optionName, probability]) => `${optionName}=${formatProbability(probability)}`)
    .join(" ");
}

function topLevel(answer: DecisionAnswer): string | undefined {
  const entries = Object.entries(answer.probabilities ?? {});
  if (entries.length === 0) return undefined;
  const [levelKey] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  const description = answer.legend?.[levelKey];
  return description ? `${levelKey} ${description}` : levelKey;
}

function formatAnswer(answer: DecisionAnswer): string {
  if (answer.type === "choice" && answer.choice !== undefined) {
    return [
      `choice=${answer.choice}`,
      answer.confidence !== undefined ? `confidence=${formatProbability(answer.confidence)}` : "",
      formatProbabilities(answer.probabilities),
    ]
      .filter(Boolean)
      .join("  ");
  }
  if (answer.type === "noul" && answer.noul !== undefined) {
    return `noul P(yes)=${formatProbability(answer.noul)}`;
  }
  if (answer.type === "score" && answer.score !== undefined) {
    const level = topLevel(answer);
    return [
      `score=${formatProbability(answer.score)}`,
      answer.confidence !== undefined ? `confidence=${formatProbability(answer.confidence)}` : "",
      level ? `top=${level}` : "",
    ]
      .filter(Boolean)
      .join("  ");
  }
  return JSON.stringify(answer);
}

/** 文本模式：每个问题一行；未知结构回落为该答案的 JSON。 */
export function formatDecisionAnswers(response: DecisionResponse): string {
  const answers = Object.entries(response.answers ?? {});
  if (answers.length === 0) return JSON.stringify(response);
  const idWidth = Math.max(...answers.map(([questionId]) => questionId.length));
  return answers
    .map(
      ([questionId, answer]) =>
        `${questionId.padEnd(idWidth)}  ${isDecisionObject(answer) ? formatAnswer(answer) : JSON.stringify(answer)}`,
    )
    .join("\n");
}

/** 文本模式统计行（写 stderr）：input_tokens / latency_ms。 */
export function formatDecisionStats(response: DecisionResponse): string | undefined {
  const parts = [
    response.usage?.input_tokens !== undefined ? `input_tokens=${response.usage.input_tokens}` : "",
    response.latency_ms !== undefined ? `latency_ms=${response.latency_ms}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("  ") : undefined;
}
