# 长期记忆 API live 验证报告

- 时间: 2026-09-20
- Host: `https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory`
- 原始响应: `docs/memory/2026-09-20-memory-live-verify.json`
- 测试数据已删除（user `doc-verify-20260920` / `doc-verify-skill-20260920`，临时 schema / 节点均已 DELETE）

## 结论

生产环境接口可用。文档里有 **6 处和真实 wire 不一致**，已回写到 `2026-09-20-memory-backend-api.md`。

## 和文档不一致（已按 live 改文档）

| 严重度 | 接口                       | 文档原口径                                | 实际                                                                                                                                      |
| ------ | -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P0     | AddMemory                  | custom_content 也发 `project_ids`         | `custom_content` + `project_ids` → **400** `custom_content can only be bound to one project`。必须发单数 `project_id`                     |
| P0     | GetEvent result            | `memoryType` camelCase                    | **`memory_type` snake_case**                                                                                                              |
| P0     | GetEvent / AddMemory       | `resource_type=profile`                   | 实际是 **`user_profile`**；另有 `custom_observation` / `custom_skill`                                                                     |
| P1     | GetEvent status            | PENDING / SUCCEEDED / FAILED / UNRECORDED | 轮询中还有 **`RUNNING`**。本环境未出现 `SUCCESS`                                                                                          |
| P1     | GetSkillExport             | 与 GetMemoryNode 基本一致                 | **不是**：export 拆出 `skill_name` / `skill_description` / `skill_tags`，`content` 只剩正文；GetMemoryNode 的 content 带 YAML frontmatter |
| P1     | ListMemoryProjects         | 不传 memory_type 默认只列 observation     | **不传会同时列出 observation 和 skill**                                                                                                   |
| P2     | GetUserProfile             | 默认模式可能 camelCase                    | 本环境两种模式都是 **snake_case**；`need_evidence` 未返回                                                                                 |
| P2     | List / Get schema、project | 未列 `extract_scene`                      | 实际有。schema/project 还有 `description`；GetProfileSchema 有 `plan_version`、`attributes[].immutable`                                   |
| P2     | GetEvent result            | 未成功时 result 不存在                    | PENDING/RUNNING 时 **`result: []`**。user_profile 成功项多 `name` 字段                                                                    |

## 已对齐、实测通过

| 接口                                          | HTTP | 备注                                                                                                  |
| --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| ListMemory                                    | 200  | 空列表 / 有数据均含 total、page_num、page_size、memory_type、status、timestamp、project_id、meta_data |
| SearchMemory                                  | 200  | `memory_types` 数组生效；`min_score` 按 0~1；响应回显 `plan_version`；节点含 score                    |
| GetMemoryNode                                 | 200  | 字段与文档一致                                                                                        |
| UpdateMemory                                  | 200  | 只回 `request_id`；meta_data 增量合并                                                                 |
| DeleteMemory                                  | 200  | Query 带 user_id 成功                                                                                 |
| Create/Get/Update/Delete ProfileSchema        | 200  | 闭环成功                                                                                              |
| GetUserProfile 默认 + need_detail             | 200  | 抽取后默认模式有拼接 value；detail 有 item_id                                                         |
| UpdateUserProfileValues add/update            | 200  | 只回 `request_id`                                                                                     |
| List/Get MemoryProject                        | 200  | 非对客接口生产可用。skill 项目 `expired_in_days=-1`                                                   |
| AddMemory messages 抽取                       | 200  | 约 30s 到 SUCCEEDED；一次产生 observation + user_profile 两条 event                                   |
| AddMemory custom_content + project_id         | 200  | resource_type=`custom_observation` / `custom_skill`                                                   |
| AddMemory messages + project_ids + skill 项目 | 200  | resource_type=`skill`，会抽成完整 skill 文档                                                          |
| Search memory_types=skill                     | 200  | 能召回刚写入的 skill 节点                                                                             |
| GetSkillExport（skill 节点）                  | 200  | 见上表差异                                                                                            |
| ListMemory 不传 project_id                    | 200  | **列不出 skill 节点**，必须带 skill 的 project_id                                                     |

## skill 专项

1. `.env` 已加 `BAILIAN_E2E_MEMORY_SKILL_PROJECT_ID=5914d8b460de451fb2fbd920279627e3`（控制台项目名「Skill抽取」，`extract_scene=intelligent`，`plan_version=pro`）。
2. 项目本身原先没有节点；用 custom_content + 三件套、以及 messages 抽取各写了一条，测完已删。
3. **CLI 影响**：当前 `memory add` 一律把 `--project-id` 序列化成 `project_ids`。这对 `messages` 抽取没问题，但对 `--content`（custom_content）会 400。skill 直存必须改成发 `project_id`。

## 本轮补测（2026-09-20 下午）

| 项                                     | 结果                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| CreateMemoryProject observation        | 200，返回 `{ request_id, project_id }`。lite 默认 `extract_scene=efficient`             |
| UpdateMemoryProject                    | 合法字段（name / expired_in_days / auto_refresh）200，Get 可见已更新                    |
| Update 开多模态 + lite                 | 400：`Support multi modal only supports memory_type observation with plan_version pro.` |
| Create skill + lite                    | 400：`Skill project only supports plan_version pro.`                                    |
| Create skill + instruction_type=custom | 400：`When memory_type is skill, instruction_type can only be null or default.`         |
| Create skill + pro                     | 200；默认 `expired_in_days=180`、`auto_refresh=true`、`extract_scene=intelligent`       |
| tool_calls 抽取                        | 200，约 30s `SUCCEEDED`，抽出「用户明天下午三点在杭州开会」。入参形状被接受，不是测不了 |
| 寒暄「你好/在吗」                      | 提交成功，终态是 **`SUCCEEDED` + `result: []`**，**不是 UNRECORDED**                    |
| 无效 profile_schema                    | 提交阶段 400 `Profile schema not found`，不会进入 event FAILED                          |
| skill custom_content 缺三件套          | 提交阶段 400 `Skill name cannot be empty.`，不会进入 event FAILED                       |
| 同步 POST `/add`                       | **不测**。CLI 已移除 `memoryAddPath`，产品只走 `/add-async`                             |

留下的项目（无删除接口）：`f100c452287a484688e06376f19aa64d`（observation）、`ea83a3ed512e491eb2cdcbd9880d9414`（skill）。

## 仍未打出的终态

- `FAILED`：参数错误都在 HTTP 400 拦下，没有进入异步 event
- `UNRECORDED`：无信息对话走的是 `SUCCEEDED` + 空 result。这个枚举要么是服务端内部/旧口径，要么触发条件我们不知道，**不是「没法造数据」而是「没有公开的稳定造法」**
