# `bl search` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

> **Agent routing (mandatory):** Before running any `bl search *` command, Read skill `bailian-web-search` if installed and follow its routing (default `bl search web` = model mode for every identity, including Token Plan; the WebSearch MCP service requires explicit `--mode mcp` and a regular DashScope key; eligible MCP failures → fall back to model mode once). Do **not** route Token Plan keys to `bl search web --mode mcp` — they cannot authorize Bailian MCP search. If that skill is missing, run `bl skill init` or fall back to `bl search web --help` / `bl text chat --help` after checking `bl config show --output json`.

Index: [index.md](index.md)

## Commands in this group

| Command         | Authentication | Description                                                                                               |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `bl search web` | API Key        | Search the web via a chat model with built-in web search (default) or the DashScope MCP WebSearch service |

## Command details

### `bl search web`

| Field              | Value                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **Name**           | `search web`                                                                                              |
| **Description**    | Search the web via a chat model with built-in web search (default) or the DashScope MCP WebSearch service |
| **Authentication** | API Key                                                                                                   |
| **Usage**          | `bl search web --query <text> [flags]`                                                                    |

#### Flags

| Flag                  | Type   | Required | Description                                                                                                              |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--query <text>`      | string | no       | Search query text                                                                                                        |
| `--count <n>`         | number | no       | Number of search results (default: 10)                                                                                   |
| `--list-tools`        | switch | no       | List available MCP tools and exit                                                                                        |
| `--mode <mcp\|model>` | string | no       | Search mode: model answers via Chat Completions with enable_search, mcp calls the WebSearch MCP service (default: model) |
| `--model <model>`     | string | no       | Model ID for --mode model (default: qwen3.8-max)                                                                         |
| `--api-key <key>`     | string | no       | API key                                                                                                                  |
| `--base-url <url>`    | string | no       | API base URL                                                                                                             |

#### Notes

- Defaults to --mode model: one non-streaming Chat Completions request with enable_search: true, returning the model answer as a single content[].text block (no pages list). Use --mode mcp for the WebSearch MCP service (pages list); --count and --list-tools are MCP-mode only. The model resolves from --model, default_text_model, then qwen3.8-max.

#### Examples

```bash
bl search web --query "Alibaba Cloud Bailian latest features"
```

```bash
bl search web --query "Today's news"
```

```bash
bl search web --mode mcp --query "TypeScript 5.9 new features" --count 5
```

```bash
bl search web --mode mcp --query "Alibaba Cloud Bailian latest features"
```

```bash
bl search web --list-tools
```
