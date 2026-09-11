# 检索服务管理命令手册

检索服务（也称 agent）是知识库的检索入口。通过 `--agent-id` 在 search/chat 命令中使用。服务有 `chat`（问答）和 `search`（检索）两种场景。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./kscli-cli-guide.md#通用约定)。

---

#### `kscli service list`

列出工作区中的检索/Q&A 服务。

**用法**

```bash
kscli service list --scene <chat|search> [flags]
```

**参数**

| 参数                     | 类型   | 必填 | 说明                                                    |
| ------------------------ | ------ | ---- | ------------------------------------------------------- |
| `--scene <chat\|search>` | string | 是   | 服务场景：`chat`（Q&A）或 `search`（检索）              |
| `--status <status>`      | string | 否   | 按状态过滤：`draft`、`deployed`（含 edited）、`deleted` |
| `--name <text>`          | string | 否   | 按服务名称模糊过滤                                      |
| `--agent-id <id>`        | string | 否   | 按精确 agent ID 过滤                                    |
| `--index-id <id>`        | string | 否   | 按关联知识库 ID 过滤                                    |
| `--page-number <n>`      | number | 否   | 页码（默认：1）                                         |
| `--page-size <n>`        | number | 否   | 每页条数（默认：10，最大 100）                          |

**参数约束**

- `--scene` 只能是 `chat` 或 `search`
- `--status` 只能是 `draft`、`deployed`、`deleted`
- `--page-size` 范围 1-100

**输出**

text 模式：

```
aid-xxx  deployed  2  my-qa  (kb: my-kb)
total: 1
Use an agent_id above with the chat command.
```

> 最后一行根据 scene 自动提示用 `search` 还是 `chat` 命令消费。

quiet 模式：每行一个 `agent_id`。

json 模式：返回 API 原始响应。

**注意事项**

- 服务端要求 `--scene` 必填，要查看两种场景的服务需分别执行。

**示例**

```bash
# 列出 chat 服务
kscli service list --scene chat --workspace-id ws-xxx

# 只看已部署的检索服务
kscli service list --scene search --status deployed
```

---

#### `kscli service get`

查看服务详情，含各版本配置。

**用法**

```bash
kscli service get --agent-id <id> [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                      |
| --------------------------- | ------ | ---- | --------------------------------------------------------- |
| `--agent-id <id>`           | string | 是   | 服务（agent）ID                                           |
| `--agent-version <version>` | string | 否   | 指定版本查看（`beta` 或已发布版本号）；不传则返回所有版本 |

**输出**

text 模式：

```
Basic:
  id: aid-xxx
  name: my-qa
  desc: product Q&A
  scene: chat
  status: deployed
Version beta:
  desc: draft
  policy: turbo
  model: qwen-max
  temperature: 0.7
  kb: idx-xxx (my-kb)
Version 1:
  published: 2026-01-01
  ...
```

quiet 模式：输出 JSON 格式。

json 模式：返回 API 原始响应。

**注意事项**

- 不传 `--agent-version` 时返回所有版本（beta 草稿 + 已发布版本号）。
- 版本值原样传递，有效值集合由服务端维护。

**示例**

```bash
# 查看服务完整详情
kscli service get --agent-id aid-xxx --workspace-id ws-xxx

# 只看 beta 草稿配置
kscli service get --agent-id aid-xxx --agent-version beta
```

---

#### `kscli service create`

创建检索/Q&A 服务，初始状态为 draft，版本为 beta。

**用法**

```bash
kscli service create --name <text> --scene <chat|search> [flags]
```

**参数**

| 参数                     | 类型   | 必填 | 说明                                              |
| ------------------------ | ------ | ---- | ------------------------------------------------- |
| `--name <text>`          | string | 是   | 服务名称（最多 200 字符，同一场景下工作区内唯一） |
| `--scene <chat\|search>` | string | 是   | 服务场景：`chat`（Q&A）或 `search`（检索）        |
| `--description <text>`   | string | 建议 | 这个服务能回答什么、给谁用（最多 1000 字符）      |
| `--index-id <id>`        | string | 否   | 绑定此知识库；其他配置使用服务端默认值            |

**参数约束**

- `--name` 最多 200 字符
- `--scene` 只能是 `chat` 或 `search`
- `--description` 最多 1000 字符；建议填写 —— agent 靠它判断该调用哪个服务

**输出**

text 模式：

```
created: aid-xxx  (status: draft, version: beta)
Test the draft with --agent-version beta on search/chat, then deploy it to publish.
```

quiet 模式：输出 agent ID。

json 模式：返回 API 原始响应。

**注意事项**

- 不指定 `--index-id` 时，服务端使用默认 agent 配置。
- beta 草稿可通过 search/chat 的 `--agent-version beta` 测试，部署后才生效。
- 需要工作区的知识库创建权限。

**示例**

```bash
# 创建 Q&A 服务
kscli service create --name my-qa --scene chat --workspace-id ws-xxx

# 创建检索服务并绑定知识库
kscli service create --name my-search --scene search --index-id idx-xxx
```

---

#### `kscli service update`

更新服务名称、描述或草稿配置。

**用法**

```bash
kscli service update --agent-id <id> [flags]
```

**参数**

| 参数                           | 类型   | 必填 | 说明                                                                                     |
| ------------------------------ | ------ | ---- | ---------------------------------------------------------------------------------------- |
| `--agent-id <id>`              | string | 是   | 服务（agent）ID                                                                          |
| `--name <text>`                | string | 否   | 新名称（最多 200 字符）                                                                  |
| `--description <text>`         | string | 否   | 新描述（最多 1000 字符）                                                                 |
| `--agent-version <version>`    | string | 否   | 目标版本（默认：beta 草稿。已发布版本只接受 `--version-desc`）                           |
| `--version-desc <text>`        | string | 否   | 版本描述                                                                                 |
| `--policy <policy>`            | string | 否   | Agent 策略：`turbo`（快速）或 `agentic`（多轮）                                          |
| `--model <name>`               | string | 否   | 生成模型代码（须在平台白名单中）                                                         |
| `--temperature <n>`            | number | 否   | 采样温度，范围 0-2                                                                       |
| `--max-llm-calls <n>`          | number | 否   | 单次请求最大 LLM 调用次数，范围 1-30                                                     |
| `--enable-session-file <bool>` | string | 否   | 启用会话文件：`true` 或 `false`                                                          |
| `--enable-refusal <bool>`      | string | 否   | 启用拒答：`true` 或 `false`                                                              |
| `--enable-anti-leak <bool>`    | string | 否   | 启用防泄漏：`true` 或 `false`                                                            |
| `--enable-rich-text <bool>`    | string | 否   | 启用富文本输出：`true` 或 `false`                                                        |
| `--enable-citation <bool>`     | string | 否   | 启用引用标注：`true` 或 `false`                                                          |
| `--config-file <path>`         | string | 否   | JSON 文件替换整个 `agent_config`（含嵌套设置如 `kb_search_configs`）；与标量配置参数互斥 |

**参数约束**

- 至少提供一个更新项（`--name`/`--description`/`--version-desc`/`--config-file`/标量配置参数），否则报错 "Nothing to update"
- `--config-file` 与标量配置参数（`--policy`/`--model`/`--temperature` 等）互斥
- 已发布版本 + 配置变更 → 报错（已发布版本只接受 `--version-desc`）
- `--name` 最多 200 字符；`--description` 最多 1000 字符
- `--policy` 只能是 `turbo` 或 `agentic`
- `--temperature` 范围 0-2
- `--max-llm-calls` 范围 1-30
- 布尔参数（`--enable-*`）只能是 `true` 或 `false`

**输出**

text 模式：

```
updated: aid-xxx
Draft config changed — verify with --agent-version beta, then deploy.
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 配置变更只作用于 beta 草稿；已发布版本只接受 `--version-desc`。
- 标量配置参数采用 read-merge-write：CLI 先读取当前 beta 配置，再合并变更后整体提交（API 是整替换语义）。
- `--config-file` 替换整个配置，适合设置嵌套字段（如 `kb_search_configs`）。
- 修改草稿后用 `--agent-version beta` 在 search/chat 上测试，通过后 `service deploy` 发布。

**示例**

```bash
# 调整温度
kscli service update --agent-id aid-xxx --temperature 0.7 --workspace-id ws-xxx

# 用 JSON 文件替换整个配置
kscli service update --agent-id aid-xxx --config-file ./agent-config.json

# 给已发布版本 1 加描述
kscli service update --agent-id aid-xxx --agent-version 1 --version-desc "first stable release"
```

---

#### `kscli service deploy`

发布 beta 草稿为新版本。

**用法**

```bash
kscli service deploy --agent-id <id> [flags]
```

**参数**

| 参数                    | 类型   | 必填 | 说明                   |
| ----------------------- | ------ | ---- | ---------------------- |
| `--agent-id <id>`       | string | 是   | 服务（agent）ID        |
| `--version-desc <text>` | string | 否   | 新版本的描述说明       |
| `--yes`                 | switch | 否   | 显式确认执行高风险操作 |

**输出**

text 模式：

```
deployed: aid-xxx  version 2
```

quiet 模式：输出新版本号。

json 模式：返回 API 原始响应。

**注意事项**

- 版本号自动递增，状态变为 `deployed`。
- 发布影响线上调用方，确认提示会警告。
- 如果当前状态为 `edited`（已发布后又改了草稿），确认提示会额外警告「发布会覆盖线上行为」。
- 需要工作区的知识库修改权限。

**示例**

```bash
# 发布（交互确认）
kscli service deploy --agent-id aid-xxx --workspace-id ws-xxx

# 带描述并跳过确认
kscli service deploy --agent-id aid-xxx --version-desc "tuned rerank params" --yes
```

---

#### `kscli service delete`

删除检索/Q&A 服务（软删除，幂等）。

**用法**

```bash
kscli service delete --agent-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明                   |
| ----------------- | ------ | ---- | ---------------------- |
| `--agent-id <id>` | string | 是   | 服务（agent）ID        |
| `--yes`           | switch | 否   | 显式确认执行高风险操作 |

**输出**

text 模式：

```
deleted: aid-xxx  (status: deleted)
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 删除不可撤销，`agent_id` 不再可用于 search/chat 调用。
- API 是幂等的：删除已删除的服务不会报错。
- 如果服务状态为 `deployed` 或 `edited`，确认提示会额外警告「此服务正在线上运行」。
- 需要工作区的知识库删除权限。

**示例**

```bash
# 删除（交互确认）
kscli service delete --agent-id aid-xxx --workspace-id ws-xxx

# 跳过确认
kscli service delete --agent-id aid-xxx --yes
```

---

#### `kscli service copy`

复制服务为新草稿（名称自动加 `copy_` 前缀）。

**用法**

```bash
kscli service copy --agent-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明              |
| ----------------- | ------ | ---- | ----------------- |
| `--agent-id <id>` | string | 是   | 源服务（agent）ID |

**输出**

text 模式：

```
new agent_id: aid-new  (name: copy_my-qa, status: draft)
Test the draft with --agent-version beta on search/chat, then deploy it to publish.
```

quiet 模式：输出新 agent ID。

json 模式：返回 API 原始响应。

**注意事项**

- 副本初始为 beta 草稿，测试后需 deploy 发布。
- 需要工作区的知识库创建权限。

**示例**

```bash
# 复制服务
kscli service copy --agent-id aid-source --workspace-id ws-xxx
```

---

← [返回总览](./kscli-cli-guide.md)
