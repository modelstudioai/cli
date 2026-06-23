# `bl tokenplan` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `bl tokenplan seats` | List Token Plan subscription seat details |

## Command details

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
