# `bl usage` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `bl usage free`     | Query free-tier quota for models (all models if --model is omitted)                        |
| `bl usage freetier` | Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable |
| `bl usage stats`    | Query model usage statistics                                                               |
| `bl usage summary`  | Show a unified usage summary: free-tier quota and recent usage overview                    |

## Command details

### `bl usage free`

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| **Name**        | `usage free`                                                        |
| **Description** | Query free-tier quota for models (all models if --model is omitted) |
| **Usage**       | `bl usage free [--model <model>[,model2,...]] [flags]`              |

#### Flags

| Flag                           | Type   | Required | Description                                                               |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------- |
| `--model <model>`              | string | no       | Model name(s) to query, comma-separated for multiple; omit for all models |
| `--expiring <days>`            | string | no       | Only show quotas expiring within N days                                   |
| `--sort <remaining\|expires>`  | string | no       | Sort by: remaining (ascending), expires (ascending)                       |
| `--all`                        | switch | no       | Show all models instead of the top rows                                   |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                  |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                     |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                     |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                  |

#### Examples

```bash
bl usage free
```

```bash
bl usage free --model qwen3-max
```

```bash
bl usage free --model qwen3-max,qwen-turbo
```

```bash
bl usage free --expiring 30
```

```bash
bl usage free --sort remaining
```

```bash
bl usage free --all
```

```bash
bl usage free --model qwen-turbo --output json
```

```bash
bl usage free --model qwen3-max --console-region cn-beijing
```

### `bl usage freetier`

| Field           | Value                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Name**        | `usage freetier`                                                                           |
| **Description** | Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable |
| **Usage**       | `bl usage freetier <--model <model>[,model2,...] \| --all> [--off] [flags]`                |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--model <model>`              | string | no       | Model name(s), comma-separated for multiple              |
| `--all`                        | switch | no       | Apply to all free-tier models                            |
| `--on`                         | switch | no       | Enable auto-stop (default behavior)                      |
| `--off`                        | switch | no       | Disable auto-stop                                        |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl usage freetier --model qwen3-max
```

```bash
bl usage freetier --model qwen3-max,qwen-turbo
```

```bash
bl usage freetier --all
```

```bash
bl usage freetier --on --model qwen3-max
```

```bash
bl usage freetier --off --model qwen3-max
```

```bash
bl usage freetier --off --all
```

### `bl usage stats`

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| **Name**        | `usage stats`                                              |
| **Description** | Query model usage statistics                               |
| **Usage**       | `bl usage stats [--model <model>] [--days <days>] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--model <model>`              | string | no       | Model name(s), comma-separated; omit for overview        |
| `--days <days>`                | string | no       | Number of days (default: 7)                              |
| `--type <type>`                | string | no       | Model type: Text, Vision, Multimodal, Audio, Embedding   |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl usage stats
```

```bash
bl usage stats --days 30
```

```bash
bl usage stats --model qwen-turbo
```

```bash
bl usage stats --model qwen-turbo --days 7
```

```bash
bl usage stats --model qwen3.6-plus,deepseek-v4-pro
```

```bash
bl usage stats --type Text --days 14
```

```bash
bl usage stats --output json
```

### `bl usage summary`

| Field           | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| **Name**        | `usage summary`                                                         |
| **Description** | Show a unified usage summary: free-tier quota and recent usage overview |
| **Usage**       | `bl usage summary [--days <days>] [flags]`                              |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--days <days>`                | string | no       | Number of days for the usage overview (default: 7)       |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl usage summary
```

```bash
bl usage summary --days 30
```

```bash
bl usage summary --output json
```
