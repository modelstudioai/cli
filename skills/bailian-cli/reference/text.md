# `bl text` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command        | Authentication | Description                                              |
| -------------- | -------------- | -------------------------------------------------------- |
| `bl text chat` | API Key        | Send a text model request (OpenAI compatible, DashScope) |

## Command details

### `bl text chat`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `text chat`                                                         |
| **Description**    | Send a text model request (OpenAI compatible, DashScope)            |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl text chat (--message <text> \| --messages-file <path>) [flags]` |

#### Flags

| Flag                      | Type   | Required | Description                                                                 |
| ------------------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `--api <chat\|responses>` | string | no       | API to call (default: chat)                                                 |
| `--model <model>`         | string | no       | Model ID (default: qwen3.8-max)                                             |
| `--message <text>`        | array  | no       | Message text (repeatable, prefix role: to set role); or use --messages-file |
| `--messages-file <path>`  | string | no       | Messages array for one request (use - for stdin)                            |
| `--system <text>`         | string | no       | System prompt                                                               |
| `--max-tokens <n>`        | number | no       | Maximum tokens to generate (default: 4096)                                  |
| `--temperature <n>`       | number | no       | Sampling temperature (0.0, 2.0]                                             |
| `--top-p <n>`             | number | no       | Nucleus sampling threshold                                                  |
| `--stream`                | switch | no       | Stream response tokens (default: on in TTY)                                 |
| `--tool <json-or-path>`   | array  | no       | Tool definition as JSON or file path (repeatable)                           |
| `--enable-thinking`       | switch | no       | Enable thinking/reasoning mode (for qwen3/qwq models)                       |
| `--thinking-budget <n>`   | number | no       | Max tokens for thinking (default: 4096)                                     |
| `--batch`                 | switch | no       | Single synchronous Batch Chat request (non-streaming)                       |
| `--prime`                 | switch | no       | Use Prime mode with a workspace-scoped endpoint                             |
| `--workspace-id <id>`     | string | no       | Workspace ID for the default Prime endpoint (or set BAILIAN_WORKSPACE_ID)   |
| `--api-key <key>`         | string | no       | API key                                                                     |
| `--base-url <url>`        | string | no       | API base URL                                                                |

#### Notes

- --batch sends one synchronous Batch Chat request, non-streaming even in TTY; cannot combine with --prime, --api responses or --stream. --message/--messages-file supply one request's conversation context, not independent file requests. File inference uses batch create/get/download: create returns a task ID without waiting for completion. Explicit realtime/international/Token Plan hosts are rejected; explicit Batch/custom proxy URLs retain existing credentials. No automatic fallback or POST replay.
- Batch Chat total request timeout defaults to 300s; --timeout must be 60–3600s.
- Prime mode requires an explicit model and currently supports only the Chat Completions API.
- Prime endpoint: configured --base-url, DASHSCOPE_BASE_URL, or profile base_url takes precedence; otherwise workspace is resolved from --workspace-id, BAILIAN_WORKSPACE_ID, then config workspace_id.

#### Examples

```bash
bl text chat --message "What is Qwen?"
```

```bash
bl text chat --api responses --model qwen3.8-max --tool '{"type":"web_search"}' --message "Search for recent Alibaba Cloud news"
```

```bash
bl text chat --model qwen-max --system "You are a coding assistant." --message "Write fizzbuzz in Python"
```

```bash
bl text chat --message "Hello" --message "assistant:Hi!" --message "How are you?"
```

```bash
bl text chat --batch --model qwen-plus --message "Hello" --timeout 3600
```

```bash
bl text chat --batch --model qwen-plus --messages-file messages.json --timeout 3600
```

```bash
bl text chat --messages-file - --stream
```

```bash
bl text chat --message "Hello" --output json
```

```bash
bl text chat --model qwq-plus --message "Solve 1+1" --enable-thinking
```

```bash
bl text chat --prime --workspace-id <id> --model glm-5.3-prime --message "Explain this code"
```
