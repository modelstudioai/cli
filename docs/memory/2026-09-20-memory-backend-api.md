# 长期记忆后端 API（对齐稿）

> 日期: 2026-09-20；最后复核: 2026-09-21
> 来源: `.local/memory.md`（旧公开契约）+ `.local/memory-0918.md`（0918 新契约）+ `.local/memory-0921.md`（后端修订）+ CLI 代码对齐 + **生产环境 live 验证**
> 生产 Host: `https://{workspace_id}.cn-beijing.maas.aliyuncs.com`
> 路径前缀: `/api/v2/apps/memory/`
>
> 本文档是给后端的对齐后接口契约。POC 环境文档里的 `poc-dashscope.aliyuncs.com/api/v2/apps/poc-memory/` 仅为测试前缀。标「live」的口径已在 `{workspace_id}.cn-beijing.maas.aliyuncs.com` 实测。

## 0921 复核与证据边界

本次复核覆盖新版契约和生产 HTTP wire。新增结论优先于旧稿中的历史说明。验证证据见同目录 `2026-09-21-memory-live-verify.md` 和 `2026-09-21-memory-live-verify.json`。

- **已实测修正**：PATCH/DELETE 不要求 `user_id`；PATCH 省略 `timestamp` 保留旧值；错误体为 `{request_id, code, message}`；删除节点后 Get 可返回 `status="delete"`。
- **已实测补充**：`extract_mode=profile_only`、`project_ids` 最多 5 项、Search 单数别名、实体/画像删除范围，以及旧 `enable_rerank` 对生效计划的影响。
- **开放范围**：0921 将 `timestamp`、`query_timestamp`、`custom_instructions`、`expired_in_days`、`auto_refresh`（Add 入参）、`immutable` 标为内部；`need_detail`、画像值修改和项目/实体管理标为暂未对客。接口可调用不代表已公开，不自动据此扩展 CLI。
- **历史字段**：旧稿中的长度上限、限流、`enable_judge`/`enable_rewrite` 行为未全部重测；0921 未提及不等于已废弃，也不应把旧说明写成新契约已确认。
- **删除模板**：0921 遗漏 DeleteProfileSchema；本轮 DELETE 清理 4 个临时模板均为 200，继续保留为实测能力，公开状态待后端确认。

## 公共请求信息

| 参数         | 说明                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| Base URL     | `https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/` |
| workspace_id | 业务空间 ID，构成 Host 域名前缀，形如 `llm-xxxxxxxx`                      |
| 认证         | Header `Authorization: Bearer $DASHSCOPE_API_KEY`                         |
| Content-Type | `application/json`                                                        |

0921 所列公共生产地址 `https://dashscope.aliyuncs.com/api/v2/apps/memory` 已通过列表及错误响应探针；上述 workspace 域名完成完整验证。未对公共地址重跑全部写接口。

成功响应包含 `request_id`。本轮 400/404 返回 JSON：`{"request_id":"...","code":"InvalidParameter","message":"..."}`，响应头有 `x-request-id`。未见 0921 写的 `request_id` / `status_name` / `status_message` 三个响应头；客户端应读取 JSON 错误体，保留 HTTP 状态码。

账号级限流（历史契约，本轮未压测）：全部记忆接口合计不超过 3000 QPM；Add 120 QPM；Search 300 QPM。

## 对齐口径（相对 0918 / 旧公开文档的修正）

| #   | 事项                        | 对齐后口径                                                                                                                                                                                                             | live                             |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Add 主路径                  | 新链路走 **POST `/add-async`**。同步 POST `/add` 仍保留（参数/行为不变），但不作为新能力入口                                                                                                                           | 已通                             |
| 2   | `min_score`                 | 值域 **`[0, 1]`**。0918 写成 `[0, 100]` 视为笔误                                                                                                                                                                       | 已通，score 为 0~1 小数          |
| 3   | Search 类型筛选             | 键名 **`memory_types`**，类型 `Array[String]`。0918 示例里的 `"memory_type": "observation"` 为笔误                                                                                                                     | 已通                             |
| 4   | Add 项目隔离                | **`messages` 走 `project_ids` 数组**；**`custom_content` 只能走单数 `project_id`**。live 实测：`custom_content` + `project_ids` 返回 `InvalidParameter`（`custom_content can only be bound to one project`）。二者互斥 | **文档原口径错误，已按 live 改** |
| 5   | Search / List 项目隔离      | Search 用 **`project_ids` 数组**。List 查询参数仍为单数 `project_id`。不传 `project_id` 时 List 只返回默认 observation 规则下的节点，**不会列出 skill 节点**                                                           | 已通                             |
| 6   | Add `timestamp`             | 纳入入参（秒级 Unix 时间戳）。0918 参数表未列、示例请求体有                                                                                                                                                            | 已通，节点 `timestamp` 回显该值  |
| 7   | Search 旧公开能力           | 保留 `enable_rerank` / `enable_judge` / `enable_rewrite` / `plan_version`。`plan_version` 优先；未传时显式 `enable_rerank=false` 为 `lite`，`true` 为 `pro`，二者均省略为 `pro`                                        | 已通                             |
| 8   | Event 状态                  | 提交时 `PENDING` → 轮询中 **`RUNNING`** → 终态 `SUCCEEDED` / `FAILED` / `UNRECORDED`。0918 参数表漏了 `RUNNING`；本环境未复现 `SUCCESS` 变体                                                                           | **已改**                         |
| 9   | Event result 字段           | **`memory_type`（snake_case）**，不是 0918 示例的 camelCase `memoryType`                                                                                                                                               | **文档原口径错误，已按 live 改** |
| 10  | GetUserProfile 大小写       | 本环境默认模式与 `need_detail` 均为 snake_case（`request_id` / `schema_name`）。0918 默认模式 camelCase 未复现。`need_evidence` 本环境未返回                                                                           | **已改**                         |
| 11  | `resource_type`             | 不是简单的 observation/skill/profile。live：`observation` / `skill` / **`user_profile`** / **`custom_observation`** / **`custom_skill`**                                                                               | **已改**                         |
| 12  | ListMemoryProjects 默认过滤 | 0918 写「不传 memory_type 默认 observation」。live **不传会同时列出 observation 和 skill**                                                                                                                             | **已改**                         |

## 接口概览

| 接口名称                | 方法   | 路径                                                  | 说明                                   |
| ----------------------- | ------ | ----------------------------------------------------- | -------------------------------------- |
| AddMemory               | POST   | `/add-async`                                          | 异步添加记忆（事实 / 技能 / 画像抽取） |
| GetEvent                | GET    | `/events/{event_id}`                                  | 查询异步任务状态与结果                 |
| SearchMemory            | POST   | `/memory_nodes/search`                                | 按对话语义搜索记忆                     |
| ListMemory              | GET    | `/memory_nodes`                                       | 分页列出记忆                           |
| GetMemoryNode           | GET    | `/memory_nodes/{memory_node_id}`                      | 查询单个记忆节点                       |
| UpdateMemory            | PATCH  | `/memory_nodes/{memory_node_id}`                      | 更新记忆节点                           |
| DeleteMemory            | DELETE | `/memory_nodes/{memory_node_id}`                      | 删除记忆节点                           |
| GetSkillExport          | GET    | `/skill/export/{memory_node_id}`                      | 导出 skill 类型记忆                    |
| GetUserProfile          | GET    | `/profile_schemas/{profile_schema_id}/user_profile`   | 获取用户画像                           |
| UpdateUserProfileValues | PATCH  | `/profile_schemas/{profile_schema_id}/profile_values` | 画像值项增删改                         |
| CreateProfileSchema     | POST   | `/profile_schemas`                                    | 创建画像模板                           |
| ListProfileSchemas      | GET    | `/profile_schemas`                                    | 分页列出画像模板                       |
| GetProfileSchema        | GET    | `/profile_schemas/{profile_schema_id}`                | 画像模板详情                           |
| UpdateProfileSchema     | PATCH  | `/profile_schemas/{profile_schema_id}`                | 更新画像模板                           |
| DeleteProfileSchema     | DELETE | `/profile_schemas/{profile_schema_id}`                | 删除画像模板                           |
| CreateMemoryProject     | POST   | `/memory_projects`                                    | 创建记忆项目（非对客）                 |
| ListMemoryProjects      | GET    | `/memory_projects`                                    | 列出记忆项目（非对客）                 |
| GetMemoryProject        | GET    | `/memory_projects/{project_id}`                       | 记忆项目详情（非对客）                 |
| UpdateMemoryProject     | PATCH  | `/memory_projects/{project_id}`                       | 更新记忆项目（非对客）                 |
| DeleteEntity            | DELETE | `/entities/{entity_type}/{entity_id}`                 | 删除实体全部记忆（暂不对客）           |
| DeleteEntityProfile     | DELETE | `/entities_profile/{entity_type}/{entity_id}`         | 仅删除实体画像（暂不对客）             |

兼容接口（行为不变，新调用方不必使用）：

| 接口名称          | 方法 | 路径   | 说明                                                                  |
| ----------------- | ---- | ------ | --------------------------------------------------------------------- |
| AddMemory（同步） | POST | `/add` | 同步添加记忆；参数与旧公开契约一致，不含 skill / tool / `project_ids` |

---

# 一、记忆节点

## AddMemory

**接口路径：** `POST /api/v2/apps/memory/add-async`

**接口描述：** 提交异步抽取任务，将对话记录或自定义内容转化为记忆。一次提交可同时产生多条任务（事实抽取、技能抽取、画像抽取）。返回 `event_id` 后，调用方轮询 GetEvent 直到全部任务到达终态。

`messages` 与 `custom_content` 必填其一；传了 `custom_content` 时服务端忽略 `messages`，直接保存自定义内容。

**项目 ID 怎么传（live）：**

- 用 `messages` 抽取：传 `project_ids`（数组），可绑多个项目
- 用 `custom_content` 直存：只能传单数 `project_id`。传 `project_ids` 会 400：`custom_content can only be bound to one project, project_ids is not supported when custom_content is provided.`

skill 项目 + `custom_content` 时，`skill_name` / `skill_description` / `skill_tags` 必须同时传入，否则报错。

### 入参

| 参数                                       | 位置 | 类型            | 必填                     | 说明                                                                                                                        |
| ------------------------------------------ | ---- | --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| user_id                                    | Body | String          | 是                       | 子用户 / 记忆实体 ID，用于隔离，最大 64 字符                                                                                |
| messages                                   | Body | Array           | 与 custom_content 二选一 | 对话记录，最多 50 条（一问一答算 2 条）                                                                                     |
| messages[].role                            | Body | String          | 是（有 messages 时）     | `user` / `assistant` / `tool`                                                                                               |
| messages[].content                         | Body | String \| Array | 否                       | 文本或 multimodal 数组（参考 Omni 入参）                                                                                    |
| messages[].tool_calls                      | Body | Array           | 否                       | OpenAI 标准 tool_call 列表，assistant 消息可带                                                                              |
| messages[].tool_calls[].id                 | Body | String          | 是（有 tool_calls 时）   | tool call id                                                                                                                |
| messages[].tool_calls[].type               | Body | String          | 否                       | 固定 `function`                                                                                                             |
| messages[].tool_calls[].function.name      | Body | String          | 是（有 tool_calls 时）   | 函数名                                                                                                                      |
| messages[].tool_calls[].function.arguments | Body | String          | 否                       | 函数参数 JSON 字符串                                                                                                        |
| messages[].tool_call_id                    | Body | String          | 条件                     | `role=tool` 时必填，对应 `tool_calls[].id`                                                                                  |
| custom_content                             | Body | String          | 与 messages 二选一       | 自定义内容，最大 512 字符；传入则不基于 messages 抽取                                                                       |
| memory_library_id                          | Body | String          | 否                       | 记忆库 ID，最大 32 字符；不传则用默认记忆库                                                                                 |
| project_ids                                | Body | Array[String]   | 否                       | 记忆片段规则 ID 列表，**仅 `messages` 抽取时使用**。不传则用该记忆库默认规则。与 `project_id` 互斥；最多 5 项，6 项实测 400 |
| project_id                                 | Body | String          | 否                       | 单数规则 ID。**`custom_content` 时必须用这个，不能用 `project_ids`**                                                        |
| profile_schema                             | Body | String          | 否                       | 画像模板 ID；需要同时抽取用户画像时必填                                                                                     |
| extract_mode                               | Body | String          | 否                       | `profile_only` 仅抽画像，必须传 `profile_schema` 与 `messages`；实测仅产生 user_profile 任务                                |
| custom_instructions                        | Body | String          | 否                       | 内部参数，0921 新增，自定义抽取指令；本轮未验证其效果                                                                       |
| expired_in_days                            | Body | Integer         | 否                       | 内部参数，0921 新增，过期天数；本轮未验证其效果                                                                             |
| auto_refresh                               | Body | Boolean         | 否                       | 内部参数，0921 新增，是否自动刷新；本轮未验证其效果                                                                         |
| meta_data                                  | Body | Object          | 否                       | 用户自定义元信息                                                                                                            |
| skill_name                                 | Body | String          | 条件                     | skill 三件套之一。skill 项目 + custom_content 时必传三件套                                                                  |
| skill_description                          | Body | String          | 条件                     | skill 三件套之一                                                                                                            |
| skill_tags                                 | Body | Array[String]   | 条件                     | skill 三件套之一                                                                                                            |
| timestamp                                  | Body | Long            | 否                       | 记忆对应事件发生时的秒级 Unix 时间戳；不填默认当前系统时间                                                                  |

### 出参

| 参数                       | 类型   | 说明                                      |
| -------------------------- | ------ | ----------------------------------------- |
| request_id                 | String | 请求 ID                                   |
| event_id                   | String | 异步任务事件 ID，用于 GetEvent 轮询       |
| events                     | Array  | 本次提交产生的任务列表                    |
| events[].created_at        | Long   | 创建时间（秒级）                          |
| events[].updated_at        | Long   | 状态最后更新时间（秒级）                  |
| events[].event_id          | String | 事件 ID，与顶层 `event_id` 相同           |
| events[].event_type        | String | 事件类型，如 `ADD_ASYNC`                  |
| events[].memory_library_id | String | 记忆库 ID                                 |
| events[].resource_id       | String | 来源 ID：project_id 或 profile_schema_id  |
| events[].resource_type     | String | 见下表                                    |
| events[].status            | String | 提交时 `PENDING`；轮询中变为 `RUNNING`    |
| events[].result            | Array  | 提交时即为空数组 `[]`，成功后填入变更记录 |
| events[].user_id           | String | 子用户 ID                                 |

普通模式下 `project_ids` / `project_id` / `profile_schema` 对应返回的任务；`extract_mode=profile_only` 只产生画像任务。live 实测 `resource_type`：

| 入参                              | resource_type                    |
| --------------------------------- | -------------------------------- |
| messages + 默认/observation 项目  | `observation`                    |
| messages + skill 项目             | `skill`                          |
| custom_content + observation 项目 | `custom_observation`             |
| custom_content + skill 项目       | `custom_skill`                   |
| 传入 profile_schema               | `user_profile`（不是 `profile`） |

### 请求示例

```bash
curl -X POST "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/add-async" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "user_id": "user_001",
    "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
    "project_ids": ["a0edbcba8c4a4daa83f795f7dd4dc78b"],
    "profile_schema": "8e73a84011a7420bb25b4d790e0b2644",
    "timestamp": 1747278460,
    "messages": [
      {"role": "user", "content": "你好"},
      {"role": "assistant", "content": "你好，有什么可以帮您"},
      {"role": "user", "content": "每天上午11点提醒我点外卖，明天提醒我穿衣服。"},
      {"role": "assistant", "content": "没问题"},
      {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {
              "name": "update_memory",
              "arguments": "{\"text\":\"明天穿衣服\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": "{\"ok\":true}"
      }
    ],
    "meta_data": {
      "location_name": "北京",
      "geo_coordinate": "116.481499,39.990475"
    }
  }'
```

响应：

```json
{
  "request_id": "048983ff-ed50-96e0-b0a6-482cce26cbe3",
  "event_id": "9d30e77a2f8e42378bf533406fdc09d9",
  "events": [
    {
      "created_at": 1784638015,
      "event_id": "9d30e77a2f8e42378bf533406fdc09d9",
      "event_type": "ADD_ASYNC",
      "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
      "resource_id": "a0edbcba8c4a4daa83f795f7dd4dc78b",
      "resource_type": "observation",
      "result": [],
      "status": "PENDING",
      "updated_at": 1784638015,
      "user_id": "user_001"
    },
    {
      "created_at": 1784638015,
      "event_id": "9d30e77a2f8e42378bf533406fdc09d9",
      "event_type": "ADD_ASYNC",
      "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
      "resource_id": "8e73a84011a7420bb25b4d790e0b2644",
      "resource_type": "user_profile",
      "result": [],
      "status": "PENDING",
      "updated_at": 1784638015,
      "user_id": "user_001"
    }
  ]
}
```

skill 自定义内容示例：

```bash
curl -X POST "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/add-async" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "user_id": "user_001",
    "project_id": "skill_project_xxx",
    "custom_content": "整理会议纪要",
    "skill_name": "会议纪要整理",
    "skill_description": "自动提取会议重点并生成摘要",
    "skill_tags": ["办公", "总结"]
  }'
```

---

## GetEvent

**接口路径：** `GET /api/v2/apps/memory/events/{event_id}`

**接口描述：** 查询 AddMemory 异步任务详情。提交后轮询本接口，直到 `events[]` 全部到达终态。

状态机（live）：`PENDING`（提交回执）→ `RUNNING`（处理中）→ `SUCCEEDED` / `FAILED` / `UNRECORDED`。0918 示例里的 `SUCCESS` 本环境未出现。`result` 在 PENDING/RUNNING 时为空数组 `[]`，成功后填入变更记录。

### 入参

| 参数     | 位置 | 类型   | 必填 | 说明            |
| -------- | ---- | ------ | ---- | --------------- |
| event_id | Path | String | 是   | 异步任务事件 ID |

### 出参

| 参数                             | 类型   | 说明                                                                                                          |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| request_id                       | String | 请求 ID                                                                                                       |
| events                           | Array  | 事件列表                                                                                                      |
| events[].created_at              | Long   | 创建时间                                                                                                      |
| events[].updated_at              | Long   | 更新时间                                                                                                      |
| events[].event_id                | String | 事件 ID                                                                                                       |
| events[].event_type              | String | 事件类型                                                                                                      |
| events[].memory_library_id       | String | 记忆库 ID                                                                                                     |
| events[].resource_id             | String | 资源 ID（project / profile）                                                                                  |
| events[].resource_type           | String | `observation` / `skill` / `user_profile` / `custom_observation` / `custom_skill`                              |
| events[].status                  | String | `PENDING` / `RUNNING` / `SUCCEEDED` / `FAILED` / `UNRECORDED`                                                 |
| events[].user_id                 | String | 子用户 ID                                                                                                     |
| events[].result                  | Array  | 变更结果；未成功时为 `[]`                                                                                     |
| events[].result[].memory_type    | String | 记忆类型：`observation` / `skill` / `user_profile`。**snake_case**（0918 写成 camelCase `memoryType` 未复现） |
| events[].result[].content        | String | ADD 为添加内容，UPDATE 为新内容，DELETE 为旧内容                                                              |
| events[].result[].event          | String | `ADD` / `UPDATE` / `DELETE`                                                                                   |
| events[].result[].memory_node_id | String | observation / skill 时为节点 ID；user_profile 时不存在                                                        |
| events[].result[].name           | String | 仅 `memory_type=user_profile` 时出现，为画像属性名                                                            |
| events[].result[].old_content    | String | 仅 UPDATE 时存在，为旧节点内容                                                                                |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/events/07c054c438584f279ff7db7c3243fa51" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "bb499327-79c6-9a65-9f2d-c0c6abda6419",
  "events": [
    {
      "created_at": 1784602119,
      "event_id": "07c054c438584f279ff7db7c3243fa51",
      "event_type": "ADD_ASYNC",
      "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
      "resource_id": "8e73a84011a7420bb25b4d790e0b2644",
      "resource_type": "user_profile",
      "status": "SUCCEEDED",
      "result": [
        {
          "content": "杭州",
          "event": "ADD",
          "memory_type": "user_profile",
          "name": "城市"
        }
      ],
      "updated_at": 1784602161,
      "user_id": "user_001"
    },
    {
      "created_at": 1784602119,
      "event_id": "07c054c438584f279ff7db7c3243fa51",
      "event_type": "ADD_ASYNC",
      "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
      "resource_id": "a0edbcba8c4a4daa83f795f7dd4dc78b",
      "resource_type": "observation",
      "status": "SUCCEEDED",
      "result": [
        {
          "content": "用户想去非洲",
          "event": "DELETE",
          "memory_node_id": "3127d7445a57442d9f700d534b1b14e3",
          "memory_type": "observation"
        }
      ],
      "updated_at": 1784602150,
      "user_id": "user_001"
    }
  ]
}
```

---

## SearchMemory

**接口路径：** `POST /api/v2/apps/memory/memory_nodes/search`

**接口描述：** 基于对话语义搜索记忆节点。不传 `memory_types` 时服务端默认 `["observation"]`。可同时传 `observation` 与 `skill` 做混合检索。

### 入参

| 参数               | 位置 | 类型            | 必填 | 说明                                                                                                                             |
| ------------------ | ---- | --------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| user_id            | Body | String          | 是   | 记忆实体 ID，最大 64 字符                                                                                                        |
| messages           | Body | Array           | 是   | 对话记录，结构同 AddMemory（search 侧 role 通常为 user / assistant）                                                             |
| messages[].role    | Body | String          | 是   | 消息角色                                                                                                                         |
| messages[].content | Body | String \| Array | 否   | 消息内容                                                                                                                         |
| memory_library_id  | Body | String          | 否   | 记忆库 ID；不传则用默认记忆库                                                                                                    |
| project_ids        | Body | Array[String]   | 否   | 记忆片段规则 ID 数组，可多规则混合检索；不传则用默认规则；与 project_id 互斥                                                     |
| project_id         | Body | String          | 否   | 单个项目 ID，0921 明确支持；实测可配 memory_type=skill 召回 skill                                                                |
| top_k              | Body | Integer         | 否   | 最大召回个数，1~100，默认 10                                                                                                     |
| min_score          | Body | Double          | 否   | 最小相似度阈值，值域 **`[0, 1]`**，默认 0.3。低于阈值的结果会被过滤                                                              |
| memory_types       | Body | Array[String]   | 否   | 筛选记忆类型：`observation` / `skill`。不传默认 `["observation"]`                                                                |
| memory_type        | Body | String          | 否   | 单类型别名。建议与 memory_types 二选一；并传冲突值实测不报错，优先级未形成完整契约                                               |
| plan_version       | Body | String          | 否   | `pro` / `lite`，大小写不敏感，传错报错。不传默认 `pro`。优先级高于 `enable_rerank`                                               |
| enable_rerank      | Body | Boolean         | 否   | 历史兼容字段；显式 false 且未传 plan_version 时响应为 lite，true 时为 pro；二者均省略为 pro。显式 plan_version 优先（0921 实测） |
| enable_judge       | Body | Boolean         | 否   | 历史兼容字段；本轮 false 入参被接受，未验证判别效果或默认值                                                                      |
| enable_rewrite     | Body | Boolean         | 否   | 历史兼容字段；本轮 false 入参被接受，未验证重写效果或默认值                                                                      |
| query_timestamp    | Body | Long            | 否   | 问询时间（秒级 Unix 时间戳），rewrite 阶段使用；不填默认当前系统时间                                                             |

### 出参

| 参数                          | 类型   | 说明                                                  |
| ----------------------------- | ------ | ----------------------------------------------------- |
| request_id                    | String | 请求 ID                                               |
| plan_version                  | String | 本次搜索生效的收费计划 `pro` / `lite`                 |
| memory_nodes                  | Array  | 召回的记忆列表                                        |
| memory_nodes[].memory_node_id | String | 记忆节点 ID                                           |
| memory_nodes[].content        | String | 记忆内容                                              |
| memory_nodes[].timestamp      | Long   | 记忆相关时间。如 5-01 记录「明天有会议」，这里是 5-02 |
| memory_nodes[].memory_type    | String | 记忆类型 `observation` / `skill`                      |
| memory_nodes[].score          | Float  | 搜索分数                                              |
| memory_nodes[].status         | String | 记忆状态，示例为 `valid`                              |
| memory_nodes[].created_at     | Long   | 创建时间                                              |
| memory_nodes[].updated_at     | Long   | 更新时间                                              |
| memory_nodes[].project_id     | String | 所属项目 / 规则 ID                                    |
| memory_nodes[].meta_data      | Object | 自定义元信息                                          |

### 请求示例

```bash
curl -X POST "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes/search" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "user_id": "user_001",
    "messages": [
      {"role": "user", "content": "你好"},
      {"role": "assistant", "content": "你好"},
      {"role": "user", "content": "明天上午十一点我有什么日程安排吗？"}
    ],
    "top_k": 100,
    "min_score": 0,
    "memory_types": ["observation"],
    "plan_version": "pro"
  }'
```

响应：

```json
{
  "request_id": "416f3d78-2bba-9852-ac15-4b3bcee6c7e4",
  "plan_version": "pro",
  "memory_nodes": [
    {
      "memory_node_id": "f33b50af59024be2a7cc42dcf9f7445c",
      "content": "The user has a scheduled electrocardiogram test at the hospital on 2000-01-02 at 12:00:00.",
      "created_at": 1783503852,
      "updated_at": 1783503852,
      "timestamp": 946684800,
      "memory_type": "observation",
      "status": "valid",
      "score": 0.676,
      "project_id": "9d02496071ce4463b2f1ecd6c2baa560",
      "meta_data": {
        "location_name": "北京",
        "media_desc": []
      }
    }
  ]
}
```

---

## ListMemory

**接口路径：** `GET /api/v2/apps/memory/memory_nodes`

**接口描述：** 分页列出指定用户的记忆节点。不直接按 `memory_type` 过滤，通过 `project_id` 间接指定规则 / 类型。

live：不传 `project_id` 时只列出默认 observation 规则下的节点；skill 节点必须显式传 skill 项目的 `project_id` 才能列出来。

### 入参

| 参数              | 位置  | 类型    | 必填 | 说明                                                                                                                                 |
| ----------------- | ----- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| user_id           | Query | String  | 是   | 记忆实体 ID，最大 64 字符                                                                                                            |
| memory_library_id | Query | String  | 否   | 记忆库 ID；不传则用默认记忆库                                                                                                        |
| project_id        | Query | String  | 否   | 记忆片段规则 ID（单值过滤）。不传只查默认规则，不会汇总其他 observation / skill 项目；本轮自定义 observation 有 3 条，默认查询仍为 0 |
| page_num          | Query | Integer | 否   | 页号，从 1 开始，默认 1                                                                                                              |
| page_size         | Query | Integer | 否   | 每页大小，默认 10                                                                                                                    |

### 出参

| 参数                          | 类型    | 说明                                      |
| ----------------------------- | ------- | ----------------------------------------- |
| request_id                    | String  | 请求 ID                                   |
| memory_nodes                  | Array   | 记忆列表                                  |
| memory_nodes[].memory_node_id | String  | 记忆节点 ID                               |
| memory_nodes[].content        | String  | 记忆内容                                  |
| memory_nodes[].timestamp      | Long    | 消息时间戳                                |
| memory_nodes[].created_at     | Long    | 创建时间                                  |
| memory_nodes[].updated_at     | Long    | 更新时间                                  |
| memory_nodes[].project_id     | String  | add / update 时指定的 projectId，可能为空 |
| memory_nodes[].meta_data      | Object  | 自定义信息                                |
| memory_nodes[].memory_type    | String  | 记忆节点类型 `observation` / `skill`      |
| memory_nodes[].status         | String  | 记忆节点状态，示例为 `valid`              |
| memory_nodes[].media_desc     | String  | 多模态信息描述（可能为空字符串）          |
| total                         | Integer | 总数                                      |
| page_num                      | Integer | 页号                                      |
| page_size                     | Integer | 每页大小                                  |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes?user_id=user_001&page_size=10&page_num=1" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "c04d36e2-8fe8-9aad-b7ae-be40d5852c35",
  "page_num": 1,
  "page_size": 10,
  "total": 53,
  "memory_nodes": [
    {
      "memory_node_id": "4fe7ea3b791a4453b5e1d117da6b7483",
      "content": "我后天要坐汽车去上海出差，记得带身份证",
      "created_at": 1781765715,
      "updated_at": 1781765715,
      "timestamp": 1781765684,
      "memory_type": "observation",
      "status": "valid",
      "project_id": "5477585c7cb442a6a9e627f15f168831",
      "meta_data": {}
    }
  ]
}
```

---

## GetMemoryNode

**接口路径：** `GET /api/v2/apps/memory/memory_nodes/{memory_node_id}`

**接口描述：** 查询单个记忆节点详情。list / search 之后看全字段，以及 update 前确认节点是否为 skill 类型。

### 入参

| 参数           | 位置 | 类型   | 必填 | 说明        |
| -------------- | ---- | ------ | ---- | ----------- |
| memory_node_id | Path | String | 是   | 记忆节点 ID |

### 出参

| 参数                       | 类型          | 说明                             |
| -------------------------- | ------------- | -------------------------------- |
| request_id                 | String        | 请求 ID                          |
| memory_node                | Object        | 记忆节点详情                     |
| memory_node.memory_node_id | String        | 记忆唯一 ID                      |
| memory_node.content        | String        | 记忆内容                         |
| memory_node.timestamp      | Long          | 消息时间戳                       |
| memory_node.created_at     | Long          | 创建时间                         |
| memory_node.updated_at     | Long          | 更新时间                         |
| memory_node.media_desc     | String        | 多模态信息描述                   |
| memory_node.meta_data      | Object        | 元信息                           |
| memory_node.memory_type    | String        | 记忆类型 `observation` / `skill` |
| memory_node.status         | String        | 记忆状态                         |
| memory_node.project_id     | String        | 项目 ID                          |
| memory_node.media_urls     | Array[String] | 多模态资源链接列表               |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes/42dfc089dfa7409889966960a95c3b7e" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "c7d1c4d2-1234-5678-90ab-6f2b4381abcd",
  "memory_node": {
    "memory_node_id": "42dfc089dfa7409889966960a95c3b7e",
    "content": "用户需要被提醒明天穿衣服",
    "timestamp": 1781798400,
    "created_at": 1781765139,
    "updated_at": 1781765139,
    "media_desc": "",
    "meta_data": {},
    "memory_type": "observation",
    "status": "valid",
    "project_id": "5477585c7cb442a6a9e627f15f168831",
    "media_urls": []
  }
}
```

---

## UpdateMemory

**接口路径：** `PATCH /api/v2/apps/memory/memory_nodes/{memory_node_id}`

**接口描述：** 更新记忆节点内容。`custom_content` 整体替换节点内容；`meta_data` 为增量合并（未指定的 key 不更新）。目标节点为 skill 类型时，必须同时传 `skill_name` / `skill_description` / `skill_tags`，否则报错。节点类型由服务端判定。

### 入参

| 参数              | 位置 | 类型          | 必填 | 说明                                                                        |
| ----------------- | ---- | ------------- | ---- | --------------------------------------------------------------------------- |
| memory_node_id    | Path | String        | 是   | 记忆节点 ID                                                                 |
| custom_content    | Body | String        | 是   | 更新后的内容，最大 512 字符                                                 |
| memory_library_id | Body | String        | 否   | 记忆库 ID；非默认记忆库时需要                                               |
| timestamp         | Body | Long          | 否   | 内部参数；秒级 Unix 时间戳。PATCH 不传保留旧值，显式传入会更新（0921 实测） |
| meta_data         | Body | Object        | 否   | 自定义元信息，增量更新                                                      |
| skill_name        | Body | String        | 条件 | 节点为 skill 时必传三件套                                                   |
| skill_description | Body | String        | 条件 | 节点为 skill 时必传三件套                                                   |
| skill_tags        | Body | Array[String] | 条件 | 节点为 skill 时必传三件套                                                   |

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes/{memory_node_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "custom_content": "更新内容",
    "timestamp": 1747278460,
    "meta_data": {
      "location_name": "杭州",
      "geo_coordinate": "坐标信息"
    }
  }'
```

响应：

```json
{
  "request_id": "cc2690f9f2b3485a93013e5705c91241"
}
```

---

## DeleteMemory

**接口路径：** `DELETE /api/v2/apps/memory/memory_nodes/{memory_node_id}`

**接口描述：** 删除指定记忆节点。0921 实测删除后 Get 仍 200 返回节点，`status="delete"`；不能据此声称立即物理删除或内容不可再读取。

### 入参

| 参数              | 位置  | 类型   | 必填 | 说明                          |
| ----------------- | ----- | ------ | ---- | ----------------------------- |
| memory_node_id    | Path  | String | 是   | 记忆节点 ID                   |
| memory_library_id | Query | String | 否   | 记忆库 ID；不传则用默认记忆库 |

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

```bash
curl -X DELETE "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_nodes/{memory_node_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "cc2690f9f2b3485a93013e5705c91241"
}
```

---

## GetSkillExport

**接口路径：** `GET /api/v2/apps/memory/skill/export/{memory_node_id}`

**接口描述：** 导出 skill 类型记忆。与 GetMemoryNode **不是同一形状**：

- GetMemoryNode 的 `content` 是带 YAML frontmatter 的整段（`---\nName: ...\nDescription: ...\nTags: ...\n---\n\n正文`）
- GetSkillExport 把 frontmatter 拆成 `skill_name` / `skill_description` / `skill_tags`，`content` 只保留正文

对 observation 节点调用本接口也会 200，但不会出现 skill 三件套字段。

### 入参

| 参数           | 位置 | 类型   | 必填 | 说明              |
| -------------- | ---- | ------ | ---- | ----------------- |
| memory_node_id | Path | String | 是   | skill 记忆节点 ID |

### 出参

| 参数                          | 类型          | 说明                                               |
| ----------------------------- | ------------- | -------------------------------------------------- |
| request_id                    | String        | 请求 ID                                            |
| memory_node                   | Object        | 记忆节点详情                                       |
| memory_node.memory_node_id    | String        | 记忆唯一 ID                                        |
| memory_node.content           | String        | 技能正文（不含 Name/Description/Tags frontmatter） |
| memory_node.timestamp         | Long          | 消息时间戳                                         |
| memory_node.created_at        | Long          | 创建时间                                           |
| memory_node.updated_at        | Long          | 更新时间                                           |
| memory_node.media_desc        | String        | 多模态信息描述（可能省略）                         |
| memory_node.meta_data         | Object        | 元信息                                             |
| memory_node.memory_type       | String        | `skill`                                            |
| memory_node.status            | String        | 记忆状态                                           |
| memory_node.project_id        | String        | 项目 ID                                            |
| memory_node.media_urls        | Array[String] | 多模态资源链接列表                                 |
| memory_node.skill_name        | String        | 技能名称（从 frontmatter 拆出）                    |
| memory_node.skill_description | String        | 技能描述                                           |
| memory_node.skill_tags        | Array[String] | 技能标签                                           |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/skill/export/{memory_node_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "8495da4c-1091-9907-a940-0838f891d5b3",
  "memory_node": {
    "memory_node_id": "9f3ab2cd12344f12aabbccddeeff0011",
    "content": "整理会议纪要并生成摘要",
    "timestamp": 1781798400,
    "created_at": 1781765139,
    "updated_at": 1781765200,
    "media_urls": [],
    "meta_data": {},
    "memory_type": "skill",
    "status": "valid",
    "project_id": "a0edbcba8c4a4daa83f795f7dd4dc78b",
    "skill_name": "会议纪要整理",
    "skill_description": "自动提取会议重点并生成摘要",
    "skill_tags": ["办公", "总结"]
  }
}
```

---

# 二、用户画像

## GetUserProfile

**接口路径：** `GET /api/v2/apps/memory/profile_schemas/{profile_schema_id}/user_profile`

**接口描述：** 基于画像模板 ID 和 user_id 获取已提取的用户画像。画像由 AddMemory 传入同一 `profile_schema` 时抽取；若属性值均为空，说明尚未用该模板抽取。

`need_detail=false`（默认）：每个属性返回拼接后的 `value` 字符串。
`need_detail=true`：每个属性返回 `value_items` 列表（含 `item_id` / `status` / `value`），作为 UpdateUserProfileValues 的操作句柄。

live：两种模式均为 snake_case（`request_id` / `schema_name` / `schema_description`）。0918 默认模式 camelCase 未复现。`need_evidence` 本环境未返回。无值时默认模式省略 `value`，详情模式为 `value_items: []`；两条独立值实测使用 `; ` 拼接。

### 入参

| 参数              | 位置  | 类型    | 必填 | 说明                          |
| ----------------- | ----- | ------- | ---- | ----------------------------- |
| profile_schema_id | Path  | String  | 是   | 画像模板 ID                   |
| user_id           | Query | String  | 是   | 记忆实体 ID，最大 64 字符     |
| memory_library_id | Query | String  | 否   | 记忆库 ID；不传则用默认记忆库 |
| need_detail       | Query | Boolean | 否   | 是否返回值项详情，默认 false  |

### 出参（need_detail=false，默认）

| 参数                       | 类型   | 说明                             |
| -------------------------- | ------ | -------------------------------- |
| request_id                 | String | 请求 ID                          |
| profile                    | Object | 用户画像                         |
| profile.schema_name        | String | 模板名称                         |
| profile.schema_description | String | 模板描述                         |
| profile.attributes         | Array  | 属性列表                         |
| profile.attributes[].id    | String | 属性 ID                          |
| profile.attributes[].name  | String | 属性名称                         |
| profile.attributes[].value | String | 拼接后的属性值；未提取时字段缺失 |

### 出参（need_detail=true）

| 参数                                       | 类型    | 说明                                     |
| ------------------------------------------ | ------- | ---------------------------------------- |
| request_id                                 | String  | 请求 ID                                  |
| profile                                    | Object  | 用户画像                                 |
| profile.schema_name                        | String  | 模板名称                                 |
| profile.schema_description                 | String  | 模板描述                                 |
| profile.attributes                         | Array   | 属性列表                                 |
| profile.attributes[].id                    | String  | 属性 ID                                  |
| profile.attributes[].name                  | String  | 属性名称                                 |
| profile.attributes[].value_items           | Array   | 值项列表                                 |
| profile.attributes[].value_items[].item_id | Integer | 值项 ID，供 UpdateUserProfileValues 使用 |
| profile.attributes[].value_items[].status  | String  | 值项状态，示例为 `valid`                 |
| profile.attributes[].value_items[].value   | String  | 值内容                                   |

### 请求示例

默认模式：

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}/user_profile?user_id=user_001" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "e5986fe3-6f2b-4381-892b-01528443790e",
  "profile": {
    "schema_name": "用户画像001",
    "schema_description": "用户画像001的描述",
    "attributes": [
      {
        "id": "00484806d4a343198d61abe8a0d8ae84",
        "name": "爱好",
        "value": "打球; 游泳"
      },
      {
        "id": "05fa398b8386454999a685d246bb2f91",
        "name": "使用平台"
      }
    ]
  }
}
```

详情模式：

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}/user_profile?user_id=user_001&need_detail=true" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "8495da4c-1091-9907-a940-0838f891d5b3",
  "profile": {
    "schema_name": "测试画像规则2",
    "schema_description": "",
    "attributes": [
      {
        "id": "d6d4f21aefa649f6ae036fa02bf5e1ea",
        "name": "兴趣",
        "value_items": [
          {
            "item_id": 5634,
            "status": "valid",
            "value": "打球"
          },
          {
            "item_id": 6496,
            "status": "valid",
            "value": "游泳"
          }
        ]
      }
    ]
  }
}
```

---

## UpdateUserProfileValues

**接口路径：** `PATCH /api/v2/apps/memory/profile_schemas/{profile_schema_id}/profile_values`

**接口描述：** 更新指定用户在某个画像 Schema 下的单个属性值项，支持 add / update / delete。成功后自动更新对应实体的活跃时间。`entity_id` 在用户画像场景传 `user_id`。`attribute_id` 必须是该 Schema 下已存在的属性。

### 入参

| 参数              | 位置 | 类型   | 必填 | 说明                                                |
| ----------------- | ---- | ------ | ---- | --------------------------------------------------- |
| profile_schema_id | Path | String | 是   | 画像模板 ID                                         |
| entity_id         | Body | String | 是   | 实体 ID，用户画像场景传 user_id                     |
| attribute_id      | Body | String | 是   | 属性 ID                                             |
| op_type           | Body | String | 是   | `add` / `update` / `delete`，大小写不敏感，传错报错 |
| item_id           | Body | Long   | 条件 | `update` / `delete` 时必填，定位已有值项            |
| value             | Body | String | 条件 | `add` / `update` 时使用                             |
| memory_library_id | Body | String | 否   | 记忆库 ID；不传则用默认记忆库                       |

约束：

- `op_type=add`：可传 `value`，不需要 `item_id`
- `op_type=update`：必须传 `item_id`，可传 `value`
- `op_type=delete`：必须传 `item_id`

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

新增：

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}/profile_values" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "entity_id": "user_001",
    "attribute_id": "attr_001",
    "op_type": "add",
    "value": "游泳"
  }'
```

更新：

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}/profile_values" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "entity_id": "user_001",
    "attribute_id": "attr_001",
    "op_type": "update",
    "item_id": 5634,
    "value": "打排球"
  }'
```

删除：

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}/profile_values" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "entity_id": "user_001",
    "attribute_id": "attr_001",
    "op_type": "delete",
    "item_id": 5634
  }'
```

响应：

```json
{
  "request_id": "cc2690f9f2b3485a93013e5705c91241"
}
```

---

# 三、画像 Schema

## CreateProfileSchema

**接口路径：** `POST /api/v2/apps/memory/profile_schemas`

**接口描述：** 创建画像模板。`attributes` 不能为空数组。`immutable=true` 时必须传 `default_value`。

### 入参

| 参数                       | 位置 | 类型    | 必填 | 说明                                                                                            |
| -------------------------- | ---- | ------- | ---- | ----------------------------------------------------------------------------------------------- |
| extract_scene              | Body | String  | 否   | efficient / intelligent；Schema 默认 efficient；本轮 Schema 和项目单独传该字段的 PATCH 均为 200 |
| name                       | Body | String  | 是   | 模板名称，最大 32 字符                                                                          |
| attributes                 | Body | Array   | 是   | 属性定义列表，不能为空                                                                          |
| attributes[].name          | Body | String  | 是   | 属性名称，最大 32 字符。语义应尽量唯一，避免「姓名/名称/名字」同时出现                          |
| attributes[].description   | Body | String  | 否   | 属性描述，最大 128 字符                                                                         |
| attributes[].default_value | Body | String  | 条件 | 默认值，最大 128 字符；`immutable=true` 时必填                                                  |
| attributes[].immutable     | Body | Boolean | 否   | 是否不可变，默认 false                                                                          |
| description                | Body | String  | 否   | 模板描述；0921 明确长度上限由系统配置决定，旧 128 字符上限不作为当前保证                        |
| plan_version               | Body | String  | 否   | `pro` / `lite`，大小写不敏感，传错报错。不传默认 `pro`                                          |
| memory_library_id          | Body | String  | 否   | 记忆库 ID；不传则用默认记忆库                                                                   |

### 出参

| 参数              | 类型   | 说明                  |
| ----------------- | ------ | --------------------- |
| request_id        | String | 请求 ID               |
| profile_schema_id | String | 创建成功的画像模板 ID |

### 请求示例

```bash
curl -X POST "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "用户基础画像",
    "description": "用于沉淀用户稳定属性",
    "plan_version": "pro",
    "attributes": [
      {
        "name": "姓名",
        "description": "用户姓名",
        "immutable": true,
        "default_value": "张三"
      },
      {
        "name": "喜欢的运动",
        "description": "用户日常喜欢的运动项目",
        "immutable": false
      }
    ]
  }'
```

响应：

```json
{
  "request_id": "6e5b5d71-0791-988d-b1af-a5031e0be48d",
  "profile_schema_id": "d148aac7f4ff42f598e3fcbc6eae4de3"
}
```

---

## ListProfileSchemas

**接口路径：** `GET /api/v2/apps/memory/profile_schemas`

**接口描述：** 分页查询画像模板列表。

### 入参

| 参数              | 位置  | 类型    | 必填 | 说明                          |
| ----------------- | ----- | ------- | ---- | ----------------------------- |
| memory_library_id | Query | String  | 否   | 记忆库 ID；不传则用默认记忆库 |
| page_num          | Query | Integer | 否   | 页号，默认 1                  |
| page_size         | Query | Integer | 否   | 每页大小，默认 10             |

### 出参

| 参数                                | 类型    | 说明                                            |
| ----------------------------------- | ------- | ----------------------------------------------- |
| request_id                          | String  | 请求 ID                                         |
| profile_schemas                     | Array   | 画像模板列表                                    |
| profile_schemas[].profile_schema_id | String  | 画像模板 ID                                     |
| profile_schemas[].name              | String  | 模板名称                                        |
| profile_schemas[].description       | String  | 模板描述                                        |
| profile_schemas[].plan_version      | String  | 收费计划 `pro` / `lite`                         |
| profile_schemas[].extract_scene     | String  | 抽取场景，live 见到 `efficient` / `intelligent` |
| total                               | Integer | 总数                                            |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas?page_num=1&page_size=10" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "e5986fe3-6f2b-4381-892b-01528443790e",
  "total": 1,
  "profile_schemas": [
    {
      "profile_schema_id": "ps_5477585c7cb442a6a9e627f15f168831",
      "name": "用户基础画像",
      "description": "用于沉淀用户稳定属性",
      "plan_version": "pro"
    }
  ]
}
```

---

## GetProfileSchema

**接口路径：** `GET /api/v2/apps/memory/profile_schemas/{profile_schema_id}`

**接口描述：** 获取画像模板详情。返回的 `attribute_id` 是 UpdateProfileSchema 做 update / delete 时的操作句柄。

### 入参

| 参数              | 位置  | 类型   | 必填 | 说明                          |
| ----------------- | ----- | ------ | ---- | ----------------------------- |
| profile_schema_id | Path  | String | 是   | 画像模板 ID                   |
| memory_library_id | Query | String | 否   | 记忆库 ID；不传则用默认记忆库 |

### 出参

| 参数                       | 类型    | 说明                            |
| -------------------------- | ------- | ------------------------------- |
| request_id                 | String  | 请求 ID                         |
| name                       | String  | 模板名称                        |
| description                | String  | 模板描述                        |
| plan_version               | String  | 收费计划                        |
| extract_scene              | String  | 抽取场景，live 见到 `efficient` |
| attributes                 | Array   | 属性列表                        |
| attributes[].attribute_id  | String  | 属性 ID                         |
| attributes[].name          | String  | 属性名称                        |
| attributes[].description   | String  | 属性描述                        |
| attributes[].default_value | String  | 属性默认值                      |
| attributes[].immutable     | Boolean | 是否不可变                      |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "22e73019-c24d-4885-9cbd-89e6cb7ca801",
  "name": "用户基础画像",
  "description": "schema_description",
  "attributes": [
    {
      "attribute_id": "0050023926374ef397b9cf06542a287c",
      "name": "更新attribute",
      "description": "更新attribute",
      "default_value": "更新default_value"
    }
  ]
}
```

---

## UpdateProfileSchema

**接口路径：** `PATCH /api/v2/apps/memory/profile_schemas/{profile_schema_id}`

**接口描述：** 更新画像模板的名称、描述、收费计划和属性。至少一个可更新字段：`name` / `description` / `plan_version` / `attributes_operations`。

### 入参

| 参数                                  | 位置 | 类型    | 必填                   | 说明                                                                                            |
| ------------------------------------- | ---- | ------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| extract_scene                         | Body | String  | 否                     | efficient / intelligent；Schema 默认 efficient；本轮 Schema 和项目单独传该字段的 PATCH 均为 200 |
| profile_schema_id                     | Path | String  | 是                     | 画像模板 ID                                                                                     |
| name                                  | Body | String  | 否                     | 模板名称，最大 32 字符                                                                          |
| description                           | Body | String  | 否                     | 模板描述；0921 明确长度上限由系统配置决定，旧 128 字符上限不作为当前保证                        |
| plan_version                          | Body | String  | 否                     | `pro` / `lite`，大小写不敏感，传错报错                                                          |
| attributes_operations                 | Body | Array   | 否                     | 属性变更操作列表                                                                                |
| attributes_operations[].op            | Body | String  | 是（有 operations 时） | `add` / `update` / `delete`                                                                     |
| attributes_operations[].name          | Body | String  | 条件                   | `op=add` 时必填，最大 32 字符                                                                   |
| attributes_operations[].description   | Body | String  | 否                     | 属性描述，最大 128 字符                                                                         |
| attributes_operations[].immutable     | Body | Boolean | 否                     | 是否不可变，仅 `op=add` 支持                                                                    |
| attributes_operations[].default_value | Body | String  | 否                     | 默认值，最大 128 字符。`op=add` 且 `immutable=true` 时应传                                      |
| attributes_operations[].attribute_id  | Body | String  | 条件                   | `op=update` / `delete` 时必填                                                                   |
| memory_library_id                     | Body | String  | 否                     | 记忆库 ID                                                                                       |

约束：

- `op=add`：可传 name / description / immutable / default_value；`immutable=true` 时应传 `default_value`
- `op=update`：必须传 `attribute_id`；可更新 name / description / default_value；不支持更新 `immutable`
- `op=delete`：必须传 `attribute_id`

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "更新后的用户基础画像",
    "description": "用于沉淀用户稳定属性和偏好信息",
    "plan_version": "lite",
    "attributes_operations": [
      {
        "op": "add",
        "name": "喜欢的音乐",
        "description": "用户喜欢的音乐类型",
        "immutable": false
      },
      {
        "op": "update",
        "attribute_id": "attr_002",
        "name": "常用运动",
        "description": "用户更常参与的运动项目",
        "default_value": "跑步"
      },
      {
        "op": "delete",
        "attribute_id": "attr_003"
      }
    ]
  }'
```

响应：

```json
{
  "request_id": "bb499327-79c6-9a65-9f2d-c0c6abda6419"
}
```

---

## DeleteProfileSchema

**接口路径：** `DELETE /api/v2/apps/memory/profile_schemas/{profile_schema_id}`

**接口描述：** 永久删除画像模板及其属性定义。已基于该模板提取的用户画像将无法访问。

### 入参

| 参数              | 位置  | 类型   | 必填 | 说明                          |
| ----------------- | ----- | ------ | ---- | ----------------------------- |
| profile_schema_id | Path  | String | 是   | 画像模板 ID                   |
| memory_library_id | Query | String | 否   | 记忆库 ID；不传则用默认记忆库 |

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

```bash
curl -X DELETE "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/profile_schemas/{profile_schema_id}" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "23d4f8bf-5e39-43ef-925a-82cf7757ec70"
}
```

---

# 四、记忆项目（非对客）

> 本节接口在 0918 契约中存在，当前 CLI 未透出。skill 项目若无法通过本接口创建，则 `project_id` 只能来自控制台。

## CreateMemoryProject

**接口路径：** `POST /api/v2/apps/memory/memory_projects`

**接口描述：** 创建记忆项目（抽取规则）。

live 约束：

- `memory_type=skill` 时，`instruction_type` 只能为 `default` 或不传；传 `custom` 会 400
- `memory_type=skill` 时，`plan_version` 只能是 `pro`；传 `lite` 会 400：`Skill project only supports plan_version pro.`
- `support_multi_modal=true` 仅当 `memory_type=observation` 且 `plan_version=pro`；lite 开启多模态会 400

### 入参

| 参数                | 位置 | 类型    | 必填 | 说明                                                                                            |
| ------------------- | ---- | ------- | ---- | ----------------------------------------------------------------------------------------------- |
| extract_scene       | Body | String  | 否   | efficient / intelligent；Schema 默认 efficient；本轮 Schema 和项目单独传该字段的 PATCH 均为 200 |
| description         | Body | String  | 否   | 0921 明确：项目描述；本轮未验证修改                                                             |
| name                | Body | String  | 是   | 项目名称                                                                                        |
| memory_library_id   | Body | String  | 否   | 记忆库 ID；不传则用默认记忆库                                                                   |
| memory_type         | Body | String  | 否   | `observation` / `skill`，默认 `observation`                                                     |
| support_multi_modal | Body | Boolean | 否   | 是否支持多模态，默认 false                                                                      |
| plan_version        | Body | String  | 否   | `pro` / `lite`，默认 `pro`                                                                      |
| instruction_type    | Body | String  | 否   | `default` / `custom`。skill 项目只能 `default` 或不传                                           |
| custom_instruction  | Body | String  | 否   | 自定义指令内容                                                                                  |
| expired_in_days     | Body | Integer | 否   | 记忆过期天数                                                                                    |
| auto_refresh        | Body | Boolean | 否   | 是否自动刷新                                                                                    |

### 出参

| 参数       | 类型   | 说明              |
| ---------- | ------ | ----------------- |
| request_id | String | 请求 ID           |
| project_id | String | 创建成功的项目 ID |

### 请求示例

```bash
curl -X POST "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_projects" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "默认观察项目",
    "memory_type": "observation",
    "plan_version": "pro",
    "support_multi_modal": true,
    "instruction_type": "default",
    "expired_in_days": 30,
    "auto_refresh": true
  }'
```

响应：

```json
{
  "request_id": "6e5b5d71-0791-988d-b1af-a5031e0be48d",
  "project_id": "5477585c7cb442a6a9e627f15f168831"
}
```

> live：创建成功返回 `{ request_id, project_id }`，与出参表一致。0918 示例只返回 `memory_library_id` 视为笔误。skill 项目不传过期天数时默认 `expired_in_days=180`、`auto_refresh=true`、`extract_scene=intelligent`。

---

## ListMemoryProjects

**接口路径：** `GET /api/v2/apps/memory/memory_projects`

**接口描述：** 分页查询记忆项目列表。不传 `memory_type` 时 **同时列出 observation 和 skill**（0918 写的默认只列 observation 未复现）。传 `memory_type=skill` 可只列技能项目。

### 入参

| 参数              | 位置  | 类型    | 必填 | 说明                                      |
| ----------------- | ----- | ------- | ---- | ----------------------------------------- |
| memory_library_id | Query | String  | 否   | 记忆库 ID                                 |
| memory_type       | Query | String  | 否   | `observation` / `skill`。不传则两种都返回 |
| page_num          | Query | Integer | 否   | 页号                                      |
| page_size         | Query | Integer | 否   | 每页大小                                  |

### 出参

| 参数                                  | 类型    | 说明                                                                   |
| ------------------------------------- | ------- | ---------------------------------------------------------------------- |
| request_id                            | String  | 请求 ID                                                                |
| memory_projects                       | Array   | 项目列表                                                               |
| memory_projects[].project_id          | String  | 项目 ID                                                                |
| memory_projects[].memory_library_id   | String  | 记忆库 ID                                                              |
| memory_projects[].name                | String  | 项目名称                                                               |
| memory_projects[].instruction_type    | String  | 指令类型                                                               |
| memory_projects[].custom_instruction  | String  | 自定义指令                                                             |
| memory_projects[].expired_in_days     | Integer | 过期天数                                                               |
| memory_projects[].auto_refresh        | Boolean | 是否自动刷新                                                           |
| memory_projects[].plan_version        | String  | 收费计划                                                               |
| memory_projects[].memory_type         | String  | 记忆类型                                                               |
| memory_projects[].support_multi_modal | Boolean | 是否支持多模态                                                         |
| memory_projects[].description         | String  | 项目描述                                                               |
| memory_projects[].extract_scene       | String  | 抽取场景，live 见到 `efficient`（observation）/ `intelligent`（skill） |
| memory_projects[].created_at          | Long    | 创建时间                                                               |
| memory_projects[].updated_at          | Long    | 更新时间                                                               |
| page_num                              | Integer | 页号                                                                   |
| page_size                             | Integer | 每页大小                                                               |
| total                                 | Integer | 总数                                                                   |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_projects?memory_library_id=dd224b7a280b45e78aff486b084de6b0&page_num=1&page_size=10" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "e5986fe3-6f2b-4381-892b-01528443790e",
  "page_num": 1,
  "page_size": 10,
  "total": 1,
  "memory_projects": [
    {
      "project_id": "5477585c7cb442a6a9e627f15f168831",
      "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
      "name": "默认观察项目",
      "instruction_type": "default",
      "custom_instruction": "",
      "expired_in_days": 30,
      "auto_refresh": true,
      "memory_type": "observation",
      "support_multi_modal": true,
      "created_at": 1781765139,
      "updated_at": 1781765200
    }
  ]
}
```

---

## GetMemoryProject

**接口路径：** `GET /api/v2/apps/memory/memory_projects/{project_id}`

**接口描述：** 查询记忆项目详情。

### 入参

| 参数              | 位置  | 类型   | 必填 | 说明      |
| ----------------- | ----- | ------ | ---- | --------- |
| project_id        | Path  | String | 是   | 项目 ID   |
| memory_library_id | Query | String | 否   | 记忆库 ID |

### 出参

| 参数                | 类型    | 说明           |
| ------------------- | ------- | -------------- |
| request_id          | String  | 请求 ID        |
| project_id          | String  | 项目 ID        |
| memory_library_id   | String  | 记忆库 ID      |
| name                | String  | 项目名称       |
| instruction_type    | String  | 指令类型       |
| custom_instruction  | String  | 自定义指令     |
| expired_in_days     | Integer | 过期天数       |
| auto_refresh        | Boolean | 是否自动刷新   |
| plan_version        | String  | 收费计划       |
| memory_type         | String  | 记忆类型       |
| support_multi_modal | Boolean | 是否支持多模态 |
| description         | String  | 项目描述       |
| extract_scene       | String  | 抽取场景       |
| created_at          | Long    | 创建时间       |
| updated_at          | Long    | 更新时间       |

### 请求示例

```bash
curl -X GET "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_projects/5477585c7cb442a6a9e627f15f168831?memory_library_id=dd224b7a280b45e78aff486b084de6b0" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

响应：

```json
{
  "request_id": "8495da4c-1091-9907-a940-0838f891d5b3",
  "project_id": "5477585c7cb442a6a9e627f15f168831",
  "memory_library_id": "dd224b7a280b45e78aff486b084de6b0",
  "name": "默认观察项目",
  "instruction_type": "default",
  "custom_instruction": "",
  "expired_in_days": 30,
  "auto_refresh": true,
  "memory_type": "observation",
  "support_multi_modal": true,
  "created_at": 1781765139,
  "updated_at": 1781765200
}
```

---

## UpdateMemoryProject

**接口路径：** `PATCH /api/v2/apps/memory/memory_projects/{project_id}`

**接口描述：** 更新记忆项目。至少一个可更新字段：`name` / `instruction_type` / `custom_instruction` / `expired_in_days` / `auto_refresh` / `support_multi_modal` / `plan_version`。

live：改 name / expired_in_days / auto_refresh 成功，只回 `{ request_id }`。`support_multi_modal=true` 仍要求 observation + pro，否则 400。

### 入参

| 参数                | 位置 | 类型    | 必填 | 说明                                                                                            |
| ------------------- | ---- | ------- | ---- | ----------------------------------------------------------------------------------------------- |
| extract_scene       | Body | String  | 否   | efficient / intelligent；Schema 默认 efficient；本轮 Schema 和项目单独传该字段的 PATCH 均为 200 |
| description         | Body | String  | 否   | 0921 明确：项目描述；本轮未验证修改                                                             |
| project_id          | Path | String  | 是   | 项目 ID                                                                                         |
| memory_library_id   | Body | String  | 否   | 记忆库 ID                                                                                       |
| name                | Body | String  | 否   | 项目名称                                                                                        |
| instruction_type    | Body | String  | 否   | `default` / `custom`                                                                            |
| custom_instruction  | Body | String  | 否   | 自定义指令                                                                                      |
| expired_in_days     | Body | Integer | 否   | 过期天数                                                                                        |
| auto_refresh        | Body | Boolean | 否   | 是否自动刷新                                                                                    |
| plan_version        | Body | String  | 否   | 收费计划                                                                                        |
| support_multi_modal | Body | Boolean | 否   | 是否支持多模态                                                                                  |

### 出参

| 参数       | 类型   | 说明    |
| ---------- | ------ | ------- |
| request_id | String | 请求 ID |

### 请求示例

```bash
curl -X PATCH "https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/memory_projects/5477585c7cb442a6a9e627f15f168831" \
  --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "更新后的观察项目",
    "instruction_type": "custom",
    "custom_instruction": "请重点提取用户的日程安排和提醒事项",
    "expired_in_days": 60,
    "auto_refresh": false,
    "support_multi_modal": true
  }'
```

响应：

```json
{
  "request_id": "bb499327-79c6-9a65-9f2d-c0c6abda6419"
}
```

---

# 五、实体清理（0921 新增；暂不对客）

## DeleteEntity

**接口路径：** `DELETE /api/v2/apps/memory/entities/{entity_type}/{entity_id}`

| 参数              | 位置  | 类型   | 必填 | 说明                                         |
| ----------------- | ----- | ------ | ---- | -------------------------------------------- |
| entity_type       | Path  | String | 是   | 当前为 user                                  |
| entity_id         | Path  | String | 是   | 待清理的实体 ID，对应 user_id                |
| memory_library_id | Query | String | 否   | 不传按默认记忆库解析；本轮显式传入测试记忆库 |

成功为 `{request_id}`。本轮删除后 observation 和 skill 列表均为空，补测非空画像也被清空。重复删除返回 HTTP 404、`code=EntityNotFound`，不是再次 200。这里只证明查询不可见，不保证底层立即物理清除。

## DeleteEntityProfile

**接口路径：** `DELETE /api/v2/apps/memory/entities_profile/{entity_type}/{entity_id}`

| 参数              | 位置  | 类型   | 必填 | 说明                                             |
| ----------------- | ----- | ------ | ---- | ------------------------------------------------ |
| entity_type       | Path  | String | 是   | 当前为 user                                      |
| entity_id         | Path  | String | 是   | 对应 user_id                                     |
| memory_library_id | Query | String | 否   | 不传按默认记忆库解析                             |
| profile_schema_id | Query | String | 否   | 指定时仅清空该模板下画像；不传清空全部模板下画像 |

成功为 `{request_id}`。本轮用两套模板验证：指定模板只清空目标画像，另一套仍保留「绘画」，observation 仍为 3 条；省略模板后另一套画像也清空，节点数仍为 3。空详情仍返回 Schema 和 attributes，仅 value_items 为空。

## 同步 AddMemory 的兼容补充

`POST /add` 的 `custom_content` 本轮成功，返回 `{request_id, memory_nodes:[{memory_node_id,content,event}]}`。0921 同步入参新增/明确 `extract_mode=profile_only`（需要 messages 和 profile_schema）及内部参数；本轮仅验证同步直存，不将异步 profile_only 的结论外推为同步抽取已验证。

## 返回字段的可选性

响应表列出字段不等于字段始终存在。纯文本节点可能省略 media_desc / multimodal_medias；未设置的项目 custom_instruction、description 可能省略；未设置的属性 default_value 可能省略。GetMemoryNode 的 media_urls 本轮为空数组。GetEvent 的 old_content 只适用于 UPDATE，本轮未触发该事件分支。应按分支建模，而非对所有字段做无条件 required 校验。
