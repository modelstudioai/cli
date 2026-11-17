import { readFileSync } from "node:fs";
import {
  BailianError,
  ExitCode,
  RL_DASHSCOPE_VERSION,
  buildTaskYaml,
  createSnapshot,
  executeInSandbox,
  getFineTune,
  resolveTrainingSpec,
  runRlAuthorization,
  stageDataFiles,
  type CommandContext,
  type FlagsDef,
  type ITaskDirLayout,
  type ParsedFlags,
  type RlAuthTarget,
  type RlJobSpec,
  type RlRunParams,
} from "bailian-cli-core";
import { consoleReadTargetPreview } from "../shared/console-read.ts";

/** Wall-clock budgets per command class (milliseconds). */
export const RL_TIMEOUT_MS = {
  query: 60_000,
  run: 1_800_000,
} as const;

const RL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface IRlExecuteOptions {
  timeoutMs?: number;
  /** Allow first-time runtime preparation (interactive run only). */
  allowInstall?: boolean;
  signal?: AbortSignal;
  /**
   * Stage task-local inputs before spawning. Return a YAML string to also write
   * a task config passed via `--config`.
   */
  prepare?: (layout: ITaskDirLayout) => string | void;
}

/** Emit a normal result, rendering JSON as text when the user asked for text. */
export function emitRlResult<F extends FlagsDef>(ctx: CommandContext<F>, data: unknown): void {
  ctx.output.result(
    data,
    ctx.settings.output === "text" ? { text: JSON.stringify(data, null, 2) } : undefined,
  );
}

/** Emit a dry-run preview (zero network, zero local writes). */
export function emitRlDryRun<F extends FlagsDef>(
  ctx: CommandContext<F>,
  action: string,
  preview: unknown,
): void {
  emitRlResult(ctx, { action, ...(preview as Record<string, unknown>) });
}

/**
 * Thin periphery: hand the SDK args + credential to the sandbox black box, which
 * internally resolves the runtime (manifest-driven first download / cache) and
 * runs `python -I -m dashscope.cli <sdkArgs>` under two-layer isolation. JSON
 * output is a leaf-level `--output-format json` carried in sdkArgs (the reviewed
 * dashscope 1.25.23 CLI has no top-level --output option).
 */
export async function executeRl<F extends FlagsDef>(
  ctx: CommandContext<F>,
  sdkArgs: string[] | ((layout: ITaskDirLayout) => string[]),
  options: IRlExecuteOptions = {},
): Promise<unknown> {
  const credential = ctx.client.exportApiCredential();
  if (!credential) {
    throw new BailianError(
      "No API key found for the RL command. / RL 命令未找到 API Key。",
      ExitCode.AUTH,
      "Configure an API key first (see the auth command).",
    );
  }
  return executeInSandbox({
    sdkArgs,
    // RL SDK 自带管理面网关路由：显式注入 base_url（推理 workspace 网关、甚至 dashscope 本身）
    // 都会破坏 RL 路由致 404；仅传 token，让 SDK 走默认 RL 网关（与 demo cli.sh 仅设 API Key 一致）。
    credential: { token: credential.token },
    prepare: options.prepare,
    timeoutMs: options.timeoutMs ?? RL_TIMEOUT_MS.query,
    maxOutputBytes: RL_MAX_OUTPUT_BYTES,
    signal: options.signal,
    allowInstall: options.allowInstall,
  });
}

/**
 * Business + execution flags shared by `rl run` and `opd run`. The watch budget
 * uses `--wait-timeout` because `--timeout` is a reserved global flag.
 */
export const RL_RUN_FLAGS = {
  configFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Optional job YAML file; explicit CLI flags override it",
      "zh-CN": "可选的任务 YAML 文件；显式 CLI 参数优先级更高",
    },
  },
  name: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Job name", "zh-CN": "任务名称" },
  },
  model: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Base model ID", "zh-CN": "基座模型 ID" },
  },
  trainFile: {
    type: "array",
    valueHint: "<path>",
    description: { "en-US": "Local training file (repeatable)", "zh-CN": "本地训练文件（可重复）" },
  },
  trainFileId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Uploaded training file ID (repeatable)",
      "zh-CN": "已上传训练文件 ID（可重复）",
    },
  },
  validationFile: {
    type: "array",
    valueHint: "<path>",
    description: {
      "en-US": "Local validation file (repeatable)",
      "zh-CN": "本地验证文件（可重复）",
    },
  },
  validationFileId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Uploaded validation file ID (repeatable)",
      "zh-CN": "已上传验证文件 ID（可重复）",
    },
  },
  codeDir: {
    type: "string",
    valueHint: "<path>",
    description: { "en-US": "Function package source directory", "zh-CN": "函数代码包源目录" },
  },
  requirements: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Requirements path relative to the code dir",
      "zh-CN": "相对代码目录的 requirements 路径",
    },
  },
  include: {
    type: "array",
    valueHint: "<glob>",
    description: {
      "en-US": "Package include glob (repeatable)",
      "zh-CN": "打包纳入 glob（可重复）",
    },
  },
  exclude: {
    type: "array",
    valueHint: "<glob>",
    description: {
      "en-US": "Package exclude glob (repeatable)",
      "zh-CN": "打包排除 glob（可重复）",
    },
  },
  rollout: {
    type: "string",
    valueHint: "<classpath>",
    description: { "en-US": "Rollout function classpath", "zh-CN": "rollout 函数 classpath" },
  },
  reward: {
    type: "array",
    valueHint: "<name=classpath>",
    description: { "en-US": "Reward function (repeatable)", "zh-CN": "reward 函数（可重复）" },
  },
  clearFunctions: {
    type: "switch",
    description: {
      "en-US": "Clear functions defined in the YAML",
      "zh-CN": "清空 YAML 中定义的函数",
    },
  },
  functionTimeout: {
    type: "array",
    valueHint: "<name=sec>",
    description: {
      "en-US": "Function timeout in seconds (repeatable)",
      "zh-CN": "函数超时秒数（可重复）",
    },
  },
  functionRuntime: {
    type: "array",
    valueHint: "<name.field=value>",
    description: {
      "en-US": "Function runtime field (repeatable)",
      "zh-CN": "函数 runtime 字段（可重复）",
    },
  },
  rewardWeight: {
    type: "array",
    valueHint: "<name=num>",
    description: { "en-US": "Reward weight (repeatable)", "zh-CN": "reward 权重（可重复）" },
  },
  rewardMetric: {
    type: "array",
    valueHint: "<name.metric=num>",
    description: {
      "en-US": "Reward metric weight (repeatable)",
      "zh-CN": "reward 指标权重（可重复）",
    },
  },
  functionEnv: {
    type: "array",
    valueHint: "<name.KEY=value>",
    description: {
      "en-US": "Function environment variable (repeatable)",
      "zh-CN": "函数环境变量（可重复）",
    },
  },
  hp: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Hyper-parameter (repeatable, parsed by type)",
      "zh-CN": "超参数（可重复，按类型解析）",
    },
  },
  chargeType: {
    type: "string",
    valueHint: "<value>",
    description: { "en-US": "Resource charge type", "zh-CN": "资源计费类型" },
  },
  mtuSpec: {
    type: "string",
    valueHint: "<code>",
    description: { "en-US": "MTU spec code", "zh-CN": "MTU 规格代码" },
  },
  mtuCount: {
    type: "number",
    valueHint: "<int>",
    description: { "en-US": "MTU capacity", "zh-CN": "MTU 数量" },
  },
  instanceId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Prepaid resource instance ID", "zh-CN": "预付费资源实例 ID" },
  },
  set: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Top-level spec override (repeatable, JSON value)",
      "zh-CN": "顶层 spec 覆盖（可重复，值按 JSON 解析）",
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
  installRuntime: {
    type: "switch",
    description: {
      "en-US": "Allow first-time managed runtime preparation",
      "zh-CN": "允许首次准备托管运行时",
    },
  },
} satisfies FlagsDef;

/** Map parsed run flags into the core business-param shape. */
export function buildRlRunParams(flags: ParsedFlags<typeof RL_RUN_FLAGS>): RlRunParams {
  return {
    name: flags.name,
    model: flags.model,
    trainFiles: flags.trainFile,
    trainFileIds: flags.trainFileId,
    validationFiles: flags.validationFile,
    validationFileIds: flags.validationFileId,
    codeDir: flags.codeDir,
    requirements: flags.requirements,
    include: flags.include,
    exclude: flags.exclude,
    rollout: flags.rollout,
    rewards: flags.reward,
    clearFunctions: flags.clearFunctions,
    functionTimeouts: flags.functionTimeout,
    functionRuntime: flags.functionRuntime,
    rewardWeights: flags.rewardWeight,
    rewardMetrics: flags.rewardMetric,
    functionEnv: flags.functionEnv,
    hp: flags.hp,
    chargeType: flags.chargeType,
    mtuSpec: flags.mtuSpec,
    mtuCount: flags.mtuCount,
    instanceId: flags.instanceId,
    set: flags.set,
  };
}

/** Read the optional job YAML, keeping an errno-specific hint on I/O failure. */
export function readRlConfigFile(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    const hint =
      errno === "ENOENT"
        ? `Config file not found: ${filePath}`
        : errno === "EACCES" || errno === "EPERM"
          ? `Permission denied reading config file: ${filePath}`
          : errno === "EISDIR"
            ? `Config file path is a directory: ${filePath}`
            : `Cannot read config file: ${filePath} (${errno ?? String(error)})`;
    throw new BailianError(`Cannot read config file: ${filePath}`, ExitCode.GENERAL, hint);
  }
}

/** Snapshot the code package and stage local data files into the task layout. */
function stageJobInputs(spec: RlJobSpec, layout: ITaskDirLayout): void {
  const codeDir =
    spec.bailian?.code_dir ?? spec.functions?.find((fn) => fn.fcmodel?.zipdir)?.fcmodel?.zipdir;
  if (codeDir) {
    createSnapshot({
      sourceDir: codeDir,
      snapshotDir: layout.snapshotDir,
      deployCopyDir: layout.deployCopyDir,
      include: spec.bailian?.package?.include,
      exclude: spec.bailian?.package?.exclude,
    });
  }
  const localFiles = (spec.datasets ?? [])
    .map((dataset) => dataset.file_name)
    .filter((file): file is string => typeof file === "string" && file.length > 0);
  if (localFiles.length > 0) stageDataFiles(localFiles, layout.dataDir);
}

export interface IRlRunControls {
  /** Dry-run action label, e.g. `finetune.rl.run`. */
  action: string;
  watch?: boolean;
  waitTimeoutSeconds?: number;
  allowInstall?: boolean;
}

/**
 * Assemble the spec, then submit `rl run` inside the sandbox (the reviewed
 * dashscope 1.25.23 CLI surface: run/get/list/logs/cancel, no `jobs` subgroup).
 * Shared by `rl run` and `opd run`; the caller supplies the merged business
 * params and the optional YAML text. Dry-run returns the assembled spec with
 * zero writes.
 */
export async function runRlJob<F extends FlagsDef>(
  ctx: CommandContext<F>,
  params: RlRunParams,
  yamlText: string | undefined,
  controls: IRlRunControls,
): Promise<void> {
  const resolved = resolveTrainingSpec(params, yamlText);
  const watch = controls.watch === true;
  const waitTimeoutSeconds = controls.waitTimeoutSeconds;

  if (ctx.settings.dryRun) {
    emitRlDryRun(ctx, controls.action, {
      model: resolved.spec.model?.name,
      training_type: resolved.spec.training?.type,
      has_functions: resolved.hasFunctions,
      is_opd: resolved.isOpd,
      watch,
      wait_timeout: waitTimeoutSeconds,
      spec: resolved.spec,
    });
    return;
  }

  // 受审查运行时基线（dashscope 1.25.23）不含 pg_opd 训练类型：OPD 真实提交
  // 快速失败（dry-run 仍可预览 spec），不引入双运行时。get/list/logs/watch/
  // cancel/delete 共用 fine-tunes 后端，不受影响。
  if (resolved.isOpd) {
    throw new BailianError(
      `OPD (pg_opd) submission is not supported by the reviewed dashscope runtime ${RL_DASHSCOPE_VERSION}. / 受审查的 dashscope 运行时 ${RL_DASHSCOPE_VERSION} 不支持 OPD（pg_opd）提交。`,
      ExitCode.USAGE,
      "Use finetune rl run for reinforcement training; OPD requires a newer reviewed SDK baseline. No cloud resources were created.",
    );
  }

  // Submit only: the SDK registers/uploads/submits and returns the job envelope
  // without blocking. `--watch` then polls in the TS host like `finetune watch
  // --follow`, sharing its no-default-timeout semantics (no sandbox wait ceiling).
  const data = await executeRl(ctx, ["rl", "run", "--output-format", "json"], {
    timeoutMs: RL_TIMEOUT_MS.run,
    allowInstall: controls.allowInstall,
    prepare: (layout) => {
      stageJobInputs(resolved.spec, layout);
      return buildTaskYaml(resolved.spec, {
        deployCopyDir: layout.deployCopyDir,
        dataDir: layout.dataDir,
      });
    },
  });

  if (!watch) {
    emitRlResult(ctx, data);
    return;
  }

  const jobId = (data as { job_id?: string } | null)?.job_id;
  if (!jobId) {
    // Submit returned no job id to follow; surface the raw submit result.
    emitRlResult(ctx, data);
    return;
  }
  await followRlJob(ctx, jobId, {
    pollTimeoutSec: waitTimeoutSeconds,
    jobLabel: params.opd ? "OPD job" : "RL job",
  });
}

export interface IRlAuthorizeOptions {
  target: RlAuthTarget;
  /** Dry-run action label, e.g. `finetune.rl.authorize`. */
  action: string;
  /** Permit role creation / enablement; read-only probe when false. */
  authorize: boolean;
}

/**
 * Run the console-side authorization state machine for one target. Authorization
 * runs in the TS host (no Python sandbox); dry-run previews the console target
 * and whether mutations are permitted, with zero network calls.
 */
export async function runRlAuthorize<F extends FlagsDef>(
  ctx: CommandContext<F>,
  options: IRlAuthorizeOptions,
): Promise<void> {
  if (ctx.settings.dryRun) {
    emitRlDryRun(ctx, options.action, {
      target: options.target,
      authorize: options.authorize,
      ...consoleReadTargetPreview(ctx.settings),
    });
    return;
  }
  const report = await runRlAuthorization({
    target: options.target,
    console: (api, data) => ctx.client.console(api, data),
    workspaceId: ctx.settings.workspaceId,
    authorize: options.authorize,
    localize: ctx.localize,
  });
  emitRlResult(ctx, report);
}

/** Default polling interval for `rl watch --follow` (seconds). */
export const RL_WATCH_DEFAULT_INTERVAL_SEC = 10;
/** Minimum polling interval for `rl watch --follow` (seconds). */
export const RL_WATCH_MIN_INTERVAL_SEC = 1;
const RL_TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

function rlWatchStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatRlElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Resolve after `milliseconds`, rejecting early on abort (Ctrl-C). */
function rlWatchSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Single non-blocking status probe, mirroring `finetune watch` default. RL jobs
 * share the fine-tunes backend, so this queries the same HTTP endpoint in the TS
 * host (no sandbox). A terminal FAILED/CANCELED status raises a normal error.
 */
export async function probeRlJob<F extends FlagsDef>(
  ctx: CommandContext<F>,
  jobId: string,
  jobLabel = "RL job",
): Promise<void> {
  const response = await getFineTune(ctx.client, jobId);
  const job = response.output ?? response.data;
  const status = String(job?.status ?? "").toUpperCase();
  const terminal = RL_TERMINAL_STATUSES.has(status);
  emitRlResult(ctx, {
    job_id: jobId,
    status: status || "UNKNOWN",
    terminal,
    request_id: response.request_id,
  });
  if (terminal && status !== "SUCCEEDED") {
    throw new BailianError(`${jobLabel} ${jobId} ended in status ${status}.`, ExitCode.GENERAL);
  }
}

export interface IRlFollowOptions {
  intervalSec?: number;
  /** Stop polling after this many seconds; undefined means no limit. */
  pollTimeoutSec?: number;
  /** Domain wording for terminal/timeout errors, e.g. "OPD job". */
  jobLabel?: string;
}

/**
 * Blocking poll loop, mirroring `finetune watch --follow`. Polls the fine-tunes
 * endpoint in the TS host until a terminal state; Ctrl-C aborts gracefully and
 * `pollTimeoutSec` (default: no limit) bounds the wait without cancelling the job.
 */
export async function followRlJob<F extends FlagsDef>(
  ctx: CommandContext<F>,
  jobId: string,
  options: IRlFollowOptions = {},
): Promise<void> {
  const intervalSec = Math.max(
    RL_WATCH_MIN_INTERVAL_SEC,
    options.intervalSec ?? RL_WATCH_DEFAULT_INTERVAL_SEC,
  );
  const pollTimeoutSec = options.pollTimeoutSec;
  const jobLabel = options.jobLabel ?? "RL job";
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on("SIGINT", onSigint);

  try {
    let lastStatus = "";
    const startedAt = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await getFineTune(ctx.client, jobId, controller.signal);
      const job = response.output ?? response.data;
      const status = String(job?.status ?? "").toUpperCase();

      if (status !== lastStatus) {
        ctx.output.progress({
          "en-US": `${rlWatchStamp()}  ${jobId}  ${status || "UNKNOWN"}`,
          "zh-CN": `${rlWatchStamp()}  ${jobId}  ${status || "UNKNOWN"}`,
        });
        lastStatus = status;
      }

      if (RL_TERMINAL_STATUSES.has(status)) {
        const elapsed = Date.now() - startedAt;
        emitRlResult(ctx, response);
        if (status !== "SUCCEEDED") {
          throw new BailianError(
            `${jobLabel} ${jobId} ended in status ${status} (elapsed ${formatRlElapsed(elapsed)}).`,
            ExitCode.GENERAL,
          );
        }
        return;
      }

      if (pollTimeoutSec !== undefined && (Date.now() - startedAt) / 1000 >= pollTimeoutSec) {
        throw new BailianError(
          `Watching ${jobLabel} ${jobId} timed out after ` +
            `${formatRlElapsed(Date.now() - startedAt)} (last status: ${status || "UNKNOWN"}).`,
          ExitCode.TIMEOUT,
        );
      }

      await rlWatchSleep(intervalSec * 1000, controller.signal);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      ctx.output.info({ "en-US": "Interrupted.", "zh-CN": "已中断。" });
      return;
    }
    throw error;
  } finally {
    process.off("SIGINT", onSigint);
  }
}
