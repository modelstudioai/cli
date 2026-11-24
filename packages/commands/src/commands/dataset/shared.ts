/**
 * dataset 域共享 helper：JSONL 读写、raw 转换，以及 generate 的转换尾段
 * finalizeDataset（转换 → 切分 → manifest → 报告）。
 *
 * 按“新功能不跨命令域收敛”的取舍在域内自实现，batch/shared.ts 零改动。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BailianError,
  ExitCode,
  MIN_SPLIT_RECORDS,
  agreementRatio,
  balanceReport,
  buildManifest,
  readTextFromPathOrStdin,
  sha256Hex,
  splitRecords,
  stateKey,
  toTrainingRecord,
  workloadIdFields,
  type AgreementTally,
  type CommandOutput,
  type ManifestInput,
  type RawLabelRow,
  type TrainingRecord,
  type UsageSummary,
  type WorkloadConfig,
} from "bailian-cli-core";

export function usageError(english: string, chinese: string): BailianError {
  return new BailianError(`${english} / ${chinese}`, ExitCode.USAGE);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 逐行读取 JSONL 对象行；空行跳过，非法行报 USAGE。 */
export function readObjectRows(path: string): Array<Record<string, unknown>> {
  const raw = readTextFromPathOrStdin(path);
  const rows: Array<Record<string, unknown>> = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw usageError(
        `${path} line ${index + 1} is not valid JSON.`,
        `${path} 第 ${index + 1} 行不是合法的 JSON。`,
      );
    }
    if (!isObject(parsed)) {
      throw usageError(
        `${path} line ${index + 1} must be a JSON object.`,
        `${path} 第 ${index + 1} 行必须是 JSON 对象。`,
      );
    }
    rows.push(parsed);
  }
  return rows;
}

/** 追加 JSONL 行；已有文件末尾缺换行时先补一个，避免手写 resume 文件与新行粘连。 */
export function appendJsonl(path: string, rows: string[]): void {
  if (rows.length === 0) return;
  let prefix = "";
  if (existsSync(path)) {
    const existing = readFileSync(path);
    if (existing.length > 0 && existing[existing.length - 1] !== 0x0a) prefix = "\n";
  }
  appendFileSync(path, prefix + rows.join("\n") + "\n");
}

export interface ConversionSummary {
  records: TrainingRecord[];
  agreement: Record<string, AgreementTally>;
  unknowableRecords: number;
  rejected: number;
  duplicates: number;
}

/** raw 行 → 训练记录：无效计 rejected、重复 state 计 duplicate，统计意图一致率。 */
export function convertRows(
  rows: Array<Record<string, unknown>>,
  workload: WorkloadConfig,
  targetTemp: number,
  soft: boolean,
): ConversionSummary {
  const idFields = workloadIdFields(workload);
  const records: TrainingRecord[] = [];
  const agreement: Record<string, AgreementTally> = {};
  const seen = new Set<string>();
  let unknowableRecords = 0;
  let rejected = 0;
  let duplicates = 0;
  for (const row of rows) {
    const { record, intentMatch } = toTrainingRecord(
      row as unknown as RawLabelRow,
      workload,
      targetTemp,
      soft,
    );
    if (!record) {
      rejected += 1;
      continue;
    }
    const key = stateKey(record.state, idFields);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    records.push(record);
    if (record._meta?.source === "unknowable") unknowableRecords += 1;
    for (const [questionId, matched] of Object.entries(intentMatch)) {
      const tally = agreement[questionId] ?? (agreement[questionId] = { hit: 0, total: 0 });
      tally.hit += matched ? 1 : 0;
      tally.total += 1;
    }
  }
  return { records, agreement, unknowableRecords, rejected, duplicates };
}

/** 文件时间戳（对齐脚本 %Y%m%d-%H%M%S-%f 形态）。 */
export function fileStamp(now: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `-${pad(now.getMilliseconds(), 3)}000`
  );
}

export interface FinalizeInput {
  workload: WorkloadConfig;
  workloadPath: string;
  rawPath: string;
  outDir: string;
  prefix: string;
  seed: number;
  targetTemp: number;
  soft: boolean;
  mode: ManifestInput["mode"];
  /** from_raw 模式为 null（无模型调用）。 */
  model: string | null;
  baseUrl: string | null;
  usage: UsageSummary | null;
  /** 命令启动时刻（Date.now()），用于 wall_s。 */
  started: number;
  schema?: string;
}

export interface DatasetFinalResult {
  action: "dataset.generate";
  mode: ManifestInput["mode"];
  schema: string;
  files: { train: string; development: string; manifest: string; raw: string };
  records: { train: number; development: number };
  unknowable_records: number;
  rejected_raw_records: number;
  duplicate_raw_records: number;
  label_balance: Record<string, Record<string, number>>;
  generator_teacher_agreement: Record<string, number>;
  usage: UsageSummary | null;
}

/**
 * 转换尾段（generate 专用）：读整份 raw → 转换 → 切分 →
 * 写 train/dev/manifest → stderr 质量与用量报告；返回结构化 result 由调用方输出。
 * 纯本地，零 API 调用。
 */
export function finalizeDataset(output: CommandOutput, input: FinalizeInput): DatasetFinalResult {
  const {
    workload,
    workloadPath,
    rawPath,
    outDir,
    prefix,
    seed,
    targetTemp,
    soft,
    mode,
    model,
    baseUrl,
    usage,
    started,
  } = input;
  const trainPath = join(outDir, `${prefix}.train.jsonl`);
  const developmentPath = join(outDir, `${prefix}.development.jsonl`);
  const manifestPath = join(outDir, `${prefix}.manifest.json`);

  // 转换阶段读取整份 raw（续跑时包含历史标签），保证 manifest 统计真实。
  const rows = mode === "from_raw" || existsSync(rawPath) ? readObjectRows(rawPath) : [];
  const summary = convertRows(rows, workload, targetTemp, soft);
  if (summary.records.length === 0) {
    throw new BailianError(
      "no usable records: check the API and skipped-batch/label messages above. / 没有可用记录：请检查 API 与上方跳过批次/标注的提示。",
      ExitCode.GENERAL,
    );
  }
  if (summary.records.length < MIN_SPLIT_RECORDS) {
    throw new BailianError(
      `need at least ${MIN_SPLIT_RECORDS} usable records for nonempty train/development splits, got ${summary.records.length}. / 非空 train/development 切分至少需要 ${MIN_SPLIT_RECORDS} 条可用记录，当前只有 ${summary.records.length} 条。`,
      ExitCode.GENERAL,
    );
  }

  const parts = splitRecords(summary.records, seed);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(trainPath, parts.train.map((record) => JSON.stringify(record)).join("\n") + "\n");
  writeFileSync(
    developmentPath,
    parts.development.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );

  const balance = balanceReport(summary.records, workload);
  const agreement = agreementRatio(summary.agreement);
  const wallSeconds = Number(((Date.now() - started) / 1000).toFixed(1));
  const manifest = buildManifest({
    created: new Date().toISOString(),
    mode,
    workloadPath,
    rawPath,
    workloadSha256: sha256Hex(readFileSync(workloadPath)),
    generator: {
      model,
      base_url: baseUrl,
      seed,
      target_temp: targetTemp,
      soft_target: soft,
    },
    unknowableRecords: summary.unknowableRecords,
    rejectedRawRecords: summary.rejected,
    duplicateRawRecords: summary.duplicates,
    records: { train: parts.train.length, development: parts.development.length },
    labelBalance: balance,
    agreement,
    wallSeconds,
    usage,
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");

  // 质量与用量报告走 stderr（info/warning），不污染 stdout 的结构化结果。
  const thin: string[] = [];
  const balanceLines = Object.entries(balance).map(([questionId, dist]) => {
    const total = Object.values(dist).reduce((sum, value) => sum + value, 0);
    const cells = Object.entries(dist)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        if (total > 0 && value / total < 0.05) thin.push(`${questionId}.${key}`);
        return `${key}=${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`;
      })
      .join("  ");
    return `  ${questionId}: ${cells}`;
  });
  output.info({
    "en-US": `=== balance (teacher labels) ===\n${balanceLines.join("\n")}`,
    "zh-CN": `=== 标签均衡（teacher 硬标签）===\n${balanceLines.join("\n")}`,
  });
  if (thin.length > 0) {
    output.warning({
      "en-US": `label balance under 5%: ${thin.join(", ")} — consider more samples or adjusted axes.`,
      "zh-CN": `标签占比低于 5%：${thin.join(", ")}——建议增加样本或调整 axes。`,
    });
  }
  if (Object.keys(summary.agreement).length > 0) {
    const agreementLines = Object.entries(summary.agreement).map(
      ([questionId, tally]) =>
        `  ${questionId}: ${tally.hit}/${tally.total} = ${Math.round((tally.hit / tally.total) * 100)}%`,
    );
    output.info({
      "en-US": `=== generator intent vs teacher label ===\n${agreementLines.join("\n")}`,
      "zh-CN": `=== 生成意图与 teacher 标注一致率 ===\n${agreementLines.join("\n")}`,
    });
  }
  if (usage) {
    output.info({
      "en-US": `=== usage: ${usage.calls} calls, ${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens, ${wallSeconds}s ===`,
      "zh-CN": `=== 用量：${usage.calls} 次调用，输入 ${usage.prompt_tokens} / 输出 ${usage.completion_tokens} token，耗时 ${wallSeconds}s ===`,
    });
  }

  return {
    action: "dataset.generate",
    mode,
    schema: input.schema ?? "decision",
    files: {
      train: trainPath,
      development: developmentPath,
      manifest: manifestPath,
      raw: rawPath,
    },
    records: { train: parts.train.length, development: parts.development.length },
    unknowable_records: summary.unknowableRecords,
    rejected_raw_records: summary.rejected,
    duplicate_raw_records: summary.duplicates,
    label_balance: balance,
    generator_teacher_agreement: agreement,
    usage,
  };
}
