/**
 * 决策模型推理请求 / 响应类型与请求构造。
 *
 * 协议：TypeSafe System One，`POST {workspace host}/compatible-mode/v1/systemone`。
 */
import type { DecisionQuestionType } from "./questions.ts";
import { isDecisionObject } from "./questions.ts";

export const DEFAULT_DECISION_MODEL = "decision-model-preview";

/** 决策模型开放的 workspace 域名地域。 */
export const DECISION_REGIONS = ["cn-beijing", "ap-southeast-1"] as const;
export type DecisionRegion = (typeof DECISION_REGIONS)[number];
export const DEFAULT_DECISION_REGION: DecisionRegion = "cn-beijing";

/** 训练专用字段，推理请求中必须去掉。 */
const TRAINING_ONLY_QUESTION_FIELDS = ["label", "target"] as const;

export type DecisionState = string | Record<string, unknown> | unknown[];

export interface DecisionQuestion {
  type: DecisionQuestionType;
  instructions?: string;
  criteria?: Record<string, string> | string[];
  [key: string]: unknown;
}

export interface DecisionRequest {
  model: string;
  state: DecisionState;
  questions: Record<string, DecisionQuestion>;
}

export interface DecisionAnswer {
  type?: string;
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
  [key: string]: unknown;
}

export interface DecisionResponse {
  model?: string;
  request_id?: string;
  answers?: Record<string, DecisionAnswer>;
  usage?: { input_tokens?: number; [key: string]: unknown };
  latency_ms?: number;
  [key: string]: unknown;
}

/**
 * 兼容两种问题文件：裸问题表 `{ id: {...} }`，或外层包了一层的 `{ "questions": {...} }`
 * （如示例包里的 workload.json / 训练样本）。当 `questions` 本身像一个问题定义
 * （带字符串 `type`）时，视为 ID 恰好叫 "questions" 的裸问题表，不做解包。
 */
export function unwrapDecisionQuestions(parsed: unknown): unknown {
  if (!isDecisionObject(parsed)) return parsed;
  const nested = parsed.questions;
  if (isDecisionObject(nested) && typeof nested.type !== "string") return nested;
  return parsed;
}

/** 去掉每个问题上的训练字段（label / target），返回新对象，不修改入参。 */
export function stripDecisionTrainingFields(questions: unknown): unknown {
  if (!isDecisionObject(questions)) return questions;
  const stripped: Record<string, unknown> = {};
  for (const [questionId, question] of Object.entries(questions)) {
    if (!isDecisionObject(question)) {
      stripped[questionId] = question;
      continue;
    }
    const definition = { ...question };
    for (const field of TRAINING_ONLY_QUESTION_FIELDS) delete definition[field];
    stripped[questionId] = definition;
  }
  return stripped;
}
