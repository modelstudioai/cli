# dsh-tool-bailian-kb

百炼知识库的 dsh 插件本体：在 `ctx.tools` 注册三个模型工具，并在 skills 服务可用时注册管理面 skill。

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
| `kb_service_list` | `scene?`（chat\|search，省略查双场景合并）、`name_filter?` | 服务清单（agent_id、名称、scene、status、绑定知识库）+ total + truncated；分页内部消化（单 scene 100 条上限） |
| `kb_search` | `query`、`agent_id`（见 defaultRetrieveAgentId）、`top_k?`（默认 5，**客户端截断**——服务端无此参数）、`images?` | chunks（text/score/来源）+ total |
| `kb_chat` | `message`、`agent_id`（见 defaultChatAgentId） | 完整答案（内部消费 SSE 流缓冲返回）+ request_id |

## 错误语义

- HTTP 错误（除 401/403 鉴权类）：错误信息**附当前服务清单**，模型可一步纠正无效 `agent_id`（5xx 也附，但通常代表服务端异常）；
- 凭证缺失：指向 `~/.dsh/.env` / `.credentials.yaml` 配置方式与控制台取 key 页面；
- chat 超时：说明服务端多轮检索特性，建议重试或改用 `kb_search`；
- 服务端错误体截断至 500 字符进入错误信息（优先 `code: message`）。

## 管理面 skill

`skills/bailian-kb-management/SKILL.md` 随包分发，插件通过 `ctx.inject(['skills'])` 在 skills 服务可用时以 `source: 'bundled'` 运行时注册；无 skills 服务的组合（headless 最小装配）不受影响。内容：kscli 安装/鉴权/workspace 解析、建库→上传→部署工作流、agent_id 固定最佳实践。

## Known Limitations

- kb_chat 执行期无进展显示（缓冲式；进展会话事件设计见仓库根 README 与 spec 附录 A）。
- `top_k` 是客户端截断：请求体不含该参数，服务端返回条数由检索服务配置决定，截断只影响进入模型上下文的量。
