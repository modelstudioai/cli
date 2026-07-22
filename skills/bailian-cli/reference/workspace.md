# `bl workspace` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `bl workspace init` | Initialize Bailian workspace and activate postpaid services |
| `bl workspace list` | List all workspaces                                         |

## Command details

### `bl workspace init`

| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Name**        | `workspace init`                                                                                 |
| **Description** | Initialize Bailian workspace and activate postpaid services                                      |
| **Usage**       | `bl workspace init --access-key-id <id> --access-key-secret <secret> [--security-token <token>]` |

#### Flags

| Flag                           | Type   | Required | Description                                 |
| ------------------------------ | ------ | -------- | ------------------------------------------- |
| `--access-key-id <id>`         | string | no       | Alibaba Cloud Access Key ID                 |
| `--access-key-secret <secret>` | string | no       | Alibaba Cloud Access Key Secret             |
| `--security-token <token>`     | string | no       | Alibaba Cloud STS Security Token (optional) |

#### Examples

```bash
bl workspace init --access-key-id LTAIxxxxx --access-key-secret xxxxx
```

### `bl workspace list`

| Field           | Value                       |
| --------------- | --------------------------- |
| **Name**        | `workspace list`            |
| **Description** | List all workspaces         |
| **Usage**       | `bl workspace list [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--list <n>`                   | string | no       | Limit number of results                                  |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl workspace list
```

```bash
bl workspace list --list 5
```

```bash
bl workspace list --output json
```
