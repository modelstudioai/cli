# Memory CLI 能力矩阵

[文档首页](README.md) · [用户技术指南](user-guide.md) · [完整参数参考](../../skills/bailian-cli/reference/memory.md)

范围：2026-09-22 工作区源码，共 **13 个公开命令**。版本与发布状态见[文档首页](README.md)。所有命令使用 API Key，均需要解析出 Workspace ID。

## 命令与 API 映射

下表路径统一省略 `/api/v2/apps/memory`。`{node_id}` 对应返回的 `memory_node_id`；`{schema_id}` 对应 `profile_schema_id`。

| 能力         | 命令                       | 必填业务参数                             | HTTP API                                        | 结果与关键语义                                     |
| ------------ | -------------------------- | ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| 写入 / 抽取  | `bl memory add`            | `--user-id`，`--messages` 或 `--content` | POST `/add-async`                               | 提交事件并默认轮询；一次抽取可能增、改、删多条节点 |
| 语义检索     | `bl memory search`         | `--user-id`，`--query` 或 `--messages`   | POST `/memory_nodes/search`                     | 返回 `memory_nodes`，默认仅搜索 observation        |
| 分页列举     | `bl memory list`           | `--user-id`                              | GET `/memory_nodes`                             | 返回 `memory_nodes` / `total`，默认仅默认规则      |
| 节点详情     | `bl memory node show`      | `--node-id`                              | GET `/memory_nodes/{node_id}`                   | 返回 `memory_node`，查看类型、状态、内容、元数据   |
| 节点更新     | `bl memory update`         | `--node-id`、`--content`                 | PATCH `/memory_nodes/{node_id}`                 | 全量替换内容，元数据增量合并                       |
| 节点删除     | `bl memory delete`         | `--node-id`                              | DELETE `/memory_nodes/{node_id}`                | 高风险确认；删除后详情可能仍显示 `status=delete`   |
| Skill 导出   | `bl memory skill export`   | `--node-id`                              | GET `/skill/export/{node_id}`                   | 正文去除 frontmatter；JSON 保留技能元数据          |
| 创建画像模板 | `bl memory profile create` | `--name`、`--attributes`                 | POST `/profile_schemas`                         | 返回 `profile_schema_id`，不会自动提取用户画像     |
| 模板列表     | `bl memory profile list`   | 无                                       | GET `/profile_schemas`                          | 分页查询模板                                       |
| 模板详情     | `bl memory profile show`   | `--schema-id`                            | GET `/profile_schemas/{schema_id}`              | 返回模板定义及属性 `attribute_id`                  |
| 更新模板     | `bl memory profile update` | `--schema-id`，至少一个更新字段          | PATCH `/profile_schemas/{schema_id}`            | 修改模板字段、属性、策略档位或抽取场景             |
| 删除模板     | `bl memory profile delete` | `--schema-id`                            | DELETE `/profile_schemas/{schema_id}`           | 高风险确认；影响依赖该模板的画像访问               |
| 读取用户画像 | `bl memory profile get`    | `--schema-id`、`--user-id`               | GET `/profile_schemas/{schema_id}/user_profile` | 读取已抽取的用户画像属性值                         |

`profile update` 的更新字段是 `--name`、`--description`、`--attributes-operations`、`--plan-version`、`--extract-scene`。

## 数据对象与支持范围

| 对象                 | 写入 / 创建                                                | 查询                                                        | 更新                                 | 删除 / 导出               |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ | ------------------------- |
| observation 事实记忆 | `add` 消息抽取或内容直存                                   | `search` / `list` / `node show`                             | `update`                             | `delete`                  |
| skill 技能记忆       | `add`，选择已有 skill 规则；直存附技能三件套               | `search --memory-types skill` / 按规则 `list` / `node show` | `update`，附技能三件套               | `delete` / `skill export` |
| Profile Schema 模板  | `profile create`                                           | `profile list` / `profile show`                             | `profile update`                     | `profile delete`          |
| 用户画像值           | `add --profile-schema`；可选 `--extract-mode profile_only` | `profile get`                                               | 通过消息抽取演进；无直接值项编辑命令 | 无单用户画像清空命令      |
| 记忆库 / 片段规则    | 无管理命令，使用已有 ID                                    | 可在相应命令中指定范围                                      | 无管理命令                           | 无管理命令                |

技能三件套指 `--skill-name`、`--skill-description`、`--skill-tags`，三者必须一起传；标签可重复。

## 范围参数矩阵

| 命令                                     | `--user-id`            | `--library-id` | 规则参数                                      |
| ---------------------------------------- | ---------------------- | -------------- | --------------------------------------------- |
| `add`                                    | 必填                   | 可选           | 内容直存最多 1 个；消息抽取最多 5 个          |
| `search`                                 | 必填                   | 可选           | --project-ids 可重复；--project-id 为弃用别名 |
| `list`                                   | 必填                   | 可选           | 单个；省略仅查询默认规则                      |
| `update` / `delete`                      | 不支持，按节点 ID 定位 | 可选           | 不支持，按节点 ID 定位                        |
| `node show` / `skill export`             | 不支持                 | 不支持         | 不支持，按节点 ID 定位                        |
| `profile create/list/show/update/delete` | 不支持                 | 可选           | 不支持                                        |
| `profile get`                            | 必填                   | 可选           | 不支持，按模板 ID 定位                        |

`--workspace-id` 对全部命令有效；也可从 `BAILIAN_WORKSPACE_ID` 或配置 `workspace_id` 获取。记忆库参数省略时使用账号默认记忆库。不要给未声明范围参数的命令追加这些参数。

搜索的 `--memory-type` 是 `--memory-types` 的 deprecated 别名；`--project-id` 是 `--project-ids` 的 deprecated 别名。同组单复数参数互斥，CLI 统一发送复数字段。

## 关键行为矩阵

| 场景                              | 当前行为                                                          |
| --------------------------------- | ----------------------------------------------------------------- |
| `add` 同时传 content/messages     | 服务端以 content 为准，但 CLI 仍解析、校验 messages；建议只传一种 |
| `add --extract-mode profile_only` | 必须传 messages 和 profile-schema，不能传 content                 |
| `add --wait 0`                    | 返回提交回执；不代表抽取完成                                      |
| `add` 默认等待                    | 轮询预算 120 秒，轮询间隔 3 秒；超时后台仍可能运行                |
| `search` 同时传 query/messages    | messages 优先；query 会在单独使用时包装成一条 user 消息           |
| `search` 未指定类型               | 服务端默认 observation；查询 skill 须显式指定                     |
| `search` 策略选择                 | 通过 plan-version 选择 pro/lite；省略时服务端默认 pro             |
| `update` 的时间戳处理             | 保留原时间戳；不会自动改成当前时间                                |
| 模板属性变更                      | op 用小写 add/update/delete；后两者用 attribute_id 定位           |
| 删除确认                          | 节点、模板删除均由 runtime 提供 `--yes`；可先 `--dry-run`         |

## 使用边界

- `add` 自动轮询异步任务；当前没有独立的事件查询命令，可通过 `list` / `search` / `profile get` 核对结果。
- `profile update` 修改画像模板；用户画像值通过消息抽取更新，没有直接编辑命令。
- 记忆库与规则使用已有 ID，CLI 不提供其管理命令。
- 节点删除仅作用于指定节点，不代表清空用户的全部记忆或画像。
