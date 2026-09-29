import type { CommandContext, CommandNotice, CommandRisk } from "bailian-cli-core";
import { KNOWLEDGE_BILLING_PAGE } from "bailian-cli-runtime";
import deleteIndex from "./kb-delete.ts";

// Policy checked against the official documentation on 2026-09-29. This is not an account balance.
export const knowledgeBillingNotice = {
  code: "KNOWLEDGE_BILLING",
  remainingAllowance: "unknown",
  url: KNOWLEDGE_BILLING_PAGE,
  message: {
    "en-US":
      "Knowledge bases accrue running-time charges from creation, even without queries. The one-time 720-hour allowance is shared across Standard Edition knowledge bases and expires 30 days after service activation for new users. Model calls are billed separately. Your remaining allowance has not been verified. Delete unused knowledge bases to stop their running-time charges.",
    "zh-CN":
      "知识库创建成功后，即使不检索也会持续按运行时长计费。一次性 720 小时额度仅适用于标准版，多个知识库共享，新用户开通服务后 30 天内有效；模型调用费用另计。当前账户剩余额度尚未核实。请删除不再需要的知识库以停止其规格计费。",
  },
} as const satisfies CommandNotice & { remainingAllowance: "unknown" };

export const knowledgeCreationRisk: CommandRisk = {
  level: "high",
  reason: "billing",
  message: {
    "en-US": `${knowledgeBillingNotice.message["en-US"]}\n${KNOWLEDGE_BILLING_PAGE}`,
    "zh-CN": `${knowledgeBillingNotice.message["zh-CN"]}\n${KNOWLEDGE_BILLING_PAGE}`,
  },
};

type NoticeContext = Pick<CommandContext, "localize" | "settings">;

export function localizedKnowledgeBillingNotice(context: NoticeContext) {
  return { ...knowledgeBillingNotice, message: context.localize(knowledgeBillingNotice.message) };
}

export function writeKnowledgeBillingNotice(context: NoticeContext): void {
  const notice = localizedKnowledgeBillingNotice(context);
  process.stderr.write(
    context.settings.output === "json"
      ? `${JSON.stringify({ warning: notice })}\n\n`
      : `${notice.message}\n${notice.url}\n`,
  );
}

/** Emit immediately after creation, before any fallible follow-up such as waiting for import. */
export function reportCreatedKnowledgeBase(
  context: NoticeContext & Partial<Pick<CommandContext, "identity" | "commandPath">>,
  workspaceId: string,
  indexId: string,
) {
  const path = context.commandPath?.(deleteIndex);
  const command =
    path && context.identity
      ? {
          bin: context.identity.binName,
          path,
          args: ["--index-id", indexId, "--workspace-id", workspaceId],
        }
      : undefined;
  const resource = {
    indexId,
    workspaceId,
    created: true,
    cleanup: {
      action: "delete-knowledge-base",
      indexId,
      workspaceId,
      requiresConfirmation: true,
      ...(command ? { command } : {}),
    },
  };
  const message = context.localize({
    "en-US": `Knowledge base ${indexId} was created and remains billable even if a later step fails. To stop its running-time charges, delete this knowledge base after confirming that its data is no longer needed.`,
    "zh-CN": `知识库 ${indexId} 已创建，后续步骤失败也不会停止其计费。如不再需要其中数据，请确认后删除该知识库以停止规格计费。`,
  });
  process.stderr.write(
    context.settings.output === "json"
      ? `${JSON.stringify({ warning: { code: "KNOWLEDGE_RESOURCE_CREATED", message, resource } })}\n\n`
      : `${message}\n`,
  );
  if (command && context.settings.output !== "json") {
    const instruction = [command.bin, ...command.path, ...command.args]
      .map((word) =>
        /^[a-zA-Z0-9_./:@=-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`,
      )
      .join(" ");
    process.stderr.write(`${instruction}\n`);
  }
  return resource;
}
