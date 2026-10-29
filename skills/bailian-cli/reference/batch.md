# `bl batch` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Authentication | Description                                                     |
| ------------------- | -------------- | --------------------------------------------------------------- |
| `bl batch cancel`   | API Key        | Request cancellation of a Batch task                            |
| `bl batch convert`  | No Auth        | Build Batch JSONL from CSV locally                              |
| `bl batch create`   | API Key        | Upload or reference input and create an asynchronous Batch task |
| `bl batch download` | API Key        | Download original Batch results/errors, optionally export CSV   |
| `bl batch get`      | API Key        | Get Batch task details, optionally following progress           |
| `bl batch list`     | API Key        | List one page of Batch tasks                                    |

## Command details

### `bl batch cancel`

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Name**           | `batch cancel`                       |
| **Description**    | Request cancellation of a Batch task |
| **Authentication** | API Key                              |
| **Usage**          | `bl batch cancel --batch-id <id>`    |

#### Flags

| Flag               | Type   | Required | Description   |
| ------------------ | ------ | -------- | ------------- |
| `--batch-id <id>`  | string | yes      | Batch task ID |
| `--api-key <key>`  | string | no       | API key       |
| `--base-url <url>` | string | no       | API base URL  |

#### Notes

- An accepted cancellation may return cancelling, not cancelled. Use batch get --follow to confirm. Already executed requests still incur charges; files are not deleted.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch cancel --batch-id batch_xxx
```

```bash
bl batch cancel --batch-id batch_xxx --dry-run
```

### `bl batch convert`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `batch convert`                                                               |
| **Description**    | Build Batch JSONL from CSV locally                                            |
| **Authentication** | No Auth                                                                       |
| **Usage**          | `bl batch convert --file <csv> --model <model> --output-file <jsonl> [flags]` |

#### Flags

| Flag                                                                  | Type   | Required | Description                                            |
| --------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--file <csv>`                                                        | string | yes      | UTF-8 CSV with headers                                 |
| `--output-file <jsonl>`                                               | string | yes      | Local JSONL output path                                |
| `--model <model>`                                                     | string | yes      | Model for every record                                 |
| `--id-column <name>`                                                  | string | no       | ID column (default: custom_id)                         |
| `--input-column <name>`                                               | string | no       | Input column (default: content)                        |
| `--system <text>`                                                     | string | no       | Shared system prompt (Chat only)                       |
| `--body-file <json>`                                                  | string | no       | Shared body parameters, excluding model/messages/input |
| `--endpoint </v1/chat/completions\|/v1/embeddings\|/v1/chat/ds-test>` | string | no       | Batch endpoint (inferred from local JSONL)             |
| `--force`                                                             | switch | no       | Replace existing output files (atomic per file)        |

#### Notes

- input.csv:
  custom_id,content
  req-001,Introduce yourself
  req-002,2+2?

input.jsonl:
{"custom_id":"req-001","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-plus","messages":[{"role":"user","content":"Introduce yourself"}]}}

defaults.json (--body-file):
{"enable_thinking":false,"max_tokens":1024}

- Text/embedding mapping only; use native JSONL for multimodal or multi-turn input. IDs remain strings; import CSV IDs as text in spreadsheet software.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch convert --file input.csv --model qwen-plus --output-file input.jsonl
```

```bash
bl batch convert --file input.csv --model text-embedding-v4 --endpoint /v1/embeddings --output-file vectors.jsonl
```

```bash
bl batch convert --file input.csv --model qwen-plus --body-file defaults.json --output-file input.jsonl --dry-run
```

### `bl batch create`

| Field              | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Name**           | `batch create`                                                                           |
| **Description**    | Upload or reference input and create an asynchronous Batch task                          |
| **Authentication** | API Key                                                                                  |
| **Usage**          | `bl batch create (--file <jsonl> \| --input-file-id <source> --endpoint <path>) [flags]` |

#### Flags

| Flag                                                                  | Type   | Required | Description                                        |
| --------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------- |
| `--file <jsonl>`                                                      | string | no       | Local Batch JSONL (exclusive with --input-file-id) |
| `--input-file-id <source>`                                            | string | no       | File ID, OSS HTTPS URL or oss:region:bucket/path   |
| `--completion-window <24h\|7d>`                                       | string | no       | Completion window: 24–336 hours (default: 24h)     |
| `--name <text>`                                                       | string | no       | Task name (max 100 characters)                     |
| `--description <text>`                                                | string | no       | Task description (max 200 characters)              |
| `--callback-url <url>`                                                | string | no       | Completion callback (documented in Beijing only)   |
| `--metadata <KEY=VALUE>`                                              | array  | no       | Custom task metadata (repeatable)                  |
| `--endpoint </v1/chat/completions\|/v1/embeddings\|/v1/chat/ds-test>` | string | no       | Batch endpoint (inferred from local JSONL)         |
| `--api-key <key>`                                                     | string | no       | API key                                            |
| `--base-url <url>`                                                    | string | no       | API base URL                                       |

#### Notes

- Chat JSONL:
  {"custom_id":"req-001","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-plus","messages":[{"role":"user","content":"Introduce yourself"}]}}

Embedding JSONL:
{"custom_id":"req-001","method":"POST","url":"/v1/embeddings","body":{"model":"text-embedding-v4","input":"Introduce yourself","encoding_format":"float"}}

Multimodal JSONL (replace the example public image URL):
{"custom_id":"req-001","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-vl-plus","messages":[{"role":"user","content":[{"type":"text","text":"Introduce yourself"},{"type":"image_url","image_url":{"url":"https://example.com/image.jpg"}}]}]}}

- Local input: <=50,000 requests, <=500 MiB, <=6 MiB per line; >1 MiB warns due to conflicting documentation. batch-test-model: <=100 requests and <=1 MiB. Remote references require authorization and sufficient URL validity; they are not downloaded for validation. No automatic POST replay or uploaded-file cleanup on failure.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch create --file input.jsonl --name eval-1 --dry-run
```

```bash
bl batch create --file input.jsonl --completion-window 24h
```

```bash
bl batch create --input-file-id file-batch-xxx --endpoint /v1/chat/completions
```

```bash
bl batch create --input-file-id oss:cn-beijing:my-bucket/input.jsonl --endpoint /v1/chat/completions --completion-window 7d
```

### `bl batch download`

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Name**           | `batch download`                                                         |
| **Description**    | Download original Batch results/errors, optionally export CSV            |
| **Authentication** | API Key                                                                  |
| **Usage**          | `bl batch download --batch-id <id> [--out-dir <path>] [--csv] [--force]` |

#### Flags

| Flag               | Type   | Required | Description                                             |
| ------------------ | ------ | -------- | ------------------------------------------------------- |
| `--batch-id <id>`  | string | yes      | Batch task ID                                           |
| `--force`          | switch | no       | Replace existing output files (atomic per file)         |
| `--out-dir <path>` | string | no       | Output directory (default: ./batch-results/<batch-id>/) |
| `--csv`            | switch | no       | Also generate result.csv (lossy display projection)     |
| `--api-key <key>`  | string | no       | API key                                                 |
| `--base-url <url>` | string | no       | API base URL                                            |

#### Notes

- result.jsonl:
  {"custom_id":"req-001","response":{"request_id":"request-001","status_code":200,"body":{"model":"qwen-plus","choices":[{"message":{"role":"assistant","content":"Hello"}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}},"error":null}

error.jsonl (illustrative envelope; verify with the service):
{"custom_id":"req-002","response":null,"error":{"code":"ExampleError","message":"Example service error"}}

result.csv:
custom_id,model,request_id,status_code,content,embedding,error_code,error_message,prompt_tokens,completion_tokens,total_tokens
req-001,qwen-plus,request-001,200,Hello,,,,10,2,12
req-002,,,,,,ExampleError,Example service error,,,

- JSONL is authoritative; CSV reads only choices[0].message.content, embedding data, response.request_id/status_code, usage and error.code/message (or response.body.error). Unknown envelopes warn. CSV omits tool calls/additional choices and protects formula-like text; import IDs as text to retain leading zeros. No guarantee of original input order. Atomic per file, not per directory; CSV failure preserves downloaded JSONL. Recover by rerunning with --force. Retention is limited; download promptly.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch download --batch-id batch_xxx --out-dir ./out --csv
```

```bash
bl batch download --batch-id batch_xxx --out-dir ./out --csv --force
```

```bash
bl batch download --batch-id batch_xxx --dry-run
```

### `bl batch get`

| Field              | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Name**           | `batch get`                                                                                 |
| **Description**    | Get Batch task details, optionally following progress                                       |
| **Authentication** | API Key                                                                                     |
| **Usage**          | `bl batch get --batch-id <id> [--follow] [--interval <seconds>] [--poll-timeout <seconds>]` |

#### Flags

| Flag                       | Type   | Required | Description                                                 |
| -------------------------- | ------ | -------- | ----------------------------------------------------------- |
| `--batch-id <id>`          | string | yes      | Batch task ID                                               |
| `--follow`                 | switch | no       | Poll until terminal state (Ctrl-C stops only local polling) |
| `--interval <seconds>`     | number | no       | Query interval, min 60s (default: 65s; --follow only)       |
| `--poll-timeout <seconds>` | number | no       | Total polling budget (default: unlimited; --follow only)    |
| `--api-key <key>`          | string | no       | API key                                                     |
| `--base-url <url>`         | string | no       | API base URL                                                |

#### Notes

- Single get exits 0 after a successful query regardless of task state. --follow exits 0 for completed (may contain failed rows), 1 for failed/expired/cancelled, 5 on client timeout, 130 on Ctrl-C. finalizing/cancelling are not terminal. Progress uses stderr; one final result uses stdout. Query errors are retried at most three times only for transport/timeouts or HTTP 429/5xx. Download results promptly; service retention is limited.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch get --batch-id batch_xxx
```

```bash
bl batch get --batch-id batch_xxx --follow
```

```bash
bl batch get --batch-id batch_xxx --follow --interval 65 --poll-timeout 86400
```

### `bl batch list`

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Name**           | `batch list`                                           |
| **Description**    | List one page of Batch tasks                           |
| **Authentication** | API Key                                                |
| **Usage**          | `bl batch list [filters] [--after <id>] [--limit <n>]` |

#### Flags

| Flag                                                                                                | Type   | Required | Description                            |
| --------------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------------------- |
| `--limit <n>`                                                                                       | number | no       | Page size: 1–100 (default: 20)         |
| `--after <id>`                                                                                      | string | no       | Previous page last_id                  |
| `--name <text>`                                                                                     | string | no       | Task name filter                       |
| `--input-file-id <id>`                                                                              | array  | no       | Input file filter (repeatable, max 20) |
| `--status <validating\|in_progress\|finalizing\|completed\|failed\|expired\|cancelling\|cancelled>` | array  | no       | Task status filter (repeatable)        |
| `--created-after <yyyyMMddHHmmss>`                                                                  | string | no       | Created after API timestamp            |
| `--created-before <yyyyMMddHHmmss>`                                                                 | string | no       | Created before API timestamp           |
| `--api-key <key>`                                                                                   | string | no       | API key                                |
| `--base-url <url>`                                                                                  | string | no       | API base URL                           |

#### Notes

- Returns data, last_id and has_more; use --after last_id for the next page. API timestamps are not timezone-converted.
- Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.

#### Examples

```bash
bl batch list --status completed --status failed --limit 20
```

```bash
bl batch list --after batch_xxx --limit 20
```

```bash
bl batch list --created-after 20261001000000 --created-before 20261023235959
```
