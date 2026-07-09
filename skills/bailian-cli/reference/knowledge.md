# `bl knowledge` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                 | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `bl knowledge chat`     | Chat with a Bailian knowledge base (RAG Q&A with streaming)               |
| `bl knowledge retrieve` | Retrieve from a Bailian knowledge base (deprecated, use `search` instead) |
| `bl knowledge search`   | Search a Bailian knowledge base (RAG semantic retrieval)                  |

## Command details

### `bl knowledge chat`

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| **Name**        | `knowledge chat`                                             |
| **Description** | Chat with a Bailian knowledge base (RAG Q&A with streaming)  |
| **Usage**       | `bl knowledge chat --message <text> --agent-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                                                            |
| --------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--message <text>`    | array  | no       | Message text (repeatable). Supports role:content prefix to set role (e.g. user:hello), defaults to user. Follows OpenAI message format |
| `--agent-id <id>`     | string | yes      | Q&A service ID (find in console knowledge Q&A page)                                                                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                        |
| `--image <url>`       | array  | no       | Image URL (repeatable). Attached to the last user message as multimodal content                                                        |
| `--api-key <key>`     | string | no       | API key                                                                                                                                |
| `--base-url <url>`    | string | no       | API base URL                                                                                                                           |

#### Notes

- Response is returned as SSE stream events. Event lifecycle: tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end. tool_calling → tool_return may loop multiple times.
- Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.
- Multi-turn: use --message "user:..." and --message "assistant:..." to pass conversation history.

#### Examples

```bash
bl knowledge chat --message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge chat --message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge chat --message "Describe these images" --image https://example.com/a.png --image https://example.com/b.png --agent-id aid-xxx --workspace-id ws-xxx
```

### `bl knowledge retrieve`

| Field           | Value                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| **Name**        | `knowledge retrieve`                                                      |
| **Description** | Retrieve from a Bailian knowledge base (deprecated, use `search` instead) |
| **Usage**       | `bl knowledge retrieve --index-id <id> --query <text> [flags]`            |

#### Flags

| Flag                            | Type   | Required | Description                                        |
| ------------------------------- | ------ | -------- | -------------------------------------------------- |
| `--index-id <id>`               | string | yes      | Knowledge base index ID (required)                 |
| `--query <text>`                | string | yes      | Search query (required)                            |
| `--dense-similarity-top-k <n>`  | number | no       | Dense retrieval top K                              |
| `--sparse-similarity-top-k <n>` | number | no       | Sparse retrieval top K                             |
| `--rerank`                      | switch | no       | Enable reranking                                   |
| `--rerank-top-n <n>`            | number | no       | Rerank top N results                               |
| `--rerank-model <name>`         | string | no       | Rerank model, e.g. qwen3-rerank-hybrid             |
| `--rerank-mode <mode>`          | string | no       | Rerank mode: qa, similar, or custom                |
| `--rerank-instruct <text>`      | string | no       | Custom rerank instruction, when mode=custom        |
| `--top-k <n>`                   | number | no       | Number of results (deprecated, use --rerank-top-n) |
| `--api-key <key>`               | string | no       | API key                                            |
| `--base-url <url>`              | string | no       | API base URL                                       |

#### Examples

```bash
bl knowledge retrieve --index-id idx_xxx --query "How to use Alibaba Cloud Bailian"
```

```bash
bl knowledge retrieve --index-id idx_xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid
```

### `bl knowledge search`

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| **Name**        | `knowledge search`                                           |
| **Description** | Search a Bailian knowledge base (RAG semantic retrieval)     |
| **Usage**       | `bl knowledge search --query <text> --agent-id <id> [flags]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                                                                                                                  |
| ------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--query <text>`         | string | yes      | Search query text (required, cannot be empty)                                                                                                                                |
| `--agent-id <id>`        | string | yes      | Retrieval service ID (find in console knowledge retrieval page)                                                                                                              |
| `--workspace-id <id>`    | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                                                              |
| `--image <url>`          | array  | no       | Image URL for multimodal retrieval (repeatable)                                                                                                                              |
| `--query-history <json>` | string | no       | User conversation history JSON for context understanding and query rewriting. Format: '[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]' |
| `--api-key <key>`        | string | no       | API key                                                                                                                                                                      |
| `--base-url <url>`       | string | no       | API base URL                                                                                                                                                                 |

#### Notes

- Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Only query and agent_id are required.
- Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.
- `--query-history` passes prior conversation turns; the server rewrites the query based on context to improve retrieval relevance.

#### Examples

```bash
bl knowledge search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge search --api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg
```

```bash
bl knowledge search --query "How does it work" --agent-id aid-xxx --workspace-id ws-xxx --query-history '[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is retrieval-augmented generation"}]'
```
