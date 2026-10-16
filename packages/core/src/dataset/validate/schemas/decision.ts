/**
 * 决策模型训练记录 Schema。
 *
 * 每条记录由输入状态 `state` 和问题定义 `questions` 组成。问题支持：
 * - choice：封闭选项分类；
 * - noul：是非判断；
 * - score：从低到高的离散评分。
 *
 * `state` 与问题定义的结构规则与推理 API 共用（见 `decision/questions.ts`）；
 * 训练侧额外要求 `label` 硬标签，`target` 是可选软标签概率分布。
 */
import {
  inspectDecisionQuestion,
  inspectDecisionQuestionId,
  inspectDecisionQuestionTable,
  inspectDecisionState,
  isDecisionObject,
  type DecisionIssue,
} from "../../../decision/questions.ts";
import { makeIssue } from "../common.ts";
import type { ValidationIssue } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";

const TARGET_SUM_TOLERANCE = 1e-6;

function decisionIssue(
  code: string,
  message: string,
  lineNo: number,
  path: string,
): ValidationIssue {
  return makeIssue("error", code, message, { line: lineNo, path });
}

function toValidationIssue(issue: DecisionIssue, lineNo: number): ValidationIssue {
  return decisionIssue(
    issue.code,
    `${issue.message["en-US"]} / ${issue.message["zh-CN"]}`,
    lineNo,
    issue.path,
  );
}

function validateTarget(
  target: unknown,
  expectedKeys: string[],
  lineNo: number,
  path: string,
): ValidationIssue[] {
  if (!isDecisionObject(target)) {
    return [
      decisionIssue(
        "DECISION_INVALID_TARGET",
        `"${path}" must be an object containing a complete probability distribution. / "${path}" 必须是包含完整概率分布的对象。`,
        lineNo,
        path,
      ),
    ];
  }

  const targetKeys = Object.keys(target).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    targetKeys.length !== sortedExpectedKeys.length ||
    targetKeys.some((targetKey, index) => targetKey !== sortedExpectedKeys[index])
  ) {
    return [
      decisionIssue(
        "DECISION_INVALID_TARGET_KEYS",
        `"${path}" must contain exactly these keys: ${sortedExpectedKeys.join(", ")}. / "${path}" 必须且只能包含这些键：${sortedExpectedKeys.join(", ")}。`,
        lineNo,
        path,
      ),
    ];
  }

  let probabilitySum = 0;
  for (const targetKey of sortedExpectedKeys) {
    const probability = target[targetKey];
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      return [
        decisionIssue(
          "DECISION_INVALID_TARGET_PROBABILITY",
          `"${path}.${targetKey}" must be a finite number in [0, 1]. / "${path}.${targetKey}" 必须是 [0, 1] 范围内的有限数字。`,
          lineNo,
          `${path}.${targetKey}`,
        ),
      ];
    }
    probabilitySum += probability;
  }

  if (Math.abs(probabilitySum - 1) > TARGET_SUM_TOLERANCE) {
    return [
      decisionIssue(
        "DECISION_TARGET_SUM_NOT_ONE",
        `Probabilities in "${path}" must sum to 1 (got ${probabilitySum}). / "${path}" 中的概率之和必须为 1（当前为 ${probabilitySum}）。`,
        lineNo,
        path,
      ),
    ];
  }

  return [];
}

/** 问题定义已通过共享校验后，再校验 choice 的 label / target。 */
function validateChoiceLabels(
  question: Record<string, unknown>,
  lineNo: number,
  path: string,
): ValidationIssue[] {
  const optionKeys = Object.keys(question.criteria as Record<string, unknown>);
  if (typeof question.label !== "string" || !optionKeys.includes(question.label)) {
    return [
      decisionIssue(
        "DECISION_INVALID_CHOICE_LABEL",
        `"${path}.label" must be one of: ${optionKeys.join(", ")}. / "${path}.label" 必须是以下选项之一：${optionKeys.join(", ")}。`,
        lineNo,
        `${path}.label`,
      ),
    ];
  }

  return question.target === undefined
    ? []
    : validateTarget(question.target, optionKeys, lineNo, `${path}.target`);
}

function validateNoulLabels(
  question: Record<string, unknown>,
  lineNo: number,
  path: string,
): ValidationIssue[] {
  if (typeof question.label !== "boolean") {
    return [
      decisionIssue(
        "DECISION_INVALID_NOUL_LABEL",
        `"${path}.label" must be true or false. / "${path}.label" 必须是 true 或 false。`,
        lineNo,
        `${path}.label`,
      ),
    ];
  }

  return question.target === undefined
    ? []
    : validateTarget(question.target, ["true", "false"], lineNo, `${path}.target`);
}

function validateScoreLabels(
  question: Record<string, unknown>,
  lineNo: number,
  path: string,
): ValidationIssue[] {
  const levelCount = (question.criteria as unknown[]).length;
  if (
    typeof question.label !== "number" ||
    !Number.isInteger(question.label) ||
    question.label < 0 ||
    question.label >= levelCount
  ) {
    return [
      decisionIssue(
        "DECISION_INVALID_SCORE_LABEL",
        `"${path}.label" must be an integer from 0 to ${levelCount - 1}. / "${path}.label" 必须是 0 到 ${levelCount - 1} 之间的整数。`,
        lineNo,
        `${path}.label`,
      ),
    ];
  }

  const scoreKeys = Array.from({ length: levelCount }, (_level, levelIndex) => String(levelIndex));
  return question.target === undefined
    ? []
    : validateTarget(question.target, scoreKeys, lineNo, `${path}.target`);
}

function inspectDecisionRecord(record: Record<string, unknown>, lineNo: number): ValidationIssue[] {
  const issues: ValidationIssue[] = inspectDecisionState(record.state).map((issue) =>
    toValidationIssue(issue, lineNo),
  );

  const questions = record.questions;
  const tableIssues = inspectDecisionQuestionTable(questions);
  if (tableIssues.length > 0) {
    issues.push(...tableIssues.map((issue) => toValidationIssue(issue, lineNo)));
    return issues;
  }

  for (const [questionId, questionValue] of Object.entries(questions as Record<string, unknown>)) {
    const idIssues = inspectDecisionQuestionId(questionId);
    if (idIssues.length > 0) {
      issues.push(...idIssues.map((issue) => toValidationIssue(issue, lineNo)));
      continue;
    }

    const path = `questions.${questionId}`;
    const definitionIssues = inspectDecisionQuestion(questionValue, path);
    if (definitionIssues.length > 0) {
      issues.push(...definitionIssues.map((issue) => toValidationIssue(issue, lineNo)));
      continue;
    }

    const question = questionValue as Record<string, unknown>;
    if (question.type === "choice") {
      issues.push(...validateChoiceLabels(question, lineNo, path));
    } else if (question.type === "noul") {
      issues.push(...validateNoulLabels(question, lineNo, path));
    } else {
      issues.push(...validateScoreLabels(question, lineNo, path));
    }
  }

  return issues;
}

export const decisionSchema: RecordSchemaSpec = {
  name: "decision",
  detect: (record) => !("messages" in record) && ("questions" in record || "state" in record),
  inspect: inspectDecisionRecord,
};
