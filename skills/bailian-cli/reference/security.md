# `bl security` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                | Authentication | Description                                                 |
| ---------------------- | -------------- | ----------------------------------------------------------- |
| `bl security alerts`   | API Key        | List Agent security alerts                                  |
| `bl security overview` | API Key        | Show the Agent security protection overview (last 24 hours) |

## Command details

### `bl security alerts`

| Field              | Value                        |
| ------------------ | ---------------------------- |
| **Name**           | `security alerts`            |
| **Description**    | List Agent security alerts   |
| **Authentication** | API Key                      |
| **Usage**          | `bl security alerts [flags]` |

#### Flags

| Flag                                                                 | Type   | Required | Description                                                               |
| -------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| `--workspace-id <id>`                                                | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)           |
| `--page <n>`                                                         | number | no       | Page number (default: 1)                                                  |
| `--page-size <n>`                                                    | number | no       | Results per page (default: 20)                                            |
| `--risk-level <high\|medium\|low>`                                   | string | no       | Filter by risk level: high, medium, low                                   |
| `--risk-name <text>`                                                 | string | no       | Filter by risk name                                                       |
| `--status <status>`                                                  | string | no       | Filter by handling status                                                 |
| `--status-list <status>`                                             | array  | no       | Filter by multiple statuses (repeatable)                                  |
| `--app-name <name>`                                                  | string | no       | Filter by application name                                                |
| `--asset-type <agent\|tool\|skill\|knowledge_base\|memory\|channel>` | string | no       | Filter by asset type: agent, tool, skill, knowledge_base, memory, channel |
| `--vendor <vendor>`                                                  | string | no       | Filter by vendor                                                          |
| `--order-by <field>`                                                 | string | no       | Sort field (default: check_time)                                          |
| `--order <asc\|desc>`                                                | string | no       | Sort direction: asc, desc (default: desc)                                 |
| `--lang <zh\|en>`                                                    | string | no       | Response language: zh, en                                                 |
| `--api-key <key>`                                                    | string | no       | API key                                                                   |
| `--base-url <url>`                                                   | string | no       | API base URL                                                              |

#### Notes

- Auth: uses DashScope API Key (Bearer token).
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.
- Filters, pagination and sorting go in the query string; enum flags are validated before any request is sent.
- AgentStudio host: derived from --workspace-id by default; point --base-url / DASHSCOPE_BASE_URL (or `auth login --base-url`) at a workspace or pre-release origin such as https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio to override it, and --workspace-id is then not required.

#### Examples

```bash
bl security alerts --workspace-id ws-xxx
```

```bash
bl security alerts --risk-level high --page-size 50
```

```bash
bl security alerts --asset-type agent --app-name "demo app" --output json
```

```bash
bl security alerts --status-list unhandled --status-list handling
```

### `bl security overview`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `security overview`                                         |
| **Description**    | Show the Agent security protection overview (last 24 hours) |
| **Authentication** | API Key                                                     |
| **Usage**          | `bl security overview [flags]`                              |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Auth: uses DashScope API Key (Bearer token).
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.
- Fixed to the last 24 hours; the AgentStudio region is always cn-beijing and is not configurable.
- AgentStudio host: derived from --workspace-id by default; point --base-url / DASHSCOPE_BASE_URL (or `auth login --base-url`) at a workspace or pre-release origin such as https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio to override it, and --workspace-id is then not required.

#### Examples

```bash
bl security overview --workspace-id ws-xxx
```

```bash
bl security overview --workspace-id ws-xxx --output json
```
