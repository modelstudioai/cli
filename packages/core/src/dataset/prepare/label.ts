/**
 * teacher 原始标注 → 训练记录的转换。
 *
 * 硬标签 label 取概率最大的选项（noul 以 P(true)≥0.5 判真，score 取档位下标）；
 * 软标签 target 可选，由 teacher 分布经温度平滑得到（temp 越大越平滑、越保留不确定
 * 性）；unknowable（信息不足）样本改用均匀分布 target，专门降低过度自信。转换前要求
 * teacher 分布键完整、概率有限且落在 [0,1]、总和为正，并归一化消除舍入漂移。
 */
import { isDecisionObject } from "../../decision/questions.ts";
import type { DecisionQuestion } from "../../decision/request.ts";
import { extractJson } from "./parse.ts";
import { questionOptions } from "./prompt.ts";
import type { WorkloadConfig } from "./workload.ts";

export interface RawAnswer {
  type?: string;
  probabilities?: Record<string, number>;
  noul?: number;
}

/** 标注阶段落盘的原始行：state + 画像 + teacher 概率（label/target 在转换时派生）。 */
export interface RawLabelRow {
  state: unknown;
  plan?: Record<string, unknown>;
  answers?: Record<string, RawAnswer>;
  missing?: string[];
}

export interface TrainingQuestion extends DecisionQuestion {
  label: string | boolean | number;
  target?: Record<string, number>;
}

export interface TrainingRecord {
  state: unknown;
  questions: Record<string, TrainingQuestion>;
  _meta?: { source: string };
}

export interface ConversionResult {
  record: TrainingRecord | null;
  /** 生成意图（画像）与 teacher 硬标签是否一致，按问题 ID 统计。 */
  intentMatch: Record<string, boolean>;
}

/** 概率保留 4 位小数，消除浮点尾差。 */
export function round4(value: number): number {
  return Number(value.toFixed(4));
}

export interface TeacherParseResult {
  answers: Record<string, RawAnswer>;
  missing: string[];
}

/**
 * 解析 teacher 回复为逐问题概率分布：键集校验 + 归一化 + round4；noul 额外存
 * P(true)。任一问题无效即记入 missing（调用方据此跳过整行），同步与离线共用。
 */
export function parseTeacherRow(
  content: string,
  questions: Record<string, DecisionQuestion>,
): TeacherParseResult {
  const parsed = extractJson(content);
  const answers: Record<string, RawAnswer> = {};
  const missing: string[] = [];
  for (const [questionId, spec] of Object.entries(questions)) {
    try {
      const keys = Object.keys(questionOptions(spec));
      const raw = isDecisionObject(parsed) ? parsed[questionId] : undefined;
      const values = alignRow(raw, keys);
      const answer: RawAnswer = {
        type: spec.type,
        probabilities: Object.fromEntries(keys.map((key, index) => [key, round4(values[index])])),
      };
      if (spec.type === "noul") answer.noul = round4(values[1]);
      answers[questionId] = answer;
    } catch {
      missing.push(questionId);
    }
  }
  return { answers, missing };
}

/** 要求完整有效的 teacher 分布，再归一化消除舍入漂移；非法抛错（调用方跳过该记录）。 */
export function alignRow(raw: unknown, answerKeys: string[]): number[] {
  if (!isDecisionObject(raw)) {
    throw new Error("teacher probability keys do not match the question");
  }
  const rawKeys = Object.keys(raw);
  if (
    rawKeys.length !== answerKeys.length ||
    !answerKeys.every((key) => Object.prototype.hasOwnProperty.call(raw, key))
  ) {
    throw new Error("teacher probability keys do not match the question");
  }
  const values = answerKeys.map((key) => {
    const rawValue = raw[key];
    return typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number(rawValue)
        : NaN;
  });
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("teacher probabilities must be finite and in [0, 1]");
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("teacher probabilities sum to zero");
  return values.map((value) => value / total);
}

/** 温度平滑：p^(1/temp) 后重归一；temp=1 保持原分布，越大越平滑。 */
export function smooth(probs: Record<string, number>, temp: number): Record<string, number> {
  const raised = Object.fromEntries(
    Object.entries(probs).map(([key, value]) => [key, value ** (1 / temp)]),
  );
  const total = Object.values(raised).reduce((sum, value) => sum + value, 0);
  return total
    ? Object.fromEntries(Object.entries(raised).map(([key, value]) => [key, value / total]))
    : probs;
}

function copyQuestionDefinition(
  spec: DecisionQuestion,
): Pick<DecisionQuestion, "type" | "instructions" | "criteria"> {
  const question: Pick<DecisionQuestion, "type" | "instructions" | "criteria"> = {
    type: spec.type,
  };
  if (spec.instructions !== undefined) question.instructions = spec.instructions;
  if (spec.criteria !== undefined) question.criteria = spec.criteria;
  return question;
}

/** 一条原始行 → 一条训练记录（硬标签必有，软标签可选）；无效行返回 null。 */
export function toTrainingRecord(
  row: RawLabelRow,
  workload: WorkloadConfig,
  targetTemp: number,
  soft: boolean,
): ConversionResult {
  if (row.missing && row.missing.length > 0) return { record: null, intentMatch: {} };
  const plan = row.plan ?? {};
  const unknowable = plan.difficulty === "unknowable";
  const record: TrainingRecord = { state: row.state, questions: {} };
  if (unknowable) record._meta = { source: "unknowable" };
  const intentMatch: Record<string, boolean> = {};

  for (const [questionId, spec] of Object.entries(workload.questions)) {
    const definition = copyQuestionDefinition(spec);
    let probs: Record<string, number>;
    let keys: string[];
    try {
      const answer = row.answers?.[questionId];
      if (!answer) throw new Error("missing teacher answer");
      keys = Object.keys(questionOptions(spec));
      const raw =
        spec.type === "noul"
          ? { true: Number(answer.noul), false: 1 - Number(answer.noul) }
          : answer.probabilities;
      const values = alignRow(raw, keys);
      probs = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    } catch {
      return { record: null, intentMatch: {} };
    }
    const best = keys.reduce((bestKey, key) => (probs[key] > probs[bestKey] ? key : bestKey));
    const label =
      spec.type === "noul" ? probs.true >= 0.5 : spec.type === "score" ? Number(best) : best;
    const question: TrainingQuestion = { ...definition, label };
    if (unknowable) {
      question.target = Object.fromEntries(keys.map((key) => [key, 1 / keys.length]));
    } else if (soft) {
      question.target = smooth(probs, targetTemp);
    }
    record.questions[questionId] = question;
    if (Object.prototype.hasOwnProperty.call(plan, questionId)) {
      intentMatch[questionId] = String(label) === String(plan[questionId]);
    }
  }
  return { record, intentMatch };
}
