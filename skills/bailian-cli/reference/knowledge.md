# `bl knowledge` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
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

| Flag                            | Type    | Required | Description                                                  |
| ------------------------------- | ------- | -------- | ------------------------------------------------------------ |
| `--index-id <id>`               | string  | yes      | Knowledge base index ID (required)                           |
| `--query <text>`                | string  | yes      | Search query (required)                                      |
| `--dense-similarity-top-k <n>`  | number  | no       | Dense retrieval top K                                        |
| `--sparse-similarity-top-k <n>` | number  | no       | Sparse retrieval top K                                       |
| `--rerank`                      | boolean | no       | Enable reranking                                             |
| `--rerank-top-n <n>`            | number  | no       | Rerank top N results                                         |
| `--rerank-model <name>`         | string  | no       | Rerank model, e.g. qwen3-rerank-hybrid                       |
| `--rerank-mode <mode>`          | string  | no       | Rerank mode: qa, similar, or custom                          |
| `--rerank-instruct <text>`      | string  | no       | Custom rerank instruction, when mode=custom                  |
| `--top-k <n>`                   | number  | no       | Number of results (deprecated, use --rerank-top-n)           |
| `--workspace-id <id>`           | string  | no       | Bailian workspace ID (only needed for deprecated AK/SK auth) |
| `--access-key-id <key>`         | string  | no       | Deprecated: use global --api-key instead                     |
| `--access-key-secret <key>`     | string  | no       | Deprecated: use global --api-key instead                     |

#### Notes

- Authentication: pass `--api-key <key>`. AK/SK auth is deprecated and will be removed in a future version.
- `--workspace-id` is NOT required when using --api-key.

#### Examples

```bash
bl knowledge retrieve --index-id idx_xxx --query "How to use Alibaba Cloud Bailian"
```

```bash
bl knowledge retrieve --api-key $DASHSCOPE_API_KEY --index-id idx_xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid
```
