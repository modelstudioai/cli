# 记忆检索命令手册

覆盖 `bl memory search`。根据用户问题或对话上下文召回事实、技能记忆。

> 鉴权、Workspace、输出格式、确认机制和退出码见[总览指南的通用约定](memory-cli-guide.md#通用约定)。示例沿用已配置的 API Key 和 Workspace；请替换尖括号中的 ID。命令参数表不重复全局参数，array 类型通过重复 flag 传入。

## `bl memory search`

通过查询文本或消息搜索记忆节点。接口：`POST /memory_nodes/search`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory search --user-id <id> [--query <text>] [flags]
```

**参数**

| 参数                                  | 类型   | 必填 | 说明                                                                  |
| ------------------------------------- | ------ | ---- | --------------------------------------------------------------------- |
| `--user-id <id>`                      | string | 是   | 记忆实体 ID，标识记忆归属对象（必填）                                 |
| `--query <text>`                      | string | 否   | 搜索文本；作为单条用户消息发送                                        |
| `--messages <json>`                   | string | 否   | 用于上下文搜索的消息 JSON 数组；优先于 --query                        |
| `--top-k <n>`                         | number | 否   | 最大召回个数，1~100（默认：10）                                       |
| `--min-score <score>`                 | number | 否   | 最小相似度分数阈值，0~1（默认：0.3；仅 pro 生效）                     |
| `--memory-types <observation\|skill>` | array  | 否   | 搜索的记忆类型（可重复；服务端默认仅 observation）                    |
| `--memory-type <observation\|skill>`  | string | 否   | 已弃用：--memory-types 的别名，不能与 --memory-types 同时传入         |
| `--project-ids <id>`                  | array  | 否   | 记忆片段规则 ID（可重复）                                             |
| `--project-id <id>`                   | array  | 否   | 已弃用：--project-ids 的别名（可重复），不能与 --project-ids 同时传入 |
| `--plan-version <pro\|lite>`          | string | 否   | 策略版本：pro（开启 Rerank）或 lite（关闭 Rerank），计费单价不同      |
| `--library-id <id>`                   | string | 否   | 记忆库 ID（默认：账号的默认记忆库）                                   |

**参数约束**

- query / messages 至少一项；同时传入时messages优先。query会包装成一条user消息发送。
- top-k 范围1–100，服务默认10；min-score 范围0–1，服务默认0.3。
- **min-score仅在pro时生效；lite不按该阈值过滤。** 省略plan-version时服务默认pro。
- memory-types 可重复指定observation/skill；不传时仅observation。
- project-ids / project-id 不能混用；memory-types / memory-type 不能混用。单数形式为兼容保留的弃用别名。
- user-id 最长64、library-id 最长32；messages为对象数组。

**输出**

text / quiet 每条显示类型（如有）、节点ID、正文和分数（如有），空结果显示提示。json保留响应中的 `memory_nodes`、`request_id` 等字段；分数位于节点的 `score`。空结果本身不是错误。

**注意事项**

不同plan的检索策略及计费不同，不应跨策略直接比较分数。省略的top-k/min-score由服务提供默认值，CLI不主动补写。

search用于相关性召回；需要分页列举已保存节点时使用[list](node.md#bl-memory-list)。检索不到时先检查异步写入是否完成，以及user/library/project/memory-types范围。

**示例**

```bash
# pro阈值过滤
bl memory search --user-id demo_user --query '用户喜欢什么运动？' --plan-version pro --top-k 5 --min-score 0.8 --output json

# lite检索：不设置无效的分数阈值
bl memory search --user-id demo_user --query '周末运动' --plan-version lite --top-k 5 --output json

# 对话上下文；同时召回事实与技能
bl memory search --user-id demo_user --messages '[{"role":"user","content":"帮我整理会议记录"}]' --memory-types observation --memory-types skill --output json

# 指定已有规则和记忆库
bl memory search --user-id demo_user --query '运动' --project-ids '<project-id>' --library-id '<library-id>' --output json
```
