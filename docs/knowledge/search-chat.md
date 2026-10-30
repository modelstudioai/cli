# 检索与对话命令手册

以下命令通过检索服务（agent）消费知识库。`search` 用于语义检索，`chat` 用于多轮对话。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](knowledge-cli-guide.md#通用约定)。

---

#### `bl knowledge search`

对知识库执行语义检索（RAG 检索）。

**用法**

```bash
bl knowledge search --agent-id <id> (--query <text> | --image <url>) [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                                |
| --------------------------- | ------ | ---- | ------------------------------------------------------------------- |
| `--query <text>`            | string | 否   | 检索文本（或提供 image）                                            |
| `--agent-id <id>`           | string | 是   | 检索服务 ID（在控制台知识检索页面获取，或通过 `service list` 查看） |
| `--agent-version <version>` | string | 否   | 服务版本：`beta`（调试草稿）或已发布版本号；默认调用最新已发布版本  |
| `--image <url>`             | array  | 否   | 图片 URL（可重复），用于多模态检索                                  |

**参数约束**

- 文本或图片至少提供一种有效输入；纯图片时 query 发送空串。

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
- `--agent-version beta` 调试草稿配置进行调试，部署前验证效果。
- `search` 通过 agent_id 驱动检索策略，支持多知识库、路由、rerank 等。

**示例**

```bash
# 基础检索
bl knowledge search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx

# 多模态检索（带图片）
bl knowledge search --query "describe this image" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg

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
  "request_id": "xxx",
  "phases": [],
  "tools": [],
  "docs": [],
  "usage": null,
  "events": []
}
```

quiet 模式：输出完整的回答文本。

**注意事项**

- API 仅支持 SSE 流式响应。TTY 环境下实时打印 token；非 TTY 环境缓冲后输出完整文本。
- SSE 事件生命周期：`tool_calling` → `tool_return` → `plan_start` → `planning` → `plan_end` → `generation_start` → `generating` → `generation_end`。`tool_calling` → `tool_return` 可能循环多次。
- 多轮对话：用 `--message "user:..."` 和 `--message "assistant:..."` 传递对话历史。
- `--agent-version beta` 调用草稿配置进行调试。
- `--image` 附加到最后一条 user 消息上。如果消息中已包含 `image_url` 内容部分，则不能再用 `--image`。
- `--verbose` 模式下，SSE 事件类型诊断会输出到 stderr；原始事件可在 JSON events 中查看。

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

← [返回总览](knowledge-cli-guide.md)

## 媒体结果与问答输出合同

search 的 JSON 保留原始结果，text 展示片段时间、画面描述与媒体来源；空转写不意味着空切片。clip 时间以毫秒读取，音频分段可能跨 clip 边界，JSON 不裁剪。

纯图片可省略 query；文本与图片至少提供一种。`--kb-search-configs-file` 接受数组，每项只有唯一非空 `id` 和可选 `search_filters` 数组；过滤对象内字段保留给服务端校验，不在请求中覆盖 rerank、权重等离线策略。

```bash
bl knowledge search --agent-id aid-xxx --image https://example.com/frame.png
bl knowledge search --agent-id aid-xxx --query '相关片段' --kb-search-configs-file ./filters.json
bl knowledge chat --agent-id aid-xxx --messages-file ./messages.json --output json
```

chat 仍使用 SSE 接口，各输出模式共享事件聚合：

| 模式                     | stdout                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| JSON                     | answer 只含最终回答，request_id 保留；新增 phases、tools、docs、usage、events |
| text + TTY               | 按规划/工具/回答显示过程，末尾可读来源摘要                                    |
| text + 管道              | 仅最终回答                                                                    |
| quiet，包括 JSON + quiet | 仅裸最终回答；TTY 同样遵守                                                    |
| verbose                  | 主结果不变，事件诊断写 stderr                                                 |

`events` 顺序保存原始 SSE event/data，未知字段不会因聚合而丢失；不是 HTTP 字节流快照。`usage` 取最终生成结算帧，不能将累计帧相加；工具阶段用量可在原始事件中查看。无完整最终回答或流中断会非零退出，不把规划或工具摘要当作成功回答。相比旧版，answer 不再混入过程文本，依赖旧混合内容的脚本需要改读 phases/tools/events。

`--messages-file` 为完整消息 JSON 数组，与 message/image 互斥；支持 user、assistant、tool，保留 tool_calls、tool_call_id 和未知消息字段。tool_call_id 应使用原始工具调用 ID。其他可选参数：`--session-file-id`（可重复，最多 10 个）、`--enable-cache-control true|false`、`--request-id`。会话附件要求服务开启文件预解析，并使用 SESSION_FILE 注册的 fileId；缓存命中不保证每次发生。
