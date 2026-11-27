/**
 * 已标注 JSONL 的去重与 train/development 切分（纯本地，不调用 API）。
 *
 * 去重键忽略 workload.id_fields 里的记录编号，只保留决策相关字段，规范化序列化后
 * 比对——同一输入不应在训练集与评估集里重复出现。切分用确定性种子洗牌后按比例取
 * development，其余为 train。
 */
import { isDecisionObject } from "../../decision/questions.ts";
import { renderValue } from "./parse.ts";
import { seededShuffle } from "./rng.ts";

/** 切出两份非空文件所需的最少记录数（与脚本一致）。 */
export const MIN_SPLIT_RECORDS = 7;

/** 默认 development 占比（脚本固定 0.15）。 */
export const DEFAULT_DEV_RATIO = 0.15;

/** 忽略记录编号字段后的规范化 state 键，用于跨记录去重。 */
export function stateKey(state: unknown, idFields: string[]): string {
  let normalized = state;
  if (isDecisionObject(state)) {
    normalized = Object.fromEntries(
      Object.entries(state).filter(([fieldName]) => !idFields.includes(fieldName)),
    );
  }
  return renderValue(normalized);
}

export interface SplitParts<T> {
  train: T[];
  development: T[];
}

/** 种子洗牌后按 devRatio 取整切分：前 devCount 条为 development，其余为 train。 */
export function splitRecords<T>(
  records: readonly T[],
  seed: number,
  devRatio: number = DEFAULT_DEV_RATIO,
): SplitParts<T> {
  const shuffled = seededShuffle(records, seed);
  const devCount = Math.floor(shuffled.length * devRatio);
  return { development: shuffled.slice(0, devCount), train: shuffled.slice(devCount) };
}

/** 按 state 去重，保留首次出现；返回去重结果与重复计数（generate 转换阶段用）。 */
export function dedupByState<T extends { state: unknown }>(
  records: readonly T[],
  idFields: string[],
): { unique: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;
  for (const record of records) {
    const key = stateKey(record.state, idFields);
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    unique.push(record);
  }
  return { unique, duplicateCount };
}
