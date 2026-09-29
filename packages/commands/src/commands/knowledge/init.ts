import { resolve } from "node:path";
import {
  BailianError,
  ExitCode,
  defineCommand,
  detectOutputFormat,
  type CommandContext,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { knowledgeCreationRisk, localizedKnowledgeBillingNotice } from "./billing.ts";
import { prepareKnowledgeInit, type InitPrepared } from "./init-prepare.ts";
import { runKnowledgeInit, type InitResource } from "./init-workflow.ts";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";
import deleteIndex from "./kb-delete.ts";
import deleteService from "./service-delete.ts";
import deleteFile from "./file-delete.ts";
import search from "./search.ts";

const INIT_FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Knowledge base name (1-20 characters; default: cli-demo)",
      "zh-CN": "知识库名称（1–20 个字符；默认 cli-demo）",
    },
  },
  stateFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Recovery checkpoint (default: .bailian/knowledge/init.json)",
      "zh-CN": "恢复记录路径（默认 .bailian/knowledge/init.json）",
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

interface CommandAction {
  path: string[];
  args: string[];
}

function cleanupAction(
  context: Pick<CommandContext, "commandPath">,
  resource: InitResource,
  workspaceId: string,
): CommandAction[] {
  if (!resource.created) return [];
  const command =
    resource.kind === "knowledge-base"
      ? deleteIndex
      : resource.kind === "service"
        ? deleteService
        : deleteFile;
  const flag =
    resource.kind === "knowledge-base"
      ? "--index-id"
      : resource.kind === "service"
        ? "--agent-id"
        : "--file-id";
  const path = context.commandPath?.(command);
  return path ? [{ path, args: [flag, resource.id, "--workspace-id", workspaceId] }] : [];
}

function renderAction(binName: string, action: CommandAction): string {
  return [binName, ...action.path, ...action.args]
    .map((word) =>
      /^[a-zA-Z0-9_./:@=-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`,
    )
    .join(" ");
}

export default defineCommand<typeof INIT_FLAGS, InitPrepared>({
  description: {
    "en-US": "Initialize a knowledge base and verify sample retrieval",
    "zh-CN": "初始化知识库并验证样例检索",
  },
  auth: "apiKey",
  risk: knowledgeCreationRisk,
  flags: INIT_FLAGS,
  usageArgs: "[--name <name>] [--state-file <path>] [flags]",
  notes: [
    {
      "en-US":
        "Creating a knowledge base starts running-time billing. The 720-hour Standard Edition allowance is shared and time limited; remaining balance is not verified. Confirm creation with --yes.",
      "zh-CN":
        "知识库创建即开始按运行时长计费。标准版 720 小时额度有有效期且共享扣减，当前余额未核实。请通过 --yes 确认创建。",
    },
    {
      "en-US":
        "--dry-run requires credentials and reads existing resources, but makes no resource or checkpoint changes. Keep the state file for recovery.",
      "zh-CN":
        "--dry-run 需要凭证并会读取已有资源，但不修改资源或恢复记录。请保留状态文件以便恢复。",
    },
    {
      "en-US":
        "Creates a retrieval service using its beta draft; does not publish a service or create a chat service. Closing the CLI does not stop knowledge-base charges.",
      "zh-CN":
        "创建检索服务并使用 beta 草稿，不发布服务或创建问答服务。关闭 CLI 不会停止知识库计费。",
    },
  ],
  exampleArgs: ["--dry-run", "--yes", "--name my-demo --state-file .bailian/my-demo.json --yes"],
  validate(flags) {
    if (flags.name !== undefined && (!flags.name.trim() || flags.name.length > 20))
      return { "en-US": "--name must be 1-20 characters.", "zh-CN": "--name 必须为 1–20 个字符。" };
    if (flags.stateFile !== undefined && !flags.stateFile.trim())
      return { "en-US": "--state-file cannot be empty.", "zh-CN": "--state-file 不能为空。" };
    if (
      flags.pollInterval !== undefined &&
      (!Number.isFinite(flags.pollInterval) || flags.pollInterval <= 0)
    )
      return {
        "en-US": "--poll-interval must be positive.",
        "zh-CN": "--poll-interval 必须为正数。",
      };
    return undefined;
  },
  async prepare(context) {
    return prepareKnowledgeInit({
      client: context.client,
      workspaceId: resolveWorkspaceId(context),
      name: context.flags.name ?? "cli-demo",
      stateFile: resolve(context.flags.stateFile ?? ".bailian/knowledge/init.json"),
      localize: context.localize,
    });
  },
  async run(context) {
    if (!context.prepared)
      throw new BailianError(
        context.localize({
          "en-US": "Initialization requires a prepared plan.",
          "zh-CN": "初始化需要先生成执行计划。",
        }),
        ExitCode.GENERAL,
      );
    const workspaceId = resolveWorkspaceId(context);
    const format = detectOutputFormat(context.settings.output);
    const result = await runKnowledgeInit({
      client: context.client,
      workspaceId,
      name: context.flags.name ?? "cli-demo",
      stateFile: context.prepared.stateFile,
      localize: context.localize,
      settings: context.settings,
      prepared: context.prepared,
      pollInterval: context.flags.pollInterval ?? 5,
      report: (resource) => {
        const cleanup = cleanupAction(context, resource, workspaceId);
        const message =
          resource.kind === "knowledge-base"
            ? context.localize({
                "en-US": `Knowledge base ${resource.id} remains subject to running-time charges, even if a later step fails. Delete it when no longer needed.`,
                "zh-CN": `知识库 ${resource.id} 会持续按运行时长计费，后续失败也不会停止计费。不再需要时请删除。`,
              })
            : context.localize({
                "en-US": `${resource.created ? "Created" : "Reused"} ${resource.kind}: ${resource.id}`,
                "zh-CN": `${resource.created ? "已创建" : "已复用"} ${resource.kind}：${resource.id}`,
              });
        if (format === "json")
          process.stderr.write(
            `${JSON.stringify({ code: "KNOWLEDGE_INIT_RESOURCE", message, resource, cleanup })}\n`,
          );
        else {
          process.stderr.write(`${message}\n`);
          for (const action of cleanup)
            process.stderr.write(`${renderAction(context.identity.binName, action)}\n`);
        }
      },
    });
    const cleanup = [...result.resources]
      .sort(
        (left, right) =>
          ["service", "knowledge-base", "file"].indexOf(left.kind) -
          ["service", "knowledge-base", "file"].indexOf(right.kind),
      )
      .flatMap((resource) => cleanupAction(context, resource, workspaceId));
    const searchPath = context.commandPath?.(search);
    const nextSearch = searchPath
      ? {
          path: searchPath,
          args: [
            "--agent-id",
            result.agentId,
            "--agent-version",
            "beta",
            "--workspace-id",
            workspaceId,
            "--query",
            context.localize({ "en-US": "What is RAG?", "zh-CN": "什么是 RAG？" }),
          ],
        }
      : undefined;
    const notices = [localizedKnowledgeBillingNotice(context)];
    if (format === "json") {
      emitResult({ ...result, cleanup, nextSearch, notices }, format);
      return;
    }
    emitBare(
      context.localize({
        "en-US": "Initialization succeeded: the sample was retrieved.",
        "zh-CN": "初始化成功：已检索到样例内容。",
      }),
    );
    emitBare(
      `indexId: ${result.indexId}\nagentId: ${result.agentId}\nstateFile: ${result.stateFile}`,
    );
    if (nextSearch) emitBare(renderAction(context.identity.binName, nextSearch));
    emitBare(notices[0]!.message);
    if (cleanup.length)
      emitBare(
        context.localize({
          "en-US":
            "Cleanup commands for resources created in this run (confirm deletion separately):",
          "zh-CN": "本次新建资源的清理命令（删除需另行确认）：",
        }),
      );
    for (const action of cleanup) emitBare(renderAction(context.identity.binName, action));
  },
});
