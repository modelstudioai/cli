import {
  BailianError,
  ExitCode,
  defineCommand,
  detectOutputFormat,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { WORKSPACE_FLAG, resolveWorkspaceId } from "./shared.ts";
import { prepareSync, type SyncPrepared } from "./sync/prepare.ts";
import { executeSyncPlan } from "./sync/execute.ts";
import { runSyncRecovery } from "./sync/recovery-run.ts";
import { createSyncExecutionPorts } from "./sync/ports.ts";
import { verifySyncInputs } from "./sync/verify.ts";
import { readSyncRemoteInventory } from "./sync/remote.ts";
import { readStateFile } from "./state-store.ts";

const flags = {
  dir: {
    type: "string",
    required: true,
    valueHint: "<path>",
    description: { "en-US": "Local document directory", "zh-CN": "本地文档目录" },
  },
  indexId: {
    type: "string",
    required: true,
    valueHint: "<id>",
    description: { "en-US": "Target knowledge base ID", "zh-CN": "目标知识库 ID" },
  },
  stateFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Checkpoint path (default: <dir>/.bailian/sync-state.json)",
      "zh-CN": "状态路径（默认 <dir>/.bailian/sync-state.json）",
    },
  },
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Data-center category ID (default: workspace default on first run)",
      "zh-CN": "数据中心类目 ID（首次默认使用工作空间默认类目）",
    },
  },
  syncId: {
    type: "string",
    valueHint: "<uuid>",
    description: { "en-US": "Synchronization set UUID", "zh-CN": "同步集 UUID" },
  },
  delete: {
    type: "switch",
    description: {
      "en-US": "Delete managed index documents missing locally",
      "zh-CN": "删除本地已移除的托管索引文档",
    },
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval (default: 5 seconds)",
      "zh-CN": "轮询间隔（默认 5 秒）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand<typeof flags, SyncPrepared>({
  description: {
    "en-US": "Synchronize a local document directory to a knowledge base",
    "zh-CN": "将本地文档目录增量同步到知识库",
  },
  auth: "apiKey",
  flags,
  risk: {
    level: "high",
    reason: "destructive",
    message: {
      "en-US":
        "Sync may replace or delete managed index documents. Preview affected paths before confirming.",
      "zh-CN": "同步可能替换或删除托管索引文档，请预览受影响路径后确认。",
    },
  },
  usageArgs: "--dir <path> --index-id <id> [flags]",
  exampleArgs: [
    "--dir ./docs --index-id idx-example --dry-run",
    "--dir ./docs --index-id idx-example --yes",
    "--dir ./docs --index-id idx-example --delete --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Dry-run reads remote resources but makes no resource or checkpoint changes. Replacement and deletion require confirmation. Source files are retained.",
      "zh-CN":
        "预览会读取远端资源，但不修改资源或状态记录。替换与删除需要确认，数据中心源文件保留。",
    },
    {
      "en-US":
        "Keep the state file and allow only one writer per synchronization set, including across CI machines. Model import charges may apply; deleting documents does not stop knowledge base charges.",
      "zh-CN":
        "请保留状态文件，每个同步集仅允许一个写入者，跨 CI 机器也需串行。导入可能产生模型费用；删除文档不会停止知识库计费。",
    },
  ],
  validate(values) {
    for (const name of ["dir", "indexId", "stateFile", "categoryId", "syncId"] as const)
      if (values[name] !== undefined && !values[name].trim())
        return { "en-US": `${name} cannot be empty.`, "zh-CN": `${name} 不能为空。` };
    if (
      values.pollInterval !== undefined &&
      (!Number.isFinite(values.pollInterval) || values.pollInterval <= 0)
    )
      return {
        "en-US": "--poll-interval must be positive.",
        "zh-CN": "--poll-interval 必须为正数。",
      };
    return undefined;
  },
  async prepare(context) {
    const prepared = await prepareSync({
      client: context.client,
      workspaceId: resolveWorkspaceId(context),
      indexId: context.flags.indexId,
      directory: context.flags.dir,
      stateFile: context.flags.stateFile,
      categoryId: context.flags.categoryId,
      syncId: context.flags.syncId,
      deleteEnabled: context.flags.delete,
      localize: context.localize,
    });
    const preview = {
      scope: prepared.state.target,
      syncId: prepared.state.syncId,
      stateRevision: prepared.stateRevision,
      stateFile: prepared.stateFile,
      summary: prepared.plan.counts,
      actions: prepared.plan.actions,
      skipped: prepared.plan.skipped,
      unmanaged: prepared.plan.unmanaged,
      orphans: prepared.orphans,
      conflicts: prepared.plan.conflicts,
      blocked: prepared.plan.blocked,
    };
    return { data: prepared, preview, risk: prepared.plan.risk, notices: prepared.notices };
  },
  async run(context) {
    const prepared = context.prepared;
    if (!prepared || prepared.plan.blocked)
      throw new BailianError(
        context.localize({
          "en-US":
            "Sync requires a prepared plan without conflicts. Inspect the dry-run conflicts before continuing.",
          "zh-CN": "同步需要无冲突的预览计划。请先检查预览中的冲突再继续。",
        }),
        ExitCode.GENERAL,
      );
    const ports = createSyncExecutionPorts({
      client: context.client,
      target: prepared.target,
      settings: context.settings,
      pollInterval: context.flags.pollInterval ?? 5,
      localize: context.localize,
      verify: () =>
        verifySyncInputs({ ...prepared, client: context.client, localize: context.localize }),
    });
    const common = {
      stateFile: prepared.stateFile,
      stateRevision: prepared.stateRevision,
      state: prepared.state,
      files: prepared.scan.files,
      ports,
      localize: context.localize,
    };
    let completed: unknown;
    try {
      completed = prepared.plan.requiresReplan
        ? await runSyncRecovery({
            ...common,
            loadRemote: () =>
              readSyncRemoteInventory(context.client, prepared.target, context.localize),
          })
        : await executeSyncPlan({ ...common, plan: prepared.plan });
    } catch (error) {
      const checkpoint = await readStateFile(prepared.stateFile, context.localize).catch(
        () => undefined,
      );
      process.stderr.write(
        `${JSON.stringify({ code: "KNOWLEDGE_SYNC_INCOMPLETE", stateFile: prepared.stateFile, checkpoint })}\n`,
      );
      throw error;
    }
    const result = {
      summary: prepared.plan.counts,
      actions: prepared.plan.actions,
      skipped: prepared.plan.skipped,
      unmanaged: prepared.plan.unmanaged,
      orphans: prepared.orphans,
      notices: prepared.notices.map((notice) => ({
        ...notice,
        message: context.localize(notice.message),
      })),
      stateFile: prepared.stateFile,
      requiresReplan: prepared.plan.requiresReplan,
      result: completed,
    };
    const format = detectOutputFormat(context.settings.output);
    if (format === "json") emitResult(result, format);
    else {
      emitBare(
        context.localize(
          prepared.plan.requiresReplan
            ? {
                "en-US": "Recovery completed. Preview remaining changes again before continuing.",
                "zh-CN": "恢复完成。请重新预览剩余变更后继续。",
              }
            : { "en-US": "Synchronization completed.", "zh-CN": "同步完成。" },
        ),
      );
      emitBare(JSON.stringify(result.summary));
      emitBare(`stateFile: ${prepared.stateFile}`);
    }
  },
});
