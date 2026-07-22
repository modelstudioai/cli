# `bl quota` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command            | Description                             |
| ------------------ | --------------------------------------- |
| `bl quota check`   | Check current usage against rate limits |
| `bl quota history` | View quota change history               |
| `bl quota list`    | View model RPM/TPM rate limits          |
| `bl quota request` | Request a temporary quota increase      |

## Command details

### `bl quota check`

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Name**        | `quota check`                              |
| **Description** | Check current usage against rate limits    |
| **Usage**       | `bl quota check [--model <model>] [flags]` |

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

| Field           | Value                      |
| --------------- | -------------------------- |
| **Name**        | `quota history`            |
| **Description** | View quota change history  |
| **Usage**       | `bl quota history [flags]` |

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

| Field           | Value                                     |
| --------------- | ----------------------------------------- |
| **Name**        | `quota list`                              |
| **Description** | View model RPM/TPM rate limits            |
| **Usage**       | `bl quota list [--model <model>] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl quota list
```

```bash
bl quota list --model qwen3.6-plus
```

```bash
bl quota list --model qwen3.6-plus,qwen-turbo
```

```bash
bl quota list --output json
```

### `bl quota request`

| Field           | Value                                                    |
| --------------- | -------------------------------------------------------- |
| **Name**        | `quota request`                                          |
| **Description** | Request a temporary quota increase                       |
| **Usage**       | `bl quota request --model <model> --tpm <value> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--model <model>`              | string | yes      | Model name (required)                                    |
| `--tpm <value>`                | string | yes      | Target TPM value (required)                              |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl quota request --model qwen-turbo --tpm 100000
```

```bash
bl quota request --model qwen3.6-plus --tpm 8000000
```

```bash
bl quota request --model qwen-turbo --tpm 100000 --output json
```
