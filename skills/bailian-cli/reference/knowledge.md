# `bl knowledge` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `bl knowledge retrieve` | Retrieve from a Bailian knowledge base |

## Command details

### `bl knowledge retrieve`

| Field           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| **Name**        | `knowledge retrieve`                                           |
| **Description** | Retrieve from a Bailian knowledge base                         |
| **Usage**       | `bl knowledge retrieve --index-id <id> --query <text> [flags]` |

#### Options

| Flag                            | Type    | Required | Description                                                |
| ------------------------------- | ------- | -------- | ---------------------------------------------------------- |
| `--index-id <id>`               | string  | yes      | Knowledge base index ID (required)                         |
| `--query <text>`                | string  | yes      | Search query (required)                                    |
| `--dense-similarity-top-k <n>`  | number  | no       | Dense retrieval top K (API-KEY only)                       |
| `--sparse-similarity-top-k <n>` | number  | no       | Sparse retrieval top K (API-KEY only)                      |
| `--rerank`                      | boolean | no       | Enable reranking                                           |
| `--rerank-top-n <n>`            | number  | no       | Rerank top N results                                       |
| `--rerank-model <name>`         | string  | no       | Rerank model, e.g. qwen3-rerank-hybrid (API-KEY only)      |
| `--rerank-mode <mode>`          | string  | no       | Rerank mode: qa, similar, or custom (API-KEY only)         |
| `--rerank-instruct <text>`      | string  | no       | Custom rerank instruction, when mode=custom (API-KEY only) |
| `--top-k <n>`                   | number  | no       | Number of results (deprecated, use --rerank-top-n)         |
| `--workspace-id <id>`           | string  | no       | Bailian workspace ID (required for AK/SK auth)             |
| `--access-key-id <key>`         | string  | no       | Alibaba Cloud Access Key ID (deprecated)                   |
| `--access-key-secret <key>`     | string  | no       | Alibaba Cloud Access Key Secret (deprecated)               |

#### Examples

```bash
bl knowledge retrieve --index-id idx_xxx --query "如何使用阿里云百炼"
```

```bash
bl knowledge retrieve --index-id idx_xxx --query "API限流" --rerank --rerank-model qwen3-rerank-hybrid
```
