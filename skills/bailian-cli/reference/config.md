# `bl config` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Description                                   |
| ---------------- | --------------------------------------------- |
| `bl config set`  | Set a config value                            |
| `bl config show` | Display current configuration                 |
| `bl config ui`   | Open a local web UI to manage config profiles |

## Command details

### `bl config set`

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| **Name**        | `config set`                                |
| **Description** | Set a config value                          |
| **Usage**       | `bl config set --key <key> --value <value>` |

#### Flags

| Flag              | Type   | Required | Description                                                                                                                                                  |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--key <key>`     | string | yes      | Config key (base*url, output, output_dir, timeout, api_key, access_token, access_key_id, access_key_secret, security_token, default*\*\_model, workspace_id) |
| `--value <value>` | string | yes      | Value to set                                                                                                                                                 |

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

#### Flags

_No command-specific flags._

#### Examples

```bash
bl config show
```

```bash
bl config show --output json
```

### `bl config ui`

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| **Name**        | `config ui`                                   |
| **Description** | Open a local web UI to manage config profiles |
| **Usage**       | `bl config ui [--port <port>] [--no-open]`    |

#### Flags

| Flag            | Type   | Required | Description                                   |
| --------------- | ------ | -------- | --------------------------------------------- |
| `--port <port>` | number | no       | Port to listen on (default: random free port) |
| `--no-open`     | switch | no       | Do not open the browser automatically         |

#### Examples

```bash
bl config ui
```

```bash
bl config ui --port 8787
```

```bash
bl config ui --config staging --no-open
```
