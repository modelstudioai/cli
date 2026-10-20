# Skill记忆导出命令手册

覆盖skill export，并说明如何使用add/search/update操作skill类型的记忆节点。这里的Skill是服务端记忆类型，不是本地Agent宿主的安装管理。

> 鉴权、Workspace、输出格式、确认机制和退出码见[总览指南的通用约定](memory-cli-guide.md#通用约定)。示例沿用已配置的 API Key 和 Workspace；请替换尖括号中的 ID。命令参数表不重复全局参数，array 类型通过重复 flag 传入。

## `bl memory skill export`

导出 skill 记忆节点。接口：`GET /skill/export/{node_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory skill export --node-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明                      |
| ---------------- | ------ | ---- | ------------------------- |
| `--node-id <id>` | string | 是   | skill 记忆节点 ID（必填） |

**参数约束**

- node-id必填，目标应为skill节点。
- 不接受library-id、user-id或project-id；使用节点ID与Workspace定位。

**输出**

text / quiet输出服务导出的正文，不含frontmatter；json保留 `memory_node` 下的正文和技能元数据。命令不直接写文件，可用shell重定向。

**注意事项**

需要名称、描述和标签时保留JSON。导出不会自动安装Skill或生成完整技能目录；实际宿主集成不在本手册范围。node show中的content可能带frontmatter，不能与导出正文直接视为相同格式。

**示例**

```bash
bl memory skill export --node-id '<skill-node-id>' --output text > meeting-summary.md
bl memory skill export --node-id '<skill-node-id>' --output json > meeting-summary.json
```

## 写入、检索和更新Skill节点

先取得已有skill类型规则ID；CLI不提供规则创建或管理命令。内容直存时传齐skill-name、skill-description、skill-tags；标签可重复。

```bash
bl memory add --user-id demo_user --project-id '<skill-project-id>' \
  --content '整理会议记录：提取议题、决策、待办、负责人和截止时间。' \
  --skill-name meeting-summary --skill-description '整理会议行动清单' \
  --skill-tags office --skill-tags meeting --output json

bl memory search --user-id demo_user --query '整理会议记录' \
  --memory-types skill --project-ids '<skill-project-id>' --output json

# 使用返回的memory_node_id；即使只修改正文，也传齐技能三件套
bl memory update --node-id '<skill-node-id>' --content '按议题、决策和待办整理会议记录。' \
  --skill-name meeting-summary --skill-description '整理会议行动清单' \
  --skill-tags office --skill-tags meeting --output json
```

完整参数见[写入手册](add.md)、[检索手册](search.md)、[节点管理手册](node.md)。默认检索只包含observation，查询skill必须显式指定类型。
