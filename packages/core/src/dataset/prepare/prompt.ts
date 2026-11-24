/**
 * 数据合成的提示词构造（teacher 标注 / 业务输入生成）。
 *
 * 提示词正文沿用示例脚本：teacher 被要求对每个问题输出概率分布（和为 1），生成
 * 模型按 state_schema 与画像构造原始输入。这些是发给模型的 prompt 内容，不是 CLI
 * 用户面文案。问题选项键的顺序（choice 按 criteria、score 按档位下标、noul 按
 * false/true）与训练记录 / 推理 API 保持一致。
 */
import {
  MAX_DECISION_CHOICE_OPTIONS,
  MAX_DECISION_SCORE_LEVELS,
  MIN_DECISION_SCORE_LEVELS,
  isDecisionObject,
} from "../../decision/questions.ts";
import type { DecisionQuestion } from "../../decision/request.ts";
import type { ChatMessage } from "../../types/api.ts";
import { renderValue } from "./parse.ts";
import type { GenerationPlan } from "./plan.ts";
import type { WorkloadConfig } from "./workload.ts";

export const TEACHER_SYSTEM_PROMPT =
  "You are a precise, deterministic decision engine that answers structured " +
  "questions about a given STATE. For every question you receive, you must produce a " +
  "probability distribution over that question's candidate answer keys.\n\n" +
  "Rules:\n" +
  "1. Base every probability only on evidence in the STATE. Read it literally and carefully; " +
  "extract exact facts (numbers, ids, names, dates, amounts) when asked.\n" +
  "2. Each question is independent. Judge it on its own; do not let other questions bias it.\n" +
  "3. Output a distribution per question whose probabilities sum to 1.0.\n" +
  "4. Represent uncertainty faithfully: when the STATE clearly determines the answer, put >=0.9 on it; when " +
  "evidence is genuinely ambiguous or conflicting, spread the mass honestly instead of " +
  "guessing with false confidence. Distinguish what is stated from what is merely implied.\n" +
  "5. For ordinal score levels, prefer adjacent levels when uncertain (do not jump from " +
  "lowest to highest without strong evidence).\n" +
  "6. When the instructions state an explicit policy, rule, or ONLY-if condition, apply it " +
  "literally and exclusively: the answer is decided solely by whether the rule's stated " +
  "conditions are present in the STATE. Do not introduce rules from other business domains. " +
  "Use tone or wording only when relevant to the question and supplied business rules.\n" +
  "7. When asked to select an exact value (id, amount, phone, date, name) from the STATE, " +
  "copy it verbatim and prefer the candidate whose text matches the STATE exactly.\n" +
  "8. Think privately and thoroughly first. Your final message must be ONLY a JSON object, " +
  "with no prose, no markdown fences, no commentary.";

const GENERATION_SYSTEM_PROMPT =
  "你在按给定业务配置构造训练样本，只生成模型需要判断的原始输入。\n" +
  "要求：\n" +
  "1. 遵循业务场景、字段说明和业务规则，每条输入独立、自然，符合实际使用场景。\n" +
  "2. 覆盖不同内容和表达，避免只替换编号或名称的重复样本。\n" +
  "3. 用具体事实体现生成画像，不把答案、标签或分析写进输入。\n" +
  "4. 只输出 JSON，不要 markdown 代码块，不要任何解释。";

const DEFAULT_DIFFICULTY_HINTS: Record<string, string> = {
  clean: "信息完整，判断依据明确。",
  hard: "包含干扰信息或边界情况，但保留足够的判断依据。",
  unknowable: "缺少作出判断所需的信息，不补充可推断答案的事实。",
};

/** 校验单个问题并返回有序答案键 → 描述；非法定义抛错（调用方捕获后跳过该记录）。 */
export function questionOptions(spec: DecisionQuestion): Record<string, string> {
  const kind = spec.type;
  const criteria = spec.criteria;
  if (kind === "choice" && isDecisionObject(criteria)) {
    const optionCount = Object.keys(criteria).length;
    if (optionCount >= 1 && optionCount <= MAX_DECISION_CHOICE_OPTIONS) {
      return criteria as Record<string, string>;
    }
  } else if (kind === "score" && Array.isArray(criteria)) {
    if (
      criteria.length >= MIN_DECISION_SCORE_LEVELS &&
      criteria.length <= MAX_DECISION_SCORE_LEVELS
    ) {
      return Object.fromEntries(criteria.map((level, index) => [String(index), String(level)]));
    }
  } else if (kind === "noul") {
    if (criteria === undefined) return { false: "No", true: "Yes" };
    if (
      isDecisionObject(criteria) &&
      Object.keys(criteria).length === 2 &&
      "false" in criteria &&
      "true" in criteria
    ) {
      return { false: String(criteria.false), true: String(criteria.true) };
    }
  }
  throw new Error("expected choice (1..255 options), score (2..255 levels), or noul");
}

const QUESTION_HEADINGS: Record<string, string> = {
  choice: "  candidate answer keys => description:",
  score: "  ordinal levels, lowest to highest (key = level position):",
  noul: "  candidate answer keys (assign one distribution over BOTH):",
};

/**
 * 构造 teacher 标注消息：逐问题列出指令与候选键，要求只输出概率分布 JSON。
 * guidance 作为业务规则附在 system 提示词末尾（对齐脚本 label_states）。
 */
export function buildTeacherMessages(
  state: unknown,
  questions: Record<string, DecisionQuestion>,
  guidance: string[] = [],
): ChatMessage[] {
  const blocks: string[] = [];
  const skeleton: Record<string, Record<string, number>> = {};
  for (const [questionId, spec] of Object.entries(questions)) {
    const kind = spec.type;
    let questionText = renderValue(spec.instructions ?? "");
    let options = questionOptions(spec);
    skeleton[questionId] = Object.fromEntries(Object.keys(options).map((key) => [key, 0]));
    if (kind === "noul") {
      if (spec.criteria !== undefined) {
        questionText += `\nYes means: ${renderValue(options.true)}\nNo means: ${renderValue(options.false)}`;
      }
      options = { false: "the answer is No", true: "the answer is Yes" };
    }
    const lines = [
      `QUESTION id="${questionId}"  type=${kind}`,
      `  instructions: ${questionText}`,
      QUESTION_HEADINGS[kind],
    ];
    for (const [key, value] of Object.entries(options)) {
      let description = renderValue(value);
      if (kind === "choice") description = value === null ? key : `${key}: ${description}`;
      const label = kind === "noul" ? `"${key}"`.padEnd(7) : `"${key}"`;
      lines.push(`    ${label} => ${description}`);
    }
    blocks.push(lines.join("\n"));
  }
  const user =
    `STATE:\n${renderValue(state)}\n\n` +
    `Answer ALL ${Object.keys(questions).length} question(s) below about this STATE.\n\n` +
    `${blocks.join("\n\n")}\n\n` +
    "OUTPUT FORMAT — return ONLY this JSON object (keys exactly as shown, floats summing " +
    "to 1.0 within each question):\n" +
    JSON.stringify(skeleton);
  const system =
    TEACHER_SYSTEM_PROMPT +
    (guidance.length > 0 ? `\n\nBusiness rules:\n${renderValue(guidance)}` : "");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 构造业务输入生成消息：按 state_schema 与画像批量生成原始输入（不含答案）。 */
export function buildGenerationMessages(
  workload: WorkloadConfig,
  plans: GenerationPlan[],
): ChatMessage[] {
  const schema = Object.entries(workload.state_schema ?? {})
    .map(([fieldName, requirement]) => `  "${fieldName}": ${requirement}`)
    .join("\n");
  const hints = { ...DEFAULT_DIFFICULTY_HINTS, ...workload.difficulty_hints };
  const lines = plans.map((plan, index) => {
    const profile = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "index"));
    return `  [${index}] ${renderValue(profile)}\n      ${hints[plan.difficulty] ?? ""}`;
  });
  const user =
    `业务场景：${workload.description ?? ""}\n\n` +
    `需要判断的问题：${renderValue(workload.questions)}\n\n` +
    `业务规则：${renderValue(workload.guidance ?? [])}\n\n` +
    `每条输入是一个 JSON 对象，必须包含以下字段，字段名保持一致：\n${schema}\n\n` +
    "画像中与问题 ID 同名的字段表示期望答案；score 使用从 0 开始的档位下标。\n" +
    `按下面 ${plans.length} 个画像各写一条，顺序对应输出数组的下标：\n${lines.join("\n")}\n\n` +
    `输出格式：{"samples": [...]}，数组长度为 ${plans.length}，元素为上述对象。`;
  return [
    { role: "system", content: GENERATION_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
