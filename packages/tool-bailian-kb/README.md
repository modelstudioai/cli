# dsh-tool-bailian-kb

百炼知识库的 dsh 插件包（同时是 dsh bundle）：在 `ctx.tools` 注册两个检索模型工具（kb_search、kb_chat），并在 skills 服务可用时注册管理面 skill。服务发现通过 kscli CLI 完成。

## Bundle 声明

`package.json` 的 `dsh.bundle.patch` 指向 [`cordis.patch.yml`](cordis.patch.yml)，向 profile 插入插件行：

```yaml
- insert:
    - id: tool-bailian-kb
      name: dsh-tool-bailian-kb
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

`workspaceId` 只是解析链的一层，不是唯一来源：Config 同时注册为 `bailian-kb` settings namespace，patch entry 作 base 层，设置页/设置文档的用户层叠在其上；都未设置时 per-call 回退到 `BAILIAN_WORKSPACE_ID` credential。同样回退覆盖 `defaultRetrieveAgentId`（`BAILIAN_DEFAULT_RETRIEVE_AGENT_ID`）、`defaultChatAgentId`（`BAILIAN_DEFAULT_CHAT_AGENT_ID`）与 API key（`DASHSCOPE_API_KEY`，无 settings 面）。

### 四个值的解析链

| 值 | 1️⃣ settings 用户层（设置页可编辑、回显） | 2️⃣ entry config（本 patch 或用户覆盖，作 base 层） | 3️⃣ credential（`~/.dsh/.credentials.yaml` / env） | 4️⃣ 都缺失时 |
|---|---|---|---|---|
| `DASHSCOPE_API_KEY` | —（无 settings 面） | —（无 config 面） | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_WORKSPACE_ID` | ✅ `workspaceId` | ✅ `workspaceId` | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_DEFAULT_RETRIEVE_AGENT_ID` | ✅ `defaultRetrieveAgentId` | ✅ `defaultRetrieveAgentId` | ✅ | `kb_search` 的 `agent_id` 参数变必填 |
| `BAILIAN_DEFAULT_CHAT_AGENT_ID` | ✅ `defaultChatAgentId` | ✅ `defaultChatAgentId` | ✅ | `kb_chat` 的 `agent_id` 参数变必填 |

行为参数（`endpointHost`/`agentVersion`/`chatTimeoutMs`）在 config/settings 层（设置文档可改，实时生效）。

### Web UI 配置页

装进 profile 后，Settings 左侧导航出现“百炼知识库”页（`settings.section` 槽位）：

- **DashScope API Key** — write-only，`type=password` 遮罩输入草稿，仅显示 configured/来自环境变量 徽标；写 `~/.dsh/.credentials.yaml`
- **Bailian Workspace ID / 默认检索服务 ID / 默认对话服务 ID** — 回显：读写 `bailian-kb` settings 用户层，预填当前解析值；清空保存 = 移除用户层，回退 entry config → credential

降级：远程浏览器（非 loopback，settings RPC 不可达）或未组合 settings 服务时，ID 字段退回旧的 write-only credential 控件，页面顶部显示提示。

### 用户覆盖

用户 patch 层在本 bundle 之上，按 id 覆盖时**替换整个 config（无 deep-merge）**：

```yaml
# ~/.dsh/cordis.patch.yml 或 profile 的 cordis.patch.yml
- id: tool-bailian-kb
  config:
    defaultRetrieveAgentId: aid-search-service
    defaultChatAgentId: aid-chat-service
    chatTimeoutMs: 600000
```

禁用：`- id: tool-bailian-kb` + `disabled: true`。

## Config

Config 同时注册为 `bailian-kb` settings namespace（`installSettingsSection`）：profile patch 的 entry config 作为 base 层，用户在设置页/设置文档的修改叠在其上且实时生效（所有值每次调用经 source thunk 读取，无需重启或重注册工具）。

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `workspaceId` | string? | — | 百炼工作空间 id；API host 为 workspace 子域名 `https://<workspaceId>.<endpointHost>`。未设置时每次调用回退 `BAILIAN_WORKSPACE_ID` credential |
| `endpointHost` | string | `cn-beijing.maas.aliyuncs.com` | host 后缀，其他 region/私有化时替换 |
| `defaultRetrieveAgentId` | string? | — | 默认检索服务；`kb_search` 的 `agent_id` 参数 schema 恒可选，默认值每次调用运行时解析（settings/config → credential） |
| `defaultChatAgentId` | string? | — | 默认对话服务；`kb_chat` 的 `agent_id` 参数 schema 恒可选，默认值每次调用运行时解析（settings/config → credential） |
| `agentVersion` | string? | — | `beta`（草稿调试）或已发布版本号；不暴露给模型 |
| `chatTimeoutMs` | number | 300000 | kb_chat 超时；服务端是分钟级 agentic loop |

凭证与回退链：`DASHSCOPE_API_KEY` 只走 `ctx.credentials` 引用（write-only，每次调用重新解析，热更换生效）；`workspaceId`/`defaultRetrieveAgentId`/`defaultChatAgentId` 先取 settings 解析值（用户层 > entry config），缺失时回退同名 credential（`BAILIAN_WORKSPACE_ID`/`BAILIAN_DEFAULT_RETRIEVE_AGENT_ID`/`BAILIAN_DEFAULT_CHAT_AGENT_ID`），都没有时报错并附配置指引。

## 工具

| 工具 | 参数 | 返回 |
|---|---|---|
| `kb_search` | `query`、`agent_id`（见 defaultRetrieveAgentId）、`top_k?`（默认 5，**客户端截断**——服务端无此参数）、`images?` | chunks（text/score/来源）+ total |
| `kb_chat` | `message`、`agent_id`（见 defaultChatAgentId） | 完整答案（内部消费 SSE 流缓冲返回）+ request_id |

服务发现（`kb_service_list` 已移除）：通过 `kscli service list` CLI 命令查询可用检索/对话服务及其 agent_id。

## 错误语义

- HTTP 错误：原始错误透传，模型可通过 `kscli service list` 发现可用服务以纠正无效 `agent_id`；
- 凭证缺失：指向 `~/.dsh/.env` / `.credentials.yaml` 配置方式与控制台取 key 页面；
- chat 超时：说明服务端多轮检索特性，建议重试或改用 `kb_search`；
- 服务端错误体截断至 500 字符进入错误信息（优先 `code: message`）。

## 管理面 skill

`skills/bailian-kb-management/SKILL.md` 随包分发，插件通过 `ctx.inject(['skills'])` 在 skills 服务可用时以 `source: 'bundled'` 运行时注册；无 skills 服务的组合（headless 最小装配）不受影响。内容：kscli 安装/鉴权/workspace 解析、建库→上传→部署工作流、agent_id 固定最佳实践。

## Known Limitations

- kb_chat 执行期无进展显示（缓冲式；进展会话事件设计见仓库根 README 与 spec 附录 A）。
- `top_k` 是客户端截断：请求体不含该参数，服务端返回条数由检索服务配置决定，截断只影响进入模型上下文的量。
