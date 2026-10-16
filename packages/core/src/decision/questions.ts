/**
 * 决策模型（TypeSafe System One）问题定义与 state 的结构校验。
 *
 * 推理请求（`bl decision`）与训练数据校验（`decision` record schema）共用这里的
 * 规则；训练侧在此之上再校验 `label` / `target`。规则以决策模型 API 文档为准：
 * - state：非空字符串、对象或数组；
 * - instructions：可选字符串；
 * - choice.criteria：选项名 → 描述，1–255 项；
 * - score.criteria：从低到高的等级描述数组，2–255 级；
 * - noul.criteria：可选，只能包含 `true` / `false` 描述。
 */

export const DECISION_QUESTION_TYPES = ["choice", "noul", "score"] as const;
export type DecisionQuestionType = (typeof DECISION_QUESTION_TYPES)[number];

export const MAX_DECISION_CHOICE_OPTIONS = 255;
export const MIN_DECISION_SCORE_LEVELS = 2;
export const MAX_DECISION_SCORE_LEVELS = 255;

const NOUL_CRITERIA_KEYS = new Set(["true", "false"]);

export interface DecisionIssue {
  code: string;
  /** 双语文案：命令层用 `ctx.localize` 渲染，训练校验拼成 `英文 / 中文`。 */
  message: { readonly "en-US": string; readonly "zh-CN": string };
  path: string;
}

export function isDecisionObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function decisionIssue(
  code: string,
  path: string,
  english: string,
  chinese: string,
): DecisionIssue {
  return { code, path, message: { "en-US": english, "zh-CN": chinese } };
}

export function inspectDecisionState(state: unknown, path = "state"): DecisionIssue[] {
  const isValid =
    isNonEmptyString(state) ||
    (Array.isArray(state) && state.length > 0) ||
    (isDecisionObject(state) && Object.keys(state).length > 0);
  if (isValid) return [];
  return [
    decisionIssue(
      "DECISION_INVALID_STATE",
      path,
      `"${path}" must be a non-empty string, object, or array.`,
      `"${path}" 必须是非空字符串、对象或数组。`,
    ),
  ];
}

function inspectChoiceCriteria(criteria: unknown, path: string): DecisionIssue[] {
  const criteriaPath = `${path}.criteria`;
  if (!isDecisionObject(criteria)) {
    return [
      decisionIssue(
        "DECISION_INVALID_CHOICE_CRITERIA",
        criteriaPath,
        `"${criteriaPath}" must be an option-to-description object.`,
        `"${criteriaPath}" 必须是“选项名到描述”的对象。`,
      ),
    ];
  }
  const optionCount = Object.keys(criteria).length;
  if (optionCount < 1 || optionCount > MAX_DECISION_CHOICE_OPTIONS) {
    return [
      decisionIssue(
        "DECISION_INVALID_CHOICE_CRITERIA",
        criteriaPath,
        `"${criteriaPath}" must contain 1-${MAX_DECISION_CHOICE_OPTIONS} options (got ${optionCount}).`,
        `"${criteriaPath}" 必须包含 1-${MAX_DECISION_CHOICE_OPTIONS} 个选项（当前 ${optionCount} 个）。`,
      ),
    ];
  }
  for (const [optionName, description] of Object.entries(criteria)) {
    if (!isNonEmptyString(optionName) || !isNonEmptyString(description)) {
      return [
        decisionIssue(
          "DECISION_INVALID_CHOICE_CRITERIA",
          `${criteriaPath}.${optionName}`,
          `Choice option names and descriptions in "${criteriaPath}" must be non-empty strings.`,
          `"${criteriaPath}" 中的选项名和描述必须是非空字符串。`,
        ),
      ];
    }
  }
  return [];
}

function inspectScoreCriteria(criteria: unknown, path: string): DecisionIssue[] {
  const criteriaPath = `${path}.criteria`;
  if (!Array.isArray(criteria) || criteria.some((level) => !isNonEmptyString(level))) {
    return [
      decisionIssue(
        "DECISION_INVALID_SCORE_CRITERIA",
        criteriaPath,
        `"${criteriaPath}" must be an array of non-empty level descriptions, from low to high.`,
        `"${criteriaPath}" 必须是从低到高排列、由非空等级描述组成的数组。`,
      ),
    ];
  }
  if (criteria.length < MIN_DECISION_SCORE_LEVELS || criteria.length > MAX_DECISION_SCORE_LEVELS) {
    return [
      decisionIssue(
        "DECISION_INVALID_SCORE_CRITERIA",
        criteriaPath,
        `"${criteriaPath}" must contain ${MIN_DECISION_SCORE_LEVELS}-${MAX_DECISION_SCORE_LEVELS} levels (got ${criteria.length}).`,
        `"${criteriaPath}" 必须包含 ${MIN_DECISION_SCORE_LEVELS}-${MAX_DECISION_SCORE_LEVELS} 个等级（当前 ${criteria.length} 个）。`,
      ),
    ];
  }
  return [];
}

function inspectNoulCriteria(criteria: unknown, path: string): DecisionIssue[] {
  if (criteria === undefined) return [];
  const criteriaPath = `${path}.criteria`;
  const isValid =
    isDecisionObject(criteria) &&
    Object.entries(criteria).every(
      ([criterionKey, description]) =>
        NOUL_CRITERIA_KEYS.has(criterionKey) && typeof description === "string",
    );
  if (isValid) return [];
  return [
    decisionIssue(
      "DECISION_INVALID_NOUL_CRITERIA",
      criteriaPath,
      `"${criteriaPath}" is optional; when provided it must be an object with only "true" / "false" string descriptions.`,
      `"${criteriaPath}" 为可选项；填写时必须是只包含 "true" / "false" 字符串描述的对象。`,
    ),
  ];
}

/** 校验单个问题定义（不含训练专用的 label / target）。 */
export function inspectDecisionQuestion(question: unknown, path: string): DecisionIssue[] {
  if (!isDecisionObject(question)) {
    return [
      decisionIssue(
        "DECISION_QUESTION_NOT_OBJECT",
        path,
        `"${path}" must be an object.`,
        `"${path}" 必须是对象。`,
      ),
    ];
  }

  const issues: DecisionIssue[] = [];
  if (question.instructions !== undefined && typeof question.instructions !== "string") {
    issues.push(
      decisionIssue(
        "DECISION_INVALID_INSTRUCTIONS",
        `${path}.instructions`,
        `"${path}.instructions" must be a string when provided.`,
        `"${path}.instructions" 填写时必须是字符串。`,
      ),
    );
  }

  if (question.type === "choice") {
    issues.push(...inspectChoiceCriteria(question.criteria, path));
  } else if (question.type === "noul") {
    issues.push(...inspectNoulCriteria(question.criteria, path));
  } else if (question.type === "score") {
    issues.push(...inspectScoreCriteria(question.criteria, path));
  } else {
    issues.push(
      decisionIssue(
        "DECISION_INVALID_QUESTION_TYPE",
        `${path}.type`,
        `"${path}.type" must be choice, noul, or score.`,
        `"${path}.type" 必须是 choice、noul 或 score。`,
      ),
    );
  }
  return issues;
}

/** 校验问题表本身是否为非空对象。 */
export function inspectDecisionQuestionTable(
  questions: unknown,
  path = "questions",
): DecisionIssue[] {
  if (isDecisionObject(questions) && Object.keys(questions).length > 0) return [];
  return [
    decisionIssue(
      "DECISION_INVALID_QUESTIONS",
      path,
      `"${path}" must be a non-empty object keyed by question ID.`,
      `"${path}" 必须是以问题 ID 为键的非空对象。`,
    ),
  ];
}

export function inspectDecisionQuestionId(questionId: string, path = "questions"): DecisionIssue[] {
  if (isNonEmptyString(questionId)) return [];
  return [
    decisionIssue(
      "DECISION_INVALID_QUESTION_ID",
      path,
      "Question IDs must be non-empty strings.",
      "问题 ID 必须是非空字符串。",
    ),
  ];
}

/** 校验完整问题表：表结构、每个问题 ID 与问题定义。 */
export function inspectDecisionQuestions(questions: unknown, path = "questions"): DecisionIssue[] {
  const tableIssues = inspectDecisionQuestionTable(questions, path);
  if (tableIssues.length > 0) return tableIssues;

  const issues: DecisionIssue[] = [];
  for (const [questionId, question] of Object.entries(questions as Record<string, unknown>)) {
    const idIssues = inspectDecisionQuestionId(questionId, path);
    if (idIssues.length > 0) {
      issues.push(...idIssues);
      continue;
    }
    issues.push(...inspectDecisionQuestion(question, `${path}.${questionId}`));
  }
  return issues;
}
