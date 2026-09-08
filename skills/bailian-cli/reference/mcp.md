# `bl mcp` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Authentication | Description                                                            |
| ------------------- | -------------- | ---------------------------------------------------------------------- |
| `bl mcp call`       | API Key        | Call a tool on an MCP server (tools/call)                              |
| `bl mcp connect`    | API Key        | Register a Bailian MCP server in an Agent's native configuration       |
| `bl mcp disconnect` | No Auth        | Remove an unchanged MCP registration previously managed by bailian-cli |
| `bl mcp list`       | Console        | List MCP servers activated under your Bailian account                  |
| `bl mcp tools`      | API Key        | List tools exposed by an MCP server (tools/list)                       |

## Command details

### `bl mcp call`

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Name**           | `mcp call`                                                                          |
| **Description**    | Call a tool on an MCP server (tools/call)                                           |
| **Authentication** | API Key                                                                             |
| **Usage**          | `bl mcp call --target <server.tool> [--arg k=v ...] [--json '{...}'] [--url <url>]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                                                 |
| ------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `--target <server.tool>` | string | yes      | Server code and tool name joined by a dot, e.g. market-cmapi00073529.SmartStockSelection                    |
| `--arg <kv>`             | array  | no       | Tool argument (repeatable). Values parsed as JSON if possible, else string.                                 |
| `--json <obj>`           | string | no       | Full arguments object as JSON; merged with --arg (arg wins).                                                |
| `--query <text>`         | string | no       | Shortcut for --arg query=<text> (mirrors many DashScope MCP tools).                                         |
| `--url <url>`            | string | no       | Override the MCP endpoint URL (non-Bailian). Tries Streamable HTTP first, then classic SSE on the same URL. |
| `--api-key <key>`        | string | no       | API key                                                                                                     |
| `--base-url <url>`       | string | no       | API base URL                                                                                                |

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

| Field              | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Name**           | `mcp connect`                                                                            |
| **Description**    | Register a Bailian MCP server in an Agent's native configuration                         |
| **Authentication** | API Key                                                                                  |
| **Usage**          | `bl mcp connect --server <code> --transport <streamable-http\|sse> --agent <agent\|all>` |

#### Flags

| Flag                                                   | Type   | Required | Description                                                 |
| ------------------------------------------------------ | ------ | -------- | ----------------------------------------------------------- |
| `--server <code>`                                      | string | yes      | Bailian MCP Server Code, such as TextGenerateImage          |
| `--transport <streamable-http\|sse>`                   | string | yes      | MCP transport exposed by the server: streamable-http or sse |
| `--agent <codex\|claude-code\|qwen-code\|gemini\|all>` | string | yes      | Target Agent: codex, claude-code, qwen-code, gemini, all    |
| `--api-key <key>`                                      | string | no       | API key                                                     |
| `--base-url <url>`                                     | string | no       | API base URL                                                |

#### Notes

- This release registers the official China-site MCP endpoint; the model API --base-url does not change the MCP endpoint.
- The resolved API key is written to the selected Agent's private local configuration. Existing unmanaged entries are never overwritten.

#### Examples

```bash
bl mcp connect --server TextGenerateImage --transport streamable-http --agent codex
```

```bash
bl mcp connect --server VideoGenerate --transport sse --agent claude-code
```

```bash
bl mcp connect --server TextGenerateImage --transport streamable-http --agent all
```

### `bl mcp disconnect`

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| **Name**           | `mcp disconnect`                                                       |
| **Description**    | Remove an unchanged MCP registration previously managed by bailian-cli |
| **Authentication** | No Auth                                                                |
| **Usage**          | `bl mcp disconnect --server <code> --agent <agent\|all>`               |

#### Flags

| Flag                                                   | Type   | Required | Description                                              |
| ------------------------------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--server <code>`                                      | string | yes      | Bailian MCP Server Code used during connect              |
| `--agent <codex\|claude-code\|qwen-code\|gemini\|all>` | string | yes      | Target Agent: codex, claude-code, qwen-code, gemini, all |

#### Notes

- A registration changed after connect is left untouched and reported as a conflict.

#### Examples

```bash
bl mcp disconnect --server TextGenerateImage --agent codex
```

```bash
bl mcp disconnect --server TextGenerateImage --agent all
```

### `bl mcp list`

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Name**           | `mcp list`                                            |
| **Description**    | List MCP servers activated under your Bailian account |
| **Authentication** | Console                                               |
| **Usage**          | `bl mcp list [flags]`                                 |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--name <text>`                | string | no       | Filter by server name (substring match)                  |
| `--type <type>`                | string | no       | Server type: OFFICIAL \| PRIVATE (default: OFFICIAL)     |
| `--page <n>`                   | number | no       | Page number (default: 1)                                 |
| `--page-size <n>`              | number | no       | Results per page (default: 30)                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl mcp list
```

```bash
bl mcp list --name finance
```

```bash
bl mcp list --output json
```

### `bl mcp tools`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `mcp tools`                                      |
| **Description**    | List tools exposed by an MCP server (tools/list) |
| **Authentication** | API Key                                          |
| **Usage**          | `bl mcp tools --server <code> [--url <url>]`     |

#### Flags

| Flag               | Type   | Required | Description                                                                                                 |
| ------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `--server <code>`  | string | yes      | Server code from `mcp list` (e.g. market-cmapi00073529)                                                     |
| `--url <url>`      | string | no       | Override the MCP endpoint URL (non-Bailian). Tries Streamable HTTP first, then classic SSE on the same URL. |
| `--api-key <key>`  | string | no       | API key                                                                                                     |
| `--base-url <url>` | string | no       | API base URL                                                                                                |

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
