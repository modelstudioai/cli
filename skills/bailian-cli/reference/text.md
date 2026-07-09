# `bl text` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command        | Description                                           |
| -------------- | ----------------------------------------------------- |
| `bl text chat` | Send a chat completion (OpenAI compatible, DashScope) |

## Command details

### `bl text chat`

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Name**        | `text chat`                                           |
| **Description** | Send a chat completion (OpenAI compatible, DashScope) |
| **Usage**       | `bl text chat --message <text> [flags]`               |

#### Flags

| Flag                     | Type   | Required | Description                                                                 |
| ------------------------ | ------ | -------- | --------------------------------------------------------------------------- |
| `--model <model>`        | string | no       | Model ID (default: qwen3.7-max)                                             |
| `--message <text>`       | array  | no       | Message text (repeatable, prefix role: to set role); or use --messages-file |
| `--messages-file <path>` | string | no       | JSON file with messages array (use - for stdin)                             |
| `--system <text>`        | string | no       | System prompt                                                               |
| `--max-tokens <n>`       | number | no       | Maximum tokens to generate (default: 4096)                                  |
| `--temperature <n>`      | number | no       | Sampling temperature (0.0, 2.0]                                             |
| `--top-p <n>`            | number | no       | Nucleus sampling threshold                                                  |
| `--stream`               | switch | no       | Stream response tokens (default: on in TTY)                                 |
| `--tool <json-or-path>`  | array  | no       | Tool definition as JSON or file path (repeatable)                           |
| `--enable-thinking`      | switch | no       | Enable thinking/reasoning mode (for qwen3/qwq models)                       |
| `--thinking-budget <n>`  | number | no       | Max tokens for thinking (default: 4096)                                     |
| `--api-key <key>`        | string | no       | API key                                                                     |
| `--base-url <url>`       | string | no       | API base URL                                                                |

#### Examples

```bash
bl text chat --message "What is Qwen?"
```

```bash
bl text chat --model qwen-max --system "You are a coding assistant." --message "Write fizzbuzz in Python"
```

```bash
bl text chat --message "Hello" --message "assistant:Hi!" --message "How are you?"
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
