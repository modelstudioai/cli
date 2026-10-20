# 记忆节点管理命令手册

覆盖list、node show、update、delete。节点ID取自响应的 `memory_node_id`，不要使用写入回执的event_id替代。

> 鉴权、Workspace、输出格式、确认机制和退出码见[总览指南的通用约定](memory-cli-guide.md#通用约定)。示例沿用已配置的 API Key 和 Workspace；请替换尖括号中的 ID。命令参数表不重复全局参数，array 类型通过重复 flag 传入。

## `bl memory list`

列出用户的记忆节点。接口：`GET /memory_nodes`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory list --user-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                      |
| ------------------- | ------ | ---- | ----------------------------------------- |
| `--user-id <id>`    | string | 是   | 记忆实体 ID，标识记忆归属对象（必填）     |
| `--page-size <n>`   | number | 否   | 每页结果数（默认：10）                    |
| `--page <n>`        | number | 否   | 页码（默认：1）                           |
| `--project-id <id>` | string | 否   | 记忆片段规则 ID（默认：记忆库的默认规则） |
| `--library-id <id>` | string | 否   | 记忆库 ID（默认：账号的默认记忆库）       |

**参数约束**

- user-id最长64、library-id最长32。page/page-size至少1，服务默认第1页、每页10条。
- project-id只接受一个规则ID；不传时仅查询默认规则，不代表全规则汇总。

**输出**

json返回 `memory_nodes` / `total` 等字段；text / quiet显示类型、节点ID、正文、元数据和总数（如有），空集合显示提示。

**注意事项**

每次只返回一页，不自动翻页。需要其他规则的节点时显式传project-id；语义召回使用search。

**示例**

```bash
bl memory list --user-id demo_user --page 1 --page-size 20 --output json
bl memory list --user-id demo_user --project-id '<project-id>' --library-id '<library-id>' --output json
```

---

## `bl memory node show`

查看单个记忆节点的完整详情。接口：`GET /memory_nodes/{node_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory node show --node-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明                |
| ---------------- | ------ | ---- | ------------------- |
| `--node-id <id>` | string | 是   | 记忆节点 ID（必填） |

**参数约束**

- 必须提供node-id。此命令不接受user-id、library-id或project-id。

**输出**

json返回 `memory_node`；text / quiet显示正文、类型、状态、规则、时间戳和元数据等存在的字段。

**注意事项**

已删除的节点仍可能返回status=delete，不能以“仍能查看”判断删除失败。

**示例**

```bash
bl memory node show --node-id '<node-id>' --output json
```

---

## `bl memory update`

更新记忆节点内容。接口：`PATCH /memory_nodes/{node_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory update --node-id <id> --content <text> [flags]
```

**参数**

| 参数                         | 类型   | 必填 | 说明                                                                  |
| ---------------------------- | ------ | ---- | --------------------------------------------------------------------- |
| `--node-id <id>`             | string | 是   | 记忆节点 ID（必填）                                                   |
| `--content <text>`           | string | 是   | 记忆节点的新内容，最多 512 个字符（必填）                             |
| `--meta-data <json>`         | string | 否   | 用户自定义信息 JSON 对象，增量合并：{"key":"value"}                   |
| `--skill-name <name>`        | string | 否   | 技能名称（skill 记忆；需与 --skill-description、--skill-tags 同时传） |
| `--skill-description <text>` | string | 否   | 技能描述（skill 记忆；需与 --skill-name、--skill-tags 同时传）        |
| `--skill-tags <tag>`         | array  | 否   | 技能标签（可重复；需与 --skill-name、--skill-description 同时传）     |
| `--library-id <id>`          | string | 否   | 记忆库 ID（默认：账号的默认记忆库）                                   |

**参数约束**

- content必填，最长512；meta-data必须为JSON对象；library-id最长32。
- 技能三件套要一起传；更新skill节点时即使只改正文，也应传齐。

**输出**

json保留服务响应；text / quiet输出节点更新确认信息。

**注意事项**

content整体替换，meta-data增量合并；原时间戳保留。此命令不更新已提取的用户画像。无单独的metadata-only参数组合；更新后用node show读回。

**示例**

```bash
bl memory update --node-id '<node-id>' --content '用户现在更喜欢游泳。' --meta-data '{"source":"user_correction"}' --output json
bl memory node show --node-id '<node-id>' --output json
```

---

## `bl memory delete`

删除记忆节点。接口：`DELETE /memory_nodes/{node_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory delete --node-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填         | 说明                                |
| ------------------- | ------ | ------------ | ----------------------------------- |
| `--node-id <id>`    | string | 是           | 记忆节点 ID（必填）                 |
| `--library-id <id>` | string | 否           | 记忆库 ID（默认：账号的默认记忆库） |
| `--yes`             | switch | 实际执行时是 | 确认删除；dry-run 不要求            |

**参数约束**

- node-id必填，library-id最长32。实际删除需--yes；dry-run无需确认。

**输出**

json保留服务响应；text / quiet输出节点删除确认信息。

**注意事项**

只删除指定节点，不删除已提取的画像值或模板，也不是整用户数据清空。删除后结合详情status、列表和检索核对；不承诺底层物理擦除或恢复。

**示例**

```bash
bl memory delete --node-id '<node-id>' --dry-run --output json
# 确认节点ID后执行
bl memory delete --node-id '<node-id>' --yes --output json
```
