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
  | 'nav' | 'title' | 'description' | 'settingsUnavailable' | 'fallbackConfigured'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'workspaceId' | 'workspaceIdHint' | 'workspaceIdHintFallback' | 'workspaceIdSet' | 'workspaceIdUnset'
  | 'retrieveAgentId' | 'retrieveAgentIdHint' | 'retrieveAgentIdHintFallback' | 'retrieveAgentIdSet' | 'retrieveAgentIdUnset'
  | 'chatAgentId' | 'chatAgentIdHint' | 'chatAgentIdHintFallback' | 'chatAgentIdSet' | 'chatAgentIdUnset'
  | 'fromEnv' | 'clear' | 'clearing'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'
  | 'autofill' | 'autofilling' | 'autofillHint'
  | 'autofillDone' | 'autofillLoginStarted' | 'autofillBlMissing' | 'autofillFailed'

/** English copy. */
export const en: Record<BailianKbLocaleKey, string> = {
  nav: 'Bailian KB',
  title: 'Bailian knowledge base',
  description: 'Account for the knowledge tools: API key, workspace, and default services.',
  settingsUnavailable: 'The settings document is not reachable from this browser; values below are write-only and stored in the credential store.',
  fallbackConfigured: 'Falling back to a configured credential-store value.',
  apiKey: 'API key',
  apiKeyHint: 'DashScope API key. Stored in the credentials store and never shown again; leave blank to keep the current one.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; knowledge tools fail until one is.',
  workspaceId: 'Workspace id',
  workspaceIdHint: 'Bailian workspace id — the subdomain of your endpoints. Stored in the settings document; clear and save to fall back to the credential store.',
  workspaceIdHintFallback: 'Bailian workspace id — the subdomain of your endpoints. Leave blank to keep the current one.',
  workspaceIdSet: 'A workspace is configured.',
  workspaceIdUnset: 'No workspace is configured; knowledge tools fail until one is.',
  retrieveAgentId: 'Default retrieval service id',
  retrieveAgentIdHint: 'agent_id of the default retrieval service (kb_search); when unset, every call must name one (`bl knowledge service list` discovers ids). Stored in the settings document.',
  retrieveAgentIdHintFallback: 'agent_id of the default retrieval service (kb_search); when unset, every call must name one (`bl knowledge service list` discovers ids). Leave blank to keep the current one.',
  retrieveAgentIdSet: 'A default retrieval service is configured.',
  retrieveAgentIdUnset: 'No default retrieval service; every kb_search call must name one.',
  chatAgentId: 'Default chat service id',
  chatAgentIdHint: 'agent_id of the default Q&A service (kb_chat); when unset, every call must name one (`bl knowledge service list` discovers ids). Stored in the settings document.',
  chatAgentIdHintFallback: 'agent_id of the default Q&A service (kb_chat); when unset, every call must name one (`bl knowledge service list` discovers ids). Leave blank to keep the current one.',
  chatAgentIdSet: 'A default chat service is configured.',
  chatAgentIdUnset: 'No default chat service; every kb_chat call must name one.',
  fromEnv: 'Set by the environment (read-only here)',
  clear: 'Clear default',
  clearing: 'Clearing…',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The Host did not accept these values; they were left for you to correct.',
  autofill: 'Auto-fill from bl CLI',
  autofilling: 'Fetching…',
  autofillHint: 'Adopt the API key and workspace id stored by the bl CLI (~/.bailian/config.json on the host); starts a console browser login on the host when the CLI has none yet.',
  autofillDone: 'Adopted the bl CLI login; the fields below reflect the new values.',
  autofillLoginStarted: 'A Bailian console login was opened in a browser on the host machine — finish signing in there, then click again.',
  autofillBlMissing: 'The bl CLI was not found on the host; install it with `npm install -g bailian-cli` and retry.',
  autofillFailed: 'Auto-fill failed — the credential may be locked by an environment variable, or the Host refused the write.',
}

/** Simplified Chinese copy. */
export const zh: Record<BailianKbLocaleKey, string> = {
  nav: '百炼知识库',
  title: '百炼知识库',
  description: '知识库工具的账号信息：API 密钥、工作空间与默认服务。',
  settingsUnavailable: '当前浏览器无法访问设置文档；以下字段仅可写入凭据存储，不回显。',
  fallbackConfigured: '回退：凭据存储中已有值。',
  apiKey: 'API 密钥',
  apiKeyHint: 'DashScope API key。保存在凭据存储中且不会再次显示；留空表示保持当前值。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置前知识库工具不可用。',
  workspaceId: '工作空间 ID',
  workspaceIdHint: '百炼工作空间 ID，即终端节点地址的子域名。存入设置文档；清空并保存则回退到凭据存储。',
  workspaceIdHintFallback: '百炼工作空间 ID，即终端节点地址的子域名。留空表示保持当前值。',
  workspaceIdSet: '已配置工作空间。',
  workspaceIdUnset: '未配置工作空间；配置前知识库工具不可用。',
  retrieveAgentId: '默认检索服务 ID',
  retrieveAgentIdHint: '默认检索服务（kb_search）的 agent_id；未设置时每次调用都需显式指定（可用 `bl knowledge service list` 发现 id）。存入设置文档。',
  retrieveAgentIdHintFallback: '默认检索服务（kb_search）的 agent_id；未设置时每次调用都需显式指定（可用 `bl knowledge service list` 发现 id）。留空表示保持当前值。',
  retrieveAgentIdSet: '已配置默认检索服务。',
  retrieveAgentIdUnset: '未配置默认检索服务；每次 kb_search 调用需显式指定。',
  chatAgentId: '默认对话服务 ID',
  chatAgentIdHint: '默认对话服务（kb_chat）的 agent_id；未设置时每次调用都需显式指定（可用 `bl knowledge service list` 发现 id）。存入设置文档。',
  chatAgentIdHintFallback: '默认对话服务（kb_chat）的 agent_id；未设置时每次调用都需显式指定（可用 `bl knowledge service list` 发现 id）。留空表示保持当前值。',
  chatAgentIdSet: '已配置默认对话服务。',
  chatAgentIdUnset: '未配置默认对话服务；每次 kb_chat 调用需显式指定。',
  fromEnv: '来自环境变量（此处只读）',
  clear: '清除默认',
  clearing: '清除中…',
  save: '保存',
  saving: '保存中…',
  discard: '放弃',
  unsaved: '未保存',
  saveFailed: '宿主未接受这些值，已保留供你修改。',
  autofill: '自动获取（bl CLI）',
  autofilling: '获取中…',
  autofillHint: '从宿主机 bl CLI 的登录态（~/.bailian/config.json）回填 API 密钥与工作空间 ID；CLI 尚未登录时会在宿主机拉起百炼控制台浏览器登录。',
  autofillDone: '已回填 bl CLI 的登录信息，下方字段已更新。',
  autofillLoginStarted: '已在宿主机浏览器打开百炼控制台登录页，完成登录后请再次点击。',
  autofillBlMissing: '宿主机未安装 bl CLI；请先 `npm install -g bailian-cli` 再重试。',
  autofillFailed: '自动获取失败——凭据可能被环境变量锁定，或宿主拒绝了写入。',
}
