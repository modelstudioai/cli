# memory 命令对齐 0918 契约 — 完整设计清单

> 状态:设计定稿,待开工
> 日期:2026-09-19
> 契约来源:`.local/memory-0918.md`(0918 新契约,POC 环境文档)、`.local/memory.md`(旧公开契约)
> 范围:`bl memory *` 全部命令 + `packages/core` memory 端点与类型

## 0. 定稿决策

| #   | 决策                                                                                           | 落地影响                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `memory add` **一律走 add-async**,CLI 内部轮询到终态,不暴露同步接口、不让用户手动轮询          | 移除 core 的 `memoryAddPath`;新增 `--wait`                                                                                             |
| 2   | 生产端点与代码现有前缀一致(`{workspace}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/`)     | 四个新路径直接挂 `memoryEndpoint` 下;文档中 `poc-memory` 前缀仅为测试环境                                                              |
| 3   | `min_score` 值域 **[0,1]**                                                                     | 现 search 校验不动,新文档 [0,100] 视为笔误                                                                                             |
| 4   | search 筛选键名为 **`memory_types`,数组**                                                      | `--memory-types` 可重复 flag                                                                                                           |
| 5   | add 只传 **`project_ids`**(数组),不发单数                                                      | add 的 `--project-id` 从单值改为可重复;list 查询参数仍为单数 `project_id`(该接口本来就是单值过滤,不变)                                 |
| 6   | observation 与 skill **不按类型拆分命令**,统一动词树 + 三层消化类型差异(竞品调研结论,见附录 A) | CRUD 共用 `memory add/search/list/update/delete/node`;skill 差异走 flag 组 + `--memory-types` 过滤 + `memory skill` 子命令组(独有操作) |

## 1. 命令总表

| 命令                                     | 类型           | 端点                          | 变更摘要                                                                            |
| ---------------------------------------- | -------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `memory add`                             | **重写**       | POST `/add-async`             | 全异步 + 内部轮询;tool 消息;project_ids;skill 三件套                                |
| `memory search`                          | 改造           | POST `/memory_nodes/search`   | +`--memory-types` `--query-timestamp`;出参新字段                                    |
| `memory list`                            | 改造           | GET `/memory_nodes`           | 出参透出 memory_type/status 等                                                      |
| `memory update`                          | 改造           | PATCH `/memory_nodes/{id}`    | +skill 三件套                                                                       |
| `memory node show`                       | **新增**       | GET `/memory_nodes/{id}`      | 单节点详情(复用现有 `memoryNodePath`,method GET)                                    |
| `memory skill export`                    | **新增**       | GET `/skill/export/{id}`      | skill 记忆导出                                                                      |
| ~~`memory event get`~~                   | **不透出**     | GET `/events/{event_id}`      | 轮询为纯内部实现(core 保留 `memoryEventPath`,不注册用户命令;超时后引导走结果侧查询) |
| `memory profile get`                     | 改造           | GET `.../user_profile`        | +`--need-detail`                                                                    |
| `memory profile update`                  | 改造           | PATCH `/profile_schemas/{id}` | +`--plan-version`                                                                   |
| `memory profile list`                    | 改造           | GET `/profile_schemas`        | 出参 +plan_version                                                                  |
| `memory profile value add/update/delete` | **新增(P2-b)** | PATCH `.../profile_values`    | 画像值项增删改,设计就绪待拍板                                                       |
| `memory project create/list/show/update` | **新增(P2-a)** | `/memory_projects`            | 抽取规则管理,设计就绪待拍板                                                         |

## 2. 逐命令设计

### 2.1 `memory add`(重写,核心)

```
bl memory add --user-id <id> (--messages <json> | --content <text>) [flags]
```

**Flags**

| Flag                                     | 类型              | 必填   | 说明                                                                                                                                                                           |
| ---------------------------------------- | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--user-id`                              | string            | 是     | 沿用,≤64 字符                                                                                                                                                                  |
| `--messages`                             | json              | 二选一 | **扩展**:role 支持 `user`/`assistant`/`tool`;assistant 可带 `tool_calls`(OpenAI 标准),tool 必带 `tool_call_id`;content 支持 string\|多模态数组(`MemoryContentPart` 类型已就绪) |
| `--content`                              | string            | 二选一 | 沿用,≤512 字符                                                                                                                                                                 |
| `--project-id`                           | **array(可重复)** | 否     | **语义变更**:1..N 个,统一序列化为 `project_ids` 数组,永不发单数                                                                                                                |
| `--profile-schema`                       | string            | 否     | 沿用;add-async 入参兼容,一次提交同时抽取画像                                                                                                                                   |
| `--skill-name` / `--skill-description`   | string            | 条件   | **新增**,三件套 all-or-nothing(skill 项目 + custom_content 时服务端强制,CLI 本地只做结构校验)                                                                                  |
| `--skill-tags`                           | array(可重复)     | 条件   | 同上                                                                                                                                                                           |
| `--meta-data`                            | json              | 否     | 沿用                                                                                                                                                                           |
| `--timestamp`                            | number            | 否     | 秒级;**示例请求体有、参数表未列 → 纳入但标注 live 验证**(见待拍板 #3)                                                                                                          |
| `--wait`                                 | number            | 否     | **新增**,默认 120 秒;轮询预算,`--wait 0` = 提交后立即打印 event_id 返回(照顾批量脚本)                                                                                          |
| `--memory-library-id` / `--workspace-id` | string            | 否     | 沿用                                                                                                                                                                           |

**行为流程**

1. `POST /add-async` → 拿 `event_id` + `events[]`(PENDING)
2. 内部轮询 `GET /events/{event_id}`,间隔 3s,直到全部 event 终态或 `--wait` 预算耗尽(`--verbose` 时输出轮询进度)
3. 终态判定:`SUCCEEDED` / `FAILED` / `UNRECORDED` 均视为终态(UNRECORDED 输出提示;若 live 验证发现会转移再改)
4. **text 输出**(保持旧观感):observation/skill 的 result 逐条 `[ADD|UPDATE|DELETE] <node_id> <content>`;profile event 单独一行 `profile <resource_id>: SUCCEEDED`
5. **json 输出**:`{ request_id, event_id, events }` 整体透传
6. **部分失败**:先输出已完成部分,再以 `BailianError(GENERAL)` 退出,message 原样透传失败 event 信息(服务端错误不翻译)
7. **超时**:`BailianError(TIMEOUT)`,message 携带 event_id(仅报障定位)+ 结果侧引导语(“抽取可能仍在后台进行,稍后用 `memory list` / `memory search` / `memory profile get` 查看结果”)
8. `--dry-run`:输出 `{ endpoint: <add-async URL>, method: POST, request: body }`——**注意既有 e2e 断言的端点要从 `/add` 改为 `/add-async`**

**本地校验**(dry-run 需执行完整本地校验)

- messages/content 二选一(沿用)
- role 白名单 {user, assistant, tool};`role=tool` 必须带 `tool_call_id`;`tool_calls[].{id, function.name, function.arguments}` 结构校验
- skill 三件套要么全传要么全不传
- `--wait ≥ 0`;既有长度校验(user_id/content/library-id)全部保留

### 2.2 轮询接口不透出(定稿)

`GET /events/{event_id}` 降级为纯内部实现:add 轮询在命令实现内部调用(core 保留 `memoryEventPath` 端点函数),**不注册 `memory event get` 用户命令**。理由:

- event 是过程记录,不是用户心智模型里的对象;超时后想知道结果,结果侧命令全覆盖(observation → `memory list`/`search`,skill → `search --memory-types skill`,画像 → `profile get`,单节点 → `node show`)
- 契约文档中 GetEvent 定位是服务端 QA 手段("开发 ots 查询"),非对客 API,且 status 枚举本身有笔误(SUCCESS/SUCCEEDED 不一致)
- 与"不让用户根据 eventId 轮询"的既定哲学一致;不透出是保守方向,未来需要时加命令是纯增量,先透出再下线则是破坏性变更
- add 超时错误的 message 携带 event_id 仅用于报障定位,并引导走结果侧查询(见 §2.1 第 7 条)

### 2.3 `memory search`(改造)

| 变更                | 内容                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--memory-types`    | **新增**,可重复,choices `observation`/`skill`;**不传则不发**(服务端默认 `["observation"]`);键名 `memory_types`(已确认) |
| `--query-timestamp` | **新增**,秒级时间戳,rewrite 阶段使用                                                                                   |
| `min_score`         | **不变**,[0,1] 校验保留(已确认口径)                                                                                    |
| `--project-id`      | 不变(已是可重复 → `project_ids`)                                                                                       |
| 出参                | 类型补 `plan_version`(回显)、节点 `memory_type`/`status`/`score`;text 行追加 memory_type 前缀与 score;json 透传        |

### 2.4 `memory list`(改造)

- **无 flag 变更**(查询参数维持单数 `project_id`)
- 类型补 `memory_type`/`status`/`timestamp`/`project_id`/`meta_data`;text 行加 memory_type 前缀;json 透传

### 2.5 `memory update`(改造)

- **新增** `--skill-name` / `--skill-description` / `--skill-tags`(可重复),all-or-nothing 本地校验;节点为 skill 类型时服务端强制三件套,类型判定交给服务端
- 其余(node-id/user-id/content/timestamp/meta-data)全部沿用

### 2.6 `memory node show`(新增)

```
bl memory node show --node-id <id>
```

- `GET /memory_nodes/{node_id}`(复用 `memoryNodePath`,无 user_id 查询参数)
- 输出全字段:content、memory_type、status、timestamp、created_at/updated_at、project_id、meta_data、media_desc、media_urls
- 定位:list/search 之后看单节点详情,也是 update 前确认 skill 类型的入口

### 2.7 `memory skill export`(新增)

```
bl memory skill export --node-id <id>
```

- `GET /skill/export/{memory_node_id}`,响应为 memory_node 对象(文档注明与节点详情基本一致,但语义独立,单独成命令)
- text 直接输出 content(即"技能:…;描述:…;标签:…"导出内容);json 透传

### 2.8 `memory profile get`(改造)

- **新增** `--need-detail <bool>`(boolean value flag,风格同 `--enable-rerank`)
- detail 模式出参:`attributes[].value_items[]{item_id, status, value, need_evidence?}`;text 逐项 `<attr>: <value> (item <id>, <status>)`
- 类型注意:detail 响应里 `need_evidence` 文档已划掉但示例仍返回 → 类型作 optional 透传,text 不展示;两种模式 schema 字段大小写不一致(默认模式 `schemaName` camelCase,detail 模式 `schema_name`)→ JSON 原样透传,text 不读该字段,不做归一化

### 2.9 `memory profile update`(改造)

- **新增** `--plan-version`(复用 `PLAN_VERSION_FLAG`)
- validate 改为:`--name` / `--description` / `--plan-version` / `--attributes-operations` 至少一项(服务端"至少一个可更新字段"口径对齐)

### 2.10 `memory profile list`(改造)

- 响应类型 `ProfileSchemaSummary` + `plan_version`;text 行尾追加 `(pro|lite)`;json 透传

### 2.11 `memory profile value add/update/delete`(P2-b,设计就绪)

三个叶子命令共用一份实现(与 profile 系列风格一致,优于单命令带 `--op`):

```
bl memory profile value add    --schema-id <id> --entity-id <id> --attribute-id <id> --value <text>
bl memory profile value update --schema-id <id> --entity-id <id> --attribute-id <id> --item-id <n> --value <text>
bl memory profile value delete --schema-id <id> --entity-id <id> --attribute-id <id> --item-id <n>
```

- `PATCH /profile_schemas/{id}/profile_values`,body 含 `op_type`/`entity_id`/`attribute_id`/`item_id`/`value`
- 与 `--need-detail` 配套闭环:detail 拿 item_id → value 命令操作
- 条件必填本地校验(add 不需要 item_id;update/delete 必须)

### 2.12 `memory project create/list/show/update`(P2-a,设计就绪)

```
bl memory project create --name <name> [--memory-type observation|skill] [--support-multi-modal <bool>]
                          [--plan-version pro|lite] [--instruction-type default|custom] [--custom-instruction <text>]
                          [--expired-in-days <n>] [--auto-refresh <bool>]
bl memory project list   [--memory-type observation|skill] [--page <n>] [--page-size <n>]
bl memory project show   --project-id <id>
bl memory project update --project-id <id> [--name ...] [--plan-version ...] [--support-multi-modal <bool>] ...
```

- 约束:skill 项目 `instruction_type` 只能 default/不传(本地校验);update 至少一个可更新字段;list 不传 memory_type 时服务端默认只列 observation(需显式传 skill 才列技能项目)
- **做不做待产品拍板**;不做则 skill 链路的 project_id 只能源自控制台

## 3. core 层变更

**endpoints.ts**(`packages/core/src/client/endpoints.ts`)

| 函数                              | 路径                                                      | 动作                                       |
| --------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `memoryAddAsyncPath()`            | `/api/v2/apps/memory/add-async`                           | 新增                                       |
| `memoryEventPath(eventId)`        | `/api/v2/apps/memory/events/{id}`                         | 新增                                       |
| `memorySkillExportPath(nodeId)`   | `/api/v2/apps/memory/skill/export/{id}`                   | 新增                                       |
| `userProfileValuesPath(schemaId)` | `/api/v2/apps/memory/profile_schemas/{id}/profile_values` | 新增                                       |
| `memoryAddPath()`                 | `/api/v2/apps/memory/add`                                 | **移除**(仅 add.ts 消费,core 无外部消费者) |

**types/api.ts**(`packages/core/src/types/api.ts`)

- `MemoryMessage`:`role: "user"|"assistant"|"tool"` + `tool_calls?` / `tool_call_id?`;新增 `MemoryToolCall`(OpenAI 标准)
- `MemoryAddRequest`:`project_id` → `project_ids?: string[]`;+skill 三件套、`timestamp?`
- 新增:`MemoryAddAsyncResponse`、`MemoryEvent`(status 枚举 PENDING/SUCCEEDED/FAILED/UNRECORDED + `result?: MemoryEventResult[]`)、`MemoryEventResult`(**注意 wire 字段是 camelCase `memoryType`**,与整体 snake_case 不一致,类型照抄 wire)、`MemoryNodeDetailResponse`
- `MemoryNode` += `timestamp`/`project_id`/`memory_type`/`status`/`score`/`media_desc`/`media_urls`
- `MemorySearchRequest` += `memory_types`/`query_timestamp`;`MemorySearchResponse` += `plan_version`
- `ProfileSchemaUpdateRequest`/`ProfileSchemaSummary` += `plan_version`
- `UserProfileAttribute` += `value_items`;新增 `UserProfileValueUpdateRequest`
- (P2)`MemoryProject` 系列类型

## 4. 输出 / 错误 / 轮询约定

- 轮询:间隔 3s,默认预算 120s(`--wait` 覆盖,0 = 不等待);超时 → `BailianError(TIMEOUT)` 且 message 带 event_id
- 服务端错误(含 FAILED、HTTP 4xx/5xx、业务错码)一律**原样透传**,不翻译
- 新文案全部 en-US/zh-CN 双语

## 5. e2e 测试计划

| 类别          | 内容                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dry-run 断言  | 每个新 flag 的映射断言;add 端点从 `/add` 改断 `/add-async`;`tests/e2e/memory/shared.ts` 的 `MemoryDryRunBody` 补 `memory_types`/`query_timestamp`/`skill_*`/`need_detail` |
| **单测**      | 轮询 helper(mock client):正常终态 / 超时 / 部分 FAILED / UNRECORDED / `--wait 0`                                                                                          |
| live 自清理链 | add(自动轮询到结果)→ list → node show → update → search → delete;profile 链复用现有模式 + `--need-detail` 断言 value_items                                                |
| skill 链      | 新 env var `BAILIAN_E2E_MEMORY_SKILL_PROJECT_ID` gating(skill 项目无法 CLI 创建,fixture 预置);未设置则跳过;非加白账号的报错透传可作一条负向断言                           |
| 更新          | 既有 11 个 memory e2e 文件中受端点/参数影响的断言逐个过一遍                                                                                                               |

## 6. 注册与配套

`packages/commands/src/index.ts` 导出 → `packages/cli/src/commands.ts` 注册(kscli 无 memory 命令,维持) → e2e `topic-routes.ts` → `pnpm run sync:skill-assets` 再生成 reference → CHANGELOG(中英)。无新增高风险命令,delete 的 risk gate 不变。

## 7. 待拍板

| #   | 事项                                           | 状态/建议                                                 |
| --- | ---------------------------------------------- | --------------------------------------------------------- |
| 1   | ~~`memory event get` 保留与否~~                | **已定:不透出**(见 §2.2)                                  |
| 2   | P2-a project / P2-b profile value 是否纳入本期 | 设计已就绪,随时可并入;project 不做则 skill 前置依赖控制台 |
| 3   | add 的 `--timestamp`                           | 纳入(live 验证兜底);示例有、参数表无                      |
| 4   | 轮询默认值                                     | 预算 120s / 间隔 3s(文档示例抽取耗时 30–45s),可调         |

## 8. 实现顺序

core 端点/类型 → add 重写 + 轮询 helper(含单测)→ 各改造命令(search/list/update/profile×3)→ 新增命令(node show / skill export)→ e2e → skill 资产再生成 → CHANGELOG

## 附录 A:observation / skill 是否拆分命令 — 竞品调研结论(2026-09-19 定稿)

> 议题:事实记忆(observation)和 skill 记忆目前共用 `memory xxx`,画像用 `memory profile xxx`。是否把 skill 也拆出独立命名空间?
> 动议理由:即使同为记忆,observation 与 skill 的入参出参存在差异。
> 数据来源:钉钉 AI 表格「竞品 CLI 能力对比」(横向矩阵 46 项能力 × 6 家 + 5 个竞品命令详表)、mem0 CLI / LangMem 官方文档调研。

### A.1 竞品实况:6 家无一按"记忆类型"拆命令

| 竞品            | 命令树组织                                                                                                  | 类型差异的处理方式                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mem0            | 扁平动词树 `add/search/get/list/update/delete/import` + `entity`/`event` 资源族分组                         | categories 是 flag(`add --custom-categories`、`list --category`、`search --filter`);行为差异也是 flag(`--no-infer`、`--immutable`)                |
| VikingCLI(火山) | 两级:`memory add-session/search/setup` + `memory collection *`                                              | 无类型拆分;collection 是**容器**资源族,不是类型                                                                                                   |
| MemU            | 扁平 `retrieve/commit/prepare/list-files`                                                                   | 记忆与技能统一在 commit 的 Markdown 内容里,命令层无类型概念                                                                                       |
| Hindsight       | `memory retain/recall/reflect/history` + 资源族分组 `bank`/`entity`/`document`/`operation`/`knowledge-base` | 有 observation 与 fact-type 体系,但仍是统一入口 + flag(`recall --fact-type --tags`);抽取策略差异走 `retain --strategy <name>`                     |
| Memvid          | 完全扁平 `put/find/update/delete/facts/ask/state/timeline`                                                  | 四层元数据 flag:`--title/--track/--tag/--label`                                                                                                   |
| LangMem         | 统一 store + namespace + metadata 过滤                                                                      | semantic/episodic/procedural 三分类是概念层;唯一独立 API 是 procedural 的 `create_prompt_optimizer`——因**操作语义**不同(优化 prompt,非 CRUD 条目) |

**规律**:竞品拆子命令组的依据全部是「资源族 / 操作语义」——容器(bank/collection)、派生对象(entity)、原始素材(document)、过程对象(event/operation)。没有任何一家把"记忆类型"作为命令树分支。与我们场景最接近的 Hindsight 明确有 observation/fact-type 类型体系,仍走统一 `memory retain/recall`。

### A.2 差异量化:0918 契约下 observation vs skill

| 接口                           | 差异                                                                         | 重合度 |
| ------------------------------ | ---------------------------------------------------------------------------- | ------ |
| `add-async` 入参               | skill 多 3 个字段(skill_name/description/tags,skill 节点模式必传),其余全同   | ~90%   |
| `add-async` 出参               | 完全相同(event_id + events[],`resource_type` 区分 skill/observation/profile) | 100%   |
| `search`                       | 同一接口,`memory_types` 数组过滤;出参 skill 节点多几个字段                   | ~95%   |
| `list` / `update` / `node get` | 同一接口,`memory_type` 字段区分;update 时 skill 三件套可改                   | ~95%   |
| skill 独有操作                 | 仅 `GET /skill/export/{id}` 一个                                             | —      |

真实差异量级 = **3 个条件必填 flag + 1 个过滤 flag + 1 个独有操作**,属"flag 组"级别,不足以支撑"命令"级别拆分。

### A.3 定稿:不拆 CRUD,三层消化类型差异

```
bl memory add --skill-name X --skill-description Y --skill-tags a,b   ← ① flag 组(all-or-nothing 校验)
bl memory search --memory-types skill                                  ← ② 类型过滤 flag
bl memory skill export --node-id N                                     ← ③ skill 独有操作进 skill 子命令组
```

合理性:

1. **对齐竞品共识**:6 家全部统一入口,拆分将成为业界孤例
2. **对齐 API 契约**:服务端就是一个 AddMemory/SearchMemory;`memory_types` 数组过滤的存在本身就是统一入口的设计意图,混合检索(一次查 observation+skill)在拆分方案下无处安放
3. **给 skill 留生长点**:`memory skill` 命名空间因 export 而存在,未来 skill 独有操作(审核、版本、批量导出)自然加入,不动主 CRUD 树——即 Hindsight `entity`/`document`/`knowledge-base` 的演化路径(按操作语义分组,而非按类型分组)

profile 独立不受影响:它是另一个资源族(schema/values 有独立生命周期),与"类型拆分"是两回事,竞品同样如此(Mem0 entity、Hindsight bank 均为资源族独立)。

### A.4 重新评估拆分的触发条件

满足任一条件时重启拆分讨论:

- skill 与 observation 的参数重合度跌破 ~50%
- skill 独有操作 ≥ 3 个(当前仅 1 个:export)

### A.5 附注:钉钉差距表基于旧契约

「CLI与API能力对照」表中"AddMemory 同步阻塞无异步体系"、"数据面无 GetMemoryNode"两条在 0918 契约下已过时(add-async + events、GetMemoryNode 数据面接口均已提供),正是本期落地内容;其余 P0/P1 差距项(meta_data 封装、按 project 过滤、画像模板 list/get)与本设计方向一致。
