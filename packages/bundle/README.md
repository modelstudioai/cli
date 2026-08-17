# bailian-kb-dsh（分发包）

dsh bundle 分发面：`package.json` 的 `dsh.bundle.patch` 声明 + [`cordis.patch.yml`](cordis.patch.yml)，向 profile 插入 `tool-bailian-kb` row，并随包分发浏览器端配置页（`dsh.client` → `lib/client.js`）。

## Patch row

```yaml
- insert:
    - id: tool-bailian-kb
      name: dsh-tool-bailian-kb
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

`workspaceId` 只是解析链的一层，不是唯一来源：Config 同时注册为 `bailian-kb` settings namespace，patch entry 作 base 层，设置页/设置文档的用户层叠在其上；都未设置时 per-call 回退到 `BAILIAN_WORKSPACE_ID` credential。同样回退覆盖 `defaultRetrieveAgentId`（`BAILIAN_DEFAULT_RETRIEVE_AGENT_ID`）、`defaultChatAgentId`（`BAILIAN_DEFAULT_CHAT_AGENT_ID`）与 API key（`DASHSCOPE_API_KEY`，无 settings 面）。

## 四个值的解析链

| 值 | 1️⃣ settings 用户层（设置页可编辑、回显） | 2️⃣ entry config（本 patch 或用户覆盖，作 base 层） | 3️⃣ credential（`~/.dsh/.credentials.yaml` / env） | 4️⃣ 都缺失时 |
|---|---|---|---|---|
| `DASHSCOPE_API_KEY` | —（无 settings 面） | —（无 config 面） | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_WORKSPACE_ID` | ✅ `workspaceId` | ✅ `workspaceId` | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_DEFAULT_RETRIEVE_AGENT_ID` | ✅ `defaultRetrieveAgentId` | ✅ `defaultRetrieveAgentId` | ✅ | `kb_search` 的 `agent_id` 参数变必填（schema 恒 optional，运行时校验） |
| `BAILIAN_DEFAULT_CHAT_AGENT_ID` | ✅ `defaultChatAgentId` | ✅ `defaultChatAgentId` | ✅ | `kb_chat` 的 `agent_id` 参数变必填（schema 恒 optional，运行时校验） |

行为参数（`endpointHost`/`agentVersion`/`chatTimeoutMs`）在 config/settings 层（设置文档可改，实时生效），见 [tool-bailian-kb README](../tool-bailian-kb/README.md)。

## Web UI 配置页

装进 profile 后，Settings 左侧导航出现“百炼知识库”页（`settings.section` 槽位）：

- **DashScope API Key** — write-only（凭据域 wire 结构上无值位，永不回显），`type=password` 遮罩输入草稿，仅显示 configured/来自环境变量 徽标；写 `~/.dsh/.credentials.yaml`
- **Bailian Workspace ID / 默认检索服务 ID / 默认对话服务 ID** — **回显**：读写 `bailian-kb` settings 用户层（设置文档），预填当前解析值；清空保存 = 移除用户层，回退 entry config → credential；每个默认服务 ID 附“清除”按钮（同时 unset settings 用户层与 credential，避免回退链复活旧值）

降级：远程浏览器（非 loopback，settings RPC 不可达）或未组合 settings 服务时，ID 字段退回旧的 write-only credential 控件，页面顶部显示提示。

## 用户覆盖

用户 patch 层在本 bundle 之上，按 id 覆盖时**替换整个 config（无 deep-merge）**，覆盖后的 config 成为 settings namespace 的新 base 层（设置页的用户层仍叠在其上）。`workspaceId`/`defaultRetrieveAgentId`/`defaultChatAgentId` 均为可选，只需重述想显式固定的字段：

```yaml
# ~/.dsh/cordis.patch.yml 或 profile 的 cordis.patch.yml
- id: tool-bailian-kb
  config:
    defaultRetrieveAgentId: aid-search-service   # 检索服务；省略 workspaceId 走 credential
    defaultChatAgentId: aid-chat-service         # 对话服务
    chatTimeoutMs: 600000
```

禁用：`- id: tool-bailian-kb` + `disabled: true`。

## 安装（本地 checkout 链接）

bundle 是 `dsh.bundle` 声明层，真正的插件包 `dsh-tool-bailian-kb` 是它的依赖；`link:` 安装不携带传递依赖，**两个包都要 add**（第二个无 bundle 声明，dsh 会以 plain dependency 装入，CLI 的 warning 即预期行为）：

```sh
dsh plugin --profile web add /path/to/bailian-kb-dsh/packages/bundle
dsh plugin --profile web add /path/to/bailian-kb-dsh/packages/tool-bailian-kb
```

## 卸载

```sh
dsh plugin --profile <name> remove bailian-kb-dsh dsh-tool-bailian-kb
```
