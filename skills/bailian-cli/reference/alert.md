# `bl alert` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Authentication | Description                                                                  |
| -------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `bl alert create`          | Console        | Create a model alert rule from an alert template                             |
| `bl alert delete`          | Console        | Delete model alert rules                                                     |
| `bl alert disable`         | Console        | Disable a model alert rule (keeps the rule, stops notifications)             |
| `bl alert enable`          | Console        | Enable a model alert rule                                                    |
| `bl alert history`         | Console        | List model alert history (firing and recovered events)                       |
| `bl alert list`            | Console        | List model alert rules                                                       |
| `bl alert metrics`         | Console        | List metrics that alert rules can be created on, with supported aggregations |
| `bl alert template create` | Console        | Create a custom alert template (or copy an official one with --from)         |
| `bl alert template delete` | Console        | Delete custom alert templates (official templates cannot be deleted)         |
| `bl alert template list`   | Console        | List alert templates (official and custom); pass --template-id for details   |
| `bl alert template update` | Console        | Update a custom alert template (full replacement of conditions)              |
| `bl alert update`          | Console        | Update a model alert rule (full replacement; same fields as create)          |

## Command details

### `bl alert create`

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Name**           | `alert create`                                                             |
| **Description**    | Create a model alert rule from an alert template                           |
| **Authentication** | Console                                                                    |
| **Usage**          | `bl alert create --name <name> --template-id <id> --model <model> [flags]` |

#### Flags

| Flag                             | Type   | Required | Description                                                                       |
| -------------------------------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `--name <name>`                  | string | yes      | Alert rule name (max 64 chars)                                                    |
| `--template-id <id>`             | string | yes      | Alert template ID (from `alert template list`)                                    |
| `--model <model>`                | string | yes      | Model name(s) to alert on, comma-separated                                        |
| `--message <text>`               | string | no       | Alert notification content (Go template); defaults to the console template        |
| `--level <INFO\|WARNING\|ERROR>` | string | no       | Alert level (default: INFO)                                                       |
| `--interval <seconds>`           | number | no       | Check interval in seconds (default: 60)                                           |
| `--duration <seconds>`           | number | no       | How long the condition must hold before alerting; 0 = immediately (default: 60)   |
| `--contact <id>`                 | string | no       | CMS alert contact ID(s), comma-separated; create them in the CloudMonitor console |
| `--contact-group <id>`           | string | no       | CMS alert contact group ID(s), comma-separated                                    |
| `--notify-window <HH:mm-HH:mm>`  | string | no       | Daily notification window (default: 00:00-23:59)                                  |
| `--notify-days <days>`           | string | no       | Days of week to notify, 1-7 comma-separated (default: every day)                  |
| `--silence <seconds>`            | number | no       | Silence period between repeat notifications (default: never repeat)               |
| `--gmt-offset <offset>`          | string | no       | Timezone offset for the notify window (default: +0800)                            |
| `--console-region <region>`      | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                          |
| `--console-site <site>`          | string | no       | Console site: domestic, international                                             |
| `--console-switch-agent <uid>`   | number | no       | Switch agent UID for delegated access                                             |
| `--workspace-id <id>`            | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                          |

#### Notes

- Alert conditions come from the template; browse `alert template list` first. Notification contacts/contact groups are created in the CloudMonitor console — pass their IDs via --contact/--contact-group.

#### Examples

```bash
bl alert create --name high-failure-rate --template-id 123 --model qwen3.6-plus
```

```bash
bl alert create --name latency --template-id 456 --model qwen3.6-plus,qwen-turbo --level ERROR --contact-group 4004200
```

```bash
bl alert create --name nightly --template-id 123 --model qwen3.6-plus --notify-window 09:00-18:00 --notify-days 1,2,3,4,5 --silence 3600
```

```bash
bl alert create --name test --template-id 123 --model qwen3.6-plus --dry-run
```

### `bl alert delete`

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Name**           | `alert delete`                                                           |
| **Description**    | Delete model alert rules                                                 |
| **Authentication** | Console                                                                  |
| **Usage**          | `bl alert delete --rule-id <id>[,<id>...] [--yes]`                       |
| **Risk**           | `high`                                                                   |
| **Risk message**   | This permanently deletes the specified alert rules and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--rule-id <id>[,<id>...]`     | string | yes      | Rule ID(s) to delete, comma-separated                    |
| `--yes`                        | switch | no       | Confirm this high-risk operation                         |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Irreversible — the alert rules are permanently removed.

#### Examples

```bash
bl alert delete --rule-id 789
```

```bash
bl alert delete --rule-id 789,790 --dry-run
```

```bash
# Only after explicit user confirmation:
bl alert delete --rule-id 789 --yes
```

### `bl alert disable`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `alert disable`                                                  |
| **Description**    | Disable a model alert rule (keeps the rule, stops notifications) |
| **Authentication** | Console                                                          |
| **Usage**          | `bl alert disable --rule-id <id> [flags]`                        |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--rule-id <id>`               | string | yes      | Alert rule ID                                            |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert disable --rule-id 789
```

```bash
bl alert disable --rule-id 789 --dry-run
```

### `bl alert enable`

| Field              | Value                                    |
| ------------------ | ---------------------------------------- |
| **Name**           | `alert enable`                           |
| **Description**    | Enable a model alert rule                |
| **Authentication** | Console                                  |
| **Usage**          | `bl alert enable --rule-id <id> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--rule-id <id>`               | string | yes      | Alert rule ID                                            |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert enable --rule-id 789
```

```bash
bl alert enable --rule-id 789 --dry-run
```

### `bl alert history`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `alert history`                                                 |
| **Description**    | List model alert history (firing and recovered events)          |
| **Authentication** | Console                                                         |
| **Usage**          | `bl alert history [--rule-id <id>] [--status <status>] [flags]` |

#### Flags

| Flag                             | Type   | Required | Description                                              |
| -------------------------------- | ------ | -------- | -------------------------------------------------------- |
| `--days <days>`                  | number | no       | Number of days to look back (default: 7)                 |
| `--start-time <time>`            | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`              | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--rule-id <id>`                 | string | no       | Filter by alert rule ID                                  |
| `--status <ALARM\|OK>`           | string | no       | Alert state: ALARM (firing), OK (recovered)              |
| `--level <INFO\|WARNING\|ERROR>` | string | no       | Filter by highest alert level                            |
| `--max-results <n>`              | number | no       | Rows per page, 1-50 (default: 10)                        |
| `--skip <n>`                     | number | no       | Rows to skip (default: 0)                                |
| `--next-token <token>`           | string | no       | Pagination token from a previous response                |
| `--console-region <region>`      | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`          | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`   | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`            | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert history
```

```bash
bl alert history --status ALARM --days 1
```

```bash
bl alert history --rule-id 789 --days 30
```

```bash
bl alert history --level ERROR --output json
```

### `bl alert list`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `alert list`                                                    |
| **Description**    | List model alert rules                                          |
| **Authentication** | Console                                                         |
| **Usage**          | `bl alert list [--name <name>] [--enabled true\|false] [flags]` |

#### Flags

| Flag                             | Type    | Required | Description                                              |
| -------------------------------- | ------- | -------- | -------------------------------------------------------- |
| `--rule-id <id>`                 | string  | no       | Exact rule ID filter                                     |
| `--name <name>`                  | string  | no       | Fuzzy filter by rule name                                |
| `--enabled <true\|false>`        | boolean | no       | Filter by enabled state                                  |
| `--level <INFO\|WARNING\|ERROR>` | string  | no       | Filter by alert level                                    |
| `--max-results <n>`              | number  | no       | Rows per page (default: 20)                              |
| `--skip <n>`                     | number  | no       | Rows to skip (default: 0)                                |
| `--next-token <token>`           | string  | no       | Pagination token from a previous response                |
| `--console-region <region>`      | string  | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`          | string  | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`   | number  | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`            | string  | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert list
```

```bash
bl alert list --enabled true
```

```bash
bl alert list --name 失败率 --level ERROR
```

```bash
bl alert list --output json
```

### `bl alert metrics`

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Name**           | `alert metrics`                                                              |
| **Description**    | List metrics that alert rules can be created on, with supported aggregations |
| **Authentication** | Console                                                                      |
| **Usage**          | `bl alert metrics [flags]`                                                   |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert metrics
```

```bash
bl alert metrics --output json
```

### `bl alert template create`

| Field              | Value                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `alert template create`                                                                                                |
| **Description**    | Create a custom alert template (or copy an official one with --from)                                                   |
| **Authentication** | Console                                                                                                                |
| **Usage**          | `bl alert template create --name <name> [--condition <metric:agg:cmp:value:period>...] [--from <template-id>] [flags]` |

#### Flags

| Flag                                        | Type   | Required | Description                                                                                                                                                     |
| ------------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--name <name>`                             | string | yes      | Template name (max 64 chars)                                                                                                                                    |
| `--condition <metric:agg:cmp:value:period>` | array  | no       | Alert condition, repeatable (1-10). Example: 'model_call_failed_count:sum:>:10:60' (quote it: > is a shell metacharacter). See `alert metrics` for metric names |
| `--from <template-id>`                      | string | no       | Copy conditions from an existing (e.g. official) template                                                                                                       |
| `--logical-operator <or\|and>`              | string | no       | How multiple conditions combine (default: or)                                                                                                                   |
| `--console-region <region>`                 | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                                        |
| `--console-site <site>`                     | string | no       | Console site: domestic, international                                                                                                                           |
| `--console-switch-agent <uid>`              | number | no       | Switch agent UID for delegated access                                                                                                                           |
| `--workspace-id <id>`                       | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                                                                                        |

#### Examples

```bash
bl alert template create --name 失败率告警 --condition 'model_call_failed_count:sum:>:10:60'
```

```bash
bl alert template create --name 高延迟 --condition 'model_call_duration:avg:>:3000:300' --condition 'model_call_5xx_count:sum:>:5:60' --logical-operator and
```

```bash
bl alert template create --name 我的模板 --from <template-id>
```

```bash
bl alert template create --name test --condition 'model_call_count:sum:>:100:60' --dry-run
```

### `bl alert template delete`

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Name**           | `alert template delete`                                                      |
| **Description**    | Delete custom alert templates (official templates cannot be deleted)         |
| **Authentication** | Console                                                                      |
| **Usage**          | `bl alert template delete --template-id <id>[,<id>...] [--yes]`              |
| **Risk**           | `high`                                                                       |
| **Risk message**   | This permanently deletes the specified alert templates and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--template-id <id>[,<id>...]` | string | yes      | Template ID(s) to delete, comma-separated                |
| `--yes`                        | switch | no       | Confirm this high-risk operation                         |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Irreversible — the alert templates are permanently removed.

#### Examples

```bash
bl alert template delete --template-id 123
```

```bash
bl alert template delete --template-id 123,124 --dry-run
```

```bash
# Only after explicit user confirmation:
bl alert template delete --template-id 123 --yes
```

### `bl alert template list`

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Name**           | `alert template list`                                                      |
| **Description**    | List alert templates (official and custom); pass --template-id for details |
| **Authentication** | Console                                                                    |
| **Usage**          | `bl alert template list [--name <name>] [--source <source>] [flags]`       |

#### Flags

| Flag                             | Type   | Required | Description                                              |
| -------------------------------- | ------ | -------- | -------------------------------------------------------- |
| `--template-id <id>`             | string | no       | Exact template ID (view a single template)               |
| `--name <name>`                  | string | no       | Fuzzy filter by template name                            |
| `--source <Official\|Customize>` | string | no       | Template source: Official, Customize; omit for all       |
| `--max-results <n>`              | number | no       | Rows per page (default: 50)                              |
| `--skip <n>`                     | number | no       | Rows to skip (default: 0)                                |
| `--console-region <region>`      | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`          | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`   | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`            | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl alert template list
```

```bash
bl alert template list --source Official
```

```bash
bl alert template list --name 失败率
```

```bash
bl alert template list --template-id 123 --output json
```

### `bl alert template update`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `alert template update`                                                                                          |
| **Description**    | Update a custom alert template (full replacement of conditions)                                                  |
| **Authentication** | Console                                                                                                          |
| **Usage**          | `bl alert template update --template-id <id> --name <name> --condition <metric:agg:cmp:value:period>... [flags]` |

#### Flags

| Flag                                        | Type   | Required | Description                                                                                                               |
| ------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--template-id <id>`                        | string | yes      | Template ID (from `alert template list`)                                                                                  |
| `--name <name>`                             | string | yes      | Template name (max 64 chars)                                                                                              |
| `--condition <metric:agg:cmp:value:period>` | array  | no       | Alert condition, repeatable (1-10). Example: 'model_call_failed_count:sum:>:10:60' (quote it: > is a shell metacharacter) |
| `--logical-operator <or\|and>`              | string | no       | How multiple conditions combine (default: or)                                                                             |
| `--console-region <region>`                 | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                  |
| `--console-site <site>`                     | string | no       | Console site: domestic, international                                                                                     |
| `--console-switch-agent <uid>`              | number | no       | Switch agent UID for delegated access                                                                                     |
| `--workspace-id <id>`                       | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                                                  |

#### Examples

```bash
bl alert template update --template-id 123 --name 失败率告警 --condition 'model_call_failed_count:sum:>:20:60'
```

```bash
bl alert template update --template-id 123 --name test --condition 'model_call_count:sum:>:100:60' --dry-run
```

### `bl alert update`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `alert update`                                                                            |
| **Description**    | Update a model alert rule (full replacement; same fields as create)                       |
| **Authentication** | Console                                                                                   |
| **Usage**          | `bl alert update --rule-id <id> --name <name> --template-id <id> --model <model> [flags]` |

#### Flags

| Flag                             | Type   | Required | Description                                                                       |
| -------------------------------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `--rule-id <id>`                 | string | yes      | Alert rule ID (from `alert list`)                                                 |
| `--name <name>`                  | string | yes      | Alert rule name (max 64 chars)                                                    |
| `--template-id <id>`             | string | yes      | Alert template ID (from `alert template list`)                                    |
| `--model <model>`                | string | yes      | Model name(s) to alert on, comma-separated                                        |
| `--message <text>`               | string | no       | Alert notification content (Go template); defaults to the console template        |
| `--level <INFO\|WARNING\|ERROR>` | string | no       | Alert level (default: INFO)                                                       |
| `--interval <seconds>`           | number | no       | Check interval in seconds (default: 60)                                           |
| `--duration <seconds>`           | number | no       | How long the condition must hold before alerting; 0 = immediately (default: 60)   |
| `--contact <id>`                 | string | no       | CMS alert contact ID(s), comma-separated; create them in the CloudMonitor console |
| `--contact-group <id>`           | string | no       | CMS alert contact group ID(s), comma-separated                                    |
| `--notify-window <HH:mm-HH:mm>`  | string | no       | Daily notification window (default: 00:00-23:59)                                  |
| `--notify-days <days>`           | string | no       | Days of week to notify, 1-7 comma-separated (default: every day)                  |
| `--silence <seconds>`            | number | no       | Silence period between repeat notifications (default: never repeat)               |
| `--gmt-offset <offset>`          | string | no       | Timezone offset for the notify window (default: +0800)                            |
| `--console-region <region>`      | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                          |
| `--console-site <site>`          | string | no       | Console site: domestic, international                                             |
| `--console-switch-agent <uid>`   | number | no       | Switch agent UID for delegated access                                             |
| `--workspace-id <id>`            | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                          |

#### Examples

```bash
bl alert update --rule-id 789 --name high-failure-rate --template-id 123 --model qwen3.6-plus --level WARNING
```

```bash
bl alert update --rule-id 789 --name nightly --template-id 123 --model qwen3.6-plus --silence 1800
```

```bash
bl alert update --rule-id 789 --name test --template-id 123 --model qwen3.6-plus --dry-run
```
