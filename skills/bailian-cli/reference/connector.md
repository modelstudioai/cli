# `bl connector` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command               | Authentication | Description                                                               |
| --------------------- | -------------- | ------------------------------------------------------------------------- |
| `bl connector call`   | API Key        | Validate arguments and execute one connector tool on the selected account |
| `bl connector schema` | API Key        | Inspect a connector tool's input schema for the selected account          |
| `bl connector tools`  | API Key        | Discover connector tools and authorized accounts by intent                |

## Command details

### `bl connector call`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `connector call`                                                                                 |
| **Description**    | Validate arguments and execute one connector tool on the selected account                        |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl connector call --tool <toolRef> --instance <instanceId> --json '<object>' [--trace-id <id>]` |
| **Risk**           | `high`                                                                                           |
| **Risk message**   | The selected tool may change data in the connected account.                                      |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                      | Type   | Required | Description                                                     |
| ------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`     | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--tool <toolRef>`        | string | yes      | Tool reference returned by discovery                            |
| `--instance <instanceId>` | string | yes      | Selected authorized connector instance                          |
| `--trace-id <id>`         | string | no       | Trace ID from connector discovery                               |
| `--json <object>`         | string | yes      | JSON object matching the selected tool schema                   |
| `--yes`                   | switch | no       | Confirm this high-risk operation                                |
| `--api-key <key>`         | string | no       | API key                                                         |
| `--base-url <url>`        | string | no       | API base URL                                                    |

#### Examples

```bash
bl connector call --tool <toolRef> --instance <instanceId> --json '{}' --dry-run
```

### `bl connector schema`

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Name**           | `connector schema`                                                               |
| **Description**    | Inspect a connector tool's input schema for the selected account                 |
| **Authentication** | API Key                                                                          |
| **Usage**          | `bl connector schema --tool <toolRef> --instance <instanceId> [--trace-id <id>]` |

#### Flags

| Flag                      | Type   | Required | Description                                                     |
| ------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`     | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--tool <toolRef>`        | string | yes      | Tool reference returned by discovery                            |
| `--instance <instanceId>` | string | yes      | Selected authorized connector instance                          |
| `--trace-id <id>`         | string | no       | Trace ID from connector discovery                               |
| `--api-key <key>`         | string | no       | API key                                                         |
| `--base-url <url>`        | string | no       | API base URL                                                    |

#### Examples

```bash
bl connector schema --tool <toolRef> --instance <instanceId> --output json
```

### `bl connector tools`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `connector tools`                                          |
| **Description**    | Discover connector tools and authorized accounts by intent |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl connector tools --query <text> [--workspace-id <id>]`  |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--query <text>`      | string | yes      | Describe the task and any preferred app or account              |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Examples

```bash
bl connector tools --query "Find tomorrow's meetings"
```
