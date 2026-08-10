# 检索与对话命令手册

以下命令通过检索服务（agent）消费知识库。`search` 用于语义检索，`chat` 用于多轮对话。`retrieve` 已废弃。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](../knowledge-cli-guide.md#通用约定)。

---

#### `bl knowledge retrieve`

从知识库检索（已废弃，请用 `search` 替代）。

**用法**

```bash
bl knowledge retrieve --index-id <id> --query <text> [flags]
```

**参数**

| 参数                            | 类型   | 必填 | 说明                                                |
| ------------------------------- | ------ | ---- | --------------------------------------------------- |
| `--index-id <id>`               | string | 是   | 知识库 ID                                           |
| `--query <text>`                | string | 是   | 检索查询文本                                        |
| `--dense-similarity-top-k <n>`  | number | 否   | 稠密检索 top K                                      |
| `--sparse-similarity-top-k <n>` | number | 否   | 稀疏检索 top K                                      |
| `--rerank`                      | switch | 否   | 启用 rerank                                         |
| `--rerank-top-n <n>`            | number | 否   | rerank 返回 top N 结果                              |
| `--rerank-model <name>`         | string | 否   | rerank 模型名，如 `qwen3-rerank-hybrid`             |
| `--rerank-mode <mode>`          | string | 否   | rerank 模式：`qa`、`similar` 或 `custom`            |
| `--rerank-instruct <text>`      | string | 否   | 自定义 rerank 指令（`--rerank-mode custom` 时使用） |
| `--top-k <n>`                   | number | 否   | 返回结果数（已废弃，用 `--rerank-top-n` 替代）      |

**输出**

text/quiet 模式：

```
[1] (score: 0.9512)
检索到的文本内容...

[2] (score: 0.8734)
另一段文本内容...
```

> 无结果时输出 `No results found.`

json 模式：返回 API 原始响应。

**注意事项**

- **已废弃**，推荐使用 `search` 命令。`search` 通过 agent_id 驱动检索策略，支持更多高级特性。
- `--top-k` 已废弃，使用 `--rerank-top-n` 替代，传入 `--top-k` 会输出 stderr 警告。
- 此命令直接用 `--index-id` 检索，不需要创建检索服务。

**示例**

```bash
# 基础检索
bl knowledge retrieve --index-id idx-xxx --query "How to use Alibaba Cloud Bailian" --workspace-id ws-xxx

# 启用 rerank
bl knowledge retrieve --index-id idx-xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid
```

---

#### `bl knowledge search`

对知识库执行语义检索（RAG 检索）。

**用法**

```bash
bl knowledge search --query <text> --agent-id <id> [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                                                                                                      |
| --------------------------- | ------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--query <text>`            | string | 是   | 检索查询文本（不可为空）                                                                                                                  |
| `--agent-id <id>`           | string | 是   | 检索服务 ID（在控制台知识检索页面获取，或通过 `service list` 查看）                                                                       |
| `--agent-version <version>` | string | 否   | 服务版本：`beta`（调试草稿）或已发布版本号；默认调用最新已发布版本                                                                        |
| `--image <url>`             | array  | 否   | 图片 URL（可重复），用于多模态检索                                                                                                        |
| `--query-history <json>`    | string | 否   | 用户对话历史 JSON，用于上下文理解和查询改写。格式：`[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]` |

**参数约束**

- `--query` 不可为空（API 要求 `minLength: 1`）
- `--query-history` 必须是合法 JSON 数组

**输出**

text/quiet 模式：

```
[1] (score: 0.9512)
检索到的文本内容...

[2] (score: 0.8734)
另一段文本内容...
```

> 无结果时输出 `No results found.`

json 模式：返回 API 原始响应，`data.nodes[]` 包含检索结果。

**注意事项**

- 检索范围和策略（多知识库加权、路由、rerank 等）由 `--agent-id` 对应的服务配置驱动。只需 `--query` 和 `--agent-id` 即可调用。
- `--query-history` 传入前序对话轮次，服务端基于上下文改写查询以提升检索相关性。
- `--agent-version beta` 调用草稿配置进行调试，部署前验证效果。
- 与 `retrieve` 的区别：`search` 通过 agent_id 间接驱动检索策略（支持多知识库、路由、rerank 等），`retrieve` 直接操作 index_id 且功能较少。

**示例**

```bash
# 基础检索
bl knowledge search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx

# 多模态检索（带图片）
bl knowledge search --query "describe this image" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg

# 带对话历史的多轮检索
bl knowledge search --query "How does it work" --agent-id aid-xxx --workspace-id ws-xxx --query-history '[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is retrieval-augmented generation"}]'

# 调试草稿版本
bl knowledge search --query "test" --agent-id aid-xxx --agent-version beta --workspace-id ws-xxx
```

---

#### `bl knowledge chat`

与知识库进行 RAG 对话（流式输出）。

**用法**

```bash
bl knowledge chat --message <text> --agent-id <id> [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                                                                                           |
| --------------------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--message <text>`          | array  | 是¹  | 消息文本（可重复）。支持 `role:content` 前缀设置角色（如 `user:hello`），默认角色为 `user`。也支持完整 JSON 对象传递结构化消息 |
| `--agent-id <id>`           | string | 是   | Q&A 服务 ID（在控制台知识问答页面获取，或通过 `service list --scene chat` 查看）                                               |
| `--agent-version <version>` | string | 否   | 服务版本：`beta`（调试草稿）或已发布版本号；默认调用最新已发布版本                                                             |
| `--image <url>`             | array  | 否   | 图片 URL（可重复）。附加到最后一条 user 消息作为多模态内容                                                                     |

> ¹ `--message` 或 `--image` 至少提供其一。纯图片查询可以只传 `--image`（CLI 会自动创建空 user 消息承载图片）。

**参数约束**

- `--message` 或 `--image` 至少提供一个
- `--image` 不能与已包含 `image_url` 内容部分的消息同时使用

**输出**

**TTY text 模式**（实时流式）：

```
🔍 Retrieving...
✍️ Generating...
这是AI生成的回答内容，逐字流式输出...
```

> 进度标签由 SSE `step_change` 事件驱动：`tool_calling`（检索中）→ `plan_start`（规划中）→ `generation_start`（生成中）。

**非 TTY text 模式**（缓冲输出）：

```
完整的回答文本...
```

**json 模式**（`--output json`）：

```json
{
  "answer": "完整的回答文本...",
  "request_id": "xxx"
}
```

quiet 模式：输出完整的回答文本。

**注意事项**

- API 仅支持 SSE 流式响应。TTY 环境下实时打印 token；非 TTY 环境缓冲后输出完整文本。
- SSE 事件生命周期：`tool_calling` → `tool_return` → `plan_start` → `planning` → `plan_end` → `generation_start` → `generating` → `generation_end`。`tool_calling` → `tool_return` 可能循环多次。
- 多轮对话：用 `--message "user:..."` 和 `--message "assistant:..."` 传递对话历史。
- `--agent-version beta` 调用草稿配置进行调试。
- `--image` 附加到最后一条 user 消息上。如果消息中已包含 `image_url` 内容部分，则不能再用 `--image`。
- `--verbose` 模式下，所有 SSE 事件详情会输出到 stderr。

**示例**

```bash
# 单轮对话
bl knowledge chat --message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx

# 多轮对话（带历史）
bl knowledge chat \
  --message "user:What is RAG?" \
  --message "assistant:RAG is retrieval-augmented generation..." \
  --message "How does it work?" \
  --agent-id aid-xxx --workspace-id ws-xxx

# 多模态对话（带图片）
bl knowledge chat \
  --message "Describe these images" \
  --image https://example.com/a.png \
  --image https://example.com/b.png \
  --agent-id aid-xxx --workspace-id ws-xxx

# 调试草稿版本
bl knowledge chat --message "test" --agent-id aid-xxx --agent-version beta --workspace-id ws-xxx
```

---

← [返回总览](../knowledge-cli-guide.md)
