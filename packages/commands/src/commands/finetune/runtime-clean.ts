import {
  cleanupSandboxArtifacts,
  currentManagedRuntimeId,
  DEFAULT_RUNS_TTL_MS,
  defineCommand,
  type FlagsDef,
} from "bailian-cli-core";

import { emitRlDryRun, emitRlResult } from "./rl-shared.ts";

const MS_PER_HOUR = 3_600_000;

const CLEAN_FLAGS = {
  ttlHours: {
    type: "number",
    valueHint: "<hours>",
    description: {
      "en-US": "Age threshold for orphaned run directories (default 24)",
      "zh-CN": "孤儿任务目录的年龄阈值（默认 24 小时）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Reclaim orphaned sandbox run directories and superseded runtime versions",
    "zh-CN": "回收孤儿沙箱任务目录与旧版本运行时",
  },
  auth: "none",
  risk: {
    level: "high",
    reason: "destructive",
    message: {
      "en-US":
        "This permanently deletes orphaned run directories and superseded runtime versions; it cannot be undone.",
      "zh-CN": "该操作会永久删除孤儿任务目录与旧版本运行时，且无法撤销。",
    },
  },
  usageArgs: "[--ttl-hours <hours>] [--dry-run]",
  flags: CLEAN_FLAGS,
  exampleArgs: ["--dry-run", "--ttl-hours 48", ""],
  notes: [
    {
      "en-US":
        "Normal runs are disposed automatically when the invocation ends; only crash leftovers (older than the TTL) remain under runs/. Superseded runtime versions under runtimes/rl/ are reclaimed, keeping only the current reviewed baseline.",
      "zh-CN":
        "正常调用的任务目录在结束时自动销毁，runs/ 下只剩崩溃残留（超过 TTL 才回收）；runtimes/rl/ 下仅保留当前受审查基线，旧版本目录被回收。",
    },
    {
      "en-US":
        "Never touches the current baseline runtime, BAILIAN_RL_RUNTIME development directories, or the content-addressed download cache. Local only: no credentials, no cloud resources.",
      "zh-CN":
        "绝不触碰当前基线运行时、BAILIAN_RL_RUNTIME 开发目录与按内容寻址的下载缓存。纯本地操作：无需凭证，不创建任何云资源。",
    },
    {
      "en-US":
        "Deletion is irreversible; preview the remove/keep plan with --dry-run first. Runtime reclamation requires a bundled manifest entry for this platform; otherwise only runs are pruned.",
      "zh-CN":
        "删除不可撤销，请先用 --dry-run 预览 remove/keep 计划。运行时回收需要本平台在随包清单中有条目，否则只清理 runs。",
    },
  ],
  validate: (flags) => {
    const ttlHours = flags.ttlHours as number | undefined;
    if (ttlHours !== undefined && !(ttlHours > 0)) {
      return "--ttl-hours must be a positive number. / --ttl-hours 必须为正数。";
    }
    return undefined;
  },
  async run(ctx) {
    const ttlHours =
      (ctx.flags.ttlHours as number | undefined) ?? DEFAULT_RUNS_TTL_MS / MS_PER_HOUR;
    const currentRuntimeId = currentManagedRuntimeId();
    const options = {
      runsTtlMs: ttlHours * MS_PER_HOUR,
      pruneRuns: true,
      pruneRuntimes: currentRuntimeId !== undefined,
      currentRuntimeId,
    };
    if (ctx.settings.dryRun) {
      emitRlDryRun(
        ctx,
        "finetune.runtime.clean",
        cleanupSandboxArtifacts({ ...options, dryRun: true }),
      );
      return;
    }
    emitRlResult(ctx, cleanupSandboxArtifacts(options));
  },
});
