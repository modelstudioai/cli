import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  BailianError,
  DEFAULT_DEV_RATIO,
  ExitCode,
  MIN_SPLIT_RECORDS,
  defineCommand,
  loadWorkload,
  readTextFromPathOrStdin,
  splitRecords,
  stateKey,
  validateDataset,
  workloadIdFields,
  type FlagsDef,
} from "bailian-cli-core";

const SPLIT_FLAGS = {
  input: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Labeled JSONL file to split (use - for stdin)",
      "zh-CN": "待切分的已标注 JSONL 文件（- 表示 stdin）",
    },
    required: true,
  },
  outDir: {
    type: "string",
    valueHint: "<dir>",
    description: {
      "en-US": "Output directory (default: output/custom)",
      "zh-CN": "输出目录（默认：output/custom）",
    },
  },
  prefix: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Output file name prefix (default: tickets)",
      "zh-CN": "输出文件名前缀（默认：tickets）",
    },
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Shuffle seed for a reproducible split (default: 0)",
      "zh-CN": "洗牌种子，保证切分可复现（默认：0）",
    },
  },
  devRatio: {
    type: "number",
    valueHint: "<ratio>",
    description: {
      "en-US": "Development share in (0, 1), floor(n * ratio) records (default: 0.15)",
      "zh-CN": "development 占比，取值 (0, 1)，按 floor(n * ratio) 取整（默认：0.15）",
    },
  },
  workload: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "workload.json used to read id_fields for dedup",
      "zh-CN": "用于读取去重忽略字段 id_fields 的 workload.json",
    },
  },
  idFields: {
    type: "string",
    valueHint: "<a,b>",
    description: {
      "en-US": "Comma-separated record-id fields ignored by dedup (overrides --workload)",
      "zh-CN": "去重时忽略的记录编号字段，逗号分隔（覆盖 --workload 的 id_fields）",
    },
  },
  schema: {
    type: "string",
    valueHint: "<s>",
    choices: ["decision"] as const,
    description: {
      "en-US": 'Record schema. Only "decision" (state/questions) is supported today.',
      "zh-CN": '记录 Schema。当前仅支持 "decision"（state/questions 决策数据）。',
    },
  },
} satisfies FlagsDef;

function usageError(english: string, chinese: string): BailianError {
  return new BailianError(`${english} / ${chinese}`, ExitCode.USAGE);
}

interface LabeledRecord {
  state: unknown;
  [field: string]: unknown;
}

/** 逐行解析 JSONL；空行跳过，非法行或非对象记录报 USAGE。 */
function readRecords(raw: string, inputPath: string): LabeledRecord[] {
  const records: LabeledRecord[] = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw usageError(
        `${inputPath} line ${index + 1} is not valid JSON.`,
        `${inputPath} 第 ${index + 1} 行不是合法的 JSON。`,
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw usageError(
        `${inputPath} line ${index + 1} must be a JSON object with "state".`,
        `${inputPath} 第 ${index + 1} 行必须是含 "state" 的 JSON 对象。`,
      );
    }
    const record = parsed as LabeledRecord;
    if (!("state" in record)) {
      throw usageError(
        `${inputPath} line ${index + 1} is missing "state".`,
        `${inputPath} 第 ${index + 1} 行缺少 "state"。`,
      );
    }
    records.push(record);
  }
  return records;
}

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US":
      "Split labeled decision JSONL into train/development files locally (dedup + seeded shuffle, no API calls)",
    "zh-CN":
      "在本地把已标注的决策 JSONL 切分为 train/development 两份文件（去重 + 种子洗牌，不调用 API）",
  },
  // 纯本地切分，零费用、不触网、不需 API key。
  auth: "none",
  usageArgs:
    "--input <path> [--out-dir <dir>] [--prefix <name>] [--seed <n>] [--dev-ratio <ratio>] [--workload <path>] [--id-fields <a,b>] [--schema decision]",
  flags: SPLIT_FLAGS,
  exampleArgs: [
    "--input labeled.jsonl",
    "--input labeled.jsonl --out-dir output/custom --prefix tickets",
    "--input labeled.jsonl --workload workload.json --seed 42",
    "--input labeled.jsonl --dev-ratio 0.2 --dry-run",
  ],
  notes: [
    {
      "en-US":
        'Only decision-model data (state/questions records) is supported today; --schema accepts "decision" only.',
      "zh-CN": '当前仅支持决策模型数据（state/questions 记录）；--schema 只接受 "decision"。',
    },
    {
      "en-US":
        "Dedup compares states ignoring record-id fields (id_fields from --workload, default ticket_id, or --id-fields); any duplicate state aborts with a usage error.",
      "zh-CN":
        "去重按忽略记录编号字段后的 state 比对（编号字段取 --workload 的 id_fields，默认 ticket_id，或用 --id-fields 覆盖）；发现重复 state 即以用法错误终止。",
    },
    {
      "en-US": `At least ${MIN_SPLIT_RECORDS} records are required so both output files are non-empty.`,
      "zh-CN": `至少需要 ${MIN_SPLIT_RECORDS} 条记录，保证两份输出文件都非空。`,
    },
    {
      "en-US":
        "development takes floor(n * --dev-ratio) records after a seeded shuffle; the rest go to train. The PRNG differs from Python random.Random, so the same seed reproduces splits within this CLI only.",
      "zh-CN":
        "种子洗牌后 development 取 floor(n * --dev-ratio) 条，其余为 train。随机源与 Python random.Random 不同，同一 seed 仅在本 CLI 内可复现。",
    },
    {
      "en-US":
        "Outputs <prefix>.train.jsonl and <prefix>.development.jsonl under --out-dir, then self-checks them with the decision training schema; --dry-run previews counts without writing.",
      "zh-CN":
        "在 --out-dir 下输出 <prefix>.train.jsonl 与 <prefix>.development.jsonl，并按决策训练 Schema 自检；--dry-run 仅预览计数，不写文件。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const inputPath = flags.input;
    const outDir = flags.outDir ?? "output/custom";
    const prefix = flags.prefix ?? "tickets";
    const seed = flags.seed ?? 0;
    const devRatio = flags.devRatio ?? DEFAULT_DEV_RATIO;
    if (!Number.isFinite(devRatio) || devRatio <= 0 || devRatio >= 1) {
      throw usageError(
        "--dev-ratio must be a finite number in (0, 1).",
        "--dev-ratio 必须是 (0, 1) 内的有限数值。",
      );
    }
    if (!Number.isFinite(seed)) {
      throw usageError("--seed must be a finite number.", "--seed 必须是有限数值。");
    }
    const idFields = flags.idFields
      ? flags.idFields
          .split(",")
          .map((field) => field.trim())
          .filter((field) => field.length > 0)
      : flags.workload
        ? workloadIdFields(loadWorkload(flags.workload))
        : ["ticket_id"];

    const records = readRecords(readTextFromPathOrStdin(inputPath), inputPath);
    const seen = new Set<string>();
    for (const record of records) {
      const key = stateKey(record.state, idFields);
      if (seen.has(key)) {
        throw usageError(
          `Duplicate state detected (ignoring id fields: ${idFields.join(", ")}). Deduplicate the input first.`,
          `检测到重复 state（已忽略编号字段：${idFields.join(", ")}）。请先对输入去重。`,
        );
      }
      seen.add(key);
    }
    if (records.length < MIN_SPLIT_RECORDS) {
      throw usageError(
        `Need at least ${MIN_SPLIT_RECORDS} records to split, got ${records.length}.`,
        `切分至少需要 ${MIN_SPLIT_RECORDS} 条记录，当前只有 ${records.length} 条。`,
      );
    }
    const parts = splitRecords(records, seed, devRatio);
    if (parts.development.length === 0 || parts.train.length === 0) {
      throw usageError(
        "--dev-ratio leaves one split empty; adjust it so both files are non-empty.",
        "--dev-ratio 导致某一份为空；请调整比例使两份文件都非空。",
      );
    }
    const trainPath = join(outDir, `${prefix}.train.jsonl`);
    const developmentPath = join(outDir, `${prefix}.development.jsonl`);
    const counts = {
      total: records.length,
      train: parts.train.length,
      development: parts.development.length,
    };

    if (settings.dryRun) {
      const preview = {
        action: "dataset.split",
        input: inputPath,
        schema: flags.schema ?? "decision",
        seed,
        dev_ratio: devRatio,
        id_fields: idFields,
        counts,
        files: { train: trainPath, development: developmentPath },
      };
      ctx.output.result(
        preview,
        settings.output === "text" ? { text: JSON.stringify(preview, null, 2) } : undefined,
      );
      return;
    }

    mkdirSync(outDir, { recursive: true });
    writeFileSync(trainPath, parts.train.map((record) => JSON.stringify(record)).join("\n") + "\n");
    writeFileSync(
      developmentPath,
      parts.development.map((record) => JSON.stringify(record)).join("\n") + "\n",
    );

    // 产物按训练侧同一套 decision 规则自检，问题以警告透出（切分本身已完成）。
    const validation = await validateDataset(trainPath, { schema: "decision", fullValidate: true });
    const result = {
      action: "dataset.split",
      input: inputPath,
      schema: flags.schema ?? "decision",
      seed,
      dev_ratio: devRatio,
      counts,
      files: { train: trainPath, development: developmentPath },
      validation: {
        valid: validation.valid,
        errors: validation.errors.length,
        warnings: validation.warnings.length,
      },
    };
    ctx.output.result(
      result,
      settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
    );
    if (!validation.valid) {
      ctx.output.warning({
        "en-US": `Split files written, but the train file failed decision-schema self-check (${validation.errors.length} error(s)); run "bl dataset validate --file ${trainPath} --schema decision" for details.`,
        "zh-CN": `切分文件已写出，但 train 文件未通过决策 Schema 自检（${validation.errors.length} 个错误）；可运行 "bl dataset validate --file ${trainPath} --schema decision" 查看详情。`,
      });
    }
  },
});
