# `bl mcp` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command              | Authentication | Description                                                                            |
| -------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `bl mcp activate`    | API Key        | Activate official MCP servers or enable custom servers using their saved configuration |
| `bl mcp call`        | API Key        | Open an MCP session and call a tool (tools/call)                                       |
| `bl mcp connect`     | API Key        | Connect a Bailian MCP service to native Agent configurations                           |
| `bl mcp create`      | API Key        | Create and deploy a custom MCP server                                                  |
| `bl mcp deactivate`  | API Key        | Deactivate official MCP servers or stop custom server deployments                      |
| `bl mcp delete`      | API Key        | Permanently delete a custom MCP server                                                 |
| `bl mcp disconnect`  | No Auth        | Remove a managed MCP registration from local Agent configurations                      |
| `bl mcp get`         | API Key        | Get an MCP server's details and tool definitions                                       |
| `bl mcp list`        | API Key        | List activated MCP servers and their local Agent registrations                         |
| `bl mcp tool call`   | API Key        | Call a Bailian MCP tool via OpenAPI                                                    |
| `bl mcp tool list`   | API Key        | List a Bailian MCP server's tools and input schemas via OpenAPI                        |
| `bl mcp tool search` | API Key        | Find recommended MCP tools for a natural-language query                                |
| `bl mcp tools`       | API Key        | Open an MCP session and list the server's tools (tools/list)                           |
| `bl mcp update`      | API Key        | Update a custom MCP server's metadata or replace its configuration                     |

## Command details

### `bl mcp activate`

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Name**           | `mcp activate`                                                                         |
| **Description**    | Activate official MCP servers or enable custom servers using their saved configuration |
| **Authentication** | API Key                                                                                |
| **Usage**          | `bl mcp activate --server <code,...> [--no-browser] [--dry-run]`                       |

#### Flags

| Flag                  | Type   | Required | Description                                                             |
| --------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)         |
| `--server <code,...>` | string | yes      | Comma-separated server codes (up to 30 distinct servers)                |
| `--no-browser`        | switch | no       | Print the console link without opening it when manual setup is required |
| `--api-key <key>`     | string | no       | API key                                                                 |
| `--base-url <url>`    | string | no       | API base URL                                                            |

#### Notes

- OneKey activation may place an order. ACTIVATING means the deployment is still in progress. Use mcp list to see servers once they are active.

#### Examples

```bash
bl mcp activate --server mcp-example,mcp-weather --dry-run
```

```bash
bl mcp activate --server mcp-example
```

### `bl mcp call`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `mcp call`                                                                                           |
| **Description**    | Open an MCP session and call a tool (tools/call)                                                     |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl mcp call --target <server.tool> [--arg k=v ...] [--json '{...}'] [--query <text>] [--url <url>]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                                                                                    |
| ------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <server.tool>` | string | yes      | Server code and tool name separated by the first dot                                                                                           |
| `--json <obj>`           | string | no       | Base tool arguments as a JSON object                                                                                                           |
| `--arg <k=v>`            | array  | no       | Set a tool argument (repeatable). Values are parsed as JSON when possible and override --json.                                                 |
| `--query <text>`         | string | no       | Set the query argument to this text after applying --json and --arg                                                                            |
| `--url <url>`            | string | no       | MCP endpoint that receives the API key. Try Streamable HTTP first, then classic SSE at the same URL if initialization returns HTTP 404 or 405. |
| `--api-key <key>`        | string | no       | API key                                                                                                                                        |
| `--base-url <url>`       | string | no       | API base URL                                                                                                                                   |

#### Examples

```bash
bl mcp call --target market-cmapi00073529.SmartStockSelection --query "Screen consumer stocks with ROE > 15%"
```

```bash
bl mcp call --target market-cmapi00073529.FinQuery --json '{"q":"Guizhou Maotai","limit":5}'
```

```bash
bl mcp call --target market-cmapi00073529.SmartFundSelection --arg riskLevel=R3 --arg minScale=10
```

### `bl mcp connect`

| Field              | Value                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `mcp connect`                                                                                                                                                 |
| **Description**    | Connect a Bailian MCP service to native Agent configurations                                                                                                  |
| **Authentication** | API Key                                                                                                                                                       |
| **Usage**          | `bl mcp connect --server <code> --transport <streamable-http\|sse> --agent <agent\|all> [--scope <user\|project>] [--and-activate[=true\|false]] [--dry-run]` |

#### Flags

| Flag                                                                                                                                                   | Type    | Required | Description                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--workspace-id <id>`                                                                                                                                  | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                                                     |
| `--server <code>`                                                                                                                                      | string  | yes      | Bailian MCP server code                                                                                                                                             |
| `--agent <codex\|claude-code\|cursor\|qoder\|qoderwork\|qwenwork\|qwen-code\|gemini\|opencode\|openclaw\|deepseek-harness\|zcode\|workbuddy\|pi\|all>` | string  | yes      | Target Agent: codex, claude-code, cursor, qoder, qoderwork, qwenwork, qwen-code, gemini, opencode, openclaw, deepseek-harness, zcode, workbuddy, pi, all            |
| `--scope <user\|project>`                                                                                                                              | string  | no       | Registration scope (default user). Run project scope in the project root. Supported: codex, claude-code, cursor, qoder, qwen-code, gemini, opencode, workbuddy, pi. |
| `--transport <streamable-http\|sse>`                                                                                                                   | string  | yes      | Transport exposed by the service endpoint                                                                                                                           |
| `--and-activate [true\|false]`                                                                                                                         | boolean | no       | Activate an inactive service before connecting (default true, activation may incur charges). Use --and-activate=false to connect only to active services.           |
| `--api-key <key>`                                                                                                                                      | string  | no       | API key                                                                                                                                                             |
| `--base-url <url>`                                                                                                                                     | string  | no       | API base URL                                                                                                                                                        |

#### Notes

- Agent configuration contains the resolved API key. Keep project configuration and its backups out of version control.
- The service detail supplies the workspace endpoint. Each Agent is updated independently after its registration fingerprint is checked.

#### Examples

```bash
bl mcp connect --server TextGenerateImage --transport streamable-http --agent cursor --dry-run
```

```bash
bl mcp connect --server mcp-example --transport sse --agent claude-code --scope project --and-activate=false
```

### `bl mcp create`

| Field              | Value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **Name**           | `mcp create`                                                                                           |
| **Description**    | Create and deploy a custom MCP server                                                                  |
| **Authentication** | API Key                                                                                                |
| **Usage**          | `bl mcp create --name <text> --description <text> --mcp-type <type> --mcp-config <json\|path> [flags]` |

#### Flags

| Flag                                     | Type   | Required | Description                                                     |
| ---------------------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`                    | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--name <text>`                          | string | yes      | Server name                                                     |
| `--description <text>`                   | string | yes      | Server description                                              |
| `--mcp-type <stdio\|http\|sse\|openapi>` | string | yes      | MCP type (case-insensitive)                                     |
| `--mcp-config <json\|path>`              | string | yes      | Complete MCP configuration as a JSON object or JSON file path   |
| `--api-key <key>`                        | string | no       | API key                                                         |
| `--base-url <url>`                       | string | no       | API base URL                                                    |

#### Notes

- Deploying a custom MCP server may incur charges, including Function Compute usage for STDIO.

#### Examples

```bash
bl mcp create --name weather --description "Weather lookup" --mcp-type http --mcp-config '{"url":"https://mcp.example.com/mcp"}' --dry-run
```

```bash
bl mcp create --name weather --description "Weather lookup" --mcp-type http --mcp-config ./weather.json
```

### `bl mcp deactivate`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `mcp deactivate`                                                  |
| **Description**    | Deactivate official MCP servers or stop custom server deployments |
| **Authentication** | API Key                                                           |
| **Usage**          | `bl mcp deactivate --server <code,...> [--dry-run]`               |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--server <code,...>` | string | yes      | Comma-separated server codes (up to 30 distinct servers)        |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Stopping a server can interrupt callers. Stopping a custom server keeps its definition and saved configuration. The service may reject deactivation for OneKey servers.

#### Examples

```bash
bl mcp deactivate --server mcp-example,mcp-weather --dry-run
```

```bash
bl mcp deactivate --server mcp-example
```

### `bl mcp delete`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `mcp delete`                                                      |
| **Description**    | Permanently delete a custom MCP server                            |
| **Authentication** | API Key                                                           |
| **Usage**          | `bl mcp delete --server <code> [flags]`                           |
| **Risk**           | `high`                                                            |
| **Risk message**   | Permanently delete this custom MCP server. This cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--server <code>`     | string | yes      | Custom MCP server code                                          |
| `--yes`               | switch | no       | Confirm this high-risk operation                                |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Deletion is irreversible. Use mcp disconnect to remove any local Agent registrations listed in the result.

#### Examples

```bash
bl mcp delete --server mcp-example --dry-run
```

```bash
# Only after explicit user confirmation:
bl mcp delete --server mcp-example --yes
```

### `bl mcp disconnect`

| Field              | Value                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Name**           | `mcp disconnect`                                                                               |
| **Description**    | Remove a managed MCP registration from local Agent configurations                              |
| **Authentication** | No Auth                                                                                        |
| **Usage**          | `bl mcp disconnect --server <code> --agent <agent\|all> [--scope <user\|project>] [--dry-run]` |

#### Flags

| Flag                                                                                                                                                   | Type   | Required | Description                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--server <code>`                                                                                                                                      | string | yes      | Bailian MCP server code                                                                                                                                             |
| `--agent <codex\|claude-code\|cursor\|qoder\|qoderwork\|qwenwork\|qwen-code\|gemini\|opencode\|openclaw\|deepseek-harness\|zcode\|workbuddy\|pi\|all>` | string | yes      | Target Agent: codex, claude-code, cursor, qoder, qoderwork, qwenwork, qwen-code, gemini, opencode, openclaw, deepseek-harness, zcode, workbuddy, pi, all            |
| `--scope <user\|project>`                                                                                                                              | string | no       | Registration scope (default user). Run project scope in the project root. Supported: codex, claude-code, cursor, qoder, qwen-code, gemini, opencode, workbuddy, pi. |

#### Notes

- Disconnect runs offline. Entries edited since registration are preserved and reported as conflicts.

#### Examples

```bash
bl mcp disconnect --server mcp-example --agent cursor --scope project --dry-run
```

```bash
bl mcp disconnect --server mcp-example --agent all
```

### `bl mcp get`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `mcp get`                                        |
| **Description**    | Get an MCP server's details and tool definitions |
| **Authentication** | API Key                                          |
| **Usage**          | `bl mcp get --server <code> [flags]`             |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--server <code>`     | string | yes      | Official or custom MCP server code                              |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Billing shows the reported mode, unit price and free quota, or null when unavailable. Dry-run retrieves only server details. Tool discovery may activate a OneKey service. If tool discovery fails, the detail result contains tools=null and the command exits with the error.

#### Examples

```bash
bl mcp get --server mcp-example
```

```bash
bl mcp get --server mcp-example --dry-run
```

### `bl mcp list`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `mcp list`                                                                                |
| **Description**    | List activated MCP servers and their local Agent registrations                            |
| **Authentication** | API Key                                                                                   |
| **Usage**          | `bl mcp list [--name <text>] [--type <official\|private>] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                     |
| ---------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`        | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--name <text>`              | string | no       | Filter by server name (substring match)                         |
| `--type <official\|private>` | string | no       | Ownership type (default official, case-insensitive)             |
| `--page <n>`                 | number | no       | Page of matching servers (default 1)                            |
| `--page-size <n>`            | number | no       | Matching servers per page (1–100, default 30)                   |
| `--api-key <key>`            | string | no       | API key                                                         |
| `--base-url <url>`           | string | no       | API base URL                                                    |

#### Notes

- The CLI scans the selected type to compute the activated total before paging. connected_agents and config_paths report managed native entries whose fingerprints still match.

#### Examples

```bash
bl mcp list
```

```bash
bl mcp list --name finance
```

```bash
bl mcp list --type private --page 2 --page-size 10
```

### `bl mcp tool call`

| Field              | Value                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Name**           | `mcp tool call`                                                                                                |
| **Description**    | Call a Bailian MCP tool via OpenAPI                                                                            |
| **Authentication** | API Key                                                                                                        |
| **Usage**          | `bl mcp tool call --server <code> --tool <name> [--json '{...}'] [--arg k=v ...] [--query <text>] [--dry-run]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                    |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                |
| `--server <code>`     | string | yes      | Official or custom MCP server code                                                             |
| `--tool <name>`       | string | yes      | Tool name returned by tool list or tool search                                                 |
| `--json <obj>`        | string | no       | Base tool arguments as a JSON object                                                           |
| `--arg <k=v>`         | array  | no       | Set a tool argument (repeatable). Values are parsed as JSON when possible and override --json. |
| `--query <text>`      | string | no       | Set the query argument to this text after applying --json and --arg                            |
| `--api-key <key>`     | string | no       | API key                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                   |

#### Notes

- Dry-run previews the arguments locally. Calling a tool may activate a OneKey service. A tool-reported error returns its content and exits with code 1.

#### Examples

```bash
bl mcp tool call --server mcp-example --tool getOrder --arg orderId=A123 --dry-run
```

```bash
bl mcp tool call --workspace-id ws-example --server mcp-example --tool getOrder --arg orderId=A123
```

### `bl mcp tool list`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `mcp tool list`                                                 |
| **Description**    | List a Bailian MCP server's tools and input schemas via OpenAPI |
| **Authentication** | API Key                                                         |
| **Usage**          | `bl mcp tool list --server <code> [--dry-run]`                  |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--server <code>`     | string | yes      | Official or custom MCP server code                              |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Fetching tools may activate a OneKey service. Dry-run previews the request locally.

#### Examples

```bash
bl mcp tool list --server mcp-example
```

```bash
bl mcp tool list --server mcp-example --dry-run
```

### `bl mcp tool search`

| Field              | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| **Name**           | `mcp tool search`                                             |
| **Description**    | Find recommended MCP tools for a natural-language query       |
| **Authentication** | API Key                                                       |
| **Usage**          | `bl mcp tool search --query <text> [--limit <n>] [--dry-run]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--query <text>`      | string | yes      | Describe what you want the tool to do                           |
| `--limit <n>`         | number | no       | Maximum results to show (default 10)                            |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Requesting recommendations may activate a OneKey service and place an order.

#### Examples

```bash
bl mcp tool search --query "look up an order" --dry-run
```

```bash
bl mcp tool search --query "look up an order" --limit 5
```

### `bl mcp tools`

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Name**           | `mcp tools`                                                  |
| **Description**    | Open an MCP session and list the server's tools (tools/list) |
| **Authentication** | API Key                                                      |
| **Usage**          | `bl mcp tools --server <code> [--url <url>]`                 |

#### Flags

| Flag               | Type   | Required | Description                                                                                                                                    |
| ------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--server <code>`  | string | yes      | Server code from `mcp list` (e.g. market-cmapi00073529)                                                                                        |
| `--url <url>`      | string | no       | MCP endpoint that receives the API key. Try Streamable HTTP first, then classic SSE at the same URL if initialization returns HTTP 404 or 405. |
| `--api-key <key>`  | string | no       | API key                                                                                                                                        |
| `--base-url <url>` | string | no       | API base URL                                                                                                                                   |

#### Examples

```bash
bl mcp tools --server market-cmapi00073529
```

```bash
bl mcp tools --server market-cmapi00073529 --output json
```

```bash
bl mcp tools --server my-server --url https://example.com/mcp
```

### `bl mcp update`

| Field              | Value                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `mcp update`                                                                                                                 |
| **Description**    | Update a custom MCP server's metadata or replace its configuration                                                           |
| **Authentication** | API Key                                                                                                                      |
| **Usage**          | `bl mcp update --server <code> [--name <text>] [--description <text>] [--mcp-type <type> --mcp-config <json\|path>] [flags]` |

#### Flags

| Flag                                     | Type   | Required | Description                                                     |
| ---------------------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`                    | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--server <code>`                        | string | yes      | Custom MCP server code                                          |
| `--name <text>`                          | string | no       | Server name                                                     |
| `--description <text>`                   | string | no       | Server description                                              |
| `--mcp-type <stdio\|http\|sse\|openapi>` | string | no       | MCP type (case-insensitive)                                     |
| `--mcp-config <json\|path>`              | string | no       | Complete MCP configuration as a JSON object or JSON file path   |
| `--api-key <key>`                        | string | no       | API key                                                         |
| `--base-url <url>`                       | string | no       | API base URL                                                    |

#### Notes

- Deploying a custom MCP server may incur charges, including Function Compute usage for STDIO.
- Name and description changes take effect without redeployment. Stop the instance before replacing its configuration and redeploying.

#### Examples

```bash
bl mcp update --server mcp-example --name weather-v2
```

```bash
bl mcp update --server mcp-example --mcp-type sse --mcp-config ./weather.json --dry-run
```
