# `bl memory` 命令完整用法指南

> `bl memory` 命令总览，覆盖全部 13 个记忆命令。完整参数与示例请参阅各子域手册。

---

## 目录

1. [概述](#概述)
2. [核心概念与实体关系](#核心概念与实体关系)
3. [通用约定](#通用约定)
4. [典型工作流](#典型工作流)
5. [命令手册](#命令手册)
   - [记忆节点](#记忆节点) → [完整手册](node.md)
   - [画像模板与用户画像](#画像模板与用户画像) → [完整手册](profile.md)
   - [Skill 记忆](#skill-记忆) → [完整手册](skill.md)
6. [常见错误与排查](#常见错误与排查)
7. [附录：命令速查表](#附录命令速查表)

---

## 概述

`bl memory` 是阿里云百炼 CLI 的长期记忆命令组，用来写入和检索记忆节点、维护节点内容、管理画像模板并读取用户画像，以及导出 Skill 记忆：

- **记忆写入**：从一段原文或一段对话异步抽取，一次调用可能新增、更新或删除多条节点
- **记忆读取**：按用户分页列出、按语义检索、查看单节点详情
- **节点维护**：全量替换内容、增量合并元数据、删除指定节点
- **画像**：创建和更新属性模板，再在写入时抽取某个用户的画像值
- **Skill 记忆**：把技能正文写入已有 skill 规则，并导出不含 frontmatter 的正文

共 13 个命令，按功能域分为 3 组。全部使用 DashScope API Key 鉴权，并需要解析出 Workspace ID。`--help` 与 `--introspect` 不需要凭证。

机器可读参数以 `bl memory --introspect` 和 [生成参考](../../skills/bailian-memory/reference/memory.md) 为准。本手册说明用法、输出和约束。API 路径对照见 [能力矩阵](cli-matrix.md)，从配置走到脚本集成的叙述见 [用户技术指南](user-guide.md)。

安装与运行：

```bash
npm install -g bailian-cli
bl memory --help
```

> 需要 Node.js ≥ 18.17。若本机缺少下文子命令，先用 `bl --version` 核对已安装版本。

---

## 核心概念与实体关系

```
┌─────────────────────────────────────────────────────────────┐
│                     Workspace                                │
│                                                             │
│  记忆库 (library) ── 省略时使用账号默认库                     │
│    └── 片段规则 (project)                                    │
│          ├── 默认 observation 规则                           │
│          └── 已有 skill 规则（CLI 不创建规则）                │
└──────────────────────────┬──────────────────────────────────┘
                           │ 归属 (--user-id)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     记忆实体 (user)                           │
│                                                             │
│  记忆节点 (memory node)                                      │
│    ├── observation：事实记忆                                 │
│    └── skill：技能记忆，导出时去掉 frontmatter               │
│                                                             │
│  用户画像 (user profile)                                     │
│    └── 某个画像模板下已抽出的属性值                           │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ 模板定义属性，不直接存用户值
┌─────────────────────────────────────────────────────────────┐
│                  画像模板 (profile schema)                    │
│    name / attributes / plan-version / extract-scene          │
└─────────────────────────────────────────────────────────────┘
```

**关键关系**：

- **`--user-id`**：业务侧的记忆归属标识，由调用方保持稳定。它不是 API Key，也不是阿里云账号 ID。
- **`--library-id`**：记忆库。支持该参数的命令在省略时使用账号默认库。`node show` 和 `skill export` 只按节点 ID 定位，不接受记忆库参数。
- **`--project-id` / `--project-ids`**：记忆片段规则 ID，不是本地项目路径。CLI 不提供规则的创建或管理命令，写入 skill 记忆前需要已有 skill 规则 ID。
- **节点 ID**：`memory_node_id`，用于 `node show`、`update`、`delete`、`skill export`。提交写入返回的 `event_id` 是异步任务 ID，不是节点 ID。
- **画像模板 ID**：`profile_schema_id`。创建模板只定义属性；用户画像值要在 `memory add --profile-schema` 抽取之后，用 `profile get` 读取。

---

## 通用约定

### 鉴权

业务命令使用 **DashScope API Key**（Bearer token）。`--help` 和 `--introspect` 无需凭证。

优先级（高 → 低）：

1. `--api-key <key>` 命令行参数
2. `DASHSCOPE_API_KEY` 环境变量
3. 配置文件中的 `api_key`（`bl config set api_key <key>`）

### Workspace ID

记忆 API 使用 workspace 级域名（`https://<workspace-id>.cn-beijing.maas.aliyuncs.com`），因此 **每个业务命令都需要 workspace ID**。`--base-url` 不能改写这组命令的 Workspace 网关。

优先级（高 → 低）：

1. `--workspace-id <id>` 命令行参数
2. `BAILIAN_WORKSPACE_ID` 环境变量
3. 配置文件中的 `workspace_id`（`bl config set workspace_id <id>`）

缺失时报错：`Workspace ID is required.`

### 全局通用参数

以下参数在记忆命令中通用，后续命令手册不再逐条列出：

| 参数                  | 类型   | 说明                                                     |
| --------------------- | ------ | -------------------------------------------------------- |
| `--output <format>`   | string | 输出格式：`text`（默认）或 `json`                        |
| `--api-key <key>`     | string | DashScope API Key                                        |
| `--base-url <url>`    | string | API 基地址；不能用来切换 Memory 的 Workspace 网关        |
| `--timeout <seconds>` | number | 请求超时秒数                                             |
| `--quiet`             | switch | 与 text 使用同一套摘要；同时指定 json 时仍输出文本摘要   |
| `--verbose`           | switch | 详细模式。`add` 轮询进度写到 stderr                      |
| `--dry-run`           | switch | 预览 endpoint、method 和 request，不发送 Memory 业务请求 |
| `--introspect`        | switch | 输出当前命令范围的结构化能力说明，无需凭证               |
| `--config <name>`     | string | 使用指定配置 profile 执行命令                            |
| `--workspace-id <id>` | string | Workspace ID                                             |

> 命令手册中的参数表只列出该命令特有的参数。

### 输出格式约定

- **text 模式**（默认）：人类可读摘要。空结果有固定英文提示，如 `No memory nodes found.`
- **json 模式**（`--output json`）：返回该命令组装后的 JSON。`add` 在等待完成时包含 `request_id`、`event_id` 和 `events`，字段可能缺省。
- **quiet**：记忆命令的 quiet 与 text 走同一条摘要路径。脚本需要结构化结果时只使用 `--output json`，不要再加 `--quiet`。

服务端 HTTP 错误和业务错码原样透传，CLI 不改写错误文案。

### 危险操作确认

`memory delete` 和 `memory profile delete` 是高风险操作。未带 `--yes` 时 CLI 不执行，也不弹出交互式 Y/N，而是返回 exit code 7 和 `requires_confirmation`。确认目标与范围后，在原命令中添加 `--yes` 再执行。

### Dry-run 模式

`--dry-run` 输出将访问的 endpoint、method 和 request body，不发送 Memory 业务请求，也不证明远端鉴权、规则类型或抽取效果。本地仍会做 JSON 解析和参数校验。

### 命令能力发现

```bash
bl memory --introspect
bl memory add --introspect
```

输出当前命令范围的一份 JSON，包含命令路径、参数、示例、鉴权和风险标识。它不执行业务请求，也不返回凭证值。跨参数校验在执行时进行，不从 schema 推断。已安装版本用 `bl --version` 查询。

### 异步抽取

`memory add` 提交异步任务并在进程内轮询。默认 `--wait 120`（秒），间隔 3 秒。这是轮询预算，不是整个进程的严格时限。`--wait 0` 只返回提交回执。

| 状态       | 处理方式                                               |
| ---------- | ------------------------------------------------------ |
| PENDING    | 继续轮询                                               |
| RUNNING    | 继续轮询                                               |
| SUCCEEDED  | 成功终态；`result` 为空表示这次没有记忆变化            |
| SUCCESS    | CLI 兼容的成功拼写，与 SUCCEEDED 同一类终态            |
| UNRECORDED | 终态。CLI 展示状态，不把它当作已写入成功               |
| FAILED     | 失败终态。已完成的部分会先输出，然后命令以非零状态退出 |

一个 `event_id` 可以包含多项任务。部分失败时，成功部分可能已经落地。超时只表示 CLI 停止等待，后台任务仍可能继续。当前没有独立的事件查询命令，稍后用 `list`、`search` 或 `profile get` 核对。

### 频率限制

账号级限制：`add` 120 QPM，`search` 300 QPM，全部记忆 API 合计 3000 QPM。遇到 HTTP 429 时退避，并在调用之间至少间隔 1 秒。以服务端实际限制为准。

---

## 典型工作流

### 场景 A：写入一条事实并检索

```bash
bl memory add --user-id demo_user \
  --content '用户偏好 Python，回答时优先提供 Python 示例。' \
  --workspace-id ws-xxx

bl memory list --user-id demo_user --workspace-id ws-xxx

bl memory search --user-id demo_user \
  --query '用户偏好什么编程语言？' --workspace-id ws-xxx
```

从 list 或 search 输出中取 `memory_node_id`，再查看详情：

```bash
bl memory node show --node-id node-xxx --workspace-id ws-xxx
```

### 场景 B：从对话抽取，并只拿回执

```bash
bl memory add --user-id demo_user \
  --messages '[{"role":"user","content":"我住在杭州，周末喜欢骑行。"},{"role":"assistant","content":"了解，我会据此提供建议。"}]' \
  --workspace-id ws-xxx

# 提交后立即返回 event_id，适合调用方自行核对
bl memory add --user-id demo_user --content '用户喜欢骑行。' \
  --wait 0 --output json --workspace-id ws-xxx
```

`--content` 与 `--messages` 只传一种。传了 `--content` 时，服务端忽略 `--messages`。

### 场景 C：创建画像模板并抽取用户值

```bash
bl memory profile create --name travel_profile \
  --attributes '[{"name":"city","description":"用户常住城市"},{"name":"hobby","description":"用户的兴趣爱好"}]' \
  --plan-version lite --extract-scene efficient --workspace-id ws-xxx

bl memory add --user-id demo_user --profile-schema schema-xxx \
  --messages '[{"role":"user","content":"我常住杭州，喜欢骑行和摄影。"}]' \
  --workspace-id ws-xxx

bl memory profile get --schema-id schema-xxx --user-id demo_user --workspace-id ws-xxx
```

只抽取画像、不写事实记忆时，增加 `--extract-mode profile_only`。该模式需要 `--messages` 和 `--profile-schema`，并且不传 `--content`。

### 场景 D：写入并导出 Skill 记忆

需要已有的 skill 规则 ID：

```bash
bl memory add --user-id demo_user --project-id skill-project-xxx \
  --content '整理会议记录：提取议题、决策、待办、负责人和截止时间。' \
  --skill-name meeting-summary \
  --skill-description '将会议记录整理为决策和行动清单' \
  --skill-tags office --skill-tags meeting --workspace-id ws-xxx

bl memory skill export --node-id node-xxx --output text > meeting-summary.md
```

### 场景 E：更正并删除节点

```bash
bl memory node show --node-id node-xxx --workspace-id ws-xxx
bl memory update --node-id node-xxx \
  --content '用户现在偏好 TypeScript。' \
  --meta-data '{"source":"user_correction"}' --workspace-id ws-xxx

bl memory delete --node-id node-xxx --dry-run --workspace-id ws-xxx
bl memory delete --node-id node-xxx --yes --workspace-id ws-xxx
```

---

## 命令手册

以下按功能域分组，覆盖全部 13 个命令。每个条目包含功能说明和用法签名。

> 完整参数表、约束、输出与示例见各子域手册。

---

### 记忆节点

> 📖 [完整手册](node.md) — 6 个命令

#### `bl memory add`

从原文或对话异步抽取记忆，可选同时抽取用户画像。

```bash
bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]
```

→ [完整参数与示例](node.md#bl-memory-add)

---

#### `bl memory list`

分页列出某个用户在一条规则下的记忆节点。

```bash
bl memory list --user-id <id> [flags]
```

→ [完整参数与示例](node.md#bl-memory-list)

---

#### `bl memory search`

按查询文本或对话上下文检索记忆节点。

```bash
bl memory search --user-id <id> [--query <text>] [--messages <json>] [flags]
```

→ [完整参数与示例](node.md#bl-memory-search)

---

#### `bl memory node show`

查看单个记忆节点的类型、状态、内容和元数据。

```bash
bl memory node show --node-id <id> [flags]
```

→ [完整参数与示例](node.md#bl-memory-node-show)

---

#### `bl memory update`

全量替换节点内容，并增量合并元数据。

```bash
bl memory update --node-id <id> --content <text> [flags]
```

→ [完整参数与示例](node.md#bl-memory-update)

---

#### `bl memory delete`

删除指定记忆节点。

```bash
bl memory delete --node-id <id> [--yes] [flags]
```

→ [完整参数与示例](node.md#bl-memory-delete)

---

### 画像模板与用户画像

> 📖 [完整手册](profile.md) — 6 个命令

#### `bl memory profile create`

创建画像模板。

```bash
bl memory profile create --name <name> --attributes <json> [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-create)

---

#### `bl memory profile list`

分页列出画像模板。

```bash
bl memory profile list [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-list)

---

#### `bl memory profile show`

查看模板定义和属性 `attribute_id`。

```bash
bl memory profile show --schema-id <id> [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-show)

---

#### `bl memory profile update`

更新模板名称、描述、属性、策略档位或抽取场景。

```bash
bl memory profile update --schema-id <id> [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-update)

---

#### `bl memory profile delete`

删除画像模板及其属性定义。

```bash
bl memory profile delete --schema-id <id> [--yes] [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-delete)

---

#### `bl memory profile get`

读取某个用户在指定模板下已抽出的画像值。

```bash
bl memory profile get --schema-id <id> --user-id <id> [flags]
```

→ [完整参数与示例](profile.md#bl-memory-profile-get)

---

### Skill 记忆

> 📖 [完整手册](skill.md) — 1 个命令。写入和更新仍使用 `memory add` / `memory update`。

#### `bl memory skill export`

导出技能正文。text 模式不含 frontmatter。

```bash
bl memory skill export --node-id <id> [flags]
```

→ [完整参数与示例](skill.md#bl-memory-skill-export)

---

## 常见错误与排查

### Workspace ID 缺失

**问题**：`Workspace ID is required.`

**处理**：设置 `--workspace-id`、`BAILIAN_WORKSPACE_ID` 或配置 `workspace_id`。API Key 不能代替 Workspace ID。

### 刚写入但检索不到

**处理**：确认 `add` 已到达成功终态，并且 `user-id`、`library-id`、`project-id` 与写入时一致。`search` 默认只查 observation；skill 节点需要 `--memory-types skill`。

### list 看不到其他规则的节点

**处理**：不传 `--project-id` 时只查默认规则。其他 observation 或 skill 规则要显式传入对应 ID。

### 模板存在但画像为空

**处理**：确认某次 `add` 使用了同一个 `--profile-schema`，消息里包含目标信息，并且抽取任务已经完成。创建模板本身不会生成用户画像。

### Skill 更新被拒绝

**处理**：目标节点是 skill 时，更新必须同时提供 `--skill-name`、`--skill-description`、`--skill-tags`。先用 `node show` 确认 `memory_type`。

### add 超时

**处理**：CLI 停止等待后，后台任务仍可能完成。保留 `event_id`，稍后用 `list`、`search` 或 `profile get` 核对，避免把同一次抽取再提交一遍。

### 删除后仍能 show

**处理**：详情里 `status=delete` 表示删除状态已经返回。这不表示删除请求失败，也不表示底层一定已经物理擦除。

### HTTP 429 或 FAILED

**处理**：429 时降低并发并退避。FAILED 和 HTTP 业务错误看原始消息与 `request_id`。部分成功的任务可能已经写入。

---

## 附录：命令速查表

| 命令                       | 功能            | 关键参数                                                                |
| -------------------------- | --------------- | ----------------------------------------------------------------------- |
| `bl memory add`            | 异步抽取        | `--user-id`, `--content`/`--messages`, `--wait`, `--profile-schema`     |
| `bl memory list`           | 分页列出节点    | `--user-id`, `--project-id`, `--page`, `--page-size`                    |
| `bl memory search`         | 语义检索        | `--user-id`, `--query`/`--messages`, `--memory-types`, `--plan-version` |
| `bl memory node show`      | 节点详情        | `--node-id`                                                             |
| `bl memory update`         | 更新节点        | `--node-id`, `--content`, `--meta-data`                                 |
| `bl memory delete`         | 删除节点        | `--node-id`, `--yes`                                                    |
| `bl memory profile create` | 创建画像模板    | `--name`, `--attributes`, `--plan-version`, `--extract-scene`           |
| `bl memory profile list`   | 列出模板        | `--page`, `--page-size`, `--library-id`                                 |
| `bl memory profile show`   | 模板详情        | `--schema-id`                                                           |
| `bl memory profile update` | 更新模板        | `--schema-id`, `--attributes-operations`                                |
| `bl memory profile delete` | 删除模板        | `--schema-id`, `--yes`                                                  |
| `bl memory profile get`    | 读取用户画像    | `--schema-id`, `--user-id`                                              |
| `bl memory skill export`   | 导出 Skill 正文 | `--node-id`                                                             |

当前没有这些命令：事件状态查询、记忆库管理、片段规则管理、直接编辑画像值项、清空某个用户的全部记忆或全部画像。
