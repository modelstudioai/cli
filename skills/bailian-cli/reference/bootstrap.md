# `bl bootstrap` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command        | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `bl bootstrap` | Initialize Bailian workspace and activate postpaid services |

## Command details

### `bl bootstrap`

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Name**        | `bootstrap`                                                                                 |
| **Description** | Initialize Bailian workspace and activate postpaid services                                 |
| **Usage**       | `bl bootstrap --access-key-id <id> --access-key-secret <secret> [--security-token <token>]` |

#### Flags

| Flag                           | Type   | Required | Description                                 |
| ------------------------------ | ------ | -------- | ------------------------------------------- |
| `--access-key-id <id>`         | string | no       | Alibaba Cloud Access Key ID                 |
| `--access-key-secret <secret>` | string | no       | Alibaba Cloud Access Key Secret             |
| `--security-token <token>`     | string | no       | Alibaba Cloud STS Security Token (optional) |

#### Examples

```bash
bl bootstrap --access-key-id LTAIxxxxx --access-key-secret xxxxx
```
