/**
 * Locale bundles for the Bailian knowledge-base settings page. The workspace,
 * default-retrieval-service and default-chat-service ids echo from the
 * settings section while it is available and fall back to write-only
 * credential controls otherwise; the API key copy is always written for a
 * write-only control: state is reported as configured/unconfigured, and a
 * stored key is never echoed back.
 */

/** Locale keys this page renders. */
export type BailianKbLocaleKey =
  | "nav"
  | "title"
  | "description"
  | "settingsUnavailable"
  | "fallbackConfigured"
  | "apiKey"
  | "apiKeyHint"
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
  | "pickerClear";

/** English copy. */
export const en: Record<BailianKbLocaleKey, string> = {
  nav: "Bailian KB",
  title: "Bailian knowledge base",
  description: "Account for the knowledge tools: API key, workspace, and default services.",
  settingsUnavailable:
    "The settings document is not reachable from this browser; values below are write-only and stored in the credential store.",
  fallbackConfigured: "Falling back to a configured credential-store value.",
  apiKey: "API key",
  apiKeyHint:
    "DashScope API key. Stored in the credentials store and never shown again; leave blank to keep the current one.",
  apiKeySet: "A key is configured.",
  apiKeyUnset: "No key is configured; knowledge tools fail until one is.",
  apiKeyGet: "Get",
  workspaceId: "Workspace id",
  workspaceIdHint:
    "Bailian workspace id — the subdomain of your endpoints. Stored in the settings document; clear and save to fall back to the credential store.",
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
};

/** Simplified Chinese copy. */
export const zh: Record<BailianKbLocaleKey, string> = {
  nav: "百炼知识库",
  title: "百炼知识库",
  description: "知识库工具的账号信息：API 密钥、工作空间与默认服务。",
  settingsUnavailable: "当前浏览器无法访问设置文档；以下字段仅可写入凭据存储，不回显。",
  fallbackConfigured: "回退：凭据存储中已有值。",
  apiKey: "API 密钥",
  apiKeyHint: "DashScope API key。保存在凭据存储中且不会再次显示；留空表示保持当前值。",
  apiKeySet: "已配置密钥。",
  apiKeyUnset: "未配置密钥；配置前知识库工具不可用。",
  apiKeyGet: "去获取",
  workspaceId: "工作空间 ID",
  workspaceIdHint:
    "百炼工作空间 ID，即终端节点地址的子域名。存入设置文档；清空并保存则回退到凭据存储。",
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
};
