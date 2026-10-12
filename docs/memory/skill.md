# Skill 记忆命令手册

Skill 记忆是 `memory_type=skill` 的记忆节点。写入和更新走 `memory add` / `memory update`，并附带技能名称、描述和标签。本页的独立命令是导出。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、Dry-run 模式）请参阅 [总览文档](./memory-cli-guide.md#通用约定)。

---

#### `bl memory skill export`

导出一个 skill 记忆节点。text 模式只输出去掉 frontmatter 之后的正文。

**用法**

```bash
bl memory skill export --node-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明              |
| ---------------- | ------ | ---- | ----------------- |
| `--node-id <id>` | string | 是   | Skill 记忆节点 ID |

本命令不接受 `--user-id` 或 `--library-id`。

**输出**

text / quiet：标准输出只有正文，不含技能名称、描述、标签，也不含 frontmatter。

json 模式：返回 `memory_node`，其中保留正文以及 `skill_name`、`skill_description`、`skill_tags`。

节点不存在时，text 模式输出 `Skill memory node not found.`

**注意事项**

- 导出不会安装 Skill，也不会生成技能目录。
- `node show` 的 content 可能仍带 frontmatter。需要可直接保存的正文时用本命令的 text 输出；需要元数据时保留 JSON。
- 节点 ID 来自 `memory search --memory-types skill`、按 skill 规则的 `memory list`，或写入成功时返回的 `memory_node_id`。

**示例**

```bash
bl memory skill export --node-id node-xxx --workspace-id ws-xxx

bl memory skill export --node-id node-xxx --output text > meeting-summary.md

bl memory skill export --node-id node-xxx --output json > meeting-summary.json
```

---

## 写入、检索和更新

CLI 不创建片段规则。先准备已有的 skill 规则 ID，再写入。技能三件套是 `--skill-name`、`--skill-description`、`--skill-tags`，三者一起出现，标签可重复。

```bash
bl memory add --user-id demo_user --project-id skill-project-xxx \
  --content '整理会议记录：提取议题、决策、待办、负责人和截止时间。' \
  --skill-name meeting-summary \
  --skill-description '将会议记录整理为决策和行动清单' \
  --skill-tags office --skill-tags meeting \
  --workspace-id ws-xxx

bl memory search --user-id demo_user --query '整理会议记录' \
  --memory-types skill --project-ids skill-project-xxx \
  --workspace-id ws-xxx
```

更新 skill 节点时，即使只改正文，也要再次传齐三件套。更新前用 `node show` 确认 `type` 为 skill。

```bash
bl memory update --node-id node-xxx \
  --content '整理会议记录：提取议题、决策、待办、负责人和截止时间。' \
  --skill-name meeting-summary \
  --skill-description '将会议记录整理为决策和行动清单' \
  --skill-tags office --skill-tags meeting \
  --workspace-id ws-xxx
```

参数与输出见 [memory add](node.md#bl-memory-add)、[memory search](node.md#bl-memory-search) 和 [memory update](node.md#bl-memory-update)。

---

← [返回总览](./memory-cli-guide.md)
