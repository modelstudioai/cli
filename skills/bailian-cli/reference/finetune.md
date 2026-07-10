# `bl finetune` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Description                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bl finetune audio create` | Create an audio TTS model fine-tune job (sft-lora)                                                                              |
| `bl finetune cancel`       | Cancel a running fine-tune job                                                                                                  |
| `bl finetune capability`   | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) |
| `bl finetune checkpoints`  | List checkpoints produced by a fine-tune job                                                                                    |
| `bl finetune delete`       | Delete a fine-tune job record                                                                                                   |
| `bl finetune export`       | Publish a checkpoint as a deployable model                                                                                      |
| `bl finetune get`          | Get details of a single fine-tune job                                                                                           |
| `bl finetune image create` | Create an image generation model fine-tune job (sft-lora)                                                                       |
| `bl finetune list`         | List fine-tune jobs                                                                                                             |
| `bl finetune logs`         | Fetch training logs for a fine-tune job                                                                                         |
| `bl finetune text create`  | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                   |
| `bl finetune watch`        | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                      |

## Command details

### `bl finetune audio create`

| Field           | Value                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `finetune audio create`                                                                                                             |
| **Description** | Create an audio TTS model fine-tune job (sft-lora)                                                                                  |
| **Usage**       | `bl finetune audio create --model <model> --datasets <id\|path> [--validations <id\|path>] [--model-name <name>] [--suffix <text>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                                                                                                                        |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--model <model>`            | string | yes      | Base model to fine-tune                                                                                                                                            |
| `--datasets <ids\|paths>`    | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image). Local paths are uploaded (validated) first, then their file-ids are used. |
| `--validations <ids\|paths>` | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                        |
| `--model-name <name>`        | string | no       | Output model name (after training)                                                                                                                                 |
| `--suffix <text>`            | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                   |
| `--api-key <key>`            | string | no       | API key                                                                                                                                                            |
| `--base-url <url>`           | string | no       | API base URL                                                                                                                                                       |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`)
- or local paths. Local paths are validated and uploaded first, then their
- file-ids are submitted — a one-step upload-and-train.
- Audio TTS training runs sft-lora (efficient_sft) with fixed CosyVoice
- hyper-parameter defaults; there are no training-type or hyper-parameter
- knobs to set.

#### Examples

```bash
bl finetune audio create --model cosyvoice-v3-flash --datasets ./audio.zip
```

```bash
bl finetune audio create --model cosyvoice-v3-flash --datasets file-xxx
```

```bash
bl finetune audio create --model cosyvoice-v3-flash --datasets ./audio.zip --model-name my-tts
```

```bash
bl finetune audio create --model cosyvoice-v3-flash --datasets file-xxx --output json
```

```bash
bl finetune audio create --model cosyvoice-v3-flash --datasets ./audio.zip --dry-run
```

### `bl finetune cancel`

| Field           | Value                              |
| --------------- | ---------------------------------- |
| **Name**        | `finetune cancel`                  |
| **Description** | Cancel a running fine-tune job     |
| **Usage**       | `bl finetune cancel --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Notes

- Only PENDING / RUNNING jobs can be cancelled. Completed / failed / already-
- cancelled jobs return a server-side error (passed through verbatim).

#### Examples

```bash
bl finetune cancel --job-id ft-xxx
```

```bash
bl finetune cancel --job-id ft-xxx --dry-run
```

### `bl finetune capability`

| Field           | Value                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `finetune capability`                                                                                                           |
| **Description** | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) |
| **Usage**       | `bl finetune capability --model <m> \| --training-type <t>`                                                                     |

#### Flags

| Flag                  | Type   | Required | Description                                                                           |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `--model <m>`         | string | no       | List training types supported by this base model.                                     |
| `--training-type <t>` | string | no       | List models supporting this training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt. |

#### Notes

- Exactly one of --model / --training-type is required.
- Training-type values use the `<method>` / `<method>-lora` convention:
- sft | sft-lora | dpo | dpo-lora | cpt. (cpt has no -lora variant server-side.)
- Queries listFoundationModels, a public API — no console login needed.

#### Examples

```bash
bl finetune capability --model qwen3-8b
```

```bash
bl finetune capability --training-type sft-lora
```

```bash
bl finetune capability --training-type cpt --output json
```

```bash
bl finetune capability --training-type sft --quiet
```

### `bl finetune checkpoints`

| Field           | Value                                        |
| --------------- | -------------------------------------------- |
| **Name**        | `finetune checkpoints`                       |
| **Description** | List checkpoints produced by a fine-tune job |
| **Usage**       | `bl finetune checkpoints --job-id <id>`      |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Notes

- Use the returned `checkpoint` value with `finetune export` to publish
- a deployable model.

#### Examples

```bash
bl finetune checkpoints --job-id ft-xxx
```

```bash
bl finetune checkpoints --job-id ft-xxx --output json
```

### `bl finetune delete`

| Field           | Value                              |
| --------------- | ---------------------------------- |
| **Name**        | `finetune delete`                  |
| **Description** | Delete a fine-tune job record      |
| **Usage**       | `bl finetune delete --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Notes

- Cancel a RUNNING job first via `finetune cancel` — the platform refuses
- to delete jobs that are still in flight.

#### Examples

```bash
bl finetune delete --job-id ft-xxx
```

```bash
bl finetune delete --job-id ft-xxx --dry-run
```

### `bl finetune export`

| Field           | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| **Name**        | `finetune export`                                                          |
| **Description** | Publish a checkpoint as a deployable model                                 |
| **Usage**       | `bl finetune export --job-id <id> --checkpoint <name> --model-name <name>` |

#### Flags

| Flag                  | Type   | Required | Description                                                  |
| --------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--job-id <id>`       | string | yes      | Fine-tune job ID (required)                                  |
| `--checkpoint <name>` | string | yes      | Checkpoint identifier from `finetune checkpoints` (required) |
| `--model-name <name>` | string | yes      | Deployable model name (required)                             |
| `--api-key <key>`     | string | no       | API key                                                      |
| `--base-url <url>`    | string | no       | API base URL                                                 |

#### Notes

- Required before `deploy <modality> create` can target a checkpoint. The
- platform may auto-export the best checkpoint when a job reaches SUCCEEDED —
- explicit export is the canonical path for non-best checkpoints.

#### Examples

```bash
bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft
```

### `bl finetune get`

| Field           | Value                                 |
| --------------- | ------------------------------------- |
| **Name**        | `finetune get`                        |
| **Description** | Get details of a single fine-tune job |
| **Usage**       | `bl finetune get --job-id <id>`       |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Examples

```bash
bl finetune get --job-id ft-xxx
```

```bash
bl finetune get --job-id ft-xxx --output json
```

### `bl finetune image create`

| Field           | Value                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**        | `finetune image create`                                                                                                                                                                    |
| **Description** | Create an image generation model fine-tune job (sft-lora)                                                                                                                                  |
| **Usage**       | `bl finetune image create --model <model> --datasets <id\|path> [--validations <id\|path>] [--model-name <name>] [--suffix <text>] [--generation-type <t2i\|i2i>] [--learning-rate <str>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                                                                                                         |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model <model>`              | string | yes      | Base model to fine-tune                                                                                                                                             |
| `--datasets <ids\|paths>`      | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image). Local paths are uploaded (validated) first, then their file-ids are used.  |
| `--validations <ids\|paths>`   | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                         |
| `--model-name <name>`          | string | no       | Output model name (after training)                                                                                                                                  |
| `--suffix <text>`              | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                    |
| `--generation-type <t2i\|i2i>` | string | no       | Generation type: t2i (default) \| i2i. Sets generation_type/max_pixels. Required to train I2I from a file-id or with --dry-run (local data auto-detects input_img). |
| `--learning-rate <str>`        | string | no       | Learning rate as a string to preserve precision (e.g. "3e-5")                                                                                                       |
| `--api-key <key>`              | string | no       | API key                                                                                                                                                             |
| `--base-url <url>`             | string | no       | API base URL                                                                                                                                                        |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`)
- or local paths. Local paths are validated and uploaded first, then their
- file-ids are submitted — a one-step upload-and-train.
- Image generation training runs sft-lora (efficient_sft) with fixed defaults;
- only --learning-rate is overridable. T2I vs I2I is declared with
- --generation-type (default t2i), which sets generation_type/max_pixels. For
- local data the type is auto-detected (records with input_img train I2I);
- pass --generation-type explicitly to train I2I from a file-id or in --dry-run.

#### Examples

```bash
bl finetune image create --model wan2.7-image-pro --datasets ./images.zip
```

```bash
bl finetune image create --model wan2.7-image-pro --datasets file-xxx
```

```bash
bl finetune image create --model wan2.7-image-pro --datasets file-xxx --generation-type i2i
```

```bash
bl finetune image create --model wan2.7-image-pro --datasets ./images.zip --model-name my-wan
```

```bash
bl finetune image create --model wan2.7-image-pro --datasets file-xxx --output json
```

```bash
bl finetune image create --model wan2.7-image-pro --datasets ./images.zip --dry-run
```

### `bl finetune list`

| Field           | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| **Name**        | `finetune list`                                                  |
| **Description** | List fine-tune jobs                                              |
| **Usage**       | `bl finetune list [--page <n>] [--page-size <n>] [--status <s>]` |

#### Flags

| Flag               | Type   | Required | Description                                                          |
| ------------------ | ------ | -------- | -------------------------------------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)                                             |
| `--page-size <n>`  | number | no       | Results per page (default: 10, max 100)                              |
| `--status <s>`     | string | no       | Filter by status (PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED) |
| `--api-key <key>`  | string | no       | API key                                                              |
| `--base-url <url>` | string | no       | API base URL                                                         |

#### Examples

```bash
bl finetune list
```

```bash
bl finetune list --status RUNNING
```

```bash
bl finetune list --page-size 20 --output json
```

### `bl finetune logs`

| Field           | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Name**        | `finetune logs`                                                                                   |
| **Description** | Fetch training logs for a fine-tune job                                                           |
| **Usage**       | `bl finetune logs --job-id <id> [--page <n>] [--page-size <n>] [--search <keyword>] [--tail <n>]` |

#### Flags

| Flag                 | Type   | Required | Description                                                                                                          |
| -------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `--job-id <id>`      | string | yes      | Fine-tune job ID (required)                                                                                          |
| `--page <n>`         | number | no       | Page number (default: 1)                                                                                             |
| `--page-size <n>`    | number | no       | Lines per page (default: server-defined)                                                                             |
| `--search <keyword>` | string | no       | Case-insensitive substring filter. When set, all log pages are fetched and filtered client-side (--page is ignored). |
| `--tail <n>`         | number | no       | Keep only the last N entries. When set, all log pages are fetched and the trailing N are kept (--page is ignored).   |
| `--api-key <key>`    | string | no       | API key                                                                                                              |
| `--base-url <url>`   | string | no       | API base URL                                                                                                         |

#### Examples

```bash
bl finetune logs --job-id ft-xxx
```

```bash
bl finetune logs --job-id ft-xxx --page-size 100 --output json
```

```bash
bl finetune logs --job-id ft-xxx --search checkpoint
```

```bash
bl finetune logs --job-id ft-xxx --search error --output json
```

```bash
bl finetune logs --job-id ft-xxx --tail 20
```

```bash
bl finetune logs --job-id ft-xxx --search checkpoint --tail 5
```

### `bl finetune text create`

| Field           | Value                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `finetune text create`                                                                                                                                                                                                                                                          |
| **Description** | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                                                                                                                                                                   |
| **Usage**       | `bl finetune text create --model <model> --datasets <id\|path,...> [--validations <id\|path,...>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>] [--max-length <n>] [--training-type <sft\|sft-lora\|dpo\|dpo-lora\|cpt>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                                                                                                                                              |
| ---------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model <model>`            | string | yes      | Base model to fine-tune                                                                                                                                                                  |
| `--datasets <ids\|paths>`    | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image). Local paths are uploaded (validated) first, then their file-ids are used.                       |
| `--validations <ids\|paths>` | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                                              |
| `--model-name <name>`        | string | no       | Output model name (after training)                                                                                                                                                       |
| `--suffix <text>`            | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                                         |
| `--training-type <t>`        | string | no       | Training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt (default: sft-lora). Mapping to the server happens at the interface boundary (e.g. sft-lora -> efficient_sft, dpo -> dpo_full). |
| `--n-epochs <n>`             | number | no       | Number of epochs (default: 3)                                                                                                                                                            |
| `--batch-size <n>`           | number | no       | Per-device batch size (clamped to [8, 1024]). Auto-set to 8 for small datasets (<100KB)                                                                                                  |
| `--learning-rate <str>`      | string | no       | Learning rate as a string to preserve precision (e.g. "1.6e-5")                                                                                                                          |
| `--max-length <n>`           | number | no       | Max sequence length                                                                                                                                                                      |
| `--api-key <key>`            | string | no       | API key                                                                                                                                                                                  |
| `--base-url <url>`           | string | no       | API base URL                                                                                                                                                                             |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`)
- or local paths. Local paths are validated and uploaded first, then their
- file-ids are submitted — a one-step upload-and-train.
- Training-type values use the `<method>` / `<method>-lora` convention:
- sft (full) | sft-lora (LoRA) | dpo (full) | dpo-lora (LoRA) | cpt. These map
- to the server's training_type at the interface boundary, so the rest of the
- CLI never sees the raw server strings.
- Before submitting (non dry-run) the job, the model's training capability is
- checked via listFoundationModels (no console login required); an unsupported
- training type fails fast with the list the model actually supports.
- n_epochs defaults to 3. Other hyper-parameters are platform defaults unless set.
- Learning rate is forwarded as a string to avoid JSON-number precision loss.
- Pre-submit gate: if the training dataset's sample count is not greater
- than batch_size, the job is rejected before upload or quota consumption
- (the platform would otherwise fail ~10 min in, after data processing).

#### Examples

```bash
bl finetune text create --model qwen3-8b --datasets file-xxx
```

```bash
bl finetune text create --model qwen3-8b --datasets ./train.jsonl
```

```bash
bl finetune text create --model qwen3-8b --datasets ./train.jsonl --validations ./eval.jsonl
```

```bash
bl finetune text create --model qwen3-8b --datasets file-aaa,./extra.jsonl
```

```bash
bl finetune text create --model qwen3-8b --datasets ./train.jsonl --training-type sft
```

```bash
bl finetune text create --model qwen3-8b --datasets file-xxx --learning-rate "1.6e-5" --n-epochs 4
```

```bash
bl finetune text create --model qwen3-8b --datasets file-xxx --output json
```

```bash
bl finetune text create --model qwen3-8b --datasets file-xxx --dry-run
```

### `bl finetune watch`

| Field           | Value                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| **Name**        | `finetune watch`                                                                                           |
| **Description** | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal. |
| **Usage**       | `bl finetune watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]`                     |

#### Flags

| Flag                   | Type   | Required | Description                                                                                                                                      |
| ---------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--job-id <id>`        | string | yes      | Fine-tune job ID (required)                                                                                                                      |
| `--follow`             | switch | no       | Block and poll until a terminal state (the legacy behavior). Without it, a single status probe is performed and the command returns immediately. |
| `--interval <sec>`     | number | no       | Seconds between polls with --follow (default: 10, min: 1). Ignored without --follow.                                                             |
| `--poll-timeout <sec>` | number | no       | With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.                                               |
| `--api-key <key>`      | string | no       | API key                                                                                                                                          |
| `--base-url <url>`     | string | no       | API base URL                                                                                                                                     |

#### Notes

- Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then
- return immediately. This is the mode meant for agents / scripts — the caller
- owns the polling cadence, so the CLI never holds the terminal.
- A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit);
- a SUCCEEDED or still-running status returns 0. With --follow, exceeding
- --poll-timeout raises a timeout error.
- Use --follow for the blocking, human-terminal-follow experience; use the
- default mode when driving the loop yourself (e.g. from an agent).
- For per-step training output (not status), use `finetune logs`.

#### Examples

```bash
bl finetune watch --job-id ft-xxx                       # single probe, returns immediately
```

```bash
bl finetune watch --job-id ft-xxx --output json        # status probe for agents
```

```bash
bl finetune watch --job-id ft-xxx --follow              # block until terminal
```

```bash
bl finetune watch --job-id ft-xxx --follow --interval 5
```

```bash
bl finetune watch --job-id ft-xxx --follow --poll-timeout 3600
```
