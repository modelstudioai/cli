# 记忆写入与异步抽取命令手册

覆盖 `bl memory add`。从对话抽取事实或画像，也可直接保存明确的事实和技能正文。

> 鉴权、Workspace、输出格式、确认机制和退出码见[总览指南的通用约定](memory-cli-guide.md#通用约定)。示例沿用已配置的 API Key 和 Workspace；请替换尖括号中的 ID。命令参数表不重复全局参数，array 类型通过重复 flag 传入。

## `bl memory add`

从消息或自定义内容添加记忆（异步抽取）。接口：`POST /add-async`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]
```

**参数**

| 参数                            | 类型   | 必填 | 说明                                                                                                                       |
| ------------------------------- | ------ | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `--user-id <id>`                | string | 是   | 记忆实体 ID，标识记忆归属对象（必填）                                                                                      |
| `--messages <json>`             | string | 否   | 消息 JSON 数组：[{"role":"user","content":"..."},...]；role 支持 user/assistant/tool，兼容 OpenAI tool_calls（最多 50 条） |
| `--content <text>`              | string | 否   | 要原样记忆的自定义内容；优先级高于 --messages                                                                              |
| `--profile-schema <id>`         | string | 否   | 画像模板 ID；不传则不提取用户画像                                                                                          |
| `--extract-mode <profile_only>` | string | 否   | 仅抽取用户画像；需传 --profile-schema 和 --messages，不能传 --content                                                      |
| `--skill-name <name>`           | string | 否   | 技能名称（skill 记忆；需与 --skill-description、--skill-tags 同时传）                                                      |
| `--skill-description <text>`    | string | 否   | 技能描述（skill 记忆；需与 --skill-name、--skill-tags 同时传）                                                             |
| `--skill-tags <tag>`            | array  | 否   | 技能标签（可重复；需与 --skill-name、--skill-description 同时传）                                                          |
| `--meta-data <json>`            | string | 否   | 用户自定义信息 JSON 对象：{"location_name":"北京"}                                                                         |
| `--wait <seconds>`              | number | 否   | 轮询预算秒数，耗尽后按超时退出（默认：120）；0 表示提交后立即返回 event_id                                                 |
| `--project-id <id>`             | array  | 否   | 记忆片段规则 ID（消息抽取/搜索可重复；自定义内容仅支持一个）                                                               |
| `--library-id <id>`             | string | 否   | 记忆库 ID（默认：账号的默认记忆库）                                                                                        |

**参数约束**

- `--content` / `--messages` 至少一项；同时传入时 content 优先，但 messages 仍会被解析校验，建议只传一种。
- content 最多512个 JavaScript 字符串长度单位；messages 最多50条，必须为对象数组，不能含 null、数组或标量元素。
- 内容直存最多1个 project-id；消息抽取最多5个。user-id 最长64，library-id 最长32。
- profile_only 必须同时提供 messages 和 profile-schema，不能提供 content。
- skill-name、skill-description、skill-tags 必须一起提供；meta-data 必须是 JSON 对象。
- wait 是有限非负秒数，默认120；0只提交，不等待。JSON参数不支持 `@file` 语法。

**输出**

- text / quiet：wait=0显示提交摘要；等待完成时显示事件变化或无变化说明。quiet 不保证只输出ID。
- json：wait=0保留提交响应；等待完成返回 `request_id`、`event_id`、`events`。`event_id` 不是节点ID，从事件结果或 list/search 获取 `memory_node_id`。
- 部分任务失败时仍可能输出已完成部分，同时退出码为1；始终同时检查输出与退出码。

**注意事项**

默认轮询预算从提交后开始，覆盖轮询GET及间隔等待。空events不代表完成；正等待预算下缺event_id会输出回执后报无法确认完成。超时退出码5，后台任务可能继续，勿据此自动重复写入。

UNRECORDED表示这次没有记忆变化，不等于新增事实。一次抽取可能产生新增、更新或删除；没有独立的事件查询CLI。是否提取画像由profile-schema控制；创建模板本身不会生成画像。

消息格式示例见[用户技术指南](user-guide.md#3-写入并读取第一条记忆)，轮询细节见[异步任务与等待](user-guide.md#4-异步任务与等待)。

**示例**

```bash
# 保存一条确定事实，等待任务完成
bl memory add --user-id demo_user --content '用户喜欢骑行。' --wait 180 --output json

# 从对话抽取；不传模板时不提取用户画像
bl memory add --user-id demo_user --messages '[{"role":"user","content":"我住在杭州，周末喜欢骑行。"}]' --output json

# 仅抽取画像
bl memory add --user-id demo_user --profile-schema '<schema-id>' --extract-mode profile_only --messages '[{"role":"user","content":"我常住杭州。"}]' --output json

# 只提交：成功退出不等于抽取完成
bl memory add --user-id demo_user --content '用户喜欢摄影。' --wait 0 --output json
```
