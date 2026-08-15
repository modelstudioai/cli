/**
 * Locale bundles for the Bailian knowledge-base plugin card. The card rides
 * the credentials domain for all three values, so every copy is written for
 * write-only controls: state is reported as configured/unconfigured, and a
 * stored value is never echoed back.
 */

/** Locale keys this card renders. */
export type BailianKbLocaleKey =
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'workspaceId' | 'workspaceIdHint' | 'workspaceIdSet' | 'workspaceIdUnset'
  | 'agentId' | 'agentIdHint' | 'agentIdSet' | 'agentIdUnset'
  | 'fromEnv' | 'clear' | 'clearing' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'

/** English copy. */
export const en: Record<BailianKbLocaleKey, string> = {
  title: 'Bailian knowledge base',
  description: 'Account for the knowledge tools: API key, workspace, and default service.',
  apiKey: 'API key',
  apiKeyHint: 'DashScope API key. Stored in the credentials store and never shown again; leave blank to keep the current one.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; knowledge tools fail until one is.',
  workspaceId: 'Workspace id',
  workspaceIdHint: 'Bailian workspace id — the subdomain of your endpoints. Leave blank to keep the current one.',
  workspaceIdSet: 'A workspace is configured.',
  workspaceIdUnset: 'No workspace is configured; knowledge tools fail until one is.',
  agentId: 'Default service id',
  agentIdHint: 'agent_id of the default retrieval/Q&A service; when unset, every call must name one (kb_service_list discovers ids). Leave blank to keep the current one.',
  agentIdSet: 'A default service is configured.',
  agentIdUnset: 'No default service; every call must name one.',
  fromEnv: 'Set by the environment (read-only here)',
  clear: 'Clear default',
  clearing: 'Clearing…',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The Host did not accept these values; they were left for you to correct.',
}

/** Simplified Chinese copy. */
export const zh: Record<BailianKbLocaleKey, string> = {
  title: '百炼知识库',
  description: '知识库工具的账号信息：API 密钥、工作空间与默认服务。',
  apiKey: 'API 密钥',
  apiKeyHint: 'DashScope API key。保存在凭据存储中且不会再次显示；留空表示保持当前值。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置前知识库工具不可用。',
  workspaceId: '工作空间 ID',
  workspaceIdHint: '百炼工作空间 ID，即终端节点地址的子域名。留空表示保持当前值。',
  workspaceIdSet: '已配置工作空间。',
  workspaceIdUnset: '未配置工作空间；配置前知识库工具不可用。',
  agentId: '默认服务 ID',
  agentIdHint: '默认检索/问答服务的 agent_id；未设置时每次调用都需显式指定（可用 kb_service_list 发现 id）。留空表示保持当前值。',
  agentIdSet: '已配置默认服务。',
  agentIdUnset: '未配置默认服务；每次调用需显式指定。',
  fromEnv: '来自环境变量（此处只读）',
  clear: '清除默认',
  clearing: '清除中…',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃',
  unsaved: '未保存',
  saveFailed: '宿主未接受这些值，已保留供你修改。',
}
