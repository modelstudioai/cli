/**
 * 决策数据合成的工作负载配置（workload.json）。
 *
 * 换业务只需改这份配置：`description` 写业务与判断目标，`state_schema` 写输入字段
 * 及内容要求，`questions` 定义问题与答案选项，`guidance` 补充判断规则；`axes` /
 * `difficulty_hints` 用于均衡生成画像，可省略。问题定义的结构规则与推理 / 训练校验
 * 共用 `decision/questions.ts`，保证合成数据与线上请求的问题定义一致。
 */
import { BailianError } from "../../errors/base.ts";
import { ExitCode } from "../../errors/codes.ts";
import { inspectDecisionQuestions, isDecisionObject } from "../../decision/questions.ts";
import type { DecisionQuestion } from "../../decision/request.ts";
import { readTextFromPathOrStdin } from "../../utils/fs.ts";

export interface WorkloadConfig {
  name?: string;
  language?: string;
  description?: string;
  state_schema?: Record<string, string>;
  id_fields?: string[];
  questions: Record<string, DecisionQuestion>;
  guidance?: string[];
  axes?: Record<string, unknown[]>;
  difficulty_hints?: Record<string, string>;
}

/** 记录编号字段（去重时忽略）；未配置时沿用示例默认的 ticket_id。 */
export function workloadIdFields(workload: WorkloadConfig): string[] {
  return workload.id_fields ?? ["ticket_id"];
}

function usageError(english: string, chinese: string): BailianError {
  return new BailianError(`${english} / ${chinese}`, ExitCode.USAGE);
}

/** 结构解析：必须是对象且含非空问题表；其余字段按类型收取，非法即 USAGE。 */
export function parseWorkload(parsed: unknown): WorkloadConfig {
  if (!isDecisionObject(parsed)) {
    throw usageError("workload must be a JSON object.", "workload 必须是 JSON 对象。");
  }
  if (!isDecisionObject(parsed.questions) || Object.keys(parsed.questions).length === 0) {
    throw usageError(
      'workload must define a non-empty "questions" object.',
      'workload 必须定义非空的 "questions" 对象。',
    );
  }
  const workload: WorkloadConfig = {
    questions: parsed.questions as Record<string, DecisionQuestion>,
  };
  if (typeof parsed.name === "string") workload.name = parsed.name;
  if (typeof parsed.language === "string") workload.language = parsed.language;
  if (typeof parsed.description === "string") workload.description = parsed.description;
  if (isDecisionObject(parsed.state_schema)) {
    workload.state_schema = parsed.state_schema as Record<string, string>;
  }
  if (Array.isArray(parsed.id_fields)) {
    workload.id_fields = parsed.id_fields.filter(
      (field): field is string => typeof field === "string",
    );
  }
  if (Array.isArray(parsed.guidance)) {
    workload.guidance = parsed.guidance.filter((rule): rule is string => typeof rule === "string");
  }
  if (isDecisionObject(parsed.axes)) workload.axes = parsed.axes as Record<string, unknown[]>;
  if (isDecisionObject(parsed.difficulty_hints)) {
    workload.difficulty_hints = parsed.difficulty_hints as Record<string, string>;
  }
  return workload;
}

/** 读取并解析 workload 文件（`-` 表示 stdin）。 */
export function loadWorkload(path: string): WorkloadConfig {
  const raw = readTextFromPathOrStdin(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw usageError(
      `workload is not valid JSON: ${reason}`,
      `workload 不是合法的 JSON：${reason}`,
    );
  }
  return parseWorkload(parsed);
}

/**
 * 语义校验：问题定义复用决策共享规则；生成模式额外要求 description、
 * 非空 state_schema，以及（若提供）每个 axis 至少一个取值。校验在调用 API 前执行。
 */
export function validateWorkload(workload: WorkloadConfig, forGeneration: boolean): void {
  const questionIssues = inspectDecisionQuestions(workload.questions);
  if (questionIssues.length > 0) {
    throw usageError(
      `Invalid workload questions:\n${questionIssues.map((issue) => `- ${issue.message["en-US"]}`).join("\n")}`,
      `workload 问题定义不合法：\n${questionIssues.map((issue) => `- ${issue.message["zh-CN"]}`).join("\n")}`,
    );
  }
  if (!forGeneration) return;

  if (typeof workload.description !== "string" || workload.description.trim().length === 0) {
    throw usageError(
      'workload needs a non-empty "description" for generation.',
      '生成模式需要非空的 "description"。',
    );
  }
  const schema = workload.state_schema;
  if (!isDecisionObject(schema) || Object.keys(schema).length === 0) {
    throw usageError(
      'workload must define at least one input field in "state_schema" for generation.',
      '生成模式必须在 "state_schema" 中定义至少一个输入字段。',
    );
  }
  for (const [fieldName, requirement] of Object.entries(schema)) {
    if (typeof requirement !== "string" || requirement.trim().length === 0) {
      throw usageError(
        `state_schema["${fieldName}"] must be a non-empty content requirement string.`,
        `state_schema["${fieldName}"] 必须是非空的内容要求字符串。`,
      );
    }
  }
  if (workload.axes) {
    for (const [axisName, values] of Object.entries(workload.axes)) {
      if (!Array.isArray(values) || values.length === 0) {
        throw usageError(
          `each axis must contain at least one value (axis "${axisName}" is empty).`,
          `每个 axis 至少要有一个取值（axis "${axisName}" 为空）。`,
        );
      }
    }
  }
}
