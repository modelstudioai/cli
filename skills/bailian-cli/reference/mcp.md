# `bl mcp` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command        | Description                                           |
| -------------- | ----------------------------------------------------- |
| `bl mcp call`  | Call a tool on an MCP server (tools/call)             |
| `bl mcp list`  | List MCP servers activated under your Bailian account |
| `bl mcp tools` | List tools exposed by an MCP server (tools/list)      |

## Command details

### `bl mcp call`

| Field           | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| **Name**        | `mcp call`                                                                          |
| **Description** | Call a tool on an MCP server (tools/call)                                           |
| **Usage**       | `bl mcp call --target <server.tool> [--arg k=v ...] [--json '{...}'] [--url <url>]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                              |
| ------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `--target <server.tool>` | string | yes      | Server code and tool name joined by a dot, e.g. market-cmapi00073529.SmartStockSelection |
| `--arg <kv>`             | array  | no       | Tool argument (repeatable). Values parsed as JSON if possible, else string.              |
| `--json <obj>`           | string | no       | Full arguments object as JSON; merged with --arg (arg wins).                             |
| `--query <text>`         | string | no       | Shortcut for --arg query=<text> (mirrors many DashScope MCP tools).                      |
| `--url <url>`            | string | no       | Override the MCP endpoint URL (for non-Bailian servers)                                  |
| `--api-key <key>`        | string | no       | API key                                                                                  |
| `--base-url <url>`       | string | no       | API base URL                                                                             |

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

### `bl mcp list`

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Name**        | `mcp list`                                            |
| **Description** | List MCP servers activated under your Bailian account |
| **Usage**       | `bl mcp list [flags]`                                 |

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

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| **Name**        | `mcp tools`                                      |
| **Description** | List tools exposed by an MCP server (tools/list) |
| **Usage**       | `bl mcp tools --server <code> [--url <url>]`     |

#### Flags

| Flag               | Type   | Required | Description                                             |
| ------------------ | ------ | -------- | ------------------------------------------------------- |
| `--server <code>`  | string | yes      | Server code from `mcp list` (e.g. market-cmapi00073529) |
| `--url <url>`      | string | no       | Override the MCP endpoint URL (for non-Bailian servers) |
| `--api-key <key>`  | string | no       | API key                                                 |
| `--base-url <url>` | string | no       | API base URL                                            |

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
