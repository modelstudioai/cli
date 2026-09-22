# `bl memory` 能力矩阵

本文以表格形式固化 `bl memory` 命令组的能力基线:命令 ↔ 功能域 ↔ 底层 API ↔ 参数 ↔ 约束 ↔ 输出 ↔ 风险。矩阵用于能力盘点、评审与测试用例设计;面向使用者的分步说明见 [memory-cli-guide.md](memory-cli-guide.md)。

- 核实基线:分支 `feat/memory`,13 条命令路径,核对源为 `packages/cli/src/commands.ts`、`packages/commands/src/commands/memory/*`、`packages/core/src/client/endpoints.ts`
- 核实日期:2026-09-22
- 命令清单的权威来源是 `packages/cli/src/commands.ts`;参数文案的权威来源是 `skills/bailian-cli/reference/memory.md`(自动生成)。两者与本文不一致时以代码为准,并回来更新本文

---

## 一、命令总览

| #   | 命令                    | 功能域   | 职责                                                           | HTTP     | API 路径                                                       | 鉴权    | 风险   | 异步/轮询      |
| --- | ----------------------- | -------- | -------------------------------------------------------------- | -------- | -------------------------------------------------------------- | ------- | ------ | -------------- |
| 1   | `memory add`            | 记忆写入 | 从 messages 或自定义内容抽取记忆(可同时新增/更新/删除多个节点) | `POST`   | `/api/v2/apps/memory/add-async`                                | API Key | 低     | 提交后内部轮询 |
| 2   | `memory search`         | 记忆检索 | 按 query 或 messages 语义检索记忆节点                          | `POST`   | `/api/v2/apps/memory/memory_nodes/search`                      | API Key | 低     | 同步           |
| 3   | `memory list`           | 记忆检索 | 按 user_id 分页列出记忆节点                                    | `GET`    | `/api/v2/apps/memory/memory_nodes`                             | API Key | 低     | 同步           |
| 4   | `memory node show`      | 记忆详情 | 查看单个记忆节点完整字段                                       | `GET`    | `/api/v2/apps/memory/memory_nodes/{node_id}`                   | API Key | 低     | 同步           |
| 5   | `memory update`         | 记忆写入 | 覆盖节点内容、时间戳与元数据(技能节点需三元组)                 | `PATCH`  | `/api/v2/apps/memory/memory_nodes/{node_id}`                   | API Key | 低     | 同步           |
| 6   | `memory delete`         | 记忆写入 | 删除指定记忆节点                                               | `DELETE` | `/api/v2/apps/memory/memory_nodes/{node_id}`                   | API Key | **高** | 同步           |
| 7   | `memory skill export`   | 技能记忆 | 导出技能节点正文(不含 frontmatter)                             | `GET`    | `/api/v2/apps/memory/skill/export/{node_id}`                   | API Key | 低     | 同步           |
| 8   | `memory profile create` | 画像模板 | 创建画像模板及其属性定义                                       | `POST`   | `/api/v2/apps/memory/profile_schemas`                          | API Key | 低     | 同步           |
| 9   | `memory profile list`   | 画像模板 | 分页列出画像模板                                               | `GET`    | `/api/v2/apps/memory/profile_schemas`                          | API Key | 低     | 同步           |
| 10  | `memory profile show`   | 画像模板 | 查看模板定义与 `attribute_id`                                  | `GET`    | `/api/v2/apps/memory/profile_schemas/{schema_id}`              | API Key | 低     | 同步           |
| 11  | `memory profile update` | 画像模板 | 改模板名称/描述、模板内属性增删改、计费档与抽取场景            | `PATCH`  | `/api/v2/apps/memory/profile_schemas/{schema_id}`              | API Key | 低     | 同步           |
| 12  | `memory profile delete` | 画像模板 | 永久删除模板及其属性定义                                       | `DELETE` | `/api/v2/apps/memory/profile_schemas/{schema_id}`              | API Key | **高** | 同步           |
| 13  | `memory profile get`    | 用户画像 | 读取某用户在某模板下抽取出的画像值                             | `GET`    | `/api/v2/apps/memory/profile_schemas/{schema_id}/user_profile` | API Key | 低     | 同步           |

内部轮询(非用户命令):`GET /api/v2/apps/memory/events/{event_id}`,由 `memory add` 在 `packages/commands/src/commands/memory/poll-event.ts` 中调用。

**节点生命周期能力分布**:新增/更新/删除三种节点变更都由 `memory add`(抽取式)与 `memory update`/`memory delete`(直写式)两条路径覆盖。抽取式一次调用可改动多个节点,结果需轮询;直写式一次只动一个已知 `node_id`,立即返回。

---

## 二、参数矩阵

### 2.1 全命令共有

| 参数                    | 类型   | 说明                                                                                          |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `--workspace-id <id>`   | string | 记忆 API 挂在 workspace 独占域上,**必需**;也可用 `BAILIAN_WORKSPACE_ID` 或配置 `workspace_id` |
| `--api-key <key>`       | string | 凭证(来自 `auth: "apiKey"` 凭证域)                                                            |
| `--base-url <url>`      | string | API 基址覆盖                                                                                  |
| `--output <text\|json>` | string | 输出格式,缺省 `text`                                                                          |
| `--quiet`               | switch | 仅打印精简结果                                                                                |
| `--verbose`             | switch | 打印轮询等调试信息(stderr)                                                                    |
| `--dry-run`             | switch | 只打印将要请求的 endpoint/method/body,不发请求                                                |
| `--timeout <ms>`        | number | 单次 HTTP 超时                                                                                |
| `--config <path>`       | string | 指定配置文件                                                                                  |
| `--help` / `--version`  | switch | 运行时全局参数                                                                                |

13 条命令全部为 `auth: "apiKey"`,无 console 凭证域命令。

### 2.2 作用域参数

| 参数                | 类型   | 出现于                                    | 说明                                                                                       |
| ------------------- | ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--user-id <id>`    | string | `add` / `search` / `list` / `profile get` | 记忆归属实体 ID;**必填**。`update` / `delete` 上为已弃用兼容参数,不发送到接口              |
| `--library-id <id>` | string | 除 `node show` / `skill export` 外的全部  | 记忆库 ID,缺省用账号默认库                                                                 |
| `--project-id <id>` | array  | `add` / `search` / `list`                 | 记忆抽取规则 ID。`list` 为单值;`add`/`search` 可重复,上限 5 个;`add --content` 仅接受 1 个 |

### 2.3 按命令的特有参数

| 命令                              | 特有参数                                                                                                                                                                                                                                            | 备注                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `add`                             | `--messages <json>`、`--content <text>`、`--profile-schema <id>`、`--extract-mode profile_only`、`--skill-name`、`--skill-description`、`--skill-tags`、`--meta-data <json>`、`--timestamp <s>`、`--wait <s>`                                       | `--messages` 与 `--content` 至少一个;`--content` 优先 |
| `search`                          | `--query <text>`、`--messages <json>`、`--top-k <n>`、`--min-score <s>`、`--enable-rerank <bool>`、`--enable-judge <bool>`、`--enable-rewrite <bool>`、`--memory-types <observation\|skill>`、`--query-timestamp <s>`、`--plan-version <pro\|lite>` | `--messages` 覆盖 `--query`                           |
| `list`                            | `--page-size <n>`、`--page <n>`                                                                                                                                                                                                                     | 默认 10 / 1                                           |
| `update`                          | `--node-id <id>`(必填)、`--content <text>`(必填)、`--timestamp <s>`、`--meta-data <json>`、技能三元组                                                                                                                                               | `--content` 整体覆盖                                  |
| `delete`                          | `--node-id <id>`(必填)、`--yes`                                                                                                                                                                                                                     | `--yes` 由 runtime 注入                               |
| `node show` / `skill export`      | `--node-id <id>`(必填)                                                                                                                                                                                                                              | 无其他作用域参数                                      |
| `profile create`                  | `--name <name>`(必填)、`--description`、`--attributes <json>`(必填)、`--plan-version`、`--extract-scene <efficient\|intelligent>`                                                                                                                   |                                                       |
| `profile update`                  | `--schema-id <id>`(必填)、`--name`、`--description`、`--attributes-operations <json>`、`--plan-version`、`--extract-scene`                                                                                                                          | 至少提供一项可改字段                                  |
| `profile show` / `profile delete` | `--schema-id <id>`(必填)、`--yes`(仅 delete)                                                                                                                                                                                                        |                                                       |
| `profile get`                     | `--schema-id <id>`(必填)、`--user-id <id>`(必填)、`--need-detail <bool>`                                                                                                                                                                            |                                                       |
| `profile list`                    | `--page-size <n>`、`--page <n>`                                                                                                                                                                                                                     |                                                       |

### 2.4 结构化 JSON 参数格式

| 参数                      | 形状                                                                          | 校验                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--messages`              | `[{"role":"user\|assistant\|tool","content":"..."}]`,支持 OpenAI `tool_calls` | role 必须合法;`tool` 角色必须带 `tool_call_id`;`tool_calls[].id` / `.function` / `.function.name` 必需;`add` 最多 50 条 |
| `--meta-data`             | JSON object,如 `{"location_name":"Beijing"}`                                  | `add` 整体写入,`update` 增量合并                                                                                        |
| `--attributes`            | `[{"name":"age","description":"age","default_value":"18"}]`                   | 至少 1 项,每项必须有 `name`                                                                                             |
| `--attributes-operations` | `[{"op":"add","name":"plan"}]`                                                | `op` ∈ `add\|update\|delete`;`add` 需 `name`,`update`/`delete` 需 `attribute_id`                                        |

---

## 三、API 端点矩阵

统一宿主:`https://{workspaceId}.cn-beijing.maas.aliyuncs.com` + 下列路径,由 `packages/core/src/client/endpoints.ts` 构造,命令层不拼字符串。

| 能力         | 方法 + 路径                                                        | CLI 暴露                | 幂等性说明                           |
| ------------ | ------------------------------------------------------------------ | ----------------------- | ------------------------------------ |
| 异步写入     | `POST /api/v2/apps/memory/add-async`                               | `memory add`            | 非幂等,重复提交会产生新 event        |
| 事件查询     | `GET /api/v2/apps/memory/events/{event_id}`                        | 内部轮询,无独立命令     | 只读                                 |
| 记忆检索     | `POST /api/v2/apps/memory/memory_nodes/search`                     | `memory search`         | 只读                                 |
| 记忆列表     | `GET /api/v2/apps/memory/memory_nodes`                             | `memory list`           | 只读                                 |
| 节点详情     | `GET /api/v2/apps/memory/memory_nodes/{node_id}`                   | `memory node show`      | 只读                                 |
| 节点更新     | `PATCH /api/v2/apps/memory/memory_nodes/{node_id}`                 | `memory update`         | 覆盖写                               |
| 节点删除     | `DELETE /api/v2/apps/memory/memory_nodes/{node_id}`                | `memory delete`         | 删除后节点可能仍可读,`status=delete` |
| 技能导出     | `GET /api/v2/apps/memory/skill/export/{node_id}`                   | `memory skill export`   | 只读                                 |
| 模板创建     | `POST /api/v2/apps/memory/profile_schemas`                         | `memory profile create` | 非幂等                               |
| 模板列表     | `GET /api/v2/apps/memory/profile_schemas`                          | `memory profile list`   | 只读                                 |
| 模板详情     | `GET /api/v2/apps/memory/profile_schemas/{schema_id}`              | `memory profile show`   | 只读                                 |
| 模板更新     | `PATCH /api/v2/apps/memory/profile_schemas/{schema_id}`            | `memory profile update` | 增量更新                             |
| 模板删除     | `DELETE /api/v2/apps/memory/profile_schemas/{schema_id}`           | `memory profile delete` | 不可逆                               |
| 用户画像读取 | `GET /api/v2/apps/memory/profile_schemas/{schema_id}/user_profile` | `memory profile get`    | 只读                                 |

`memory_library_id` 以 query 参数(`GET`/`DELETE`)或 body 字段(`POST`/`PATCH`)传输,由各命令按方法选择,不需要用户区分。

### 后端已具备但 CLI 未暴露

| 能力                        | 端点                                                                   | 现状                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 画像值管理(改/删单条画像值) | `PATCH /api/v2/apps/memory/profile_schemas/{schema_id}/profile_values` | 端点已在 `endpoints.ts` 中定义(`userProfileValuesPath`),但无命令引用;`profile get --need-detail true` 返回的 `item_id` 暂无 CLI 出口 |
| 事件查询                    | `GET /api/v2/apps/memory/events/{event_id}`                            | 仅作为 `memory add` 的内部轮询;`--wait 0` 拿到 `event_id` 后,用户侧无法再用 CLI 查该事件终态                                         |

这两项属于**已知缺口**而非缺陷:前者等待画像值语义定稿,后者在 `--wait 0` 场景下由 `memory list` / `memory search` 兜底。

---

## 四、约束与限额矩阵

### 4.1 本地校验(命令 `validate`,不合法直接 `USAGE` 退出)

| 字段                     | 上限                      | 生效命令                                  |
| ------------------------ | ------------------------- | ----------------------------------------- |
| `--user-id`              | 64 字符                   | `add` / `search` / `list` / `profile get` |
| `--library-id`           | 32 字符                   | 所有带该 flag 的命令                      |
| `--content`              | 512 字符                  | `add` / `update`                          |
| `--messages`             | 50 条                     | `add`                                     |
| `--project-id`           | 5 个(`--content` 仅 1 个) | `add`                                     |
| 模板 `--name`            | 32 字符                   | `profile create` / `profile update`       |
| 属性 `name`              | 32 字符                   | `profile create` / `profile update`       |
| 属性 `description`       | 128 字符                  | `profile create` / `profile update`       |
| 属性 `default_value`     | 128 字符                  | `profile create` / `profile update`       |
| `--timestamp`            | 非负整数(秒)              | `add` / `update`                          |
| `--wait`                 | 非负数(秒)                | `add`                                     |
| `--page` / `--page-size` | ≥ 1                       | `list` / `profile list`                   |
| `--top-k`                | 1–100                     | `search`                                  |

互斥与依赖关系:

- `add` 必须提供 `--messages` 或 `--content` 之一
- `add --extract-mode profile_only` 需同时给 `--profile-schema` 与 `--messages`,且不能给 `--content`
- 技能三元组 `--skill-name` / `--skill-description` / `--skill-tags` 全有或全无(`add` / `update`)
- `profile update` 至少要有一项可改字段(`--name` / `--description` / `--plan-version` / `--extract-scene` / `--attributes-operations`)

### 4.2 服务端限额(CLI 不预览,失败时按服务端错误原样透传)

| 项                            | 限额     | 说明                       |
| ----------------------------- | -------- | -------------------------- |
| add 写入                      | 120 QPM  | 账号级                     |
| search 检索                   | 300 QPM  | 账号级                     |
| 记忆 API 合计                 | 3000 QPM | 账号级                     |
| 429 处理                      | —        | 退避重试,调用间隔建议 ≥ 1s |
| `--top-k` 缺省                | 10       |                            |
| `--min-score` 缺省            | 0.3      |                            |
| `--page-size` / `--page` 缺省 | 10 / 1   |                            |

### 4.3 计费档与抽取场景

| 参数              | 取值          | 语义                                                             |
| ----------------- | ------------- | ---------------------------------------------------------------- |
| `--plan-version`  | `pro`         | rerank 开启;`search` 在两者都不传时的默认档                      |
|                   | `lite`        | rerank 关闭;`search --enable-rerank false` 单独使用也会落到 lite |
| `--extract-scene` | `efficient`   | 创建模板时的默认场景                                             |
|                   | `intelligent` | 更高成本的抽取场景                                               |

优先级:`--plan-version` 显式传入时覆盖 `--enable-rerank`;`search` 两者都不传 → pro。技能记忆 + `lite` 组合会被服务端拒绝(400)。

### 4.4 记忆类型

`--memory-types` 不传时服务端只搜 observation;要包含技能记忆必须显式 `--memory-types skill`(或两种都传)。

---

## 五、输出格式矩阵

`text`(缺省)/`--quiet` 分支逐命令实现;`json` 打印服务端原始响应。`--dry-run` 输出 `{endpoint, method, request?}`。

| 命令             | text / quiet 输出                                                                                                                                                                   | 空结果文案                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `add`            | `[ADD\|UPDATE\|DELETE] <node_id> <content>`;`user_profile <name>: <status>`;`<label>: <status> (no memory change)`;`--wait 0` 为 `Submitted: event <event_id> (N task(s) pending).` | `No memory node changed.`      |
| `search`         | `[observation\|skill] [<id>] <content> (score N)`                                                                                                                                   | `No memory nodes found.`       |
| `list`           | `[observation\|skill] [<id>] <content>`,有元数据时追加 `  meta: {...}`,末尾 `Total: N`                                                                                              | `No memory nodes found.`       |
| `node show`      | `[<id>] <content>` + `type/status`、`project`、`timestamp`、`created_at`、`updated_at`、`meta`、`media_desc`、`media_urls` 逐行                                                     | `Memory node not found.`       |
| `update`         | `Memory node <node_id> updated.`                                                                                                                                                    | —                              |
| `delete`         | `Memory node <node_id> deleted.`                                                                                                                                                    | —                              |
| `skill export`   | 直接输出节点正文(无 frontmatter);json 额外带 `skill_name` / `skill_description` / `skill_tags`                                                                                      | `Skill memory node not found.` |
| `profile create` | `Profile schema created: <schema_id>`                                                                                                                                               | —                              |
| `profile list`   | `[<schema_id>] <name> (<plan_version>)` + 描述行 + `Total: N`                                                                                                                       | `No profile schemas found.`    |
| `profile show`   | `Name:` / `Description:` / `Attributes:` + `  [<attribute_id>] <name>` + `desc:` / `default:`                                                                                       | `No attributes.`               |
| `profile update` | `Profile schema <schema_id> updated.`                                                                                                                                               | —                              |
| `profile delete` | `Profile schema <schema_id> deleted.`                                                                                                                                               | —                              |
| `profile get`    | `<name>: <value>`;`--need-detail true` 时为 `<name>: <value> (item <item_id>, <status>)`                                                                                            | `No profile data found.`       |

`--dry-run` 覆盖全部 13 条命令;`add` / `search` / `profile create` / `profile update` 的 dry-run 会带完整 `request` body,其余只带 `endpoint` + `method`。

---

## 六、风险与确认矩阵

runtime 统一为 `risk.level = "high"` 的命令注入 `--yes`(`packages/runtime/src/confirm.ts`),命令自身不声明确认 flag。

| 命令                    | 风险等级 | 风险提示(en-US)                                                                                                                           | 不带 `--yes` 的行为                                                                   |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `memory delete`         | high     | This deletes the specified memory node. Confirm the node ID before proceeding.                                                            | 返回 `ConfirmationRequiredError`,退出码 **7**,JSON 中 `type: "requires_confirmation"` |
| `memory profile delete` | high     | This permanently deletes the profile schema and its attribute definitions. Profiles already extracted for this schema become unreachable. | 同上                                                                                  |
| 其余 11 条              | —        | —                                                                                                                                         | 直接执行                                                                              |

Agent 侧硬约束:**不得自动补 `--yes`**。收到 `type: "requires_confirmation"` 时应停下,向用户复述同一动作与范围并取得显式确认后,才带 `--yes` 重跑原命令。

退出码约定(`packages/core/src/errors/codes.ts`):

| 退出码 | 常量                    | 记忆命令中的触发场景                               |
| ------ | ----------------------- | -------------------------------------------------- |
| 0      | `SUCCESS`               | 正常完成                                           |
| 1      | `GENERAL`               | 服务端 4xx/5xx、业务错码、`add` 存在 FAILED 子任务 |
| 2      | `USAGE`                 | 本地参数校验失败、JSON 参数形状不合法              |
| 3      | `AUTH`                  | 凭证缺失或无效                                     |
| 4      | `QUOTA`                 | 配额不足                                           |
| 5      | `TIMEOUT`               | `add` 轮询超出 `--wait` 预算                       |
| 6      | `NETWORK`               | DNS/TCP/TLS/代理层失败                             |
| 7      | `CONFIRMATION_REQUIRED` | 高风险命令缺 `--yes`                               |
| 10     | `CONTENT_FILTER`        | 内容安全拦截                                       |

**服务端错误不翻译**:CLI 只在超时、轮询失败聚合等自己能权威解释的场景构造语义化错误;HTTP 4xx/5xx 与业务错码的 message 原样透传。

---

## 七、异步与轮询矩阵

| 项          | 行为                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 触发命令    | 仅 `memory add`                                                                                                                           |
| 轮询间隔    | 3s(`POLL_INTERVAL_MS = 3_000`)                                                                                                            |
| 默认预算    | 120s(`DEFAULT_WAIT_SECONDS = 120`),`--wait <s>` 覆盖,`--wait 0` 立即返回                                                                  |
| 终态        | `SUCCEEDED` / `SUCCESS` / `FAILED` / `UNRECORDED`                                                                                         |
| 超时        | `BailianError(ExitCode.TIMEOUT)`,hint 指向 `memory list` / `memory search --memory-types skill` / `memory profile get`;后台任务可能仍在跑 |
| 部分失败    | 先输出已完成事件,再以 `ExitCode.GENERAL` 抛出 FAILED 事件 JSON(原样)                                                                      |
| `--verbose` | 每轮向 stderr 打印 `[poll N] <event_id> <type>=<status> ...`                                                                              |
| `--wait 0`  | 只回执 `event_id` 与 pending 任务数;后续终态需靠 `list` / `search` 侧观察                                                                 |

`memory add` 一次调用可能同时产生 ADD / UPDATE / DELETE 三类节点变更,也可能同时写出用户画像,因此 `--wait 0` + 侧查是批量导入场景的推荐组合。

---

## 八、入口差异

| 入口                                  | 是否含 memory 命令 | 说明                                           |
| ------------------------------------- | ------------------ | ---------------------------------------------- |
| `bl`(`packages/cli/src/commands.ts`)  | ✅ 13 条           | 全部记忆能力的唯一入口                         |
| `kscli`(`packages/kscli/src/main.ts`) | ❌ 0 条            | kscli 面向知识库/RAG 场景,不重映射 memory 命令 |

记忆命令仅在 `bl` 下可用;引用文档时不要写成 `kscli memory ...`。

---

## 九、能力缺口与边界一览

| 缺口                                                | 影响                                                       | 兜底方式                                           |
| --------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| 无画像值单条管理命令(`profile_values` PATCH 未暴露) | `profile get --need-detail true` 返回的 `item_id` 无法改动 | 通过再次 `memory add --profile-schema` 重新抽取    |
| 无独立事件查询命令                                  | `--wait 0` 拿到的 `event_id` 无法事后查询                  | `memory list` / `memory search` 观察结果           |
| 无记忆库管理命令                                    | 不能建库/改库                                              | 用默认库,或用 `--library-id` 指向已有库            |
| 无 project(抽取规则)管理命令                        | 不能建规则/查规则                                          | `--project-id` 由服务端侧创建后使用                |
| 无批量删除命令                                      | 逐个 `memory delete`                                       | 脚本循环;注意逐个需要 `--yes`                      |
| 删除是软删除语义                                    | 删除后节点可能仍可读(`status=delete`)                      | 以 `status` 字段判定,不要以能否 GET 到判断是否删成 |

---

## 十、文档索引

| 文档                                       | 内容                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [memory-cli-guide.md](memory-cli-guide.md) | 入口指南:核心概念、通用约定、典型工作流、错误排查、速查表                      |
| [node.md](node.md)                         | 记忆节点命令手册:`add` / `search` / `list` / `node show` / `update` / `delete` |
| [skill.md](skill.md)                       | 技能记忆命令手册:技能三元组 + `skill export`                                   |
| [profile.md](profile.md)                   | 画像模板与用户画像命令手册:`profile create\|list\|show\|update\|delete\|get`   |
| `skills/bailian-cli/reference/memory.md`   | 自动生成的参数参考(随代码更新,不要手改)                                        |
