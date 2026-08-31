# `bl quota` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command            | Authentication | Description                                                     |
| ------------------ | -------------- | --------------------------------------------------------------- |
| `bl quota check`   | Console        | Check current usage against rate limits                         |
| `bl quota history` | Console        | View quota change history                                       |
| `bl quota list`    | API Key        | View model rate limits (QPM/TPM, account and workspace level)   |
| `bl quota update`  | API Key        | Update model rate limits (QPM/TPM), or clear them with --delete |

## Command details

### `bl quota check`

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| **Name**           | `quota check`                              |
| **Description**    | Check current usage against rate limits    |
| **Authentication** | Console                                    |
| **Usage**          | `bl quota check [--model <model>] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--period <minutes>`           | string | no       | Query usage for the last N minutes (default: 2)          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl quota check
```

```bash
bl quota check --model qwen3.6-plus
```

```bash
bl quota check --period 5
```

```bash
bl quota check --model qwen3.6-plus,qwen-turbo
```

```bash
bl quota check --output json
```

### `bl quota history`

| Field              | Value                      |
| ------------------ | -------------------------- |
| **Name**           | `quota history`            |
| **Description**    | View quota change history  |
| **Authentication** | Console                    |
| **Usage**          | `bl quota history [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--page <n>`                   | string | no       | Page number (default: 1)                                 |
| `--page-size <n>`              | string | no       | Page size (default: 10)                                  |
| `--model <model>`              | string | no       | Filter by model name                                     |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl quota history
```

```bash
bl quota history --page 2
```

```bash
bl quota history --page-size 20
```

```bash
bl quota history --model qwen-turbo
```

```bash
bl quota history --output json
```

### `bl quota list`

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Name**           | `quota list`                                                                     |
| **Description**    | View model rate limits (QPM/TPM, account and workspace level)                    |
| **Authentication** | API Key                                                                          |
| **Usage**          | `bl quota list [--model <model>] [--name <name>] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag               | Type   | Required | Description                                  |
| ------------------ | ------ | -------- | -------------------------------------------- |
| `--model <model>`  | string | no       | Model name(s), comma-separated (exact match) |
| `--name <name>`    | string | no       | Fuzzy search by model name                   |
| `--page <n>`       | number | no       | Page number (default: 1)                     |
| `--page-size <n>`  | number | no       | Results per page (default: 20)               |
| `--api-key <key>`  | string | no       | API key                                      |
| `--base-url <url>` | string | no       | API base URL                                 |

#### Notes

- Usage-vs-limit pressure checks live in `quota check` (console auth).

#### Examples

```bash
bl quota list
```

```bash
bl quota list --model qwen3-max
```

```bash
bl quota list --model qwen3-max,qwen-plus
```

```bash
bl quota list --name qwen --page-size 50
```

```bash
bl quota list --output json
```

### `bl quota update`

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Name**           | `quota update`                                                               |
| **Description**    | Update model rate limits (QPM/TPM), or clear them with --delete              |
| **Authentication** | API Key                                                                      |
| **Usage**          | `bl quota update --model <model> [--rpm <n>] [--tpm <n>] [--delete] [--yes]` |

#### Flags

| Flag               | Type   | Required | Description                                |
| ------------------ | ------ | -------- | ------------------------------------------ |
| `--model <model>`  | string | yes      | Model name (required)                      |
| `--rpm <n>`        | number | no       | Max requests per minute (QPM)              |
| `--tpm <n>`        | number | no       | Max tokens per minute (TPM)                |
| `--delete`         | switch | no       | Clear all custom rate limits for the model |
| `--yes`            | switch | no       | Skip the confirmation prompt for --delete  |
| `--api-key <key>`  | string | no       | API key                                    |
| `--base-url <url>` | string | no       | API base URL                               |

#### Notes

- Fields you omit keep their current values (server-side OVERLAY merge); --delete clears all custom limits.
- --delete requires confirmation; pass --yes to skip the prompt in scripts.
- Setting TPM without an existing QPM limit is rejected server-side — pass --rpm first or together.

#### Examples

```bash
bl quota update --model qwen-plus --rpm 60 --tpm 100000
```

```bash
bl quota update --model qwen3-max --tpm 500000
```

```bash
bl quota update --model qwen-plus --delete
```

```bash
bl quota update --model qwen-plus --delete --yes
```

```bash
bl quota update --model qwen-plus --rpm 60 --output json
```
