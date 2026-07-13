# `bl dataset` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command               | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `bl dataset delete`   | Delete a dataset file by ID                                        |
| `bl dataset get`      | Get details of a single dataset file                               |
| `bl dataset list`     | List uploaded dataset files                                        |
| `bl dataset upload`   | Upload a dataset file (.jsonl or .zip) to Bailian                  |
| `bl dataset validate` | Locally validate a dataset file (.jsonl or .zip) without uploading |

## Command details

### `bl dataset delete`

| Field           | Value                              |
| --------------- | ---------------------------------- |
| **Name**        | `dataset delete`                   |
| **Description** | Delete a dataset file by ID        |
| **Usage**       | `bl dataset delete --file-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                |
| ------------------ | ------ | -------- | -------------------------- |
| `--file-id <id>`   | string | yes      | Dataset file ID (required) |
| `--api-key <key>`  | string | no       | API key                    |
| `--base-url <url>` | string | no       | API base URL               |

#### Examples

```bash
bl dataset delete --file-id file-id-xxx
```

```bash
bl dataset delete --file-id file-id-xxx --dry-run
```

### `bl dataset get`

| Field           | Value                                |
| --------------- | ------------------------------------ |
| **Name**        | `dataset get`                        |
| **Description** | Get details of a single dataset file |
| **Usage**       | `bl dataset get --file-id <id>`      |

#### Flags

| Flag               | Type   | Required | Description                |
| ------------------ | ------ | -------- | -------------------------- |
| `--file-id <id>`   | string | yes      | Dataset file ID (required) |
| `--api-key <key>`  | string | no       | API key                    |
| `--base-url <url>` | string | no       | API base URL               |

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

#### Flags

| Flag               | Type   | Required | Description                                                           |
| ------------------ | ------ | -------- | --------------------------------------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)                                              |
| `--page-size <n>`  | number | no       | Results per page (default: 10, max 100)                               |
| `--purpose <name>` | string | no       | Filter by purpose (e.g. "fine-tune", "evaluation"). Omit to list all. |
| `--api-key <key>`  | string | no       | API key                                                               |
| `--base-url <url>` | string | no       | API base URL                                                          |

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

| Field           | Value                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `dataset upload`                                                                                                                 |
| **Description** | Upload a dataset file (.jsonl or .zip) to Bailian                                                                                |
| **Usage**       | `bl dataset upload --file <path> [--purpose <name>] [--schema <chatml\|dpo\|cpt\|tts\|image>] [--no-validate] [--full-validate]` |

#### Flags

| Flag               | Type   | Required | Description                                                                                                                                              |
| ------------------ | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--file <path>`    | string | yes      | Local dataset file (.jsonl or .zip; ≤300MB text, ≤1GB image)                                                                                             |
| `--purpose <name>` | string | no       | Dataset purpose tag (default: "fine-tune"; e.g. "evaluation")                                                                                            |
| `--schema <s>`     | string | no       | Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), or "image" (image generation). Default auto-detects per record. |
| `--no-validate`    | switch | no       | Skip the local JSONL pre-flight check (not recommended)                                                                                                  |
| `--full-validate`  | switch | no       | JSON.parse every line instead of sampling (slower)                                                                                                       |
| `--api-key <key>`  | string | no       | API key                                                                                                                                                  |
| `--base-url <url>` | string | no       | API base URL                                                                                                                                             |

#### Notes

- Supports .jsonl (text) and .zip (audio/image archives with a data.jsonl
- manifest). Five record schemas are recognized: chatml = {messages:[...]}
- (SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."}
- (continual pre-training, raw text); tts = {wav_fn:"train/xxx.wav",
- text:"..."} (audio fine-tuning); image = {img_path:"..."} (image
- generation). With no --schema, a record carrying wav_fn is validated as
- TTS, img_path as image, chosen/rejected as DPO, text (no messages) as CPT,
- otherwise ChatML. Upload cap: 300MB text, 1GB image. Upload uses the
- OpenAI-compatible /compatible-mode/v1/files endpoint so the purpose tag is
- persisted (the DashScope-native /api/v1/files drops it).

#### Examples

```bash
bl dataset upload --file train.jsonl
```

```bash
bl dataset upload --file dpo.jsonl --schema dpo
```

```bash
bl dataset upload --file cpt.jsonl --schema cpt
```

```bash
bl dataset upload --file audio.zip --schema tts
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

| Field           | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Name**        | `dataset validate`                                                                              |
| **Description** | Locally validate a dataset file (.jsonl or .zip) without uploading                              |
| **Usage**       | `bl dataset validate --file <path> [--full-validate] [--schema <chatml\|dpo\|cpt\|tts\|image>]` |

#### Flags

| Flag              | Type   | Required | Description                                                                                                                                              |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--file <path>`   | string | yes      | Local dataset file (.jsonl or .zip)                                                                                                                      |
| `--full-validate` | switch | no       | JSON.parse every line instead of sampling (slower)                                                                                                       |
| `--schema <s>`    | string | no       | Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), or "image" (image generation). Default auto-detects per record. |

#### Notes

- Default scan: every line gets a structural check, then ~160 lines (front 50,
- evenly spaced 100, last 10) are JSON.parsed against the active schema.
- Schemas: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen,
- rejected}; cpt = {text:"..."} (continual pre-training, raw text);
- tts = {wav_fn:"train/xxx.wav", text:"..."} (audio fine-tuning);
- image = {img_path:"..."} (image generation). With no --schema, a record
- carrying wav_fn is validated as TTS, img_path as image, chosen/rejected
- as DPO, text (no messages) as CPT, otherwise ChatML. Pass --schema to
- require a specific shape on every record. ZIP archives (.zip) are
- validated structurally (data.jsonl present, media references resolve) in
- addition to per-record content checks. Use --full-validate to JSON.parse
- every line.

#### Examples

```bash
bl dataset validate --file train.jsonl
```

```bash
bl dataset validate --file dpo.jsonl --schema dpo
```

```bash
bl dataset validate --file cpt.jsonl --schema cpt
```

```bash
bl dataset validate --file audio.zip --schema tts
```

```bash
bl dataset validate --file eval.jsonl --full-validate
```

```bash
bl dataset validate --file train.jsonl --output json
```
