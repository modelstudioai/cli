# `bl update` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command     | Description                                         |
| ----------- | --------------------------------------------------- |
| `bl update` | Update the CLI to the latest or a specified version |

## Command details

### `bl update`

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| **Name**        | `update`                                            |
| **Description** | Update the CLI to the latest or a specified version |
| **Usage**       | `bl update [--to <version>]`                        |

#### Flags

| Flag             | Type   | Required | Description                                      |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `--to <version>` | string | no       | Install this exact version instead of the latest |

#### Examples

```bash
bl update
```

```bash
bl update --to 0.1.14
```
