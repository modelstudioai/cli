/**
 * Locale bundles for the Bailian knowledge-base plugin page.
 * Workspace and default services are plugin config. The API key stays in credentials.
 */

import type { SettingsFormLabels } from "@deepseek-ai/dsh-client-ui-primitives";

/** Locale keys this page renders. */
export type BailianKbLocaleKey =
  | "keyPlaceholder"
  | "privateKeyHint"
  | "connectionHint"
  | "saveConnection"
  | "overviewTitle"
  | "overviewHint"
  | "overviewBody"
  | "overviewReady"
  | "overviewSetup"
  | "connectionTitle"
  | "connectionSectionHint"
  | "servicesTitle"
  | "servicesHint"
  | "nav"
  | "title"
  | "description"
  | "settingsUnavailable"
  | "apiKey"
  | "apiKeySet"
  | "apiKeyUnset"
  | "apiKeyGet"
  | "workspaceId"
  | "workspaceIdHint"
  | "workspaceIdHintFallback"
  | "workspaceIdSet"
  | "workspaceIdUnset"
  | "workspaceIdGet"
  | "retrieveAgentId"
  | "retrieveAgentIdHint"
  | "chatAgentId"
  | "chatAgentIdHint"
  | "fromEnv"
  | "clear"
  | "clearing"
  | "save"
  | "saving"
  | "discard"
  | "unsaved"
  | "saveFailed"
  | "advancedConfig"
  | "autofill"
  | "autofilling"
  | "autofillHint"
  | "autofillDone"
  | "autofillAwaitingLogin"
  | "autofillOpenUrl"
  | "autofillFailed"
  | "autofillConfigured"
  | "cacheTitle"
  | "cacheHint"
  | "cacheLoading"
  | "cacheUnconfigured"
  | "cacheUnavailable"
  | "cacheFetchedAt"
  | "cacheNever"
  | "cacheStale"
  | "cacheSearchCount"
  | "cacheChatCount"
  | "cacheTruncated"
  | "cacheEmpty"
  | "cacheRefresh"
  | "cacheRefreshing"
  | "pickerNone"
  | "pickerClear"
  | "unavailable"
  | "readOnly"
  | "overridden"
  | "reset";

/** English copy. */
export const en: Record<BailianKbLocaleKey, string> = {
  keyPlaceholder: "Leave blank to keep the current key",
  privateKeyHint:
    "This API key and workspace belong only to this plugin. The stored key is never displayed.",
  connectionHint:
    "Save Workspace and API Key together after verifying access. Other plugin Workspaces are unchanged.",
  saveConnection: "Verify and save",
  overviewTitle: "Knowledge base",
  overviewHint: "One status shows whether retrieval and Q&A can run.",
  overviewBody:
    "kb_search retrieves passages from deployed retrieval services, and kb_chat answers through a Q&A service. After the connection is set, each conversation includes this workspace’s service list.",
  overviewReady: "Ready",
  overviewSetup: "Setup required",
  connectionTitle: "Connection",
  connectionSectionHint: "API key and workspace for the knowledge-base plugin only.",
  servicesTitle: "Default services",
  servicesHint:
    "Services kb_search and kb_chat use when a call omits agent_id. Leave unset to inject the full list.",
  nav: "Bailian KB",
  title: "Bailian knowledge base",
  description: "Account for the knowledge tools: API key, workspace, and default services.",
  settingsUnavailable:
    "The settings document is not reachable from this browser; plugin configuration cannot be saved.",
  apiKey: "API key",
  apiKeySet: "A key is configured.",
  apiKeyUnset: "No key is configured; knowledge tools fail until one is.",
  apiKeyGet: "Get",
  workspaceId: "Workspace id",
  workspaceIdHint:
    "Bailian workspace id — the subdomain of your endpoints. Saved in this plugin’s config; clearing it disables knowledge calls until configured again.",
  workspaceIdHintFallback:
    "Bailian workspace id — the subdomain of your endpoints. Leave blank to keep the current one.",
  workspaceIdSet: "A workspace is configured.",
  workspaceIdUnset: "No workspace is configured; knowledge tools fail until one is.",
  workspaceIdGet: "Get",
  retrieveAgentId: "Default retrieval service",
  retrieveAgentIdHint:
    "The agent_id kb_search falls back to. Left unset, the injected catalog lists every deployed service instead.",
  chatAgentId: "Default Q&A service",
  chatAgentIdHint:
    "The agent_id kb_chat falls back to. Left unset, the injected catalog lists every deployed service instead.",
  fromEnv: "Set by the environment (read-only here)",
  clear: "Clear default",
  clearing: "Clearing…",
  save: "Save",
  saving: "Saving…",
  discard: "Discard",
  unsaved: "Unsaved",
  saveFailed: "The Host did not accept these values; they were left for you to correct.",
  advancedConfig: "Advanced configuration",
  autofill: "Fetch from console login",
  autofilling: "Starting…",
  autofillHint:
    "Sign in to the Bailian console to fill in that account’s API key and workspace id.",
  autofillDone: "Credentials adopted; the fields below reflect the new values.",
  autofillAwaitingLogin:
    "Waiting for the Bailian console login to finish in a browser on the host machine…",
  autofillOpenUrl: "Open the login page manually",
  autofillFailed:
    "Auto-fill failed — the credential may be locked by an environment variable, the Host refused the write, or the login was abandoned.",
  autofillConfigured:
    "Configured. Click button to fetch this account’s API key and workspace id again.",
  cacheTitle: "Retrieval service cache",
  cacheHint:
    "The service list injected into each conversation. Refreshes on its own; refresh here when you have just created a service and want it picked up now.",
  cacheLoading: "Reading…",
  cacheUnconfigured: "Set a workspace id first.",
  cacheUnavailable: "Not reachable from this browser.",
  cacheFetchedAt: "Last fetched",
  cacheNever: "never",
  cacheStale: "refresh due",
  cacheSearchCount: "Retrieval services",
  cacheChatCount: "Q&A services",
  cacheTruncated: "List truncated — the workspace holds more than were fetched.",
  cacheEmpty: "No deployed services cached. If you just created one, refresh.",
  cacheRefresh: "Refresh",
  cacheRefreshing: "Refreshing…",
  pickerNone: "Not set — the full list is injected instead",
  pickerClear: "Clear",
  unavailable: "This plugin is not loaded, so it cannot be configured right now.",
  readOnly: "This deployment stores settings read-only.",
  overridden: "Overridden",
  reset: "Reset to default",
};

export function formLabels(t: (key: BailianKbLocaleKey) => string): SettingsFormLabels {
  return {
    unavailable: t("unavailable"),
    readOnly: t("readOnly"),
    saveFailed: t("saveFailed"),
    save: t("save"),
    saving: t("saving"),
  };
}

/** Simplified Chinese copy. */
export const zh: Record<BailianKbLocaleKey, string> = {
  keyPlaceholder: "留空保留当前 Key",
  privateKeyHint:
    "此 API Key 和工作空间仅用于当前插件，修改不会影响另一个插件；已保存的 Key 不会回显。",
  connectionHint: "验证访问权限后一起保存 Workspace 和 API Key；不会修改另一插件的 Workspace。",
  saveConnection: "验证并保存",
  overviewTitle: "知识库",
  overviewHint: "用一个状态表示检索和问答是否已经可以调用。",
  overviewBody:
    "kb_search 从已部署的检索服务取回内容，kb_chat 用问答服务回答。配好连接后，每次对话都会带上当前工作空间的服务清单。",
  overviewReady: "已就绪",
  overviewSetup: "需要设置",
  connectionTitle: "连接",
  connectionSectionHint: "知识库插件独立使用的 API 密钥与工作空间。",
  servicesTitle: "默认服务",
  servicesHint: "kb_search 和 kb_chat 未指定 agent_id 时使用的服务。不设置则注入完整清单。",
  nav: "百炼知识库",
  title: "百炼知识库",
  description: "知识库工具的账号信息：API 密钥、工作空间与默认服务。",
  settingsUnavailable: "当前浏览器无法访问设置文档；无法保存插件配置。",
  apiKey: "API 密钥",
  apiKeySet: "已配置密钥。",
  apiKeyUnset: "未配置密钥；配置前知识库工具不可用。",
  apiKeyGet: "去获取",
  workspaceId: "工作空间 ID",
  workspaceIdHint:
    "百炼工作空间 ID，即终端节点地址的子域名。保存在本插件配置中；清空后需重新配置才能调用知识库。",
  workspaceIdHintFallback: "百炼工作空间 ID，即终端节点地址的子域名。留空表示保持当前值。",
  workspaceIdSet: "已配置工作空间。",
  workspaceIdUnset: "未配置工作空间；配置前知识库工具不可用。",
  workspaceIdGet: "去获取",
  retrieveAgentId: "默认检索服务",
  retrieveAgentIdHint: "kb_search 缺省使用的 agent_id。不设置时，注入的清单会列出全部已部署服务。",
  chatAgentId: "默认对话服务",
  chatAgentIdHint: "kb_chat 缺省使用的 agent_id。不设置时，注入的清单会列出全部已部署服务。",
  fromEnv: "来自环境变量（此处只读）",
  clear: "清除默认",
  clearing: "清除中…",
  save: "保存",
  saving: "保存中…",
  discard: "放弃",
  unsaved: "未保存",
  saveFailed: "宿主未接受这些值，已保留供你修改。",
  advancedConfig: "高级配置",
  autofill: "自动获取",
  autofilling: "启动中…",
  autofillHint: "登录百炼控制台，自动填入该账号的 API 密钥与工作空间 ID。",
  autofillDone: "已回填凭据，下方字段已更新。",
  autofillAwaitingLogin: "等待在宿主机浏览器中完成百炼控制台登录…",
  autofillOpenUrl: "手动打开登录页",
  autofillFailed: "自动获取失败——凭据可能被环境变量锁定、宿主拒绝了写入，或登录未完成。",
  autofillConfigured: "已配置完成，点击按钮重新获取该账号的 API 密钥与工作空间 ID。",
  cacheTitle: "检索服务缓存",
  cacheHint: "注入到每次对话的服务清单。会自动刷新；刚建完服务想立即生效时在这里刷一下。",
  cacheLoading: "读取中…",
  cacheUnconfigured: "请先设置工作空间 ID。",
  cacheUnavailable: "当前浏览器无法访问。",
  cacheFetchedAt: "上次拉取",
  cacheNever: "尚未拉取",
  cacheStale: "待刷新",
  cacheSearchCount: "检索服务",
  cacheChatCount: "问答服务",
  cacheTruncated: "清单已截断 —— 工作空间里的服务多于已拉取的数量。",
  cacheEmpty: "缓存里没有已部署的服务。如果刚创建过，请刷新。",
  cacheRefresh: "刷新",
  cacheRefreshing: "刷新中…",
  pickerNone: "未设置 —— 会注入完整清单",
  pickerClear: "清空",
  unavailable: "该插件当前未加载，暂时无法配置。",
  readOnly: "本部署以只读方式保存设置。",
  overridden: "已覆盖",
  reset: "恢复默认",
};
