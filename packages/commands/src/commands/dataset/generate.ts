import { existsSync, mkdirSync } from "fs";
import { basename, dirname, join } from "path";
import {
  BailianError,
  ExitCode,
  buildGenerationMessages,
  buildPlans,
  buildTeacherMessages,
  chatPath,
  defineCommand,
  loadWorkload,
  parseStateItems,
  parseTeacherRow,
  runWithConcurrency,
  stateKey,
  toTrainingRecord,
  validateWorkload,
  workloadIdFields,
  type ChatRequest,
  type ChatResponse,
  type CommandContext,
  type FlagsDef,
  type GenerationPlan,
  type RawLabelRow,
  type StateItem,
  type UsageSummary,
  type WorkloadConfig,
} from "bailian-cli-core";
import {
  appendJsonl,
  fileStamp,
  finalizeDataset,
  isObject,
  readObjectRows,
  usageError,
} from "./shared.ts";

const DEFAULT_MODEL = "qwen3.8-max";
const CHAT_ATTEMPTS = 4;

const GENERATE_FLAGS = {
  workload: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US":
        "workload.json business config (required). Every field's meaning and format is listed in Notes below.",
      "zh-CN": "workload.json 业务配置（必填）。每个字段的含义与写法见下方 Notes 字段速查。",
    },
  },
  samples: {
    type: "number",
    valueHint: "<count>",
    description: {
      "en-US": "Ordinary samples to generate (default: 200)",
      "zh-CN": "生成的普通样本数（默认：200）",
    },
  },
  unknowable: {
    type: "number",
    valueHint: "<count>",
    description: {
      "en-US": "Extra evidence-free states with uniform targets (default: 0)",
      "zh-CN": "额外的信息不足样本数，使用均匀 target（默认：0）",
    },
  },
  outDir: {
    type: "string",
    valueHint: "<dir>",
    description: {
      "en-US": "Output directory (default: data)",
      "zh-CN": "输出目录（默认：data）",
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
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": `Teacher/generator model (default: ${DEFAULT_MODEL})`,
      "zh-CN": `标注与生成使用的模型（默认：${DEFAULT_MODEL}）`,
    },
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Shuffle seed for plans and split (default: 0)",
      "zh-CN": "画像与切分的洗牌种子（默认：0）",
    },
  },
  batch: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "States per generation call (default: 5)",
      "zh-CN": "每次生成调用的样本数（默认：5）",
    },
  },
  concurrency: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Parallel API calls (default: 8)",
      "zh-CN": "并行 API 调用数（默认：8）",
    },
  },
  targetTemp: {
    type: "number",
    valueHint: "<t>",
    description: {
      "en-US":
        "Soft-target smoothing temperature; 1.0 keeps the teacher distribution (default: 1.5)",
      "zh-CN": "软标签平滑温度；1.0 保持 teacher 原分布（默认：1.5）",
    },
  },
  noSoftTarget: {
    type: "switch",
    description: {
      "en-US": "Hard labels only (unknowable rows keep uniform targets)",
      "zh-CN": "仅硬标签（unknowable 样本仍保留均匀 target）",
    },
  },
  statesOnly: {
    type: "switch",
    description: {
      "en-US": "Stop after generating states; no labelling spend",
      "zh-CN": "生成输入后即停止，不产生标注费用",
    },
  },
  fromStates: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Label an existing JSONL of {state, plan?} records instead of generating",
      "zh-CN": "改为标注已有的 {state, plan?} JSONL 文件，不再生成",
    },
  },
  resumeRaw: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "With --from-states: skip states already labelled in this raw file",
      "zh-CN": "配合 --from-states：跳过该 raw 文件中已标注的 state，续跑标注",
    },
  },
  fromRaw: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Zero API calls: re-convert saved teacher labels (e.g. to adjust --target-temp)",
      "zh-CN": "零 API 调用：仅重新转换已保存的 teacher 标签（例如调整 --target-temp）",
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** 服务端 4xx（含 HTTP 200 业务错码）原样透传终止；429/5xx 与其余错误进入重试/跳过。 */
function isFatalApiError(error: unknown): error is BailianError {
  if (!(error instanceof BailianError)) return false;
  const status = error.api?.httpStatus;
  return status !== undefined && status !== 429 && status < 500;
}

/** 429/5xx 退避重试 4 次；网络/解析类错误同样重试；4xx 立即抛出。 */
async function chatWithRetry(
  ctx: CommandContext<typeof GENERATE_FLAGS>,
  request: ChatRequest,
  usage: UsageSummary,
): Promise<string> {
  let lastReason = "unknown";
  for (let attempt = 0; attempt < CHAT_ATTEMPTS; attempt++) {
    try {
      const response = await ctx.client.requestJson<ChatResponse>({
        path: chatPath(),
        method: "POST",
        body: request,
      });
      usage.calls += 1;
      usage.prompt_tokens += response.usage?.prompt_tokens ?? 0;
      usage.completion_tokens += response.usage?.completion_tokens ?? 0;
      return response.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      if (isFatalApiError(error)) throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastReason = error instanceof Error ? error.message : String(error);
      const status = error instanceof BailianError ? error.api?.httpStatus : undefined;
      const throttled = status === 429 || (status !== undefined && status >= 500);
      await sleep((throttled ? 2000 : 1500) * (attempt + 1));
    }
  }
  throw new BailianError(
    `chat failed after ${CHAT_ATTEMPTS} attempts: ${lastReason} / 模型调用重试 ${CHAT_ATTEMPTS} 次后仍失败：${lastReason}`,
    ExitCode.GENERAL,
  );
}

/** 批量生成业务输入；坏批跳过，逐批 append states 文件（崩溃只丢一批）。 */
async function generateStates(
  ctx: CommandContext<typeof GENERATE_FLAGS>,
  workload: WorkloadConfig,
  plans: GenerationPlan[],
  options: { batch: number; concurrency: number; model: string; statesPath: string },
  usage: UsageSummary,
): Promise<StateItem[]> {
  const groups: GenerationPlan[][] = [];
  for (let index = 0; index < plans.length; index += options.batch) {
    groups.push(plans.slice(index, index + options.batch));
  }
  const schemaFields = Object.keys(workload.state_schema ?? {});
  const out: StateItem[] = [];
  const tasks = groups.map((group) => async () => {
    let content: string;
    try {
      content = await chatWithRetry(
        ctx,
        {
          model: options.model,
          messages: buildGenerationMessages(workload, group),
          temperature: 1.0,
          top_p: 0.8,
          max_tokens: 4096,
          enable_thinking: false,
          enable_search: false,
        },
        usage,
      );
    } catch (error) {
      if (isFatalApiError(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      ctx.output.warning({
        "en-US": `state batch failed: ${reason}`,
        "zh-CN": `生成批次失败：${reason}`,
      });
      return;
    }
    const { items: fresh, invalid } = parseStateItems(content, group, schemaFields);
    if (invalid) {
      ctx.output.warning({
        "en-US": "state batch skipped: invalid JSON or item count (response content omitted)",
        "zh-CN": "生成批次已跳过：JSON 无效或条数不符（不展示响应内容）",
      });
      return;
    }
    if (fresh.length > 0) {
      appendJsonl(
        options.statesPath,
        fresh.map((row) => JSON.stringify(row)),
      );
    }
    out.push(...fresh);
    ctx.output.progress({
      "en-US": `states ${out.length}/${plans.length}`,
      "zh-CN": `已生成 ${out.length}/${plans.length} 条输入`,
    });
  });
  await runWithConcurrency(tasks, options.concurrency);
  return out;
}

/** 逐 state teacher 标注；校验概率分布，逐条 append raw 文件（崩溃只丢一条）。 */
async function labelStates(
  ctx: CommandContext<typeof GENERATE_FLAGS>,
  workload: WorkloadConfig,
  items: StateItem[],
  options: { concurrency: number; model: string; rawPath: string },
  usage: UsageSummary,
): Promise<RawLabelRow[]> {
  const labelled: RawLabelRow[] = [];
  const tasks = items.map((item) => async () => {
    let content: string;
    try {
      content = await chatWithRetry(
        ctx,
        {
          model: options.model,
          messages: buildTeacherMessages(item.state, workload.questions, workload.guidance ?? []),
          temperature: 0.2,
          top_p: 0.8,
          max_tokens: 4096,
          enable_thinking: true,
          // 强制关闭联网搜索：标注必须只依据 STATE，避免默认联网污染概率分布。
          enable_search: false,
        },
        usage,
      );
    } catch (error) {
      if (isFatalApiError(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      ctx.output.warning({
        "en-US": `label failed: ${reason}`,
        "zh-CN": `标注失败：${reason}`,
      });
      return;
    }
    const { answers, missing } = parseTeacherRow(content, workload.questions);
    if (missing.length > 0) {
      ctx.output.warning({
        "en-US": `label skipped: invalid probabilities for ${missing.join(", ")}`,
        "zh-CN": `标注已跳过：${missing.join(", ")} 的概率分布无效`,
      });
      return;
    }
    const row: RawLabelRow = { ...item, answers, missing: [] };
    appendJsonl(options.rawPath, [JSON.stringify(row)]);
    labelled.push(row);
    ctx.output.progress({
      "en-US": `labelled ${labelled.length}/${items.length}`,
      "zh-CN": `已标注 ${labelled.length}/${items.length} 条`,
    });
  });
  await runWithConcurrency(tasks, options.concurrency);
  return labelled;
}

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US":
      "Generate decision training data with a teacher model: synthesize states, label probabilities, convert soft targets, split, and write a manifest",
    "zh-CN":
      "用 teacher 大模型生成决策训练数据：合成输入、标注概率分布、转换软标签、切分并输出 manifest",
  },
  auth: "apiKey",
  usageArgs:
    "--workload <path> [--samples <count>] [--unknowable <count>] [--out-dir <dir>] [--prefix <name>] [--model <model>] [--seed <n>] [--batch <n>] [--concurrency <n>] [--target-temp <t>] [--no-soft-target] [--states-only | --from-states <path> [--resume-raw <path>] | --from-raw <path>] [--schema decision]",
  flags: GENERATE_FLAGS,
  exampleArgs: [
    "--workload workload.json --samples 200 --unknowable 20 --out-dir output/demo",
    "--workload workload.json --samples 20 --dry-run",
    "--workload workload.json --states-only",
    "--workload workload.json --from-states data/states.jsonl --resume-raw data/raw/labeled.jsonl",
    "--workload workload.json --from-raw data/raw/labeled.jsonl --target-temp 1.0",
  ],
  notes: [
    {
      "en-US":
        'Only decision-model data (state/questions records) is supported today; --schema accepts "decision" only.',
      "zh-CN": '当前仅支持决策模型数据（state/questions 记录）；--schema 只接受 "decision"。',
    },
    {
      "en-US":
        "Generation and labelling call the teacher model and consume tokens (billing applies). Use --dry-run to preview plans and prompts, --states-only to stop before labelling spend, or --from-raw for a zero-API re-conversion.",
      "zh-CN":
        "生成与标注会调用 teacher 模型并消耗 token（产生费用）。可先用 --dry-run 预览画像与提示词，用 --states-only 在标注前停止，或用 --from-raw 零 API 重转换。",
    },
    {
      "en-US":
        'workload.json field reference (meaning + format). Full annotated example: bailian-finetune skill, "workload.json format".',
      "zh-CN":
        "workload.json 字段速查（含义 + 写法）。完整带注释示例见 bailian-finetune 技能「workload.json format」节。",
    },
    {
      "en-US":
        'questions (required): the question table, id → {type, criteria, instructions?}. choice: criteria is an object of 1–255 "option name → description"; score: criteria is an array of 2–255 level descriptions ordered low → high; noul: criteria optional, only "true"/"false" keys. instructions is optional free text.',
      "zh-CN":
        'questions（必填）：问题表，id → {type, criteria, instructions?}。choice：criteria 为 1–255 项「选项名 → 描述」对象；score：criteria 为 2–255 级描述数组（低→高）；noul：criteria 可选，仅 "true"/"false" 两键。instructions 为可选自由文本。',
    },
    {
      "en-US":
        "description (required for generation): one sentence describing the input business data; injected into the generation prompt.",
      "zh-CN": "description（生成模式必填）：一句话描述输入业务数据，注入生成提示词。",
    },
    {
      "en-US":
        "state_schema (required for generation): input field name → non-empty example value; field names appear verbatim in every generated state.",
      "zh-CN":
        "state_schema（生成模式必填）：输入字段名 → 非空示例值；字段名原样进入每条生成的 state。",
    },
    {
      "en-US":
        'id_fields (optional, default ["ticket_id"]): state key fields used for dedup and resume; values are record ids, not model input.',
      "zh-CN":
        'id_fields（可选，默认 ["ticket_id"]）：state 主键字段，用于去重与续跑；其值是记录编号，不作为模型输入。',
    },
    {
      "en-US":
        "axes (optional): profile axis name → value list, for balanced generation. An axis named after a question id is the intended answer (score axes use 0-based level indices); axes you omit are randomized.",
      "zh-CN":
        "axes（可选）：画像轴名 → 取值列表，用于均衡生成。与问题 id 同名的轴即期望答案（score 轴用 0 起等级下标）；未列出的维度随机。",
    },
    {
      "en-US":
        "guidance (optional): business rules injected into both the generation and labelling prompts.",
      "zh-CN": "guidance（可选）：业务规则，同时注入生成与标注提示词。",
    },
    {
      "en-US":
        "difficulty_hints (optional): clean / unknowable keys override the built-in generation difficulty hints.",
      "zh-CN": "difficulty_hints（可选）：clean / unknowable 两键，覆盖内置的生成难度提示。",
    },
    {
      "en-US":
        "Crash resilience: states append per batch and labels append per row; continue labelling with --from-states plus --resume-raw. Raw labels keep teacher probabilities so --from-raw can re-derive targets at a new --target-temp without any API call.",
      "zh-CN":
        "崩溃韧性：输入逐批 append、标签逐条 append；用 --from-states 配合 --resume-raw 续跑标注。raw 文件保留 teacher 概率，--from-raw 可在不调用 API 的情况下按新 --target-temp 重新派生 target。",
    },
    {
      "en-US":
        "Outputs <prefix>.train.jsonl / <prefix>.development.jsonl (15% development), <prefix>.manifest.json (workload sha256, label balance, generator/teacher agreement, usage), and raw teacher labels under <out-dir>/raw. The state token-budget check is skipped (needs the Python transformers tokenizer).",
      "zh-CN":
        "输出 <prefix>.train.jsonl / <prefix>.development.jsonl（development 占 15%）、<prefix>.manifest.json（workload sha256、标签均衡、生成意图与 teacher 一致率、用量），以及 <out-dir>/raw 下的 teacher 原始标签。state token 预算检查跳过（依赖 Python transformers 分词器）。",
    },
    {
      "en-US":
        "Labelling forces enable_search=false so probabilities depend only on the STATE. The shuffle PRNG differs from Python random.Random: the same seed reproduces results within this CLI only. Request timeout uses the global --timeout.",
      "zh-CN":
        "标注强制 enable_search=false，概率只依据 STATE。洗牌随机源与 Python random.Random 不同：同一 seed 仅在本 CLI 内可复现。请求超时使用全局 --timeout。",
    },
  ],
  validate: (flags) => {
    if (!flags.workload) {
      return {
        "en-US":
          'Missing --workload <path>. Minimal skeleton: {"questions":{"team":{"type":"choice","criteria":{"billing":"Billing issues","technical":"Technical issues"}}},"description":"Support tickets","state_schema":{"ticket_id":"T-1001","content":"Ticket body"},"axes":{"team":["billing","technical"]}}. Every field\'s meaning and format: see the Notes of `dataset generate --help`, or the bailian-finetune skill section "workload.json format".',
        "zh-CN":
          '缺少 --workload <path>。最小骨架：{"questions":{"team":{"type":"choice","criteria":{"billing":"账单问题","technical":"技术问题"}}},"description":"客服工单","state_schema":{"ticket_id":"T-1001","content":"工单正文"},"axes":{"team":["billing","technical"]}}。每个字段的含义与写法：见 `dataset generate --help` 的 Notes 字段速查，或 bailian-finetune 技能「workload.json format」节。',
      };
    }
    for (const [name, value] of [
      ["batch", flags.batch],
      ["concurrency", flags.concurrency],
      ["target-temp", flags.targetTemp],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        return {
          "en-US": `--${name} must be positive and finite.`,
          "zh-CN": `--${name} 必须为正有限数值。`,
        };
      }
    }
    for (const [name, value] of [
      ["samples", flags.samples],
      ["unknowable", flags.unknowable],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        return {
          "en-US": `--${name} must be a nonnegative integer.`,
          "zh-CN": `--${name} 必须是非负整数。`,
        };
      }
    }
    if (flags.fromRaw && (flags.fromStates || flags.resumeRaw || flags.statesOnly)) {
      return {
        "en-US": "--from-raw cannot be combined with generation/labelling options.",
        "zh-CN": "--from-raw 不能与生成/标注选项同时使用。",
      };
    }
    if (flags.resumeRaw && !flags.fromStates) {
      return {
        "en-US": "--resume-raw requires --from-states.",
        "zh-CN": "--resume-raw 需要配合 --from-states。",
      };
    }
    if (flags.statesOnly && flags.fromStates) {
      return {
        "en-US": "--states-only is for generation; omit it when using --from-states.",
        "zh-CN": "--states-only 用于生成模式；使用 --from-states 时请去掉。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workloadPath = flags.workload as string;
    const workload = loadWorkload(workloadPath);
    const mode = flags.fromRaw ? "from_raw" : flags.fromStates ? "from_states" : "generate";
    validateWorkload(workload, mode === "generate");

    const outDir = flags.outDir ?? "data";
    const prefix = flags.prefix ?? "tickets";
    const model = flags.model ?? DEFAULT_MODEL;
    const seed = flags.seed ?? 0;
    const count = flags.samples ?? 200;
    const unknowable = flags.unknowable ?? 0;
    const batch = flags.batch ?? 5;
    const concurrency = flags.concurrency ?? 8;
    const targetTemp = flags.targetTemp ?? 1.5;
    const soft = !flags.noSoftTarget;
    const idFields = workloadIdFields(workload);
    const rawPath =
      flags.fromRaw ??
      flags.resumeRaw ??
      join(outDir, "raw", `labeled-${fileStamp(new Date())}.jsonl`);
    const statesPath = join(dirname(rawPath), basename(rawPath).replace("labeled", "states"));
    const trainPath = join(outDir, `${prefix}.train.jsonl`);
    const developmentPath = join(outDir, `${prefix}.development.jsonl`);
    const manifestPath = join(outDir, `${prefix}.manifest.json`);

    if (settings.dryRun) {
      const preview: Record<string, unknown> = {
        action: "dataset.generate",
        mode,
        schema: flags.schema ?? "decision",
        files: {
          train: trainPath,
          development: developmentPath,
          manifest: manifestPath,
          raw: rawPath,
        },
      };
      if (mode === "from_raw") {
        preview.rows = readObjectRows(rawPath).length;
        preview.estimated_calls = { generation: 0, labeling: 0 };
      } else if (mode === "from_states") {
        const items = readObjectRows(flags.fromStates as string);
        preview.states = items.length;
        preview.estimated_calls = { generation: 0, labeling: items.length };
        preview.sample = {
          teacher_messages: buildTeacherMessages(
            items[0]?.state ?? {},
            workload.questions,
            workload.guidance ?? [],
          ),
        };
      } else {
        const plans = buildPlans(workload, count, unknowable, seed);
        preview.plans = { total: plans.length, unknowable };
        preview.estimated_calls = {
          generation: Math.ceil(plans.length / batch),
          labeling: plans.length,
        };
        preview.files = { ...(preview.files as object), states: statesPath };
        const placeholderState = Object.fromEntries(
          Object.keys(workload.state_schema ?? {}).map((field) => [field, "..."]),
        );
        preview.sample = {
          generation_messages: buildGenerationMessages(workload, plans.slice(0, batch)),
          teacher_messages: buildTeacherMessages(
            placeholderState,
            workload.questions,
            workload.guidance ?? [],
          ),
        };
      }
      ctx.output.result(
        preview,
        settings.output === "text" ? { text: JSON.stringify(preview, null, 2) } : undefined,
      );
      return;
    }

    mkdirSync(join(outDir, "raw"), { recursive: true });
    const usage: UsageSummary = { calls: 0, prompt_tokens: 0, completion_tokens: 0 };
    const started = Date.now();

    if (mode !== "from_raw") {
      let items: StateItem[];
      if (mode === "from_states") {
        const rows = readObjectRows(flags.fromStates as string);
        items = rows.map((row) => {
          if (!("state" in row)) {
            throw usageError(
              `${flags.fromStates} records must contain "state".`,
              `${flags.fromStates} 的记录必须包含 "state"。`,
            );
          }
          return {
            state: row.state as Record<string, unknown>,
            plan: isObject(row.plan) ? row.plan : undefined,
          };
        });
        ctx.output.info({
          "en-US": `labelling ${items.length} states from ${flags.fromStates}`,
          "zh-CN": `开始标注 ${flags.fromStates} 中的 ${items.length} 条输入`,
        });
      } else {
        const plans = buildPlans(workload, count, unknowable, seed);
        ctx.output.info({
          "en-US": `planning ${plans.length} states (${unknowable} evidence-free) on ${model}`,
          "zh-CN": `规划 ${plans.length} 条输入（${unknowable} 条信息不足），模型 ${model}`,
        });
        items = await generateStates(
          ctx,
          workload,
          plans,
          { batch, concurrency, model, statesPath },
          usage,
        );
      }

      if (flags.statesOnly) {
        if (items.length === 0) {
          throw new BailianError(
            "no usable states: check the API and skipped-batch messages above. / 没有可用输入：请检查 API 与上方跳过批次的提示。",
            ExitCode.GENERAL,
          );
        }
        const statesResult = {
          action: "dataset.generate",
          mode,
          states_only: true,
          files: { states: statesPath },
          counts: { states: items.length },
          usage,
        };
        ctx.output.result(
          statesResult,
          settings.output === "text" ? { text: JSON.stringify(statesResult, null, 2) } : undefined,
        );
        return;
      }

      // 续跑：raw 文件中已能成功转换的 state 不再重复标注。
      const done = new Set<string>();
      if (flags.resumeRaw && existsSync(rawPath)) {
        for (const row of readObjectRows(rawPath)) {
          const { record } = toTrainingRecord(
            row as unknown as RawLabelRow,
            workload,
            targetTemp,
            soft,
          );
          if (record) done.add(stateKey(record.state, idFields));
        }
        ctx.output.info({
          "en-US": `resuming: ${done.size} states already labelled`,
          "zh-CN": `续跑：${done.size} 条输入已标注`,
        });
      }
      const seen = new Set(done);
      const unique: StateItem[] = [];
      for (const item of items) {
        const key = stateKey(item.state, idFields);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }
      ctx.output.info({
        "en-US": `${items.length} states in, ${unique.length} to label after dedupe`,
        "zh-CN": `${items.length} 条输入，去重后待标注 ${unique.length} 条`,
      });
      await labelStates(ctx, workload, unique, { concurrency, model, rawPath }, usage);
    }

    // 转换尾段（转换 → 切分 → manifest → 报告），纯本地零 API。
    const result = finalizeDataset(ctx.output, {
      workload,
      workloadPath,
      rawPath,
      outDir,
      prefix,
      seed,
      targetTemp,
      soft,
      mode,
      model: mode === "from_raw" ? null : model,
      baseUrl: mode === "from_raw" ? null : ctx.client.url(""),
      usage: mode === "from_raw" ? null : usage,
      started,
      schema: flags.schema ?? "decision",
    });
    ctx.output.result(
      result,
      settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
    );
  },
});
