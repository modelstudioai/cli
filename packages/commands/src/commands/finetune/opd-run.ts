import { readFileSync } from "node:fs";
import {
  BailianError,
  ExitCode,
  createFineTune,
  defineCommand,
  getFineTuneParams,
  getProfile,
  parseAssignment,
  parseTypedValue,
  validateFineTuneHyperParameterOverrides,
  type CreateFineTuneRequest,
  type FineTuneDatasetDescriptor,
  type FineTuneDatasetSlot,
  type FineTuneHyperParameters,
  type FineTuneParamHyperParam,
  type FineTuneResourceConfig,
  type FlagsDef,
} from "bailian-cli-core";
import { analyzeDatasetTokens, uploadResolvedLocal } from "./dataset-input.ts";
import { formatHyperParameterIssue } from "./create.ts";
import { computeOpdBatchFit, opdMiniBatchLimit } from "./opd-batch-fit.ts";
import {
  isPublishedOpdPair,
  OPD_MODEL_MATRIX_DOC,
  OPD_RECOMMENDED_MTU_CAPACITY,
} from "./opd-model-matrix.ts";
import { emitRlDryRun, emitRlResult, followRlJob } from "./rl-shared.ts";

const OPD_RUN_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Student base model ID (e.g. qwen3.5-9b)",
      "zh-CN": "学生基座模型 ID（例如 qwen3.5-9b）",
    },
    required: true,
  },
  teacherModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Platform-registered teacher model ID (required; no arbitrary URLs or keys)",
      "zh-CN": "平台登记的教师模型 ID（必填；不接受任意 URL 或密钥）",
    },
    required: true,
  },
  datasets: {
    type: "string",
    valueHint: "<ids|paths>",
    description: {
      "en-US":
        "Comma-separated dataset file IDs or local .jsonl paths. Local paths are validated and uploaded first.",
      "zh-CN": "数据集文件 ID 或本地 .jsonl 路径，以逗号分隔。本地路径会先校验并上传。",
    },
    required: true,
  },
  validations: {
    type: "string",
    valueHint: "<ids|paths>",
    description: {
      "en-US":
        "Comma-separated validation file IDs or local paths (auto-uploaded like --datasets).",
      "zh-CN": "验证集文件 ID 或本地路径，以逗号分隔（与 --datasets 一样自动上传）。",
    },
  },
  jobName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Training job display name (job_name)",
      "zh-CN": "训练任务显示名称（job_name）",
    },
  },
  hyperParametersFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US":
        "JSON file of training + resource hyper-parameters (keys map 1:1 to hyper_parameters). --hp overrides it.",
      "zh-CN": "训练与资源超参 JSON 文件（键与 hyper_parameters 一一对应）。--hp 优先级更高。",
    },
  },
  resourceConfigFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US":
        "JSON file of resource_config (charge_type / mtu_spec_code / mtu_capacity). Resource flags override it.",
      "zh-CN":
        "resource_config JSON 文件（charge_type / mtu_spec_code / mtu_capacity）。资源 flag 优先级更高。",
    },
  },
  hp: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Hyper-parameter override (repeatable, parsed by type); beats the JSON file",
      "zh-CN": "超参数覆盖（可重复，按类型解析）；优先于 JSON 文件",
    },
  },
  chargeType: {
    type: "string",
    valueHint: "<value>",
    description: {
      "en-US": "resource_config.charge_type; pg_opd only supports mtu_postpaid (default)",
      "zh-CN": "resource_config.charge_type；pg_opd 仅支持 mtu_postpaid（默认值）",
    },
  },
  mtuSpec: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US":
        "resource_config.mtu_spec_code (e.g. MTU4); required, via this flag or the resource file",
      "zh-CN": "resource_config.mtu_spec_code（例如 MTU4）；必填，本 flag 或资源文件提供均可",
    },
  },
  mtuCount: {
    type: "number",
    valueHint: "<int>",
    description: {
      "en-US":
        "resource_config.mtu_capacity (student GPUs + teacher GPUs); required, via this flag or the resource file",
      "zh-CN":
        "resource_config.mtu_capacity（学生 GPU 数 + 教师 GPU 数）；必填，本 flag 或资源文件提供均可",
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Workspace for upload, parameter query, creation and reads (X-DashScope-WorkSpace). Omit when the API key is workspace-bound.",
      "zh-CN":
        "上传、参数查询、创建与读取使用的业务空间（X-DashScope-WorkSpace）。API Key 已绑定空间时可省略。",
    },
  },
  watch: {
    type: "switch",
    description: {
      "en-US": "Wait for the job to reach a terminal state",
      "zh-CN": "提交后等待任务进入终态",
    },
  },
  waitTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US":
        "Maximum seconds to poll with --watch (default: no limit; does not cancel the cloud job)",
      "zh-CN": "--watch 的最长轮询秒数（默认无限制；超时不取消云端任务）",
    },
  },
} satisfies FlagsDef;

/** Read a JSON object file with errno-specific I/O hints and a shape check. */
function readOpdJsonObject(filePath: string, flagName: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    const hint =
      errno === "ENOENT"
        ? `File not found: ${filePath}`
        : errno === "EACCES" || errno === "EPERM"
          ? `Permission denied reading file: ${filePath}`
          : errno === "EISDIR"
            ? `Path is a directory: ${filePath}`
            : `Cannot read file: ${filePath} (${errno ?? String(error)})`;
    throw new BailianError(`Cannot read ${flagName} file: ${filePath}`, ExitCode.GENERAL, hint);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BailianError(`${flagName} file is not valid JSON: ${filePath}`, ExitCode.USAGE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BailianError(
      `${flagName} file must contain a JSON object: ${filePath}`,
      ExitCode.USAGE,
    );
  }
  return parsed as Record<string, unknown>;
}

function toDatasetDescriptors(
  fileIds: string[],
  type: FineTuneDatasetSlot,
): FineTuneDatasetDescriptor[] {
  return fileIds.map((fileId) => ({ type, data_source_type: "file_id", file_id: fileId }));
}

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Submit a pure Model OPD distillation job (pg_opd) via the fine-tunes OpenAPI",
    "zh-CN": "通过 fine-tunes OpenAPI 提交纯 Model OPD 蒸馏任务（pg_opd）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    reason: "billing",
    message: {
      "en-US": "This creates a billed OPD training job that consumes compute resources.",
      "zh-CN": "该操作会创建计费的 OPD 训练任务，消耗算力资源。",
    },
  },
  usageArgs: "--base-model <id> --teacher-model <id> --datasets <ids|paths> [flags]",
  flags: OPD_RUN_FLAGS,
  exampleArgs: [
    "--base-model qwen3.5-9b --teacher-model qwen3.8-flash --datasets file-xxx --validations file-yyy --hyper-parameters-file ./hp.json --resource-config-file ./resource.json --dry-run",
    "--base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b --datasets ./train.jsonl --hp n_epochs=1 --hp batch_size=64 --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch",
    "--base-model qwen3.5-9b --teacher-model qwen3.8-flash --datasets file-xxx --workspace-id ws-xxx",
  ],
  notes: [
    {
      "en-US":
        "Forces training_type=pg_opd. Pure Model OPD needs no rollout / reward functions and creates no function-compute resources.",
      "zh-CN":
        "强制 training_type=pg_opd。纯 Model OPD 无需 rollout / reward 函数，不创建函数计算资源。",
    },
    {
      "en-US":
        "Submits directly from the host via the fine-tunes OpenAPI (no sandbox runtime). Query commands: finetune opd get/watch/logs/cancel/delete; list/checkpoints/export/metrics use the shared finetune commands.",
      "zh-CN":
        "在宿主直接经 fine-tunes OpenAPI 提交（无需沙箱运行时）。查询命令：finetune opd get/watch/logs/cancel/delete；list/checkpoints/export/metrics 使用通用 finetune 命令。",
    },
    {
      "en-US":
        "Hyper-parameters are sent exactly as provided (JSON file, then --hp overrides). Omitted fields are resolved by the server and the selected teacher's defaults — the CLI never fills parameter-API recommend_value, which is not the teacher's effective default.",
      "zh-CN":
        "超参按提供值原样发送（JSON 文件，--hp 覆盖）。未指定字段由服务端与所选教师默认值补齐——CLI 不填充参数接口的 recommend_value，它不是教师的有效默认值。",
    },
    {
      "en-US":
        "The teacher must be a platform-registered model ID compatible with the student; compatibility and resource capacity are validated server-side and errors are surfaced as-is.",
      "zh-CN": "教师须为与学生兼容的平台登记模型 ID；兼容性与资源容量由服务端校验，错误原样透传。",
    },
    {
      "en-US": `mtu_capacity must equal student GPUs + teacher GPUs. The published docs recommend MTU4 x ${OPD_RECOMMENDED_MTU_CAPACITY} for the default layout; custom layouts must be computed yourself (the server checks capacity after job creation). Supported pairs and sizing: ${OPD_MODEL_MATRIX_DOC}.`,
      "zh-CN": `mtu_capacity 必须等于学生 GPU 数 + 教师 GPU 数。官方文档对默认布局推荐 MTU4 x ${OPD_RECOMMENDED_MTU_CAPACITY}；自定义布局需自行核算（服务端容量检查在任务创建后执行）。支持组合与规格见 ${OPD_MODEL_MATRIX_DOC}。`,
    },
    {
      "en-US":
        "batch_size is the samples-per-step: floor(training samples × n_epochs / batch_size) must be ≥ 1, otherwise the job fails at execution time after billing starts (lr_decay_steps > 0). With local datasets the CLI rejects zero-step configurations before upload; ppo_mini_batch_size must not exceed batch_size × n_rollouts.",
      "zh-CN":
        "batch_size 即每步样本数：floor(训练样本数 × n_epochs / batch_size) 必须 ≥ 1，否则任务在计费开始后的执行期失败（lr_decay_steps > 0 断言）。本地数据集时 CLI 在上传前拒绝 0 步配置；ppo_mini_batch_size 不得超过 batch_size × n_rollouts。",
    },
    {
      "en-US": "Timing out with --watch stops waiting only; it does not cancel the cloud job.",
      "zh-CN": "--watch 超时仅停止等待，不会取消云端任务。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const model = flags.baseModel;
    const workspaceId = flags.workspaceId ?? settings.workspaceId;

    // Explicit inputs only: file values first, CLI overrides on top. Omitted
    // hyper keys stay omitted for server/teacher resolution; charge_type is the
    // one fixed constraint (pg_opd is MTU-only) and defaults to mtu_postpaid.
    const hyperParameters: FineTuneHyperParameters = flags.hyperParametersFile
      ? (readOpdJsonObject(
          flags.hyperParametersFile,
          "--hyper-parameters-file",
        ) as FineTuneHyperParameters)
      : {};
    for (const entry of flags.hp ?? []) {
      const { key, value } = parseAssignment(entry, "--hp", "--hp <key=value>");
      hyperParameters[key] = parseTypedValue(value);
    }
    // Learning rate travels as a string to avoid JSON-number precision loss.
    if (typeof hyperParameters.learning_rate === "number") {
      hyperParameters.learning_rate = String(hyperParameters.learning_rate);
    }

    const resourceConfig: FineTuneResourceConfig = flags.resourceConfigFile
      ? (readOpdJsonObject(
          flags.resourceConfigFile,
          "--resource-config-file",
        ) as FineTuneResourceConfig)
      : {};
    if (flags.chargeType !== undefined) resourceConfig.charge_type = flags.chargeType;
    if (flags.mtuSpec !== undefined) resourceConfig.mtu_spec_code = flags.mtuSpec;
    if (flags.mtuCount !== undefined) resourceConfig.mtu_capacity = flags.mtuCount;
    if (resourceConfig.charge_type === undefined) {
      resourceConfig.charge_type = "mtu_postpaid";
    } else if (resourceConfig.charge_type !== "mtu_postpaid") {
      throw new BailianError(
        ctx.localize({
          "en-US": `pg_opd only supports charge_type "mtu_postpaid" (got "${resourceConfig.charge_type}").`,
          "zh-CN": `pg_opd 仅支持 charge_type 为 "mtu_postpaid"（当前为 "${resourceConfig.charge_type}"）。`,
        }),
        ExitCode.USAGE,
      );
    }
    // Without the MTU fields the server persists the job, returns 500, and the
    // job fails at execution time — reject locally before upload/creation.
    const missingResourceFields: string[] = [];
    if (!resourceConfig.mtu_spec_code) missingResourceFields.push("mtu_spec_code (--mtu-spec)");
    if (typeof resourceConfig.mtu_capacity !== "number") {
      missingResourceFields.push("mtu_capacity (--mtu-count)");
    }
    if (missingResourceFields.length > 0) {
      throw new BailianError(
        ctx.localize({
          "en-US": `pg_opd requires resource_config.${missingResourceFields.join(" and resource_config.")}; provide them via --resource-config-file or the resource flags.`,
          "zh-CN": `pg_opd 要求 resource_config.${missingResourceFields.join(" 和 resource_config.")}；请通过 --resource-config-file 或资源 flag 提供。`,
        }),
        ExitCode.USAGE,
      );
    }

    // Local pre-flight. The only hard check is the teacher-Worker template
    // constraint (TP must equal GPUs per node); everything else warns, because
    // the published matrix/capacity are point-in-time doc snapshots and the
    // server config may move ahead of them.
    const teacherTp = Number(hyperParameters.opd_teacher_infer_tp);
    const teacherGpusPerNode = Number(hyperParameters.opd_teacher_n_gpus_per_node);
    if (
      hyperParameters.opd_teacher_infer_tp !== undefined &&
      hyperParameters.opd_teacher_n_gpus_per_node !== undefined &&
      Number.isFinite(teacherTp) &&
      Number.isFinite(teacherGpusPerNode) &&
      teacherTp !== teacherGpusPerNode
    ) {
      throw new BailianError(
        ctx.localize({
          "en-US": `opd_teacher_infer_tp (${teacherTp}) must equal opd_teacher_n_gpus_per_node (${teacherGpusPerNode}); the teacher Worker template rejects mismatches.`,
          "zh-CN": `opd_teacher_infer_tp（${teacherTp}）必须等于 opd_teacher_n_gpus_per_node（${teacherGpusPerNode}）；教师 Worker 模板会拒绝不匹配的配置。`,
        }),
        ExitCode.USAGE,
      );
    }
    if (!isPublishedOpdPair(model, flags.teacherModel)) {
      ctx.output.warning({
        code: "OPD_PAIR_NOT_PUBLISHED",
        message: {
          "en-US": `Student/teacher pair "${model}" <- "${flags.teacherModel}" is not in the published OPD support list (invite-only, region-specific); the server may reject it. See ${OPD_MODEL_MATRIX_DOC}.`,
          "zh-CN": `学生/教师组合"${model}" <- "${flags.teacherModel}"不在官方公布的 OPD 支持列表中（邀测、分地域），服务端可能拒绝。见 ${OPD_MODEL_MATRIX_DOC}。`,
        },
      });
    }
    const studentLayoutKeys = [
      "nnodes_training",
      "nnodes_rollout",
      "n_gpus_training",
      "n_gpus_rollout",
    ] as const;
    if (studentLayoutKeys.some((key) => hyperParameters[key] === undefined)) {
      ctx.output.warning({
        code: "OPD_DEFAULT_LAYOUT_CAPACITY",
        message: {
          "en-US": `Student GPU layout is not fully specified; the server applies its default layout. The published recommendation is MTU4 x ${OPD_RECOMMENDED_MTU_CAPACITY}, and you set mtu_capacity=${resourceConfig.mtu_capacity}. Verify the capacity covers student + teacher GPUs (the capacity check currently runs after job creation).`,
          "zh-CN": `学生 GPU 布局未完全指定，服务端将按默认布局分配。官方推荐容量为 MTU4 x ${OPD_RECOMMENDED_MTU_CAPACITY}，当前 mtu_capacity=${resourceConfig.mtu_capacity}。请确认容量覆盖学生 + 教师 GPU（容量检查目前在任务创建后才执行）。`,
        },
      });
    }
    const teacherMaxModelLen = Number(hyperParameters.opd_teacher_max_model_len);
    if (
      hyperParameters.opd_teacher_max_model_len !== undefined &&
      Number.isFinite(teacherMaxModelLen)
    ) {
      const overLengthKeys = (["max_length", "max_prompt_length"] as const).filter((key) => {
        const value = Number(hyperParameters[key]);
        return (
          hyperParameters[key] !== undefined && Number.isFinite(value) && value > teacherMaxModelLen
        );
      });
      if (overLengthKeys.length > 0) {
        ctx.output.warning({
          code: "OPD_LENGTH_EXCEEDS_TEACHER",
          message: {
            "en-US": `${overLengthKeys.join(" / ")} exceeds the explicit opd_teacher_max_model_len (${teacherMaxModelLen}); training may fail at execution time. When teacher fields are omitted the server fills teacher defaults — keep student lengths compatible with the selected teacher.`,
            "zh-CN": `${overLengthKeys.join(" / ")} 超过显式指定的 opd_teacher_max_model_len（${teacherMaxModelLen}），训练可能在执行期失败。教师字段省略时由服务端补教师默认值——请保持学生长度与所选教师兼容。`,
          },
        });
      }
    }

    const miniBatch = opdMiniBatchLimit(hyperParameters);
    if (miniBatch && miniBatch.miniBatchSize > miniBatch.limit) {
      throw new BailianError(
        ctx.localize({
          "en-US": `ppo_mini_batch_size (${miniBatch.miniBatchSize}) must not exceed batch_size × n_rollouts (${miniBatch.limit}); the published OPD parameter relationship rejects larger mini-batches.`,
          "zh-CN": `ppo_mini_batch_size（${miniBatch.miniBatchSize}）不得超过 batch_size × n_rollouts（${miniBatch.limit}）；官方 OPD 参数关系约束更大的 mini-batch 无效。`,
        }),
        ExitCode.USAGE,
      );
    }

    const profile = getProfile("pg-opd");
    const training = await analyzeDatasetTokens(
      ctx,
      flags.datasets,
      "datasets",
      profile,
      "text",
      model,
    );
    const validation = flags.validations
      ? await analyzeDatasetTokens(ctx, flags.validations, "validations", profile, "text", model)
      : undefined;

    // Batch-fit pre-flight. batch_size is the published "samples per step";
    // floor(samples × n_epochs / batch_size) = 0 trips the DLC assertion
    // lr_decay_steps > 0 after the job is created and billed. The raw local
    // count upper-bounds the post-preprocessing count, so a local shortfall is
    // a sound hard reject; a surplus is not a guarantee (preprocessing filters).
    const batchFit = computeOpdBatchFit(hyperParameters, training.recordCount);
    if (
      batchFit.requiredSamples !== undefined &&
      training.recordCount === undefined &&
      (!settings.dryRun || training.localPaths.length === 0)
    ) {
      ctx.output.warning({
        code: "OPD_BATCH_FIT_UNKNOWN",
        message: {
          "en-US": `Dataset sample count is unknown (file-id datasets). With batch_size=${batchFit.batchSize} and n_epochs=${batchFit.nEpochs}, training needs at least ${batchFit.requiredSamples} effective samples for one step; fewer fails at execution time after billing starts.`,
          "zh-CN": `数据集样本数未知（file-id 数据集）。batch_size=${batchFit.batchSize}、n_epochs=${batchFit.nEpochs} 时，训练至少需要 ${batchFit.requiredSamples} 条有效样本才能走出 1 步；不足会在计费开始后的执行期失败。`,
        },
      });
    }
    if (!settings.dryRun && batchFit.steps !== undefined) {
      const totalSteps = batchFit.steps;
      if (totalSteps === 0) {
        throw new BailianError(
          ctx.localize({
            "en-US": `Training dataset has ${batchFit.recordCount} sample(s); with n_epochs=${batchFit.nEpochs} and batch_size=${batchFit.batchSize} (samples per step) the job would run 0 training steps and fail at execution time (lr_decay_steps > 0).`,
            "zh-CN": `训练集共 ${batchFit.recordCount} 条样本；n_epochs=${batchFit.nEpochs}、batch_size=${batchFit.batchSize}（每步样本数）时总训练步数为 0，任务会在执行期失败（lr_decay_steps > 0 断言）。`,
          }),
          ExitCode.USAGE,
          ctx.localize({
            "en-US": `Provide at least ${batchFit.requiredSamples} samples (preprocessing may filter some, so leave headroom), or lower batch_size / raise n_epochs. Nothing was uploaded or created.`,
            "zh-CN": `请至少提供 ${batchFit.requiredSamples} 条样本（预处理可能过滤部分样本，建议留余量），或调小 batch_size / 调大 n_epochs。未上传、未创建任何资源。`,
          }),
        );
      }
      const warmupSteps = Number(hyperParameters.lr_warmup_steps);
      if (
        hyperParameters.lr_warmup_steps !== undefined &&
        Number.isFinite(warmupSteps) &&
        warmupSteps >= 0 &&
        warmupSteps > totalSteps
      ) {
        ctx.output.warning({
          code: "OPD_WARMUP_EXCEEDS_STEPS",
          message: {
            "en-US": `lr_warmup_steps (${warmupSteps}) exceeds the estimated total training steps (${totalSteps}); the docs recommend 0 for small-data smoke runs so warmup does not outrun the schedule.`,
            "zh-CN": `lr_warmup_steps（${warmupSteps}）超过估算总训练步数（${totalSteps}）；官方文档建议小数据冒烟设 0，避免预热步数超过总步数。`,
          },
        });
      }
      const intervalKeys = (["eval_steps", "save_steps"] as const).filter((key) => {
        if (key === "save_steps" && hyperParameters.save_strategy === "epoch") return false;
        const value = Number(hyperParameters[key]);
        return hyperParameters[key] !== undefined && Number.isFinite(value) && value > totalSteps;
      });
      if (intervalKeys.length > 0) {
        ctx.output.warning({
          code: "OPD_INTERVAL_EXCEEDS_STEPS",
          message: {
            "en-US": `${intervalKeys.join(" / ")} exceeds the estimated total training steps (${totalSteps}); evaluation / checkpoint saving would never trigger. The docs suggest eval_steps ≈ total steps / 10~20 and save_steps ≈ eval_steps × 2~3.`,
            "zh-CN": `${intervalKeys.join(" / ")} 超过估算总训练步数（${totalSteps}），评估 / 保存 checkpoint 一次都不会触发。官方建议 eval_steps ≈ 总步数 / 10~20、save_steps ≈ eval_steps × 2~3。`,
          },
        });
      }
    }

    const buildBody = (): CreateFineTuneRequest => {
      const body: CreateFineTuneRequest = {
        model,
        training_type: "pg_opd",
        teacher_model: flags.teacherModel,
        training_datasets: toDatasetDescriptors(training.fileIds, "training"),
      };
      if (validation && validation.fileIds.length > 0) {
        body.validation_datasets = toDatasetDescriptors(validation.fileIds, "validation");
      }
      if (Object.keys(hyperParameters).length > 0) body.hyper_parameters = hyperParameters;
      body.resource_config = resourceConfig;
      if (flags.jobName !== undefined) body.job_name = flags.jobName;
      return body;
    };

    if (settings.dryRun) {
      const pending = [
        ...training.localPaths.map((path) => ({ field: "datasets", path })),
        ...(validation?.localPaths ?? []).map((path) => ({ field: "validations", path })),
      ];
      emitRlDryRun(ctx, "finetune.opd.run", {
        body: buildBody(),
        ...(pending.length > 0 ? { pending_uploads: pending } : {}),
        watch: flags.watch === true,
        wait_timeout: flags.waitTimeout,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      });
      return;
    }

    // Authoritative parameter schema (hyper + resource groups). Explicit
    // overrides must satisfy it; empty ranges/enums are skipped by the
    // validator, which matters for students whose schema omits ranges.
    const [hyperResponse, resourceResponse] = await Promise.all([
      getFineTuneParams(ctx.client, {
        inputModel: model,
        trainingType: "pg_opd",
        paramType: "hyper",
        workspaceId,
      }),
      getFineTuneParams(ctx.client, {
        inputModel: model,
        trainingType: "pg_opd",
        paramType: "resource",
        mtuSpecCode:
          typeof resourceConfig.mtu_spec_code === "string"
            ? resourceConfig.mtu_spec_code
            : undefined,
        workspaceId,
      }),
    ]);
    const schema: FineTuneParamHyperParam[] = [
      ...(hyperResponse.output?.hyper_params ?? []),
      ...(resourceResponse.output?.hyper_params ?? []),
    ];
    if (schema.length === 0) {
      throw new BailianError(
        ctx.localize({
          "en-US": `No authoritative training parameter schema was returned for model "${model}" and training type "pg_opd".`,
          "zh-CN": `模型“${model}”和训练类型“pg_opd”未返回权威训练参数配置。`,
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US": "The dataset was not uploaded and the training job was not submitted.",
          "zh-CN": "数据集未上传，训练任务未提交。",
        }),
      );
    }
    const issues = validateFineTuneHyperParameterOverrides(schema, hyperParameters).filter(
      // save_strategy is accepted by the server's hyper-parameter checker even
      // when the parameter API does not list it; do not reject it locally.
      (issue) => !(issue.parameter === "save_strategy" && issue.code === "unsupported"),
    );
    if (issues.length > 0) {
      throw new BailianError(
        ctx.localize({
          "en-US": "One or more training hyper-parameter overrides are invalid.",
          "zh-CN": "一个或多个训练超参数覆盖值无效。",
        }),
        ExitCode.USAGE,
        issues.map((issue) => formatHyperParameterIssue(ctx, issue)).join("\n"),
      );
    }

    await uploadResolvedLocal(ctx, training, "fine-tune", "datasets", workspaceId);
    if (validation) {
      await uploadResolvedLocal(ctx, validation, "fine-tune", "validations", workspaceId);
    }

    const response = await createFineTune(ctx.client, buildBody(), undefined, workspaceId);
    emitRlResult(ctx, response);

    if (flags.watch !== true) return;
    const jobId = (response.output ?? response.data)?.job_id;
    if (!jobId) return;
    await followRlJob(ctx, jobId, {
      pollTimeoutSec: flags.waitTimeout,
      jobLabel: "OPD job",
      workspaceId,
    });
  },
});
