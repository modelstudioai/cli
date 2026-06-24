# `bl dataset` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command               | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `bl dataset delete`   | Delete a dataset file by ID                                |
| `bl dataset get`      | Get details of a single dataset file                       |
| `bl dataset list`     | List uploaded dataset files                                |
| `bl dataset upload`   | Upload a dataset file (.jsonl) to Bailian                  |
| `bl dataset validate` | Locally validate a dataset file (.jsonl) without uploading |

## Command details

### `bl dataset delete`

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Name**        | `dataset delete`                           |
| **Description** | Delete a dataset file by ID                |
| **Usage**       | `bl dataset delete --file-id <id> [--yes]` |

#### Options

| Flag             | Type    | Required | Description                  |
| ---------------- | ------- | -------- | ---------------------------- |
| `--file-id <id>` | string  | yes      | Dataset file ID (required)   |
| `--yes`          | boolean | no       | Skip the confirmation prompt |

#### Examples

```bash
bl dataset delete --file-id file-id-xxx
```

```bash
bl dataset delete --file-id file-id-xxx --yes
```

### `bl dataset get`

| Field           | Value                                |
| --------------- | ------------------------------------ |
| **Name**        | `dataset get`                        |
| **Description** | Get details of a single dataset file |
| **Usage**       | `bl dataset get --file-id <id>`      |

#### Options

| Flag             | Type   | Required | Description                |
| ---------------- | ------ | -------- | -------------------------- |
| `--file-id <id>` | string | yes      | Dataset file ID (required) |

#### Examples

```bash
bl dataset get --file-id file-xxx
```

```bash
bl dataset get --file-id file-xxx --output json
```

### `bl dataset list`

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| **Name**        | `dataset list`                                                      |
| **Description** | List uploaded dataset files                                         |
| **Usage**       | `bl dataset list [--page <n>] [--page-size <n>] [--purpose <name>]` |

#### Options

| Flag               | Type   | Required | Description                                                           |
| ------------------ | ------ | -------- | --------------------------------------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)                                              |
| `--page-size <n>`  | number | no       | Results per page (default: 10, max 100)                               |
| `--purpose <name>` | string | no       | Filter by purpose (e.g. "fine-tune", "evaluation"). Omit to list all. |

#### Examples

```bash
bl dataset list
```

```bash
bl dataset list --purpose fine-tune
```

```bash
bl dataset list --purpose evaluation --page-size 20
```

```bash
bl dataset list --output json
```

### `bl dataset upload`

| Field           | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| **Name**        | `dataset upload`                                                                       |
| **Description** | Upload a dataset file (.jsonl) to Bailian                                              |
| **Usage**       | `bl dataset upload --file <path> [--purpose <name>] [--no-validate] [--full-validate]` |

#### Options

| Flag               | Type    | Required | Description                                                   |
| ------------------ | ------- | -------- | ------------------------------------------------------------- |
| `--file <path>`    | string  | yes      | Local .jsonl dataset file (≤300MB)                            |
| `--purpose <name>` | string  | no       | Dataset purpose tag (default: "fine-tune"; e.g. "evaluation") |
| `--no-validate`    | boolean | no       | Skip the local JSONL pre-flight check (not recommended)       |
| `--full-validate`  | boolean | no       | JSON.parse every line instead of sampling (slower)            |

#### Notes

- Only .jsonl is supported in this release. The default validator expects a
- ChatML schema (each line a JSON object with a "messages" array). Other
- purposes may carry a different schema in the future and would be served
- by a purpose-specific validator at that point.
- The dataset upload cap is 300MB per file.
- Upload uses the OpenAI-compatible /compatible-mode/v1/files endpoint so
- the purpose tag is persisted (the DashScope-native /api/v1/files drops it).

#### Examples

```bash
bl dataset upload --file train.jsonl
```

```bash
bl dataset upload --file eval.jsonl --purpose evaluation
```

```bash
bl dataset upload --file train.jsonl --full-validate
```

```bash
bl dataset upload --file train.jsonl --no-validate
```

### `bl dataset validate`

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| **Name**        | `dataset validate`                                         |
| **Description** | Locally validate a dataset file (.jsonl) without uploading |
| **Usage**       | `bl dataset validate --file <path> [--full-validate]`      |

#### Options

| Flag              | Type    | Required | Description                                        |
| ----------------- | ------- | -------- | -------------------------------------------------- |
| `--file <path>`   | string  | yes      | Local .jsonl dataset file                          |
| `--full-validate` | boolean | no       | JSON.parse every line instead of sampling (slower) |

#### Notes

- Default scan: every line gets a structural check, then ~160 lines (front 50,
- evenly spaced 100, last 10) are JSON.parsed against the active schema.
- Today the only registered .jsonl schema is ChatML (messages array).
- Use --full-validate to JSON.parse every line.

#### Examples

```bash
bl dataset validate --file train.jsonl
```

```bash
bl dataset validate --file eval.jsonl --full-validate
```

```bash
bl dataset validate --file train.jsonl --output json
```
