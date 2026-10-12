# 记忆节点命令手册

记忆节点是一条事实（observation）或技能（skill）记忆。本组命令覆盖异步写入、分页列出、语义检索、详情、更新和删除。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式、异步抽取）请参阅 [总览文档](./memory-cli-guide.md#通用约定)。

---

#### `bl memory add`

从自定义原文或对话消息提交异步抽取。一次调用可能新增、更新或删除多条节点，也可以同时抽取用户画像。

**用法**

```bash
bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]
```

**参数**

| 参数                            | 类型   | 必填 | 说明                                                                                          |
| ------------------------------- | ------ | ---- | --------------------------------------------------------------------------------------------- |
| `--user-id <id>`                | string | 是   | 记忆归属实体 ID，最长 64                                                                      |
| `--messages <json>`             | string | 否¹  | 消息 JSON 数组，最多 50 条。role 支持 `user`、`assistant`、`tool`                             |
| `--content <text>`              | string | 否¹  | 按原文写入的内容，最长 512。传入后服务端忽略 `--messages`                                     |
| `--profile-schema <id>`         | string | 否   | 画像模板 ID。不传则不抽取用户画像                                                             |
| `--extract-mode <profile_only>` | string | 否   | 只抽取画像。需要 `--profile-schema` 和 `--messages`，并且不传 `--content`                     |
| `--project-id <id>`             | array  | 否   | 片段规则 ID。内容直存最多 1 个，消息抽取最多 5 个                                             |
| `--skill-name <name>`           | string | 否²  | Skill 名称。与描述、标签一起出现                                                              |
| `--skill-description <text>`    | string | 否²  | Skill 描述                                                                                    |
| `--skill-tags <tag>`            | array  | 否²  | Skill 标签，可重复                                                                            |
| `--meta-data <json>`            | string | 否   | 自定义元数据 JSON 对象                                                                        |
| `--wait <seconds>`              | number | 否   | 轮询预算秒数，非负，默认 120。`0` 提交后立即返回 `event_id`                                   |
| `--library-id <id>`             | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库                                                      |

> ¹ `--content` 与 `--messages` 提供一种作为写入来源。
>
> ² 写入 skill 记忆时，`--skill-name`、`--skill-description`、`--skill-tags` 一起提供。

**参数约束**

- `--user-id` 最长 64，`--library-id` 最长 32，`--content` 最长 512。长度按 JavaScript 字符串 length 计算。
- `--messages` 必须是 JSON 数组，最多 50 条。`tool` 消息需要 `tool_call_id`；`tool_calls` 使用 OpenAI 风格，含 `id` 与 `function.name`。
- `--meta-data` 必须是 JSON 对象。这些 JSON 参数直接解析参数文本，不支持 `@file`。
- `--extract-mode profile_only` 需要 `--profile-schema` 和 `--messages`，并且不带 `--content`。
- 内容直存最多 1 个 `--project-id`；消息抽取最多 5 个。

**输出**

`--wait 0` 的 text / quiet：

```
Submitted: event evt-xxx (1 task(s) pending).
```

等待完成的 text / quiet：每个抽取结果一行。画像任务打印属性名，记忆任务打印节点 ID。

```
[ADD] node-xxx 用户偏好 Python
[UPDATE] user_profile city 杭州
memory schema-xxx: SUCCEEDED (no memory change)
```

没有可展示结果时输出 `No memory node changed.`

json 模式：等待完成时返回 `request_id`、`event_id` 和 `events`。`--wait 0` 返回提交回执。

**注意事项**

- 消息抽取不是逐句追加。服务端可能新增、更新或删除已有节点，也可能没有变化。
- 传了 `--content` 时，服务端以 content 为准并忽略 messages。CLI 仍会解析和校验 messages，因此两种来源只传一种。
- 超时退出码为超时，错误中带有 `event_id`。后台任务可能仍在运行，稍后用 `list`、`search` 或 `profile get` 核对。
- 存在 FAILED 任务时，其余任务的结果会先打印，然后命令以非零状态退出。
- `--verbose` 把每一轮轮询状态写到 stderr。
- 账号级限制：add 120 QPM。HTTP 429 时退避，调用间隔至少 1 秒。

**示例**

```bash
# 原文写入
bl memory add --user-id user1 --content "The user likes Python programming" --workspace-id ws-xxx

# 从对话抽取
bl memory add --user-id user1 \
  --messages '[{"role":"user","content":"我住在杭州，周末喜欢骑行。"}]'

# 只抽取画像
bl memory add --user-id user1 \
  --messages '[{"role":"user","content":"我常住杭州"}]' \
  --profile-schema schema-xxx --extract-mode profile_only

# 写入 skill 记忆（需要已有 skill 规则）
bl memory add --user-id user1 --project-id skill-project-xxx \
  --content "整理会议纪要" \
  --skill-name "会议纪要整理" \
  --skill-description "自动提取会议重点并生成摘要" \
  --skill-tags 办公 --skill-tags 总结

# 只拿提交回执
bl memory add --user-id user1 --content "Attended WAIC" --wait 0 --output json
```

---

#### `bl memory list`

分页列出某个用户的记忆节点。

**用法**

```bash
bl memory list --user-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                                     |
| ------------------- | ------ | ---- | -------------------------------------------------------- |
| `--user-id <id>`    | string | 是   | 记忆归属实体 ID，最长 64                                 |
| `--page <n>`        | number | 否   | 页码，至少 1，默认 1。不自动翻页                         |
| `--page-size <n>`   | number | 否   | 每页条数，至少 1，默认 10                                |
| `--project-id <id>` | string | 否   | 片段规则 ID。省略时只查该库的默认规则                    |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库                 |

**输出**

text / quiet：

```
[observation] [node-xxx] 用户偏好 Python
  meta: {"source":"user_correction"}

Total: 1
```

无节点时输出 `No memory nodes found.`

json 模式：返回 `memory_nodes` 和 `total`。

**注意事项**

- 不传 `--project-id` 时只列出默认规则，不会汇总其他 observation 或 skill 规则。
- 返回的 `memory_node_id` 用于 `node show`、`update`、`delete` 和 `skill export`。

**示例**

```bash
bl memory list --user-id user1 --workspace-id ws-xxx

bl memory list --user-id user1 --page-size 20 --page 2

bl memory list --user-id user1 --project-id skill-project-xxx --library-id lib-xxx --output json
```

---

#### `bl memory search`

按查询文本或对话上下文检索记忆节点。

**用法**

```bash
bl memory search --user-id <id> [--query <text>] [--messages <json>] [flags]
```

**参数**

| 参数                                  | 类型   | 必填 | 说明                                                                 |
| ------------------------------------- | ------ | ---- | -------------------------------------------------------------------- |
| `--user-id <id>`                      | string | 是   | 记忆归属实体 ID，最长 64                                             |
| `--query <text>`                      | string | 否   | 检索文本。单独使用时包装成一条 user 消息                             |
| `--messages <json>`                   | string | 否   | 用于结合上下文检索的消息 JSON 数组。传入后优先于 `--query`           |
| `--top-k <n>`                         | number | 否   | 最多返回条数，1–100。服务端默认 10                                   |
| `--min-score <score>`                 | number | 否   | 最低相似度，0–1。服务端默认 0.3                                      |
| `--memory-types <observation\|skill>` | array  | 否   | 要检索的类型，可重复。省略时服务端默认只查 observation               |
| `--memory-type <observation\|skill>`  | string | 否   | `--memory-types` 的弃用别名。与 `--memory-types` 互斥                |
| `--project-ids <id>`                  | array  | 否   | 片段规则 ID，可重复                                                   |
| `--project-id <id>`                   | array  | 否   | `--project-ids` 的弃用别名，可重复。与 `--project-ids` 互斥          |
| `--plan-version <pro\|lite>`          | string | 否   | `pro` 开启 rerank，`lite` 关闭 rerank。省略时服务端默认 pro          |
| `--library-id <id>`                   | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库                             |

**参数约束**

- `--memory-type` 会归一化为请求里的 `memory_types`；`--project-id` 会归一化为 `project_ids`。同一组单复数参数只传一种。
- `--top-k` 范围 1–100，`--min-score` 范围 0–1。
- `pro` 与 `lite` 计费不同。本手册不给出价格。

**输出**

text / quiet：

```
[observation] [node-xxx] 用户偏好 Python (score 0.82)
```

无结果时输出 `No memory nodes found.`

json 模式：返回 API 响应中的 `memory_nodes`。

**注意事项**

- 查 skill 记忆时显式传 `--memory-types skill`，或同时传入 observation 与 skill。
- 账号级限制：search 300 QPM，全部记忆 API 合计 3000 QPM。

**示例**

```bash
bl memory search --user-id user1 --query "programming preferences" --workspace-id ws-xxx

bl memory search --user-id user1 \
  --messages '[{"role":"user","content":"recommend a book"}]' --top-k 5

bl memory search --user-id user1 --query "reminders" --plan-version lite --min-score 0

bl memory search --user-id user1 --query "会议纪要" \
  --memory-types skill --project-ids skill-project-xxx
```

---

#### `bl memory node show`

查看单个记忆节点的完整文本摘要。

**用法**

```bash
bl memory node show --node-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明          |
| ---------------- | ------ | ---- | ------------- |
| `--node-id <id>` | string | 是   | 记忆节点 ID   |

本命令不接受 `--user-id` 或 `--library-id`。

**输出**

text / quiet：

```
[node-xxx] 用户偏好 Python
  type: observation  status: active
  project: project-xxx
  timestamp: 1710000000
  created_at: 1710000000
  updated_at: 1710000000
  meta: {"source":"user_correction"}
```

服务端提供 `media_desc` 或 `media_urls` 时会追加对应行。节点不存在时输出 `Memory node not found.`

json 模式：返回 `memory_node`。

**注意事项**

- 更新或删除前用它确认节点类型和内容。skill 节点的 content 可能含 frontmatter；导出正文用 `skill export`。
- 删除后详情仍可能返回，此时 `status=delete`。

**示例**

```bash
bl memory node show --node-id node-xxx --workspace-id ws-xxx

bl memory node show --node-id node-xxx --output json
```

---

#### `bl memory update`

全量替换节点内容。元数据按增量合并。

**用法**

```bash
bl memory update --node-id <id> --content <text> [flags]
```

**参数**

| 参数                         | 类型   | 必填 | 说明                                                    |
| ---------------------------- | ------ | ---- | ------------------------------------------------------- |
| `--node-id <id>`             | string | 是   | 记忆节点 ID                                             |
| `--content <text>`           | string | 是   | 新内容，最长 512                                        |
| `--meta-data <json>`         | string | 否   | JSON 对象，按增量合并                                   |
| `--skill-name <name>`        | string | 否¹  | Skill 名称                                              |
| `--skill-description <text>` | string | 否¹  | Skill 描述                                              |
| `--skill-tags <tag>`         | array  | 否¹  | Skill 标签，可重复                                      |
| `--library-id <id>`          | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库                |

> ¹ 目标是 skill 节点时，这三项一起提供，包括只改正文的情况。

**参数约束**

- 本命令不接受 `--user-id`，按节点 ID 定位。
- CLI 不提供修改时间戳的参数。更新内容时保留原时间戳。
- `--meta-data` 必须是 JSON 对象。

**输出**

text / quiet：

```
Memory node node-xxx updated.
```

json 模式：返回 API 响应。

**注意事项**

- `--content` 全量替换正文；`--meta-data` 只合并传入的键。
- 更新 skill 节点前先用 `node show` 确认类型，并传齐技能名称、描述和标签。

**示例**

```bash
bl memory update --node-id node-xxx --content "updated memory content" --workspace-id ws-xxx

bl memory update --node-id node-xxx \
  --content "met at WAIC" --meta-data '{"city":"Shanghai"}'

bl memory update --node-id node-xxx \
  --content "整理会议纪要" \
  --skill-name "会议纪要整理" \
  --skill-description "提取会议重点" \
  --skill-tags 办公
```

---

#### `bl memory delete`

删除指定记忆节点。

**用法**

```bash
bl memory delete --node-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| `--node-id <id>`    | string | 是   | 记忆节点 ID                              |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |
| `--yes`             | switch | 否   | 确认这次高风险操作                       |

本命令不接受 `--user-id`。

**输出**

text / quiet：

```
Memory node node-xxx deleted.
```

未带 `--yes` 时返回 exit code 7，类型为 `requires_confirmation`，不删除节点。

**注意事项**

- 先 `node show` 或 `list` 核对节点 ID，再用 `--dry-run` 看请求，确认范围后才加 `--yes`。
- 删除只作用于这一个节点，不会清空该用户的其他记忆或画像。
- 删除后 `node show` 仍可能读到该节点，`status=delete`。

**示例**

```bash
bl memory delete --node-id node-xxx --dry-run --workspace-id ws-xxx

# 确认目标节点后再执行
bl memory delete --node-id node-xxx --yes
```

---

← [返回总览](./memory-cli-guide.md)
