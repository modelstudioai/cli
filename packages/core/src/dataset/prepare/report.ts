/**
 * 数据准备的质量与用量报告：标签均衡、生成意图与 teacher 标注一致率、manifest。
 *
 * manifest 用 workload 文件的 SHA256 钉住“是哪一版问题定义产出了这批标签”——若它
 * 与线上 workload.json 不再匹配，说明数据与服务的问题定义已经漂移。token 预算检查
 * 依赖 Python transformers 分词器，CLI 无对应依赖，标记 skipped 并注明原因，不做
 * 臆造的 token 计数。
 */
import type { TrainingRecord } from "./label.ts";
import type { WorkloadConfig } from "./workload.ts";

/** 每个问题的硬标签分布（选项 → 计数）。 */
export function balanceReport(
  records: readonly TrainingRecord[],
  workload: WorkloadConfig,
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const [questionId, spec] of Object.entries(workload.questions)) {
    const keys =
      spec.type === "choice"
        ? Object.keys((spec.criteria ?? {}) as Record<string, unknown>)
        : spec.type === "score"
          ? Array.from({ length: (spec.criteria as unknown[]).length }, (_level, index) =>
              String(index),
            )
          : ["false", "true"];
    counts[questionId] = Object.fromEntries(keys.map((key) => [key, 0]));
  }
  for (const record of records) {
    for (const [questionId, question] of Object.entries(record.questions)) {
      const key = String(question.label);
      const bucket = counts[questionId] ?? (counts[questionId] = {});
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
  }
  return counts;
}

export interface AgreementTally {
  hit: number;
  total: number;
}

/** 生成意图与 teacher 硬标签的一致率（保留 4 位小数）。 */
export function agreementRatio(agreement: Record<string, AgreementTally>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(agreement).map(([questionId, tally]) => [
      questionId,
      tally.total > 0 ? Number((tally.hit / tally.total).toFixed(4)) : 0,
    ]),
  );
}

export interface UsageSummary {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ManifestInput {
  created: string;
  mode: "generate" | "from_states" | "from_raw";
  workloadPath: string;
  rawPath: string;
  workloadSha256: string;
  generator: {
    model: string | null;
    base_url: string | null;
    seed: number;
    target_temp: number;
    soft_target: boolean;
  };
  unknowableRecords: number;
  rejectedRawRecords: number;
  duplicateRawRecords: number;
  records: { train: number; development: number };
  labelBalance: Record<string, Record<string, number>>;
  agreement: Record<string, number>;
  wallSeconds: number;
  usage: UsageSummary | null;
}

/** 组装 manifest（结构对齐示例脚本；token 检查标记 skipped）。 */
export function buildManifest(input: ManifestInput): Record<string, unknown> {
  return {
    created: input.created,
    mode: input.mode,
    workload: input.workloadPath,
    raw: input.rawPath,
    workload_sha256: input.workloadSha256,
    generator: input.generator,
    unknowable_records: input.unknowableRecords,
    rejected_raw_records: input.rejectedRawRecords,
    duplicate_raw_records: input.duplicateRawRecords,
    state_token_check: {
      status: "skipped",
      reason:
        "State token-budget check needs the Python transformers tokenizer, which the CLI does not bundle.",
    },
    records: input.records,
    label_balance: input.labelBalance,
    generator_teacher_agreement: input.agreement,
    wall_s: input.wallSeconds,
    usage: input.usage,
  };
}
