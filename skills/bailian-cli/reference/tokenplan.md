# `bl tokenplan` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                     | Description                               |
| --------------------------- | ----------------------------------------- |
| `bl tokenplan add-member`   | Add a member to a Token Plan organization |
| `bl tokenplan assign-seats` | Batch assign Token Plan seats to members  |
| `bl tokenplan create-key`   | Create a Token Plan API key for a seat    |
| `bl tokenplan seats`        | List Token Plan subscription seat details |

## Command details

### `bl tokenplan add-member`

| Field           | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| **Name**        | `tokenplan add-member`                                                |
| **Description** | Add a member to a Token Plan organization                             |
| **Usage**       | `bl tokenplan add-member --account-name <name> --org-id <id> [flags]` |

#### Options

| Flag                           | Type   | Required | Description                                                      |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------- |
| `--account-name <name>`        | string | yes      | Member display name                                              |
| `--org-id <id>`                | string | yes      | Organization ID                                                  |
| `--org-role-code <code>`       | string | no       | Organization role: ORG_ADMIN or ORG_MEMBER (default: ORG_MEMBER) |
| `--spec-type <type>`           | string | no       | Seat tier to assign on creation: standard, pro, or max           |
| `--caller-uac-account-id <id>` | string | no       | Caller UAC account ID                                            |
| `--namespace-id <id>`          | string | no       | Product namespace ID (Token Plan default: namespace-1)           |
| `--access-key-id <key>`        | string | no       | Alibaba Cloud Access Key ID (deprecated)                         |
| `--access-key-secret <key>`    | string | no       | Alibaba Cloud Access Key Secret (deprecated)                     |

#### Examples

```bash
bl tokenplan add-member --account-name dev_user --org-id org_123
```

```bash
bl tokenplan add-member --account-name admin_user --org-id org_123 --org-role-code ORG_ADMIN
```

```bash
bl tokenplan add-member --account-name member1 --org-id org_123 --spec-type standard
```

### `bl tokenplan assign-seats`

| Field           | Value                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Name**        | `tokenplan assign-seats`                                                                     |
| **Description** | Batch assign Token Plan seats to members                                                     |
| **Usage**       | `bl tokenplan assign-seats --workspace-id <id> --seat-type <type> --account-id <id> [flags]` |

#### Options

| Flag                           | Type   | Required | Description                                                    |
| ------------------------------ | ------ | -------- | -------------------------------------------------------------- |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id) |
| `--seat-type <type>`           | string | yes      | Seat tier: standard, pro, or max                               |
| `--account-id <id>`            | array  | no       | Target member account ID (repeatable)                          |
| `--caller-uac-account-id <id>` | string | no       | Caller UAC account ID                                          |
| `--namespace-id <id>`          | string | no       | Product namespace ID (Token Plan default: namespace-1)         |
| `--locale <locale>`            | string | no       | Language: zh-CN or en-US                                       |
| `--access-key-id <key>`        | string | no       | Alibaba Cloud Access Key ID (deprecated)                       |
| `--access-key-secret <key>`    | string | no       | Alibaba Cloud Access Key Secret (deprecated)                   |

#### Examples

```bash
bl tokenplan assign-seats --workspace-id ws_456 --seat-type standard --account-id acc_123
```

```bash
bl tokenplan assign-seats --workspace-id ws_456 --seat-type pro --account-id acc_1 --account-id acc_2
```

### `bl tokenplan create-key`

| Field           | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| **Name**        | `tokenplan create-key`                                                  |
| **Description** | Create a Token Plan API key for a seat                                  |
| **Usage**       | `bl tokenplan create-key --account-id <id> --workspace-id <id> [flags]` |

#### Options

| Flag                           | Type   | Required | Description                                                    |
| ------------------------------ | ------ | -------- | -------------------------------------------------------------- |
| `--account-id <id>`            | string | yes      | Target member account ID                                       |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id) |
| `--description <text>`         | string | no       | API key description                                            |
| `--caller-uac-account-id <id>` | string | no       | Caller UAC account ID                                          |
| `--namespace-id <id>`          | string | no       | Product namespace ID (Token Plan default: namespace-1)         |
| `--access-key-id <key>`        | string | no       | Alibaba Cloud Access Key ID (deprecated)                       |
| `--access-key-secret <key>`    | string | no       | Alibaba Cloud Access Key Secret (deprecated)                   |

#### Examples

```bash
bl tokenplan create-key --account-id acc_123 --workspace-id ws_456
```

```bash
bl tokenplan create-key --account-id acc_123 --workspace-id ws_456 --description 'Dev key'
```

### `bl tokenplan seats`

| Field           | Value                                     |
| --------------- | ----------------------------------------- |
| **Name**        | `tokenplan seats`                         |
| **Description** | List Token Plan subscription seat details |
| **Usage**       | `bl tokenplan seats [flags]`              |

#### Options

| Flag                           | Type   | Required | Description                                                                       |
| ------------------------------ | ------ | -------- | --------------------------------------------------------------------------------- |
| `--page-no <n>`                | number | no       | Page number (default: 1)                                                          |
| `--page-size <n>`              | number | no       | Page size (default: 10)                                                           |
| `--caller-uac-account-id <id>` | string | no       | Caller UAC account ID                                                             |
| `--namespace-id <id>`          | string | no       | Product namespace ID (Token Plan default: namespace-1)                            |
| `--status <status>`            | array  | no       | Seat status filter (repeatable): CREATING, NORMAL, LIMIT, RELEASE, STOP, REFUNDED |
| `--status-list-str <json>`     | string | no       | StatusList as JSON string, e.g. '["NORMAL"]'                                      |
| `--seat-id <id>`               | string | no       | Filter by seat ID                                                                 |
| `--seat-type <type>`           | string | no       | Seat tier: standard, pro, or max                                                  |
| `--query-assigned <bool>`      | string | no       | Filter by assignment: true=assigned, false=unassigned                             |
| `--access-key-id <key>`        | string | no       | Alibaba Cloud Access Key ID (deprecated)                                          |
| `--access-key-secret <key>`    | string | no       | Alibaba Cloud Access Key Secret (deprecated)                                      |

#### Examples

```bash
bl tokenplan seats
```

```bash
bl tokenplan seats --page-size 20 --status NORMAL
```

```bash
bl tokenplan seats --query-assigned true --seat-type standard
```
