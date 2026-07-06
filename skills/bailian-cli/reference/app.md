# `bl app` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command       | Description                                    |
| ------------- | ---------------------------------------------- |
| `bl app call` | Call a Bailian application (agent or workflow) |
| `bl app list` | List Bailian applications                      |

## Command details

### `bl app call`

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| **Name**        | `app call`                                          |
| **Description** | Call a Bailian application (agent or workflow)      |
| **Usage**       | `bl app call --app-id <id> --prompt <text> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                   |
| ---------------------- | ------ | -------- | --------------------------------------------- |
| `--app-id <id>`        | string | yes      | Application ID (required)                     |
| `--prompt <text>`      | string | yes      | Input prompt text                             |
| `--image <url>`        | array  | no       | Image URL(s) to pass to the app (repeatable)  |
| `--file-id <id>`       | array  | no       | Pre-uploaded file ID(s) (repeatable)          |
| `--session-id <id>`    | string | no       | Session ID for multi-turn conversation        |
| `--stream`             | switch | no       | Stream response (default: on in TTY)          |
| `--pipeline-ids <ids>` | string | no       | Knowledge base pipeline IDs (comma-separated) |
| `--memory-id <id>`     | string | no       | Memory ID for long-term memory                |
| `--biz-params <json>`  | string | no       | Business parameters JSON (workflow variables) |
| `--has-thoughts`       | switch | no       | Show agent thinking process                   |
| `--api-key <key>`      | string | no       | API key                                       |
| `--base-url <url>`     | string | no       | API base URL                                  |

#### Examples

```bash
bl app call --app-id abc123 --prompt "Hello"
```

```bash
bl app call --app-id abc123 --prompt "Describe this image" --image https://example.com/photo.jpg
```

```bash
bl app call --app-id abc123 --prompt "Analyze the image" --image img1.jpg --image img2.jpg
```

```bash
bl app call --app-id abc123 --prompt "Continue" --session-id sess_xxx --stream
```

```bash
bl app call --app-id abc123 --prompt "Search for materials" --pipeline-ids pipe1,pipe2
```

```bash
bl app call --app-id abc123 --prompt "Start" --biz-params '{"key":"value"}'
```

### `bl app list`

| Field           | Value                     |
| --------------- | ------------------------- |
| **Name**        | `app list`                |
| **Description** | List Bailian applications |
| **Usage**       | `bl app list [flags]`     |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--name <name>`                | string | no       | Filter by app name (keyword search)                      |
| `--page <n>`                   | number | no       | Page number (default: 1)                                 |
| `--page-size <n>`              | number | no       | Results per page (default: 30)                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl app list
```

```bash
bl app list --name customer service
```

```bash
bl app list --page 2 --page-size 10
```

```bash
bl app list --output json
```
