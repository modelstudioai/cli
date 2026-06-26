# `bl config` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Description                   |
| ---------------- | ----------------------------- |
| `bl config set`  | Set a config value            |
| `bl config show` | Display current configuration |

## Command details

### `bl config set`

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| **Name**        | `config set`                                |
| **Description** | Set a config value                          |
| **Usage**       | `bl config set --key <key> --value <value>` |

#### Options

| Flag              | Type   | Required | Description                                                                                                                                  |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--key <key>`     | string | yes      | Config key (base*url, output, output_dir, timeout, api_key, access_token, default*\*\_model, access_key_id, access_key_secret, workspace_id) |
| `--value <value>` | string | yes      | Value to set                                                                                                                                 |

#### Examples

```bash
bl config set --key output --value json
```

```bash
bl config set --key timeout --value 600
```

```bash
bl config set --key base_url --value https://dashscope.aliyuncs.com
```

### `bl config show`

| Field           | Value                         |
| --------------- | ----------------------------- |
| **Name**        | `config show`                 |
| **Description** | Display current configuration |
| **Usage**       | `bl config show`              |

#### Options

_No command-specific options._

#### Examples

```bash
bl config show
```

```bash
bl config show --output json
```
