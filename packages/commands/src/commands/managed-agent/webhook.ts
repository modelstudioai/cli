import {
  createRemoteWebhookEndpoint,
  deleteRemoteWebhookEndpoint,
  disableRemoteWebhookEndpoint,
  enableRemoteWebhookEndpoint,
  getRemoteWebhookEndpoint,
  listRemoteWebhookEndpoints,
  listRemoteWebhookEvents,
  resetRemoteWebhookSecret,
  testRemoteWebhookEndpoint,
  updateRemoteWebhookEndpoint,
  type WebhookRequestOptions,
} from "@openagentpack/sdk";
import {
  BailianError,
  defineCommand,
  ExitCode,
  type CommandRisk,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  buildManagedApiContext,
  type ManagedApiHost,
  resolveManagedApiBaseUrl,
} from "./_engine/managed-api-context.ts";

const WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID; optional when a base URL is configured",
      "zh-CN": "Workspace ID；已配置 Base URL 时可省略",
    },
  },
} satisfies FlagsDef;

const WEBHOOK_ID_FLAGS = {
  ...WORKSPACE_FLAG,
  webhookId: {
    type: "string",
    valueHint: "<wep_id>",
    description: { "en-US": "Webhook endpoint ID", "zh-CN": "Webhook 端点 ID" },
    required: true,
  },
} satisfies FlagsDef;

const WEBHOOK_INPUT_FLAGS = {
  url: {
    type: "string",
    valueHint: "<url>",
    description: {
      "en-US": "Public HTTP or HTTPS callback URL",
      "zh-CN": "公网 HTTP 或 HTTPS 回调地址",
    },
  },
  event: {
    type: "array",
    valueHint: "<type>",
    description: {
      "en-US": "Named event subscription; repeat for multiple events, wildcards are unsupported",
      "zh-CN": "具名订阅事件；可重复传入多个事件，不支持通配符",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Description, up to 256 characters; an empty string clears it on update",
      "zh-CN": "描述，最多 256 个字符；更新时传空字符串可清空",
    },
  },
} satisfies FlagsDef;

const WEBHOOK_NOTES: LocalizedText[] = [
  {
    "en-US":
      "Manages workspace-level Webhooks directly; no agents.yaml or local state is required.",
    "zh-CN": "直接管理工作空间级 Webhook；无需 agents.yaml 或本地状态文件。",
  },
  {
    "en-US":
      "Auth: --api-key > DASHSCOPE_API_KEY > active profile API key. Credentials are injected into the SDK in memory only.",
    "zh-CN":
      "鉴权：--api-key > DASHSCOPE_API_KEY > 当前 Profile 的 API Key。凭证仅在内存中注入 SDK。",
  },
  {
    "en-US":
      "Base URL: --base-url > DASHSCOPE_BASE_URL > profile base_url. Without a configured URL, use --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id for the cn-beijing endpoint.",
    "zh-CN":
      "Base URL：--base-url > DASHSCOPE_BASE_URL > Profile 的 base_url。未配置地址时，按 --workspace-id > BAILIAN_WORKSPACE_ID > 配置项 workspace_id 选择 cn-beijing 端点。",
  },
];

const SECRET_NOTE: LocalizedText = {
  "en-US":
    "Signing Secret is returned only on create/reset. Save it from this successful response; the CLI does not persist it.",
  "zh-CN": "Signing Secret 仅在创建或重置时返回。请从本次成功响应中保存；CLI 不会自动持久化。",
};

interface WebhookFlags {
  webhookId?: string;
  workspaceId?: string;
  url?: string;
  event?: string[];
  description?: string;
  limit?: number;
  page?: string;
}

function validateWebhookFlags(flags: WebhookFlags): string | undefined {
  if (flags.webhookId !== undefined && !flags.webhookId.trim()) {
    return "--webhook-id must not be empty. / --webhook-id 不能为空。";
  }
  if (flags.workspaceId !== undefined && !flags.workspaceId.trim()) {
    return "--workspace-id must not be empty. / --workspace-id 不能为空。";
  }
  if (flags.url !== undefined) {
    try {
      const callbackUrl = new URL(flags.url);
      if (callbackUrl.protocol !== "http:" && callbackUrl.protocol !== "https:") {
        return "--url must use HTTP or HTTPS. / --url 必须使用 HTTP 或 HTTPS。";
      }
    } catch {
      return "--url must be a valid HTTP or HTTPS URL. / --url 必须是有效的 HTTP 或 HTTPS 地址。";
    }
  }
  if (
    flags.event !== undefined &&
    (flags.event.length === 0 || flags.event.some((event) => !event.trim() || event.includes("*")))
  ) {
    return "--event requires non-empty named events without wildcards. / --event 必须是非空具名事件，不能使用通配符。";
  }
  if (flags.description !== undefined && Array.from(flags.description).length > 256) {
    return "--description must contain at most 256 characters. / --description 最多包含 256 个字符。";
  }
  if (
    flags.limit !== undefined &&
    (!Number.isInteger(flags.limit) || flags.limit < 1 || flags.limit > 100)
  ) {
    return "--limit must be an integer between 1 and 100. / --limit 必须是 1 到 100 之间的整数。";
  }
  if (flags.page !== undefined && !flags.page.trim()) {
    return "--page must be a non-empty pagination cursor. / --page 必须是非空分页游标。";
  }
  return undefined;
}

type ManagedApiContext = ReturnType<typeof buildManagedApiContext>;

interface WebhookOperation {
  operation: string;
  webhookId?: string;
  request?: { url?: string; events?: string[]; description?: string };
  limit?: number;
  page?: string;
  returnsSecret?: boolean;
  invoke: (context: ManagedApiContext, options: WebhookRequestOptions) => Promise<unknown>;
}

function emitWebhookResult(result: unknown, host: ManagedApiHost): void {
  host.output.result(result, {
    text: host.settings.output === "text" ? JSON.stringify(result, null, 2) : undefined,
  });
}

async function runWebhookOperation(
  host: ManagedApiHost,
  operation: WebhookOperation,
): Promise<void> {
  const baseUrl = resolveManagedApiBaseUrl(host);
  if (host.settings.dryRun) {
    emitWebhookResult(
      {
        operation: `webhook.${operation.operation}`,
        provider: "bailian",
        base_url: baseUrl,
        ...(operation.webhookId !== undefined ? { webhook_id: operation.webhookId } : {}),
        ...(operation.request !== undefined ? { request: operation.request } : {}),
        ...(operation.limit !== undefined ? { limit: operation.limit } : {}),
        ...(operation.page !== undefined ? { page: operation.page } : {}),
      },
      host,
    );
    return;
  }

  const timeoutSeconds = host.settings.timeout;
  if (
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0 ||
    timeoutSeconds * 1000 > 2_147_483_647
  ) {
    throw new BailianError(
      "--timeout must be greater than 0 and at most 2147483.647 seconds. / --timeout 必须大于 0 且不超过 2147483.647 秒。",
      ExitCode.USAGE,
    );
  }
  const response = await withAgentErrors(() =>
    withStdoutProtected(host, async () => {
      const context = buildManagedApiContext(host);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.ceil(timeoutSeconds * 1000));
      try {
        return await operation.invoke(context, { provider: "bailian", signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new BailianError(
            `Webhook request timed out after ${timeoutSeconds} seconds. / Webhook 请求在 ${timeoutSeconds} 秒后超时。`,
            ExitCode.TIMEOUT,
            "Check the endpoint state before retrying a mutation; increase --timeout if needed. / 重试变更操作前请先检查端点状态；可按需增大 --timeout。",
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  emitWebhookResult(response, host);
  if (operation.returnsSecret) {
    host.output.warning({
      message: {
        "en-US":
          "Signing Secret is shown only in this successful create/reset response; save it now.",
        "zh-CN": "Signing Secret 仅在本次创建或重置成功响应中返回，请立即保存。",
      },
      code: "AGENT_WEBHOOK_SECRET_ONCE",
    });
  }
}

export const managedAgentWebhookCreate = defineCommand({
  description: { "en-US": "Create a Webhook endpoint", "zh-CN": "创建 Webhook 端点" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This creates a Webhook and starts delivering subscribed events to its callback URL.",
      "zh-CN": "该操作会创建 Webhook，并开始向回调地址投递订阅事件。",
    },
  },
  flags: {
    ...WORKSPACE_FLAG,
    ...WEBHOOK_INPUT_FLAGS,
    url: { ...WEBHOOK_INPUT_FLAGS.url, required: true },
    event: { ...WEBHOOK_INPUT_FLAGS.event, required: true },
  },
  usageArgs:
    "--url <url> --event <type> [--event <type>] [--description <text>] [--workspace-id <id>]",
  exampleArgs: [
    "--workspace-id workspace-example --url https://example.com/webhooks --event session.updated --yes",
  ],
  notes: [...WEBHOOK_NOTES, SECRET_NOTE],
  validate: validateWebhookFlags,
  async run(ctx) {
    const request = {
      url: ctx.flags.url,
      events: ctx.flags.event,
      ...(ctx.flags.description !== undefined ? { description: ctx.flags.description } : {}),
    };
    await runWebhookOperation(ctx, {
      operation: "create",
      request,
      returnsSecret: true,
      invoke: (context, options) => createRemoteWebhookEndpoint(context, request, options),
    });
  },
});

export const managedAgentWebhookList = defineCommand({
  description: { "en-US": "List all Webhook endpoints", "zh-CN": "列出全部 Webhook 端点" },
  auth: "apiKey",
  flags: WORKSPACE_FLAG,
  usageArgs: "[--workspace-id <id>]",
  exampleArgs: ["--workspace-id workspace-example --output json"],
  notes: [
    ...WEBHOOK_NOTES,
    {
      "en-US": "Returns every undeleted Webhook without pagination.",
      "zh-CN": "返回所有未删除的 Webhook，不分页。",
    },
  ],
  validate: validateWebhookFlags,
  async run(ctx) {
    await runWebhookOperation(ctx, {
      operation: "list",
      invoke: (context, options) => listRemoteWebhookEndpoints(context, options),
    });
  },
});

interface WebhookIdCommand {
  operation: string;
  description: LocalizedText;
  risk?: CommandRisk;
  notes?: LocalizedText[];
  returnsSecret?: boolean;
  invoke: (
    context: ManagedApiContext,
    id: string,
    options: WebhookRequestOptions,
  ) => Promise<unknown>;
}

function defineWebhookIdCommand(command: WebhookIdCommand) {
  return defineCommand({
    description: command.description,
    auth: "apiKey",
    risk: command.risk,
    flags: WEBHOOK_ID_FLAGS,
    usageArgs: "--webhook-id <wep_id> [--workspace-id <id>]",
    exampleArgs: [
      `--workspace-id workspace-example --webhook-id wep_example${command.risk ? " --yes" : ""}`,
    ],
    notes: [...WEBHOOK_NOTES, ...(command.notes ?? [])],
    validate: validateWebhookFlags,
    async run(ctx) {
      await runWebhookOperation(ctx, {
        operation: command.operation,
        webhookId: ctx.flags.webhookId,
        returnsSecret: command.returnsSecret,
        invoke: (context, options) => command.invoke(context, ctx.flags.webhookId, options),
      });
    },
  });
}

export const managedAgentWebhookGet = defineWebhookIdCommand({
  operation: "get",
  description: { "en-US": "Get a Webhook endpoint", "zh-CN": "查询 Webhook 端点详情" },
  invoke: getRemoteWebhookEndpoint,
});

export const managedAgentWebhookUpdate = defineCommand({
  description: { "en-US": "Update a Webhook endpoint", "zh-CN": "更新 Webhook 端点" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This updates the callback URL, description, or event subscriptions of the Webhook.",
      "zh-CN": "该操作会更新 Webhook 的回调地址、描述或订阅事件。",
    },
  },
  flags: { ...WEBHOOK_ID_FLAGS, ...WEBHOOK_INPUT_FLAGS },
  usageArgs:
    "--webhook-id <wep_id> [--url <url>] [--event <type>] [--description <text>] [--workspace-id <id>]",
  exampleArgs: ['--workspace-id workspace-example --webhook-id wep_example --description "" --yes'],
  notes: [
    ...WEBHOOK_NOTES,
    {
      "en-US": "Omitted fields stay unchanged; --event replaces the complete subscription list.",
      "zh-CN": "未传字段保持不变；--event 会替换整个订阅列表。",
    },
  ],
  validate(flags) {
    const error = validateWebhookFlags(flags);
    if (error) return error;
    if (flags.url === undefined && flags.event === undefined && flags.description === undefined) {
      return "Provide --url, --event, or --description to update. / 更新时请至少提供 --url、--event 或 --description。";
    }
  },
  async run(ctx) {
    const request = {
      ...(ctx.flags.url !== undefined ? { url: ctx.flags.url } : {}),
      ...(ctx.flags.event !== undefined ? { events: ctx.flags.event } : {}),
      ...(ctx.flags.description !== undefined ? { description: ctx.flags.description } : {}),
    };
    await runWebhookOperation(ctx, {
      operation: "update",
      webhookId: ctx.flags.webhookId,
      request,
      invoke: (context, options) =>
        updateRemoteWebhookEndpoint(context, ctx.flags.webhookId, request, options),
    });
  },
});

export const managedAgentWebhookDelete = defineWebhookIdCommand({
  operation: "delete",
  description: { "en-US": "Delete a Webhook endpoint", "zh-CN": "删除 Webhook 端点" },
  risk: {
    level: "high",
    message: {
      "en-US": "This deletes the Webhook and cancels its pending deliveries.",
      "zh-CN": "该操作会删除 Webhook，并取消尚未投递的事件。",
    },
  },
  invoke: deleteRemoteWebhookEndpoint,
});

export const managedAgentWebhookEnable = defineWebhookIdCommand({
  operation: "enable",
  description: { "en-US": "Enable a Webhook endpoint", "zh-CN": "启用 Webhook 端点" },
  risk: {
    level: "high",
    message: {
      "en-US":
        "This resumes new event deliveries. Events from the disabled period are not replayed.",
      "zh-CN": "该操作会恢复新事件投递，不会补发禁用期间的事件。",
    },
  },
  invoke: enableRemoteWebhookEndpoint,
});

export const managedAgentWebhookDisable = defineWebhookIdCommand({
  operation: "disable",
  description: { "en-US": "Disable a Webhook endpoint", "zh-CN": "禁用 Webhook 端点" },
  risk: {
    level: "high",
    message: {
      "en-US": "This stops new event deliveries and cancels pending deliveries.",
      "zh-CN": "该操作会停止新事件投递，并取消尚未投递的事件。",
    },
  },
  invoke: disableRemoteWebhookEndpoint,
});

export const managedAgentWebhookTest = defineWebhookIdCommand({
  operation: "test",
  description: {
    "en-US": "Send a real Webhook test event",
    "zh-CN": "实际发送一次 Webhook 测试事件",
  },
  risk: {
    level: "high",
    message: {
      "en-US":
        "This sends a real callback request; redirects or security validation failures may disable the Webhook.",
      "zh-CN": "该操作会实际发送回调请求；重定向或安全校验失败可能禁用 Webhook。",
    },
  },
  notes: [
    {
      "en-US":
        "Tests are synchronous, are not retried or recorded, and do not affect consecutive failure counts.",
      "zh-CN": "测试同步执行，不重试、不保存投递记录，也不影响连续失败计数。",
    },
  ],
  invoke: testRemoteWebhookEndpoint,
});

export const managedAgentWebhookResetSecret = defineWebhookIdCommand({
  operation: "reset-secret",
  description: { "en-US": "Reset a Webhook signing secret", "zh-CN": "重置 Webhook 验签密钥" },
  risk: {
    level: "high",
    message: {
      "en-US":
        "This immediately invalidates the previous signing secret. Save the new secret and update your receiver.",
      "zh-CN": "该操作会立即使旧验签密钥失效。请保存新密钥并更新接收端。",
    },
  },
  notes: [SECRET_NOTE],
  returnsSecret: true,
  invoke: resetRemoteWebhookSecret,
});

export const managedAgentWebhookEvents = defineCommand({
  description: {
    "en-US": "List recent Webhook delivery events",
    "zh-CN": "查询最近的 Webhook 投递事件",
  },
  auth: "apiKey",
  flags: {
    ...WEBHOOK_ID_FLAGS,
    limit: {
      type: "number",
      valueHint: "<count>",
      description: {
        "en-US": "Page size, 1–100 (default: 20)",
        "zh-CN": "每页数量，1–100（默认：20）",
      },
    },
    page: {
      type: "string",
      valueHint: "<cursor>",
      description: {
        "en-US": "Opaque next_page cursor from the previous response",
        "zh-CN": "上一页响应中的不透明 next_page 游标",
      },
    },
  },
  usageArgs: "--webhook-id <wep_id> [--limit <count>] [--page <cursor>] [--workspace-id <id>]",
  exampleArgs: [
    "--workspace-id workspace-example --webhook-id wep_example --limit 20 --output json",
  ],
  notes: [
    ...WEBHOOK_NOTES,
    {
      "en-US":
        "Returns one page of delivery events retained for 7 days. Continue with next_page; deleted Webhooks' retained events remain queryable.",
      "zh-CN":
        "返回一页保留 7 天的投递事件。可用 next_page 继续查询；Webhook 删除后仍可查询保留期内的事件。",
    },
  ],
  validate: validateWebhookFlags,
  async run(ctx) {
    await runWebhookOperation(ctx, {
      operation: "events",
      webhookId: ctx.flags.webhookId,
      limit: ctx.flags.limit,
      page: ctx.flags.page,
      invoke: (context, options) =>
        listRemoteWebhookEvents(context, ctx.flags.webhookId, {
          ...options,
          limit: ctx.flags.limit,
          page: ctx.flags.page,
        }),
    });
  },
});
