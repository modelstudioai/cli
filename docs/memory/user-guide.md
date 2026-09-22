# Memory CLI 用户技术指南

[文档首页](README.md) · [能力矩阵](cli-matrix.md) · [完整参数参考](../../skills/bailian-cli/reference/memory.md)

本指南帮助应用开发者用 `bl memory` 保存用户的长期记忆、召回相关信息、提取结构化画像，并管理可复用的 Skill 记忆。内容按 2026-09-22 工作区实现整理；发布范围见[文档首页](README.md)。

## 1. 先理解数据对象

| 对象               | 用途                                      | 标识                                                                |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------- |
| Workspace          | 选择 Memory API 所在工作空间              | `--workspace-id`                                                    |
| 记忆库             | 指定记忆数据所在库；省略用账号默认库      | `--library-id`                                                      |
| 记忆实体           | 业务中的用户或其他记忆归属对象            | `--user-id`                                                         |
| 片段规则 / project | 决定抽取规则及 observation / skill 等类型 | `--project-id`                                                      |
| 记忆节点           | 一条事实或技能记忆                        | 返回的 `memory_node_id`，用于 `--node-id`                           |
| 画像模板 / Schema  | 定义需要抽取的属性，如城市、爱好          | 返回的 `profile_schema_id`，用于 `--schema-id` / `--profile-schema` |
| 用户画像           | 某个用户在某模板下的属性值                | user ID + schema ID                                                 |

`--user-id` 是业务标识，不是 API Key 或阿里云账号 ID。应用应稳定地使用同一标识。`project-id` 是记忆片段规则 ID，不是本地项目路径。

## 2. 配置与检查

npm 安装要求 Node.js ≥ 18.17.0。完整安装流程见[安装说明](../../INSTALL.md)。

```bash
npm install -g bailian-cli
bl --version
bl memory --help
bl memory node show --help
bl memory skill export --help
```

如果本机没有本文的子命令，应先核对安装版本是否包含相应改动；源码包的版本字段不能证明 npm 已发布这些功能。

通过环境变量配置 API Key 和工作空间。将示例占位符替换为自己的值：

```bash
export DASHSCOPE_API_KEY='<your-api-key>'
export BAILIAN_WORKSPACE_ID='<your-workspace-id>'
```

Workspace 的解析优先级为命令 `--workspace-id`、环境变量 `BAILIAN_WORKSPACE_ID`、配置 `workspace_id`。需要持久配置时可以运行：

```bash
bl config set workspace_id '<your-workspace-id>'
```

当前实现按 Workspace 构造北京区绝对地址 `https://<workspace-id>.cn-beijing.maas.aliyuncs.com`。通用 `--base-url` 不能用来切换这组命令的 Workspace 网关。

以下示例使用默认记忆库；若使用指定库，在支持的命令中始终传同一个 `--library-id`。`node show` 和 `skill export` 仅通过节点 ID 定位，不接受记忆库参数。

## 3. 写入并读取第一条记忆

保存一条明确的事实，然后列出该用户的默认规则记忆：

```bash
bl memory add --user-id demo_user \
  --content '用户偏好 Python，回答时优先提供 Python 示例。' \
  --output json

bl memory list --user-id demo_user --output json

bl memory search --user-id demo_user \
  --query '用户偏好什么编程语言？' --output json
```

`add` 默认提交异步任务并等待结果。完成后，从事件结果或 `list` / `search` 返回的 `memory_nodes` 中获取 `memory_node_id`，再查看详情：

```bash
bl memory node show --node-id '<memory-node-id>' --output json
```

如果想从对话中抽取记忆，改用 `--messages`：

```bash
bl memory add --user-id demo_user \
  --messages '[{"role":"user","content":"我住在杭州，周末喜欢骑行。"},{"role":"assistant","content":"了解，我会据此提供建议。"}]' \
  --output json
```

消息抽取并非逐句追加：服务端可能新增、更新或删除已有节点，也可能没有记忆变化。一次最多 50 条消息，一问一答算两条。role 支持 `user`、`assistant`、`tool`；tool 消息需要 `tool_call_id`，tool_calls 支持 OpenAI 风格结构。CLI 接收内容结构不等于所有多模态组合均已验证。

不要同时传 `--content` 和 `--messages`。服务端以 content 为准，但 CLI 仍会校验 messages。

## 4. 异步任务与等待

```bash
# 提交后立即返回回执，适合调用方自行安排后续检查
bl memory add --user-id demo_user --content '用户喜欢骑行。' \
  --wait 0 --output json

# 延长轮询预算；verbose 将轮询进度写到 stderr
bl memory add --user-id demo_user \
  --messages '[{"role":"user","content":"最近开始学习摄影。"}]' \
  --wait 180 --verbose --output json
```

默认 `--wait 120`，轮询间隔为 3 秒；这是轮询预算，不是整个进程的严格时间上限。

| 状态       | 含义与处理                                            |
| ---------- | ----------------------------------------------------- |
| PENDING    | 等待处理，继续轮询                                    |
| RUNNING    | 正在执行，继续轮询                                    |
| SUCCEEDED  | 已实测的成功终态；检查 result，空数组可能表示没有变化 |
| UNRECORDED | 终态，CLI 展示状态；不能当作已写入成功                |
| FAILED     | 失败终态；CLI 输出结果并以非零状态退出                |

通常的状态变化为 `PENDING → RUNNING → SUCCEEDED`，轮询时不一定能观察到每个阶段。CLI 还兼容 `SUCCESS` 作为成功状态的拼写；这不是另一个执行阶段，也不表示它是当前后端已验证的标准返回值。

提交的 `event_id` 不是节点 ID。一个事件可以包含多项任务；轮询等待全部任务到达终态。存在部分失败时，成功部分可能已经落地，应逐项检查。

超时只表示 CLI 停止等待，后台任务可能仍在运行。稍后用 `list` / `search` / `profile get` 核对，避免直接重复提交。当前没有 `memory event` 查询命令。

## 5. 检索和分页

```bash
# 默认只检索 observation，限制结果数量与最低分数
bl memory search --user-id demo_user --query '周末活动偏好' \
  --top-k 5 --min-score 0.3 --plan-version lite --output json

# 同时检索事实和技能
bl memory search --user-id demo_user --query '如何整理会议记录' \
  --memory-types observation --memory-types skill --output json

# 按既有规则检索；project-ids 可重复
bl memory search --user-id demo_user --query '周末活动' \
  --project-ids '<project-id>' --output json

# 查看指定规则的第二页节点
bl memory list --user-id demo_user --project-id '<project-id>' \
  --page 2 --page-size 20 --output json
```

搜索推荐使用 `--project-ids`、`--memory-types`。保留 `--project-id`、`--memory-type` 作为 deprecated 别名；别名会归一化为请求中的 `project_ids`、`memory_types`。同组单复数参数不能同时传入。`add/list` 的 `--project-id` 仍是正常参数。

`search --messages '<JSON数组>'` 支持结合对话上下文检索，并优先于 `--query`。不传 `--project-id` 的 `list` 只查默认规则，不会汇总其他 observation 或 skill 规则。

检索的服务端默认值为 top_k=10、min_score=0.3；CLI 校验范围分别为 1–100 和 0–1。

通过 `--plan-version` 选择检索策略：

| 参数                  | 策略              |
| --------------------- | ----------------- |
| `--plan-version pro`  | pro，开启 rerank  |
| `--plan-version lite` | lite，关闭 rerank |
| 不传 `--plan-version` | 服务端默认 pro    |

不同策略计费不同，本文不提供价格承诺。

## 6. 更新和删除节点

```bash
bl memory update --node-id '<memory-node-id>' \
  --content '用户现在偏好 TypeScript。' \
  --meta-data '{"source":"user_correction"}' --output json
```

`--content` 全量替换节点内容；`--meta-data` 是 JSON 对象，按增量合并。CLI 不提供修改时间戳的参数，更新内容时保留原时间戳。更新和删除按节点 ID 定位，不接受 `--user-id`。

先查看详情并预览删除请求，确认目标后执行：

```bash
bl memory node show --node-id '<memory-node-id>' --output json
bl memory delete --node-id '<memory-node-id>' --dry-run --output json
# 确认目标后再运行；--yes 适用于已确认的自动化操作
bl memory delete --node-id '<memory-node-id>' --yes --output json
```

单节点删除后，详情接口仍可能返回 `status=delete`。这不代表删除请求失败，也不能据此承诺底层物理擦除或恢复能力。

## 7. 画像：创建模板、抽取、读取

### 创建模板

```bash
bl memory profile create --name travel_profile \
  --attributes '[{"name":"city","description":"用户常住城市"},{"name":"hobby","description":"用户的兴趣爱好"}]' \
  --plan-version lite --extract-scene efficient --output json
```

保存返回的 `profile_schema_id`。创建模板只定义属性，不会自动生成任何用户的画像。

`efficient` 支持 lite / pro；`intelligent` 必须搭配 pro。传 `intelligent + lite` 会被服务端拒绝（2026-09-22 live 验证）。

### 根据模板抽取

将下方占位符替换为刚创建的 Schema ID：

```bash
bl memory add --user-id demo_user --profile-schema '<profile-schema-id>' \
  --messages '[{"role":"user","content":"我常住杭州，喜欢骑行和摄影。"}]' \
  --output json
```

如果只需要画像、不需要同时抽取事实记忆，增加 `--extract-mode profile_only`。这个模式必须有 messages 和 profile-schema，不能有 content。

### 读取模板与画像

```bash
# 模板定义：属性有哪些、attribute_id 是什么
bl memory profile show --schema-id '<profile-schema-id>' --output json

# 指定用户已抽取出的属性值
bl memory profile get --schema-id '<profile-schema-id>' \
  --user-id demo_user --output json

bl memory profile list --page 1 --page-size 20 --output json
```

画像数据位于 `profile.attributes`，多值可能合并为 value 字符串。空属性可能省略 value，不应假设所有字段必有值。`attribute_id` 定位模板属性。CLI 当前不开放画像值项详情或单值项管理。

### 维护模板

```bash
bl memory profile update --schema-id '<profile-schema-id>' \
  --attributes-operations '[{"op":"add","name":"travel_style","description":"旅行方式偏好"}]' \
  --output json

bl memory profile update --schema-id '<profile-schema-id>' \
  --attributes-operations '[{"op":"update","attribute_id":"<attribute-id>","description":"长期稳定的兴趣"}]' \
  --output json

bl memory profile update --schema-id '<profile-schema-id>' \
  --plan-version pro --extract-scene intelligent --output json
```

这里的 attribute 是模板字段（如“城市”），value 是用户的具体值（如“杭州”）。当前更新模板仍使用 `--attributes-operations`，创建模板使用 `--attributes`；两者分别接收操作数组和定义数组。

属性 op 使用小写 `add` / `update` / `delete`。add 必须有 name；update/delete 必须有从 `profile show` 获取的 attribute_id。`profile update` 修改模板，不是直接编辑某个用户的画像值。模板更新也不应被当作历史数据自动重抽取的保证。

删除整个模板前确认依赖范围；它会影响使用该模板的用户画像访问，不是清空单个用户画像：

```bash
bl memory profile delete --schema-id '<profile-schema-id>' --dry-run --output json
# 确认影响范围后执行
bl memory profile delete --schema-id '<profile-schema-id>' --yes --output json
```

## 8. Skill 记忆

需要先取得已有的 skill 类型规则 ID。当前 CLI 不提供规则创建或管理命令。

```bash
bl memory add --user-id demo_user --project-id '<skill-project-id>' \
  --content '整理会议记录：提取议题、决策、待办、负责人和截止时间。' \
  --skill-name meeting-summary \
  --skill-description '将会议记录整理为决策和行动清单' \
  --skill-tags office --skill-tags meeting --output json

bl memory search --user-id demo_user --query '整理会议记录' \
  --memory-types skill --project-ids '<skill-project-id>' --output json
```

用返回的节点 ID 导出：

```bash
# 保存正文，不含 frontmatter
bl memory skill export --node-id '<skill-node-id>' --output text > meeting-summary.md

# 保存完整响应，包含 memory_node 下的正文与技能元数据
bl memory skill export --node-id '<skill-node-id>' --output json > meeting-summary.json
```

导出不会自动安装 Skill，也不会生成完整技能目录。详情接口的 content 可能含 frontmatter，而导出正文不含；需要技能名称、描述和标签时保留 JSON。

更新 skill 节点时，即使只修改正文，也要传齐 `--skill-name`、`--skill-description`、`--skill-tags`。更新前可用 `node show` 确认节点类型。

## 9. 参数约束与脚本集成

以下是当前 CLI 的本地校验，不应当作全部后端限制：

| 参数                                | 约束                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| user-id / library-id                | 最长 64 / 32                                           |
| add/update 的 content               | 最长 512                                               |
| add 的 messages                     | 最多 50 条                                             |
| add 的 project-id                   | 内容直存最多 1 个，消息抽取最多 5 个                   |
| Schema name / 属性 name             | 最长 32                                                |
| 属性 description / default_value    | 最长 128；清空 default_value 传空字符串，不能仅传 null |
| Schema description                  | 不固定为 128，服务端决定                               |
| wait                                | 非负数，单位为秒                                       |
| list/profile list 的 page/page-size | 至少 1；默认第 1 页、每页 10 条，不自动翻页            |

长度校验按 JavaScript 字符串 length 计算，包含某些 emoji 时不等于视觉字符数。

脚本显式使用 `--output json`，同时检查退出码；不要解析面向人的文本行，也不要同时使用会覆盖结构化输出的 `--quiet`。JSON 中保留 `request_id` / `event_id`，方便排查；字段可能缺省，按可选字段处理。

所有 Memory 命令都实现 `--dry-run`，可检查 endpoint、method 和 request。它不发送 Memory 业务请求，不证明远端鉴权、规则类型或抽取效果正确：

```bash
bl memory add --user-id demo_user \
  --messages '[{"role":"user","content":"我喜欢摄影。"}]' \
  --dry-run --output json
```

`--messages`、`--attributes`、`--attributes-operations` 接收 JSON 数组；`--meta-data` 接收 JSON 对象。当前实现直接解析参数文本，不提供这些参数的 `@file` 读取语法。


## 10. 常见问题

| 现象                         | 检查方法                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Workspace ID is required     | 设置 workspace 参数、环境变量或配置；API Key 本身不能补足它                      |
| 刚写入但找不到               | 检查异步任务是否完成、user/library/project 是否一致，以及 search 的 memory-types |
| list 看不到其他规则的节点    | 显式指定对应 project-id；默认列表不是全规则汇总                                  |
| Schema 存在但画像为空        | 确认 add 传入同一个 profile-schema，消息含目标信息，且任务已完成                 |
| Skill 更新被拒绝             | 检查技能三件套是否齐全、目标节点类型是否为 skill                                 |
| add 超时                     | 保留事件 ID，稍后查询结果；不要直接认定失败并重试写入                            |
| HTTP 429                     | 降低并发并退避；以服务端实际限制为准                                             |
| 返回 FAILED 或 HTTP 业务错误 | 查看原始服务端信息和 request_id；部分成功结果可能已落地                          |
| 删除后仍能 show              | 检查 status 是否为 delete，不以“还能读到”判断删除失败                            |

尚无直接画像值项编辑、整用户记忆清空、整用户画像清空、记忆库管理或规则管理命令，详见[能力矩阵](cli-matrix.md)。
