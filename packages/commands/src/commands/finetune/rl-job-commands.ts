import {
  cancelFineTune,
  defineCommand,
  deleteFineTune,
  getFineTune,
  getFineTuneLogs,
  type FlagDef,
  type FlagsDef,
} from "bailian-cli-core";

import {
  RL_TIMEOUT_MS,
  RL_WATCH_DEFAULT_INTERVAL_SEC,
  RL_WATCH_MIN_INTERVAL_SEC,
  emitRlDryRun,
  emitRlResult,
  executeRl,
  followRlJob,
  probeRlJob,
} from "./rl-shared.ts";

/**
 * Training domains that share the same fine-tunes job backend. RL and OPD are
 * distinct training types with symmetric command surfaces (`finetune rl *` /
 * `finetune opd *`). Backends differ: RL job queries run through the sandbox
 * SDK (the reviewed dashscope CLI surface), while OPD queries call the
 * fine-tunes OpenAPI directly in the host — OPD submission is OpenAPI-only,
 * so its whole command group stays sandbox-free.
 */
export type RlJobDomain = "rl" | "opd";

const DOMAIN_LABELS: Record<RlJobDomain, string> = { rl: "RL", opd: "OPD" };

/** Placeholder job ID used in help examples (OPD jobs use the ft- prefix). */
function sampleJobId(domain: RlJobDomain): string {
  return domain === "rl" ? "rl-xxx" : "ft-xxx";
}

/** OPD commands accept an optional workspace; RL flags stay unchanged. */
function workspaceFlag() {
  return {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound.",
      "zh-CN": "以 X-DashScope-WorkSpace 头发送的业务空间 ID；API Key 已绑定空间时可省略。",
    },
  } satisfies FlagDef;
}

function jobIdFlag(label: string) {
  return {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": `${label} job ID (required)`,
      "zh-CN": `${label} 任务 ID（必填）`,
    },
    required: true,
  } satisfies FlagDef;
}

function jobIdFlags(domain: RlJobDomain) {
  const canonical = {
    jobId: jobIdFlag("OPD"),
    workspaceId: workspaceFlag(),
  } satisfies FlagsDef;
  if (domain === "opd") return canonical;
  // RL has no workspace flag at runtime; the shared canonical type keeps
  // ParsedFlags precise (a union would widen defineCommand's generic).
  return { jobId: jobIdFlag("RL") } as typeof canonical;
}

function pageFlag() {
  return {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number", "zh-CN": "页码" },
  } satisfies FlagDef;
}

function sizeFlag(description: { "en-US": string; "zh-CN": string }) {
  return { type: "number", valueHint: "<n>", description } satisfies FlagDef;
}

/** Domain-conditional flags widen the parsed type; read extras defensively. */
function extraString(flags: Record<string, unknown>, name: string): string | undefined {
  return typeof flags[name] === "string" ? flags[name] : undefined;
}

function extraNumber(flags: Record<string, unknown>, name: string): number | undefined {
  return typeof flags[name] === "number" ? flags[name] : undefined;
}

export function defineJobGetCommand(domain: RlJobDomain) {
  const label = DOMAIN_LABELS[domain];
  return defineCommand({
    defaultOutput: "json",
    description: {
      "en-US": `Get an ${label} job`,
      "zh-CN": `查询 ${label} 任务详情`,
    },
    auth: "apiKey",
    usageArgs: "--job-id <id>",
    flags: jobIdFlags(domain),
    exampleArgs: [`--job-id ${sampleJobId(domain)}`],
    notes:
      domain === "opd"
        ? [
            {
              "en-US":
                "Returns the raw fine-tunes OpenAPI response (teacher_model, training/validation datasets, MTU spec and capacity included). No sandbox runtime needed.",
              "zh-CN":
                "原样返回 fine-tunes OpenAPI 响应（含 teacher_model、训练/验证数据集、MTU 规格与容量）。无需沙箱运行时。",
            },
          ]
        : undefined,
    async run(ctx) {
      const jobId = ctx.flags.jobId;
      const workspaceId = extraString(ctx.flags, "workspaceId");
      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, `finetune.${domain}.get`, {
          job_id: jobId,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        });
        return;
      }
      if (domain === "opd") {
        emitRlResult(ctx, await getFineTune(ctx.client, jobId, undefined, workspaceId));
        return;
      }
      emitRlResult(
        ctx,
        await executeRl(ctx, ["rl", "get", jobId, "--output-format", "json"], {
          timeoutMs: RL_TIMEOUT_MS.query,
        }),
      );
    },
  });
}

export function defineJobListCommand() {
  const LIST_FLAGS = {
    page: pageFlag(),
    size: sizeFlag({ "en-US": "Page size", "zh-CN": "每页数量" }),
  } satisfies FlagsDef;

  return defineCommand({
    defaultOutput: "json",
    description: { "en-US": "List RL jobs", "zh-CN": "列出 RL 任务" },
    auth: "apiKey",
    usageArgs: "[--page <n>] [--size <n>]",
    flags: LIST_FLAGS,
    exampleArgs: ["--page 1 --size 20"],
    notes: [
      {
        "en-US":
          "RL and OPD jobs share the same job backend; this lists the same job records as `finetune list` (including OPD jobs).",
        "zh-CN":
          "RL 与 OPD 任务共用同一任务后端；此处列出的任务记录与 `finetune list` 同源（含 OPD 任务）。",
      },
    ],
    async run(ctx) {
      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, "finetune.rl.list", {
          page: ctx.flags.page,
          size: ctx.flags.size,
        });
        return;
      }
      const args = ["rl", "list", "--output-format", "json"];
      if (ctx.flags.page !== undefined) args.push("--page", String(ctx.flags.page));
      if (ctx.flags.size !== undefined) args.push("--size", String(ctx.flags.size));
      emitRlResult(ctx, await executeRl(ctx, args, { timeoutMs: RL_TIMEOUT_MS.query }));
    },
  });
}

export function defineJobWatchCommand(domain: RlJobDomain) {
  const label = DOMAIN_LABELS[domain];
  const WATCH_FLAGS = {
    ...jobIdFlags(domain),
    follow: {
      type: "switch",
      description: {
        "en-US":
          "Block and poll until a terminal state. Without it, a single status probe is performed and the command returns immediately.",
        "zh-CN": "阻塞并轮询至终态。不使用时仅查询一次状态并立即返回。",
      },
    },
    interval: {
      type: "number",
      valueHint: "<sec>",
      description: {
        "en-US": `Seconds between polls with --follow (default: ${RL_WATCH_DEFAULT_INTERVAL_SEC}, min: ${RL_WATCH_MIN_INTERVAL_SEC}). Ignored without --follow.`,
        "zh-CN": `使用 --follow 时的轮询间隔秒数（默认：${RL_WATCH_DEFAULT_INTERVAL_SEC}，最小：${RL_WATCH_MIN_INTERVAL_SEC}）。未使用 --follow 时忽略。`,
      },
    },
    pollTimeout: {
      type: "number",
      valueHint: "<sec>",
      description: {
        "en-US":
          "With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.",
        "zh-CN": "使用 --follow 时，在指定秒数后停止轮询（默认：无限制）。未使用 --follow 时忽略。",
      },
    },
  } satisfies FlagsDef;

  return defineCommand({
    defaultOutput: "json",
    description: {
      "en-US": `Probe an ${label} job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.`,
      "zh-CN": `查询 ${label} 任务状态（默认：单次非阻塞获取）。使用 --follow 持续轮询至终态。`,
    },
    auth: "apiKey",
    usageArgs: "--job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]",
    flags: WATCH_FLAGS,
    exampleArgs: [
      "--job-id ft-xxx",
      "--job-id ft-xxx --output json",
      "--job-id ft-xxx --follow",
      "--job-id ft-xxx --follow --interval 5",
      "--job-id ft-xxx --follow --poll-timeout 3600",
    ],
    notes: [
      {
        "en-US":
          "Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then return immediately. The caller owns the polling cadence, so the CLI never holds the terminal.",
        "zh-CN":
          "默认不使用 --follow，执行非阻塞的单次状态查询：获取一次后立即返回。由调用方控制轮询节奏，CLI 不会持续占用终端。",
      },
      {
        "en-US":
          "A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit); SUCCEEDED or still-running returns 0. With --follow, exceeding --poll-timeout raises a timeout error but does not cancel the cloud job.",
        "zh-CN":
          "终态 FAILED/CANCELED 会触发普通 CLI 错误（非零退出码）；SUCCEEDED 或仍在运行时返回 0。使用 --follow 时超过 --poll-timeout 会触发超时错误，但不会取消云端任务。",
      },
      {
        "en-US": `Queries the fine-tunes endpoint directly in the host (no sandbox runtime needed). For per-step training output use \`finetune ${domain} logs\`.`,
        "zh-CN": `直接在宿主查询 fine-tunes 端点（无需沙箱运行时）。查看逐步骤训练输出请用 \`finetune ${domain} logs\`。`,
      },
    ],
    async run(ctx) {
      const jobId = ctx.flags.jobId;
      const follow = ctx.flags.follow;
      const intervalSec = Math.max(
        RL_WATCH_MIN_INTERVAL_SEC,
        ctx.flags.interval ?? RL_WATCH_DEFAULT_INTERVAL_SEC,
      );
      const pollTimeoutSec = ctx.flags.pollTimeout;
      const jobLabel = `${label} job`;
      const workspaceId = extraString(ctx.flags, "workspaceId");

      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, `finetune.${domain}.watch`, {
          job_id: jobId,
          follow: follow === true,
          interval: intervalSec,
          timeout: pollTimeoutSec,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        });
        return;
      }

      if (!follow) {
        await probeRlJob(ctx, jobId, jobLabel, workspaceId);
        return;
      }
      await followRlJob(ctx, jobId, { intervalSec, pollTimeoutSec, jobLabel, workspaceId });
    },
  });
}

export function defineJobLogsCommand(domain: RlJobDomain) {
  const label = DOMAIN_LABELS[domain];
  // OPD reads logs via the fine-tunes OpenAPI (page_no/page_size); RL keeps
  // the sandbox SDK's offset/lines surface.
  const canonicalLogsFlags = {
    ...jobIdFlags("opd"),
    page: pageFlag(),
    pageSize: sizeFlag({ "en-US": "Lines per page", "zh-CN": "每页行数" }),
  } satisfies FlagsDef;
  const LOGS_FLAGS: typeof canonicalLogsFlags =
    domain === "opd"
      ? canonicalLogsFlags
      : ({
          ...jobIdFlags(domain),
          offset: {
            type: "number",
            valueHint: "<n>",
            description: { "en-US": "Log offset", "zh-CN": "日志偏移量" },
          },
          lines: {
            type: "number",
            valueHint: "<n>",
            description: { "en-US": "Number of log lines", "zh-CN": "日志行数" },
          },
        } satisfies FlagsDef as unknown as typeof canonicalLogsFlags);

  return defineCommand({
    defaultOutput: "json",
    description: {
      "en-US": `Fetch ${label} job logs`,
      "zh-CN": `获取 ${label} 任务日志`,
    },
    auth: "apiKey",
    usageArgs:
      domain === "opd"
        ? "--job-id <id> [--page <n>] [--page-size <n>]"
        : "--job-id <id> [--offset <n>] [--lines <n>]",
    flags: LOGS_FLAGS,
    exampleArgs:
      domain === "opd"
        ? [
            `--job-id ${sampleJobId(domain)}`,
            `--job-id ${sampleJobId(domain)} --page 1 --page-size 100`,
          ]
        : [
            `--job-id ${sampleJobId(domain)}`,
            `--job-id ${sampleJobId(domain)} --offset 0 --lines 100`,
          ],
    async run(ctx) {
      const jobId = ctx.flags.jobId;
      const flags = ctx.flags as Record<string, unknown>;
      const workspaceId = extraString(flags, "workspaceId");
      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, `finetune.${domain}.logs`, {
          job_id: jobId,
          ...(domain === "opd"
            ? { page: extraNumber(flags, "page"), page_size: extraNumber(flags, "pageSize") }
            : { offset: extraNumber(flags, "offset"), lines: extraNumber(flags, "lines") }),
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        });
        return;
      }
      if (domain === "opd") {
        emitRlResult(
          ctx,
          await getFineTuneLogs(ctx.client, jobId, {
            pageNo: extraNumber(flags, "page"),
            pageSize: extraNumber(flags, "pageSize"),
            workspaceId,
          }),
        );
        return;
      }
      const args = ["rl", "logs", jobId, "--output-format", "json"];
      const offset = extraNumber(flags, "offset");
      const lines = extraNumber(flags, "lines");
      if (offset !== undefined) args.push("--offset", String(offset));
      if (lines !== undefined) args.push("--lines", String(lines));
      emitRlResult(ctx, await executeRl(ctx, args, { timeoutMs: RL_TIMEOUT_MS.query }));
    },
  });
}

export function defineJobCancelCommand(domain: RlJobDomain) {
  const label = DOMAIN_LABELS[domain];
  return defineCommand({
    defaultOutput: "json",
    description: {
      "en-US": `Cancel a running ${label} job`,
      "zh-CN": `取消运行中的 ${label} 任务`,
    },
    auth: "apiKey",
    risk: {
      level: "high",
      reason: "destructive",
      message: {
        "en-US": `This cancels the running ${label} job; progress may be lost.`,
        "zh-CN": `该操作会取消运行中的 ${label} 任务，进度可能丢失。`,
      },
    },
    usageArgs: "--job-id <id>",
    flags: jobIdFlags(domain),
    exampleArgs: [
      `--job-id ${sampleJobId(domain)}`,
      `--job-id ${sampleJobId(domain)} --dry-run`,
      `--job-id ${sampleJobId(domain)} --yes`,
    ],
    async run(ctx) {
      const jobId = ctx.flags.jobId;
      const workspaceId = extraString(ctx.flags, "workspaceId");
      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, `finetune.${domain}.cancel`, {
          job_id: jobId,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        });
        return;
      }
      if (domain === "opd") {
        emitRlResult(ctx, await cancelFineTune(ctx.client, jobId, undefined, workspaceId));
        return;
      }
      // 1.25.23's rl cancel has no --yes/-o: the confirmation gate is handled by the CLI risk mechanism; the success message
      // goes to stderr with empty stdout, exit 0 means cancellation succeeded, and the TS side synthesizes a structured result.
      // On failure executeRl passes the server error through (non-zero exit).
      await executeRl(ctx, ["rl", "cancel", jobId], { timeoutMs: RL_TIMEOUT_MS.query });
      emitRlResult(ctx, { job_id: jobId, canceled: true });
    },
  });
}

export function defineJobDeleteCommand(domain: RlJobDomain) {
  const label = DOMAIN_LABELS[domain];
  return defineCommand({
    defaultOutput: "json",
    description: {
      "en-US": `Delete an ${label} job record`,
      "zh-CN": `删除 ${label} 任务记录`,
    },
    auth: "apiKey",
    risk: {
      level: "high",
      reason: "destructive",
      message: {
        "en-US": `This permanently deletes the ${label} job record and cannot be undone.`,
        "zh-CN": `该操作会永久删除 ${label} 任务记录，且无法撤销。`,
      },
    },
    usageArgs: "--job-id <id>",
    flags: jobIdFlags(domain),
    exampleArgs: [
      `--job-id ${sampleJobId(domain)}`,
      `--job-id ${sampleJobId(domain)} --dry-run`,
      `--job-id ${sampleJobId(domain)} --yes`,
    ],
    notes: [
      {
        "en-US":
          "Deletes the job record via the fine-tunes endpoint directly in the host (no sandbox runtime needed); RL and OPD jobs share this backend.",
        "zh-CN":
          "直接在宿主经 fine-tunes 端点删除任务记录（无需沙箱运行时）；RL 与 OPD 任务共用该后端。",
      },
    ],
    async run(ctx) {
      const jobId = ctx.flags.jobId;
      const workspaceId = extraString(ctx.flags, "workspaceId");
      if (ctx.settings.dryRun) {
        emitRlDryRun(ctx, `finetune.${domain}.delete`, {
          job_id: jobId,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        });
        return;
      }
      // RL/OPD jobs share the fine-tunes backend; deletion goes through the host-side deleteFineTune (same path as watch/probe),
      // not through the sandbox.
      emitRlResult(ctx, await deleteFineTune(ctx.client, jobId, undefined, workspaceId));
    },
  });
}
