# `bl workspace` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `bl workspace list` | 列出所有业务空间 (List all workspaces) |

## Command details

### `bl workspace list`

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| **Name**        | `workspace list`                       |
| **Description** | 列出所有业务空间 (List all workspaces) |
| **Usage**       | `bl workspace list [flags]`            |

#### Options

| Flag                | Type   | Required | Description                                                 |
| ------------------- | ------ | -------- | ----------------------------------------------------------- |
| `--list <n>`        | string | no       | 返回数量限制 (Limit number of results)                      |
| `--region <region>` | string | no       | API 区域，默认 cn-beijing (API region, default: cn-beijing) |

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
