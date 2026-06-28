# `bl workspace` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description         |
| ------------------- | ------------------- |
| `bl workspace list` | List all workspaces |

## Command details

### `bl workspace list`

| Field           | Value                       |
| --------------- | --------------------------- |
| **Name**        | `workspace list`            |
| **Description** | List all workspaces         |
| **Usage**       | `bl workspace list [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                           |
| ------------------------------ | ------ | -------- | ------------------------------------- |
| `--list <n>`                   | string | no       | Limit number of results               |
| `--console-region <region>`    | string | no       | Console region                        |
| `--console-site <site>`        | string | no       | Console site: domestic, international |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID                      |

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
