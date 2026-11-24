/**
 * 数据准备用的 JSON 工具：规范化渲染与从模型回复中抽取 JSON。
 *
 * teacher / 生成模型的回复可能带 markdown 代码块或前导说明文字，需要稳健地取出
 * 第一个 JSON 对象/数组；state 去重键则要求与书写顺序无关的规范化序列化。
 */
import { isDecisionObject } from "../../decision/questions.ts";
import type { GenerationPlan } from "./plan.ts";

/** 递归按对象键排序，使序列化与键书写顺序无关（对齐 Python json sort_keys=True）。 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isDecisionObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** 字符串原样返回；其他值规范化（键排序）后 JSON 序列化。 */
export function renderValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(canonicalize(value));
}

const FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/g;

/**
 * 从 start 处的 `[` / `{` 起扫描配对的闭括号（跳过字符串与转义），截取第一个完整
 * JSON 值解析；等价于 Python json.JSONDecoder().raw_decode 忽略尾部多余内容。
 */
function rawDecode(text: string, start: number): unknown {
  const opener = text[start];
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === opener) depth++;
    else if (character === closer) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/** 读取 JSON 对象/数组：先试整体与代码块，再扫描前导 prose 后的第一个 JSON 值。 */
export function extractJson(text: string): unknown {
  if (!text) return undefined;
  const fenced = [...text.matchAll(FENCE_PATTERN)].map((match) => match[1]);
  for (const candidate of [text.trim(), ...fenced]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (isDecisionObject(value) || Array.isArray(value)) return value;
    } catch {
      // try next candidate
    }
  }
  for (const match of text.matchAll(/[[{]/g)) {
    const value = rawDecode(text, match.index ?? 0);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** 接受包裹列表（{"samples":[...]} 等）或裸数组；对象无数组值时回落为单元素。 */
export function extractItems(content: string): unknown[] | undefined {
  const parsed = extractJson(content);
  if (isDecisionObject(parsed)) {
    const found = Object.values(parsed).find((value) => Array.isArray(value));
    return found !== undefined ? (found as unknown[]) : [parsed];
  }
  return Array.isArray(parsed) ? parsed : undefined;
}

/** 生成阶段落盘的输入行：state + 可选画像（画像用于事后统计生成意图一致率）。 */
export interface StateItem {
  state: Record<string, unknown>;
  plan?: Record<string, unknown>;
}

export interface StateParseResult {
  items: StateItem[];
  /** JSON 无效或条数与画像不符（整批跳过）；个别字段缺失不算 invalid。 */
  invalid: boolean;
}

/**
 * 解析生成回复为 StateItem：条数须与画像一致，逐条要求 schema 字段非空；
 * 缺字段的个别条目静默跳过。同步与离线共用。
 */
export function parseStateItems(
  content: string,
  group: GenerationPlan[],
  schemaFields: string[],
): StateParseResult {
  const items = extractItems(content);
  if (!items || items.length !== group.length) return { items: [], invalid: true };
  const fresh: StateItem[] = [];
  for (let index = 0; index < group.length; index++) {
    const item = items[index];
    if (!isDecisionObject(item)) continue;
    const state: Record<string, unknown> = {};
    let complete = true;
    for (const field of schemaFields) {
      const value = item[field];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim().length === 0)
      ) {
        complete = false;
        break;
      }
      state[field] = value;
    }
    if (complete) fresh.push({ state, plan: group[index] });
  }
  return { items: fresh, invalid: false };
}
