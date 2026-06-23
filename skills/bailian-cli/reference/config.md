# `bl config` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                   | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `bl config agent`         | Configure a coding agent to use DashScope API                                       |
| `bl config export-schema` | Export all (or one) CLI command(s) as Anthropic/OpenAI-compatible JSON tool schemas |
| `bl config set`           | Set a config value                                                                  |
| `bl config show`          | Display current configuration                                                       |

## Command details

### `bl config agent`

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| **Name**        | `config agent`                                                                    |
| **Description** | Configure a coding agent to use DashScope API                                     |
| **Usage**       | `bl config agent --agent <name> --base-url <url> --api-key <key> --model <model>` |

#### Options

| Flag               | Type   | Required | Description                                                             |
| ------------------ | ------ | -------- | ----------------------------------------------------------------------- |
| `--agent <name>`   | string | no       | Target agent: claude-code, qwen-code, opencode, openclaw, hermes, codex |
| `--base-url <url>` | string | no       | API base URL                                                            |
| `--api-key <key>`  | string | no       | API key                                                                 |
| `--model <model>`  | string | no       | Default model name                                                      |

#### Examples

```bash
npx bailian-cli config agent --agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli config agent --agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.6-plus
```

```bash
npx bailian-cli config agent --agent opencode --base-url https://dashscope.aliyuncs.com/apps/anthropic/v1 --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli config agent --agent openclaw --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.6-plus
```

```bash
npx bailian-cli config agent --agent hermes --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3.7-max
```

```bash
npx bailian-cli config agent --agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3.7-max
```

### `bl config export-schema`

| Field           | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| **Name**        | `config export-schema`                                                              |
| **Description** | Export all (or one) CLI command(s) as Anthropic/OpenAI-compatible JSON tool schemas |
| **Usage**       | `bl config export-schema [--command "<name>"]`                                      |

#### Options

| Flag               | Type   | Required | Description                                                       |
| ------------------ | ------ | -------- | ----------------------------------------------------------------- |
| `--command <name>` | string | no       | Export schema for a specific command only (e.g. "image generate") |

#### Examples

```bash
bl config export-schema
```

```bash
bl config export-schema --command "video generate"
```

### `bl config set`

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| **Name**        | `config set`                                |
| **Description** | Set a config value                          |
| **Usage**       | `bl config set --key <key> --value <value>` |

#### Options

| Flag              | Type   | Required | Description                                                                                                                                  |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--key <key>`     | string | no       | Config key (base*url, output, output_dir, timeout, api_key, access_token, default*\*\_model, access_key_id, access_key_secret, workspace_id) |
| `--value <value>` | string | no       | Value to set                                                                                                                                 |

#### Examples

```bash
bl config set --key output --value json
```

```bash
bl config set --key timeout --value 600
```

```bash
bl config set --key base_url --value https://dashscope.aliyuncs.com
```

### `bl config show`

| Field           | Value                         |
| --------------- | ----------------------------- |
| **Name**        | `config show`                 |
| **Description** | Display current configuration |
| **Usage**       | `bl config show`              |

#### Options

_No command-specific options._

#### Examples

```bash
bl config show
```

```bash
bl config show --output json
```
