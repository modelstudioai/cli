# `bl agent` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Description                                   |
| ---------------- | --------------------------------------------- |
| `bl agent setup` | Configure a coding agent to use DashScope API |

## Command details

### `bl agent setup`

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| **Name**        | `agent setup`                                                                    |
| **Description** | Configure a coding agent to use DashScope API                                    |
| **Usage**       | `bl agent setup --agent <name> --base-url <url> --api-key <key> --model <model>` |

#### Options

| Flag               | Type   | Required | Description                                                             |
| ------------------ | ------ | -------- | ----------------------------------------------------------------------- |
| `--agent <name>`   | string | no       | Target agent: claude-code, qwen-code, opencode, openclaw, hermes, codex |
| `--base-url <url>` | string | no       | API base URL                                                            |
| `--api-key <key>`  | string | no       | API key                                                                 |
| `--model <model>`  | string | no       | Default model name                                                      |

#### Examples

```bash
npx bailian-cli agent setup --agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli agent setup --agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.6-plus
```

```bash
npx bailian-cli agent setup --agent opencode --base-url https://dashscope.aliyuncs.com/apps/anthropic/v1 --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli agent setup --agent openclaw --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.6-plus
```

```bash
npx bailian-cli agent setup --agent hermes --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli agent setup --agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.7-max
```
