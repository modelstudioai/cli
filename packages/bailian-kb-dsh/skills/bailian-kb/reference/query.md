# `bl knowledge search` / `chat` — 检索与问答（仅部署验证用）

> **日常检索/问答走原生工具 `kb_search` / `kb_chat`，不走 bl。**
> 这两条命令只在两种场景下使用：(1) 部署前用 `--agent-version beta` 调试草稿配置；(2) 排查原生工具与 CLI 行为差异。
> 通用鉴权/全局 flag 见 [index.md](index.md)。

## `bl knowledge search`

RAG 语义检索。

```
Usage: bl knowledge search --query <text> --agent-id <id> [flags]
```

| Flag                        | 说明                                                     |
| --------------------------- | -------------------------------------------------------- |
| `--query <text>`            | 查询文本（必填，不能为空）                               |
| `--agent-id <id>`           | 检索服务 ID                                              |
| `--agent-version <version>` | 调用版本：beta（草稿调试）或已发布版本号；默认最新发布版 |
| `--image <url>`             | 多模态检索图片 URL（可重复）                             |

Notes：

- 检索范围与策略（多库加权、路由、rerank 等）由 agent_id 的服务配置决定，只有 query 和 agent_id 必填。

```bash
bl knowledge search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
bl knowledge search --query "test" --agent-id aid-xxx --agent-version beta
```

## `bl knowledge chat`

RAG 问答（SSE 流式）。

```
Usage: bl knowledge chat --message <text> --agent-id <id> [flags]
```

| Flag                        | 说明                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `--message <text>`          | 消息（可重复）。支持 `role:content` 前缀设角色（如 `user:hello`），默认 user，遵循 OpenAI 消息格式 |
| `--agent-id <id>`           | 问答服务 ID                                                                                        |
| `--agent-version <version>` | beta 或已发布版本号；默认最新发布版                                                                |
| `--image <url>`             | 图片 URL（可重复），作为多模态内容附加到最后一条 user 消息                                         |

Notes：

- 响应为 SSE 流。事件生命周期：tool_calling → tool_return →（可循环）→ plan_start → planning → plan_end → generation_start → generating → generation_end。
- 多轮对话：用 `--message "user:..."` 和 `--message "assistant:..."` 传历史。

```bash
bl knowledge chat --message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
bl knowledge chat --message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx
```

## `bl knowledge retrieve`（已废弃）

改用 `bl knowledge search`。
