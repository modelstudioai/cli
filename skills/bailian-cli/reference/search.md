# `bl search` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command         | Description                                          |
| --------------- | ---------------------------------------------------- |
| `bl search web` | Search the web using DashScope MCP WebSearch service |

## Command details

### `bl search web`

| Field           | Value                                                |
| --------------- | ---------------------------------------------------- |
| **Name**        | `search web`                                         |
| **Description** | Search the web using DashScope MCP WebSearch service |
| **Usage**       | `bl search web --query <text> [flags]`               |

#### Flags

| Flag               | Type   | Required | Description                            |
| ------------------ | ------ | -------- | -------------------------------------- |
| `--query <text>`   | string | no       | Search query text                      |
| `--count <n>`      | number | no       | Number of search results (default: 10) |
| `--list-tools`     | switch | no       | List available MCP tools and exit      |
| `--api-key <key>`  | string | no       | API key                                |
| `--base-url <url>` | string | no       | API base URL                           |

#### Examples

```bash
bl search web --query "Alibaba Cloud Bailian latest features"
```

```bash
bl search web --query "TypeScript 5.9 new features" --count 5
```

```bash
bl search web --query "Today's news"
```

```bash
bl search web --list-tools
```
