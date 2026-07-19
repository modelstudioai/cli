# `bl config` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `bl config agent` | Configure a coding agent to use DashScope API    |
| `bl config list`  | List config profiles and show the active profile |
| `bl config set`   | Set a config value                               |
| `bl config show`  | Display current configuration                    |
| `bl config ui`    | Open a local web UI to manage config profiles    |
| `bl config use`   | Set the active config profile                    |

## Command details

### `bl config agent`

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| **Name**        | `config agent`                                                                    |
| **Description** | Configure a coding agent to use DashScope API                                     |
| **Usage**       | `bl config agent --agent <name> --base-url <url> --api-key <key> --model <model>` |

#### Flags

| Flag                                                                  | Type   | Required | Description                                                             |
| --------------------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `--agent <claude-code\|qwen-code\|opencode\|openclaw\|hermes\|codex>` | string | yes      | Target agent: claude-code, qwen-code, opencode, openclaw, hermes, codex |
| `--base-url <url>`                                                    | string | yes      | API base URL                                                            |
| `--api-key <key>`                                                     | string | yes      | API key                                                                 |
| `--model <model>`                                                     | string | yes      | Default model name                                                      |

#### Examples

```bash
bl config agent --agent claude-code --base-url https://dashscope.aliyuncs.com/apps/anthropic --api-key sk-xxxxx --model qwen3-max
```

```bash
bl config agent --agent qwen-code --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus
```

```bash
bl config agent --agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus
```

### `bl config list`

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| **Name**        | `config list`                                    |
| **Description** | List config profiles and show the active profile |
| **Usage**       | `bl config list`                                 |

#### Flags

_No command-specific flags._

#### Examples

```bash
bl config list
```

```bash
bl config list --output json
```

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
bl config ui --no-open
```

### `bl config use`

| Field           | Value                         |
| --------------- | ----------------------------- |
| **Name**        | `config use`                  |
| **Description** | Set the active config profile |
| **Usage**       | `bl config use --name <name>` |

#### Flags

| Flag            | Type   | Required | Description                       |
| --------------- | ------ | -------- | --------------------------------- |
| `--name <name>` | string | yes      | Existing profile name, or default |

#### Examples

```bash
bl config use --name token-plan
```

```bash
bl config use --name default
```
