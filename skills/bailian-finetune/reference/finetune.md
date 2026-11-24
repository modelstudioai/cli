# `bl finetune` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                          | Authentication | Description                                                                                                                     |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bl finetune audio create`       | API Key        | Create an audio TTS model fine-tune job (sft-lora)                                                                              |
| `bl finetune cancel`             | API Key        | Cancel a running fine-tune job                                                                                                  |
| `bl finetune capability`         | No Auth        | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) |
| `bl finetune checkpoints`        | API Key        | List checkpoints produced by a fine-tune job                                                                                    |
| `bl finetune compress cancel`    | API Key        | Cancel a compression job                                                                                                        |
| `bl finetune compress create`    | API Key        | Create a model compression job                                                                                                  |
| `bl finetune compress delete`    | API Key        | Delete a compression job record                                                                                                 |
| `bl finetune compress get`       | API Key        | Get a compression job                                                                                                           |
| `bl finetune compress list`      | API Key        | List model compression jobs                                                                                                     |
| `bl finetune compress logs`      | API Key        | Get compression job logs                                                                                                        |
| `bl finetune compress templates` | API Key        | List quantizable models and their compression templates                                                                         |
| `bl finetune compress watch`     | API Key        | Probe or follow a compression job's status                                                                                      |
| `bl finetune decision create`    | API Key        | Create a decision model fine-tune job (efficient_sft; choice/noul/score training data)                                          |
| `bl finetune delete`             | API Key        | Delete a fine-tune job record                                                                                                   |
| `bl finetune export`             | API Key        | Publish a checkpoint as a deployable model                                                                                      |
| `bl finetune get`                | API Key        | Get details of a single fine-tune job                                                                                           |
| `bl finetune image create`       | API Key        | Create an image generation model fine-tune job (sft-lora)                                                                       |
| `bl finetune list`               | API Key        | List fine-tune jobs                                                                                                             |
| `bl finetune logs`               | API Key        | Fetch training logs for a fine-tune job                                                                                         |
| `bl finetune metrics`            | API Key        | Query the training metrics of a fine-tune job                                                                                   |
| `bl finetune opd authorize`      | Console        | Check and authorize OPD distillation access (whitelist, service roles, enablement)                                              |
| `bl finetune opd cancel`         | API Key        | Cancel a running OPD job                                                                                                        |
| `bl finetune opd delete`         | API Key        | Delete an OPD job record                                                                                                        |
| `bl finetune opd get`            | API Key        | Get an OPD job                                                                                                                  |
| `bl finetune opd logs`           | API Key        | Fetch OPD job logs                                                                                                              |
| `bl finetune opd params`         | API Key        | Query OPD (pg_opd) training / resource parameter configuration for a student model                                              |
| `bl finetune opd run`            | API Key        | Submit a pure Model OPD distillation job (pg_opd) via the fine-tunes OpenAPI                                                    |
| `bl finetune opd watch`          | API Key        | Probe an OPD job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                           |
| `bl finetune params`             | API Key        | Query the training hyper-parameter configuration for a base model                                                               |
| `bl finetune price`              | Console        | Estimate the training cost for a fine-tune job (token billing)                                                                  |
| `bl finetune rl authorize`       | Console        | Check and authorize reinforcement-learning access (whitelist, service roles, enablement)                                        |
| `bl finetune rl cancel`          | API Key        | Cancel a running RL job                                                                                                         |
| `bl finetune rl delete`          | API Key        | Delete an RL job record                                                                                                         |
| `bl finetune rl get`             | API Key        | Get an RL job                                                                                                                   |
| `bl finetune rl list`            | API Key        | List RL jobs                                                                                                                    |
| `bl finetune rl logs`            | API Key        | Fetch RL job logs                                                                                                               |
| `bl finetune rl run`             | API Key        | Submit a reinforcement-learning training job                                                                                    |
| `bl finetune rl watch`           | API Key        | Probe an RL job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                            |
| `bl finetune runtime clean`      | No Auth        | Reclaim orphaned sandbox run directories and superseded runtime versions                                                        |
| `bl finetune runtime doctor`     | No Auth        | Check the RL runtime and sandbox isolation (credential deny, home redirect, SDK import)                                         |
| `bl finetune runtime prepare`    | No Auth        | Prepare the managed Python/SDK runtime used by RL and OPD jobs                                                                  |
| `bl finetune text create`        | API Key        | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                   |
| `bl finetune train-options`      | Console        | Query a base model's dynamic train options (modality / reasoning-mode combinations)                                             |
| `bl finetune video create`       | API Key        | Create a video generation model fine-tune job (Wan i2v/kf2v, efficient_sft)                                                     |
| `bl finetune watch`              | API Key        | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                      |

## Command details

### `bl finetune audio create`

| Field              | Value                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune audio create`                                                                                                                  |
| **Description**    | Create an audio TTS model fine-tune job (sft-lora)                                                                                       |
| **Authentication** | API Key                                                                                                                                  |
| **Usage**          | `bl finetune audio create --base-model <model> --datasets <id\|path> [--validations <id\|path>] [--model-name <name>] [--suffix <text>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                                                                                                                              |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--base-model <model>`       | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name)                                                                                                       |
| `--datasets <ids\|paths>`    | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image/video). Local paths are uploaded (validated) first, then their file-ids are used. |
| `--validations <ids\|paths>` | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                              |
| `--model-name <name>`        | string | no       | Output model name (after training)                                                                                                                                       |
| `--suffix <text>`            | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                         |
| `--api-key <key>`            | string | no       | API key                                                                                                                                                                  |
| `--base-url <url>`           | string | no       | API base URL                                                                                                                                                             |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`) or local paths. Local paths are validated and uploaded first, then their file-ids are submitted — a one-step upload-and-train.
- Audio TTS training runs sft-lora (efficient_sft) with fixed CosyVoice hyper-parameter defaults; there are no training-type or hyper-parameter knobs to set.

#### Examples

```bash
bl finetune audio create --base-model cosyvoice-v3-flash --datasets ./audio.zip
```

```bash
bl finetune audio create --base-model cosyvoice-v3-flash --datasets file-xxx
```

```bash
bl finetune audio create --base-model cosyvoice-v3-flash --datasets ./audio.zip --model-name my-tts
```

```bash
bl finetune audio create --base-model cosyvoice-v3-flash --datasets file-xxx --output json
```

```bash
bl finetune audio create --base-model cosyvoice-v3-flash --datasets ./audio.zip --dry-run
```

### `bl finetune cancel`

| Field              | Value                              |
| ------------------ | ---------------------------------- |
| **Name**           | `finetune cancel`                  |
| **Description**    | Cancel a running fine-tune job     |
| **Authentication** | API Key                            |
| **Usage**          | `bl finetune cancel --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Notes

- Only PENDING / RUNNING jobs can be cancelled. Completed / failed / already-cancelled jobs return a server-side error (passed through verbatim).

#### Examples

```bash
bl finetune cancel --job-id ft-xxx
```

```bash
bl finetune cancel --job-id ft-xxx --dry-run
```

### `bl finetune capability`

| Field              | Value                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune capability`                                                                                                           |
| **Description**    | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) |
| **Authentication** | No Auth                                                                                                                         |
| **Usage**          | `bl finetune capability --base-model <m> \| --training-type <t>`                                                                |

#### Flags

| Flag                  | Type   | Required | Description                                                                           |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `--base-model <m>`    | string | no       | List training types supported by this base model.                                     |
| `--training-type <t>` | string | no       | List models supporting this training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt. |

#### Notes

- Exactly one of --base-model / --training-type is required.
- Training-type values use the `<method>` / `<method>-lora` convention: sft | sft-lora | dpo | dpo-lora | cpt. (cpt has no -lora variant server-side.)
- Queries listFoundationModels, a public API — no console login needed.

#### Examples

```bash
bl finetune capability --base-model qwen3-8b
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

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `finetune checkpoints`                       |
| **Description**    | List checkpoints produced by a fine-tune job |
| **Authentication** | API Key                                      |
| **Usage**          | `bl finetune checkpoints --job-id <id>`      |

#### Flags

| Flag               | Type   | Required | Description                 |
| ------------------ | ------ | -------- | --------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required) |
| `--api-key <key>`  | string | no       | API key                     |
| `--base-url <url>` | string | no       | API base URL                |

#### Notes

- `model_name` (shown for SUCCEEDED checkpoints) is the direct input for `deploy create --model-name`.
- Checkpoints expire ~15 days after creation; `expire_time` shows the deadline. Export or deploy before expiry.

#### Examples

```bash
bl finetune checkpoints --job-id ft-xxx
```

```bash
bl finetune checkpoints --job-id ft-xxx --output json
```

### `bl finetune compress cancel`

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| **Name**           | `finetune compress cancel`                  |
| **Description**    | Cancel a compression job                    |
| **Authentication** | API Key                                     |
| **Usage**          | `bl finetune compress cancel --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                   |
| ------------------ | ------ | -------- | ----------------------------- |
| `--job-id <id>`    | string | yes      | Compression job ID (required) |
| `--api-key <key>`  | string | no       | API key                       |
| `--base-url <url>` | string | no       | API base URL                  |

#### Notes

- Only PENDING, QUEUING, or RUNNING jobs can be cancelled.

#### Examples

```bash
bl finetune compress cancel --job-id quant-xxx
```

```bash
bl finetune compress cancel --job-id quant-xxx --dry-run
```

### `bl finetune compress create`

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Name**           | `finetune compress create`                                               |
| **Description**    | Create a model compression job                                           |
| **Authentication** | API Key                                                                  |
| **Usage**          | `bl finetune compress create --model <model> --template-id <id> [flags]` |

#### Flags

| Flag                                | Type   | Required | Description                                           |
| ----------------------------------- | ------ | -------- | ----------------------------------------------------- |
| `--model <model>`                   | string | yes      | Source custom model ID (required)                     |
| `--template-id <id>`                | string | yes      | Compression template ID (required)                    |
| `--job-name <name>`                 | string | no       | Unique job name (max 50 characters)                   |
| `--description <text>`              | string | no       | Job description (max 200 characters)                  |
| `--hparam <key=value>`              | array  | no       | Hyper-parameter override; repeat for multiple values  |
| `--calibration-files <file-id,...>` | string | no       | Comma-separated calibration dataset file IDs          |
| `--suffix <suffix>`                 | string | no       | Output model suffix (1–8 lowercase letters or digits) |
| `--api-key <key>`                   | string | no       | API key                                               |
| `--base-url <url>`                  | string | no       | API base URL                                          |

#### Notes

- Run `finetune compress templates` first to get a compatible template ID.
- Model compression APIs are currently available only in the Beijing region.

#### Examples

```bash
bl finetune compress create --model qwen3.5-flash-2026-02-23-ft-xxx --template-id quant-flash-nvfp4-mlp-nomtp
```

```bash
bl finetune compress create --model qwen3.5-flash-2026-02-23-ft-xxx --template-id quant-flash-nvfp4-mlp-nomtp --suffix test --hparam calib_input=true
```

### `bl finetune compress delete`

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **Name**           | `finetune compress delete`                                                |
| **Description**    | Delete a compression job record                                           |
| **Authentication** | API Key                                                                   |
| **Usage**          | `bl finetune compress delete --job-id <id>`                               |
| **Risk**           | `high`                                                                    |
| **Risk message**   | This permanently deletes the compression job record and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                      |
| ------------------ | ------ | -------- | -------------------------------- |
| `--job-id <id>`    | string | yes      | Compression job ID (required)    |
| `--yes`            | switch | no       | Confirm this high-risk operation |
| `--api-key <key>`  | string | no       | API key                          |
| `--base-url <url>` | string | no       | API base URL                     |

#### Notes

- Only terminal jobs can be deleted. Deleting a job record does not delete its quantized output model.

#### Examples

```bash
bl finetune compress delete --job-id quant-xxx
```

```bash
bl finetune compress delete --job-id quant-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune compress delete --job-id quant-xxx --yes
```

### `bl finetune compress get`

| Field              | Value                                    |
| ------------------ | ---------------------------------------- |
| **Name**           | `finetune compress get`                  |
| **Description**    | Get a compression job                    |
| **Authentication** | API Key                                  |
| **Usage**          | `bl finetune compress get --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                   |
| ------------------ | ------ | -------- | ----------------------------- |
| `--job-id <id>`    | string | yes      | Compression job ID (required) |
| `--api-key <key>`  | string | no       | API key                       |
| `--base-url <url>` | string | no       | API base URL                  |

#### Examples

```bash
bl finetune compress get --job-id quant-xxx
```

### `bl finetune compress list`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `finetune compress list`                                             |
| **Description**    | List model compression jobs                                          |
| **Authentication** | API Key                                                              |
| **Usage**          | `bl finetune compress list [filters] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                                | Type   | Required | Description                                    |
| ----------------------------------- | ------ | -------- | ---------------------------------------------- |
| `--status <status>`                 | string | no       | Filter by job status                           |
| `--model <model>`                   | string | no       | Filter by source model ID                      |
| `--template-id <id>`                | string | no       | Filter by template ID                          |
| `--quant-spec <spec>`               | string | no       | Filter by quantization specification           |
| `--quant-method <method>`           | string | no       | Filter by quantization method                  |
| `--start-time <time>`               | string | no       | Filter jobs starting no earlier than this time |
| `--end-time <time>`                 | string | no       | Filter jobs ending no later than this time     |
| `--search <keyword>`                | string | no       | Search job ID or name                          |
| `--search-field <job_id\|job_name>` | string | no       | Limit --search to job_id or job_name           |
| `--sort-order <asc\|desc>`          | string | no       | Sort order by create_time (default: desc)      |
| `--page <n>`                        | number | no       | Page number (default: 1)                       |
| `--page-size <n>`                   | number | no       | Results per page (default: 10, max: 100)       |
| `--api-key <key>`                   | string | no       | API key                                        |
| `--base-url <url>`                  | string | no       | API base URL                                   |

#### Examples

```bash
bl finetune compress list
```

```bash
bl finetune compress list --status SUCCEEDED --page-size 20
```

```bash
bl finetune compress list --quant-method gptq
```

```bash
bl finetune compress list --search qwen3 --search-field job_name --sort-order asc
```

### `bl finetune compress logs`

| Field              | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Name**           | `finetune compress logs`                                                             |
| **Description**    | Get compression job logs                                                             |
| **Authentication** | API Key                                                                              |
| **Usage**          | `bl finetune compress logs --job-id <id> [--offset <n>] [--lines <n> \| --tail <n>]` |

#### Flags

| Flag               | Type   | Required | Description                                       |
| ------------------ | ------ | -------- | ------------------------------------------------- |
| `--job-id <id>`    | string | yes      | Compression job ID (required)                     |
| `--offset <n>`     | number | no       | Skip the first N lines (default: 0)               |
| `--lines <n>`      | number | no       | Number of lines to read (default: 100, max: 1000) |
| `--tail <n>`       | number | no       | Read the last N log lines                         |
| `--api-key <key>`  | string | no       | API key                                           |
| `--base-url <url>` | string | no       | API base URL                                      |

#### Examples

```bash
bl finetune compress logs --job-id quant-xxx
```

```bash
bl finetune compress logs --job-id quant-xxx --offset 0 --lines 50
```

```bash
bl finetune compress logs --job-id quant-xxx --tail 20
```

### `bl finetune compress templates`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `finetune compress templates`                           |
| **Description**    | List quantizable models and their compression templates |
| **Authentication** | API Key                                                 |
| **Usage**          | `bl finetune compress templates [--model <model>]`      |

#### Flags

| Flag               | Type   | Required | Description                                  |
| ------------------ | ------ | -------- | -------------------------------------------- |
| `--model <model>`  | string | no       | Filter by custom model ID or base model name |
| `--api-key <key>`  | string | no       | API key                                      |
| `--base-url <url>` | string | no       | API base URL                                 |

#### Notes

- Only supported full-parameter fine-tuned models are returned. LoRA and already-quantized models are excluded.
- Template IDs live in output.custom_models[].templates[].template_id. output.base_models only lists quantizable base model names and carries no templates, so an empty custom_models array means no template ID is available yet.
- An empty templates[].hyper_parameters array means that template exposes no tunable hyper-parameters; omit --hparam when creating the compression job.
- template_name and description are localized server-side from the CLI language setting (default en-US), sent as the lang query parameter. Run `config set --key language --value zh-CN` to get Chinese text.

#### Examples

```bash
bl finetune compress templates
```

```bash
bl finetune compress templates --model qwen3.5-flash-2026-02-23-ft-xxx
```

### `bl finetune compress watch`

| Field              | Value                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Name**           | `finetune compress watch`                                                                       |
| **Description**    | Probe or follow a compression job's status                                                      |
| **Authentication** | API Key                                                                                         |
| **Usage**          | `bl finetune compress watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]` |

#### Flags

| Flag                   | Type   | Required | Description                                          |
| ---------------------- | ------ | -------- | ---------------------------------------------------- |
| `--job-id <id>`        | string | yes      | Compression job ID (required)                        |
| `--follow`             | switch | no       | Poll until the job reaches a terminal state          |
| `--interval <sec>`     | number | no       | Polling interval with --follow (default: 10, min: 1) |
| `--poll-timeout <sec>` | number | no       | Stop polling after this many seconds                 |
| `--api-key <key>`      | string | no       | API key                                              |
| `--base-url <url>`     | string | no       | API base URL                                         |

#### Notes

- Without --follow, the command performs one non-blocking status probe.
- On success, quantized_output can be passed to `deploy text create --model-name`.

#### Examples

```bash
bl finetune compress watch --job-id quant-xxx
```

```bash
bl finetune compress watch --job-id quant-xxx --follow
```

```bash
bl finetune compress watch --job-id quant-xxx --follow --interval 30 --poll-timeout 7200
```

### `bl finetune decision create`

| Field              | Value                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune decision create`                                                                                                                                                                                                          |
| **Description**    | Create a decision model fine-tune job (efficient_sft; choice/noul/score training data)                                                                                                                                              |
| **Authentication** | API Key                                                                                                                                                                                                                             |
| **Usage**          | `bl finetune decision create --base-model <model> --datasets <id\|path,...> [--validations <id\|path,...>] [--job-name <name>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                                                                                                                              |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--base-model <model>`       | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name)                                                                                                       |
| `--datasets <ids\|paths>`    | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image/video). Local paths are uploaded (validated) first, then their file-ids are used. |
| `--validations <ids\|paths>` | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                              |
| `--model-name <name>`        | string | no       | Output model name (after training)                                                                                                                                       |
| `--suffix <text>`            | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                         |
| `--job-name <value>`         | string | no       | Training job display name (job_name)                                                                                                                                     |
| `--n-epochs <n>`             | number | no       | Number of epochs (default: 2)                                                                                                                                            |
| `--batch-size <n>`           | number | no       | Samples per training batch (default: 1)                                                                                                                                  |
| `--learning-rate <str>`      | string | no       | Learning rate as a string to preserve precision (default: "2e-5")                                                                                                        |
| `--api-key <key>`            | string | no       | API key                                                                                                                                                                  |
| `--base-url <url>`           | string | no       | API base URL                                                                                                                                                             |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`) or local paths. Local paths are validated and uploaded first, then their file-ids are submitted — a one-step upload-and-train.
- Training data is JSONL: each record carries an input state and a question table. Every question needs a hard label (choice: an option name; noul: true/false; score: a 0-based level index) and may carry a target soft-label distribution covering all options, with probabilities in [0, 1] summing to 1.
- Decision fine-tuning always runs efficient_sft (LoRA high-efficiency training); full-parameter training is not available. Only n_epochs / batch_size / learning_rate are overridable; omitted values are sent with the documented defaults (2 / 1 / "2e-5") because the API requires them in the request body.
- Sample-count rule: with a separate validation dataset, train and validation samples must each be at least batch_size; with training data only, samples must be at least batch_size × 10. Hundreds of samples are recommended.
- Keep question definitions (ID, type, instructions, criteria) identical across training, evaluation and online requests; changing them shifts the distribution and requires regenerating data and retraining. The CLI warns on cross-record and train/validation definition drift.
- --suffix is limited to 8 characters. After training, deploy the output model and invoke it with the decision command (--model <finetuned_output>); training-only fields label/target are stripped automatically when reusing a training sample as a request file.

#### Examples

```bash
bl finetune decision create --base-model decision-model-preview-2026-09-24 --datasets ./tickets.train.jsonl --validations ./tickets.development.jsonl
```

```bash
bl finetune decision create --base-model decision-model-preview-2026-09-24 --datasets file-xxx
```

```bash
bl finetune decision create --base-model decision-model-preview-2026-09-24 --datasets ./tickets.train.jsonl --n-epochs 3 --batch-size 4 --learning-rate "2e-5" --suffix mytune
```

```bash
bl finetune decision create --base-model decision-model-preview-2026-09-24 --datasets ./tickets.train.jsonl --dry-run
```

### `bl finetune delete`

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| **Name**           | `finetune delete`                                                                 |
| **Description**    | Delete a fine-tune job record                                                     |
| **Authentication** | API Key                                                                           |
| **Usage**          | `bl finetune delete --job-id <id>`                                                |
| **Risk**           | `high`                                                                            |
| **Risk message**   | This permanently deletes the specified fine-tune job record and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                      |
| ------------------ | ------ | -------- | -------------------------------- |
| `--job-id <id>`    | string | yes      | Fine-tune job ID (required)      |
| `--yes`            | switch | no       | Confirm this high-risk operation |
| `--api-key <key>`  | string | no       | API key                          |
| `--base-url <url>` | string | no       | API base URL                     |

#### Notes

- Irreversible — the job record is permanently removed.
- Cancel a RUNNING job first via `finetune cancel` — the platform refuses to delete jobs that are still in flight.

#### Examples

```bash
bl finetune delete --job-id ft-xxx
```

```bash
bl finetune delete --job-id ft-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune delete --job-id ft-xxx --yes
```

### `bl finetune export`

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Name**           | `finetune export`                                                          |
| **Description**    | Publish a checkpoint as a deployable model                                 |
| **Authentication** | API Key                                                                    |
| **Usage**          | `bl finetune export --job-id <id> --checkpoint <name> --model-name <name>` |

#### Flags

| Flag                  | Type   | Required | Description                                                  |
| --------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--job-id <id>`       | string | yes      | Fine-tune job ID (required)                                  |
| `--checkpoint <name>` | string | yes      | Checkpoint identifier from `finetune checkpoints` (required) |
| `--model-name <name>` | string | yes      | Deployable model name (required)                             |
| `--api-key <key>`     | string | no       | API key                                                      |
| `--base-url <url>`    | string | no       | API base URL                                                 |

#### Notes

- Required before `deploy <modality> create` can target a checkpoint. The platform may auto-export the best checkpoint when a job reaches SUCCEEDED — explicit export is the canonical path for non-best checkpoints.

#### Examples

```bash
bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft
```

### `bl finetune get`

| Field              | Value                                 |
| ------------------ | ------------------------------------- |
| **Name**           | `finetune get`                        |
| **Description**    | Get details of a single fine-tune job |
| **Authentication** | API Key                               |
| **Usage**          | `bl finetune get --job-id <id>`       |

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

| Field              | Value                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune image create`                                                                                                                                                                         |
| **Description**    | Create an image generation model fine-tune job (sft-lora)                                                                                                                                       |
| **Authentication** | API Key                                                                                                                                                                                         |
| **Usage**          | `bl finetune image create --base-model <model> --datasets <id\|path> [--validations <id\|path>] [--model-name <name>] [--suffix <text>] [--generation-type <t2i\|i2i>] [--learning-rate <str>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                                                                                                              |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--base-model <model>`         | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name)                                                                                                       |
| `--datasets <ids\|paths>`      | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image/video). Local paths are uploaded (validated) first, then their file-ids are used. |
| `--validations <ids\|paths>`   | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                              |
| `--model-name <name>`          | string | no       | Output model name (after training)                                                                                                                                       |
| `--suffix <text>`              | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                         |
| `--generation-type <t2i\|i2i>` | string | no       | Generation type: t2i (default) \| i2i. Sets generation_type/max_pixels. Required to train I2I from a file-id or with --dry-run (local data auto-detects input_img).      |
| `--learning-rate <str>`        | string | no       | Learning rate as a string to preserve precision (e.g. "3e-5")                                                                                                            |
| `--api-key <key>`              | string | no       | API key                                                                                                                                                                  |
| `--base-url <url>`             | string | no       | API base URL                                                                                                                                                             |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`) or local paths. Local paths are validated and uploaded first, then their file-ids are submitted — a one-step upload-and-train.
- Image generation training runs sft-lora (efficient_sft) with fixed defaults; only --learning-rate is overridable. T2I vs I2I is declared with --generation-type (default t2i), which sets generation_type/max_pixels. For local data the type is auto-detected (records with input_img train I2I); pass --generation-type explicitly to train I2I from a file-id or in --dry-run.

#### Examples

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets ./images.zip
```

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets file-xxx
```

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets file-xxx --generation-type i2i
```

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets ./images.zip --model-name my-wan
```

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets file-xxx --output json
```

```bash
bl finetune image create --base-model wan2.7-image-pro --datasets ./images.zip --dry-run
```

### `bl finetune list`

| Field              | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Name**           | `finetune list`                                                                         |
| **Description**    | List fine-tune jobs                                                                     |
| **Authentication** | API Key                                                                                 |
| **Usage**          | `bl finetune list [--page <n>] [--page-size <n>] [--status <s>] [--base-model <model>]` |

#### Flags

| Flag                   | Type   | Required | Description                                                          |
| ---------------------- | ------ | -------- | -------------------------------------------------------------------- |
| `--page <n>`           | number | no       | Page number (default: 1)                                             |
| `--page-size <n>`      | number | no       | Results per page (default: 10, max 100)                              |
| `--status <s>`         | string | no       | Filter by status (PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED) |
| `--base-model <model>` | string | no       | Filter by base model ID (server-side)                                |
| `--api-key <key>`      | string | no       | API key                                                              |
| `--base-url <url>`     | string | no       | API base URL                                                         |

#### Examples

```bash
bl finetune list
```

```bash
bl finetune list --status RUNNING
```

```bash
bl finetune list --base-model qwen3-8b
```

```bash
bl finetune list --page-size 20
```

### `bl finetune logs`

| Field              | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune logs`                                                                                   |
| **Description**    | Fetch training logs for a fine-tune job                                                           |
| **Authentication** | API Key                                                                                           |
| **Usage**          | `bl finetune logs --job-id <id> [--page <n>] [--page-size <n>] [--search <keyword>] [--tail <n>]` |

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

### `bl finetune metrics`

| Field              | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Name**           | `finetune metrics`                                                                       |
| **Description**    | Query the training metrics of a fine-tune job                                            |
| **Authentication** | API Key                                                                                  |
| **Usage**          | `bl finetune metrics --job-id <id> [--page <n>] [--page-size <n>] [--workspace-id <id>]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                                                    |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--job-id <id>`       | string | yes      | Fine-tune job ID (required)                                                                                                    |
| `--page <n>`          | number | no       | Page number, starting at 1 (default: 1)                                                                                        |
| `--page-size <n>`     | number | no       | Records per page (default: 100)                                                                                                |
| `--workspace-id <id>` | string | no       | Workspace ID sent as X-DashScope-WorkSpace; use the job's owning workspace. Omit when your API key is already workspace-bound. |
| `--api-key <key>`     | string | no       | API key                                                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                                                   |

#### Notes

- Queries GET /api/v1/fine-tunes/{job_id}/basic_metrics. Each metrics record is returned verbatim (step + dynamic metric fields); an empty list is a normal result.
- Metrics are not filtered server-side; the full result is returned and callers pick the metric keys from each record. Use --page/--page-size for paging.

#### Examples

```bash
bl finetune metrics --job-id ft-xxx
```

```bash
bl finetune metrics --job-id ft-xxx --page 2 --page-size 100
```

```bash
bl finetune metrics --job-id ft-xxx --output json
```

```bash
bl finetune metrics --job-id ft-xxx --dry-run
```

### `bl finetune opd authorize`

| Field              | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune opd authorize`                                                                                          |
| **Description**    | Check and authorize OPD distillation access (whitelist, service roles, enablement)                                |
| **Authentication** | Console                                                                                                           |
| **Usage**          | `bl finetune opd authorize [--authorize]`                                                                         |
| **Risk**           | `high`                                                                                                            |
| **Risk message**   | With --authorize this enables the OPD training mode for your account. The CLI never creates service-linked roles. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                                                                     |
| ------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `--authorize`                  | switch | no       | Permit enabling OPD once the service roles are manually authorized (read-only probe without it) |
| `--yes`                        | switch | no       | Confirm this high-risk operation                                                                |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                        |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                                           |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                                           |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                        |

#### Notes

- Service-linked roles must be authorized manually first (https://docs.bailian.console.aliyun.com/zh/model-studio/opd-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87); missing roles report REQUIRES_USER_ACTION and block enablement.
- Without --authorize this is a read-only probe. Each capability reports READY / MISSING / UNKNOWN / REQUIRES_USER_ACTION / FAILED; a failed query is UNKNOWN, never assumed enabled.
- Only OPD is enabled; RL is never auto-enabled. In CI pass --authorize --yes to permit changes; --yes alone does not expand permissions.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl finetune opd authorize
```

```bash
# Only after explicit user confirmation:
bl finetune opd authorize --authorize --yes
```

```bash
bl finetune opd authorize --dry-run
```

### `bl finetune opd cancel`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `finetune opd cancel`                                   |
| **Description**    | Cancel a running OPD job                                |
| **Authentication** | API Key                                                 |
| **Usage**          | `bl finetune opd cancel --job-id <id>`                  |
| **Risk**           | `high`                                                  |
| **Risk message**   | This cancels the running OPD job; progress may be lost. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                                                    |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--job-id <id>`       | string | yes      | OPD job ID (required)                                                                          |
| `--workspace-id <id>` | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound. |
| `--yes`               | switch | no       | Confirm this high-risk operation                                                               |
| `--api-key <key>`     | string | no       | API key                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                   |

#### Examples

```bash
bl finetune opd cancel --job-id ft-xxx
```

```bash
bl finetune opd cancel --job-id ft-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune opd cancel --job-id ft-xxx --yes
```

### `bl finetune opd delete`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `finetune opd delete`                                             |
| **Description**    | Delete an OPD job record                                          |
| **Authentication** | API Key                                                           |
| **Usage**          | `bl finetune opd delete --job-id <id>`                            |
| **Risk**           | `high`                                                            |
| **Risk message**   | This permanently deletes the OPD job record and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                                                    |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--job-id <id>`       | string | yes      | OPD job ID (required)                                                                          |
| `--workspace-id <id>` | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound. |
| `--yes`               | switch | no       | Confirm this high-risk operation                                                               |
| `--api-key <key>`     | string | no       | API key                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                   |

#### Notes

- Deletes the job record via the fine-tunes endpoint directly in the host (no sandbox runtime needed); RL and OPD jobs share this backend.

#### Examples

```bash
bl finetune opd delete --job-id ft-xxx
```

```bash
bl finetune opd delete --job-id ft-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune opd delete --job-id ft-xxx --yes
```

### `bl finetune opd get`

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| **Name**           | `finetune opd get`                  |
| **Description**    | Get an OPD job                      |
| **Authentication** | API Key                             |
| **Usage**          | `bl finetune opd get --job-id <id>` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                    |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--job-id <id>`       | string | yes      | OPD job ID (required)                                                                          |
| `--workspace-id <id>` | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound. |
| `--api-key <key>`     | string | no       | API key                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                   |

#### Notes

- Returns the raw fine-tunes OpenAPI response (teacher_model, training/validation datasets, MTU spec and capacity included). No sandbox runtime needed.

#### Examples

```bash
bl finetune opd get --job-id ft-xxx
```

### `bl finetune opd logs`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `finetune opd logs`                                                 |
| **Description**    | Fetch OPD job logs                                                  |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl finetune opd logs --job-id <id> [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                    |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--job-id <id>`       | string | yes      | OPD job ID (required)                                                                          |
| `--workspace-id <id>` | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound. |
| `--page <n>`          | number | no       | Page number                                                                                    |
| `--page-size <n>`     | number | no       | Lines per page                                                                                 |
| `--api-key <key>`     | string | no       | API key                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                   |

#### Examples

```bash
bl finetune opd logs --job-id ft-xxx
```

```bash
bl finetune opd logs --job-id ft-xxx --page 1 --page-size 100
```

### `bl finetune opd params`

| Field              | Value                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune opd params`                                                                                                         |
| **Description**    | Query OPD (pg_opd) training / resource parameter configuration for a student model                                            |
| **Authentication** | API Key                                                                                                                       |
| **Usage**          | `bl finetune opd params --base-model <model> [--param-type <hyper\|resource>] [--mtu-spec-code <code>] [--workspace-id <id>]` |

#### Flags

| Flag                             | Type   | Required | Description                                                                                    |
| -------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--base-model <model>`           | string | yes      | Student base model to query OPD parameters for (e.g. qwen3.5-9b)                               |
| `--param-type <hyper\|resource>` | string | no       | Parameter group: hyper (training) \| resource (GPUs / teacher). Omit to return all groups.     |
| `--mtu-spec-code <code>`         | string | no       | MTU spec code for resource-group queries (e.g. MTU4)                                           |
| `--workspace-id <id>`            | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound. |
| `--api-key <key>`                | string | no       | API key                                                                                        |
| `--base-url <url>`               | string | no       | API base URL                                                                                   |

#### Notes

- Queries GET /api/v1/fine-tunes/fine-tunes-params with training_type=pg_opd. Entries keep server field names verbatim (recommend_value, defaultValue, data_range, ...).
- recommend_value is NOT the selected teacher's effective default: external teachers (e.g. Flash/Max) carry their own default resources resolved server-side at submit time. Use this output for ranges/enums, not as a recipe to fill into requests.
- Compatible-teacher discovery is not exposed by the parameter API yet; teacher/student compatibility is validated server-side when submitting via finetune opd run.

#### Examples

```bash
bl finetune opd params --base-model qwen3.5-9b
```

```bash
bl finetune opd params --base-model qwen3.5-9b --param-type hyper
```

```bash
bl finetune opd params --base-model qwen3.5-9b --param-type resource --mtu-spec-code MTU4
```

```bash
bl finetune opd params --base-model qwen3.5-9b --dry-run
```

### `bl finetune opd run`

| Field              | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Name**           | `finetune opd run`                                                                           |
| **Description**    | Submit a pure Model OPD distillation job (pg_opd) via the fine-tunes OpenAPI                 |
| **Authentication** | API Key                                                                                      |
| **Usage**          | `bl finetune opd run --base-model <id> --teacher-model <id> --datasets <ids\|paths> [flags]` |
| **Risk**           | `high`                                                                                       |
| **Risk message**   | This creates a billed OPD training job that consumes compute resources.                      |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                             | Type   | Required | Description                                                                                                                  |
| -------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--base-model <id>`              | string | yes      | Student base model ID (e.g. qwen3.5-9b)                                                                                      |
| `--teacher-model <id>`           | string | yes      | Platform-registered teacher model ID (required; no arbitrary URLs or keys)                                                   |
| `--datasets <ids\|paths>`        | string | yes      | Comma-separated dataset file IDs or local .jsonl paths. Local paths are validated and uploaded first.                        |
| `--validations <ids\|paths>`     | string | no       | Comma-separated validation file IDs or local paths (auto-uploaded like --datasets).                                          |
| `--job-name <name>`              | string | no       | Training job display name (job_name)                                                                                         |
| `--hyper-parameters-file <path>` | string | no       | JSON file of training + resource hyper-parameters (keys map 1:1 to hyper_parameters). --hp overrides it.                     |
| `--resource-config-file <path>`  | string | no       | JSON file of resource_config (charge_type / mtu_spec_code / mtu_capacity). Resource flags override it.                       |
| `--hp <key=value>`               | array  | no       | Hyper-parameter override (repeatable, parsed by type); beats the JSON file                                                   |
| `--charge-type <value>`          | string | no       | resource_config.charge_type; pg_opd only supports mtu_postpaid (default)                                                     |
| `--mtu-spec <code>`              | string | no       | resource_config.mtu_spec_code (e.g. MTU4); required, via this flag or the resource file                                      |
| `--mtu-count <int>`              | number | no       | resource_config.mtu_capacity (student GPUs + teacher GPUs); required, via this flag or the resource file                     |
| `--workspace-id <id>`            | string | no       | Workspace for upload, parameter query, creation and reads (X-DashScope-WorkSpace). Omit when the API key is workspace-bound. |
| `--watch`                        | switch | no       | Wait for the job to reach a terminal state                                                                                   |
| `--wait-timeout <seconds>`       | number | no       | Maximum seconds to poll with --watch (default: no limit; does not cancel the cloud job)                                      |
| `--yes`                          | switch | no       | Confirm this high-risk operation                                                                                             |
| `--api-key <key>`                | string | no       | API key                                                                                                                      |
| `--base-url <url>`               | string | no       | API base URL                                                                                                                 |

#### Notes

- Forces training_type=pg_opd. Pure Model OPD needs no rollout / reward functions and creates no function-compute resources.
- Submits directly from the host via the fine-tunes OpenAPI (no sandbox runtime). Query commands: finetune opd get/watch/logs/cancel/delete; list/checkpoints/export/metrics use the shared finetune commands.
- Hyper-parameters are sent exactly as provided (JSON file, then --hp overrides). Omitted fields are resolved by the server and the selected teacher's defaults — the CLI never fills parameter-API recommend_value, which is not the teacher's effective default.
- The teacher must be a platform-registered model ID compatible with the student; compatibility and resource capacity are validated server-side and errors are surfaced as-is.
- mtu_capacity must equal student GPUs + teacher GPUs. The published docs recommend MTU4 x 24 for the default layout; custom layouts must be computed yourself (the server checks capacity after job creation). Supported pairs and sizing: https://docs.bailian.console.aliyun.com/zh/model-studio/opd-training-overview#%E6%A8%A1%E5%9E%8B%E4%B8%8E%E8%AE%AD%E7%BB%83%E5%8D%95%E5%85%83.
- batch_size is the samples-per-step: floor(training samples × n_epochs / batch_size) must be ≥ 1, otherwise the job fails at execution time after billing starts (lr_decay_steps > 0). With local datasets the CLI rejects zero-step configurations before upload; ppo_mini_batch_size must not exceed batch_size × n_rollouts.
- Timing out with --watch stops waiting only; it does not cancel the cloud job.

#### Examples

```bash
bl finetune opd run --base-model qwen3.5-9b --teacher-model qwen3.8-flash --datasets file-xxx --validations file-yyy --hyper-parameters-file ./hp.json --resource-config-file ./resource.json --dry-run
```

```bash
bl finetune opd run --base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b --datasets ./train.jsonl --hp n_epochs=1 --hp batch_size=64 --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch
```

```bash
bl finetune opd run --base-model qwen3.5-9b --teacher-model qwen3.8-flash --datasets file-xxx --workspace-id ws-xxx
```

### `bl finetune opd watch`

| Field              | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune opd watch`                                                                                  |
| **Description**    | Probe an OPD job's status (default: single non-blocking fetch). Pass --follow to poll until terminal. |
| **Authentication** | API Key                                                                                               |
| **Usage**          | `bl finetune opd watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]`            |

#### Flags

| Flag                   | Type   | Required | Description                                                                                                                |
| ---------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--job-id <id>`        | string | yes      | OPD job ID (required)                                                                                                      |
| `--workspace-id <id>`  | string | no       | Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound.                             |
| `--follow`             | switch | no       | Block and poll until a terminal state. Without it, a single status probe is performed and the command returns immediately. |
| `--interval <sec>`     | number | no       | Seconds between polls with --follow (default: 10, min: 1). Ignored without --follow.                                       |
| `--poll-timeout <sec>` | number | no       | With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.                         |
| `--api-key <key>`      | string | no       | API key                                                                                                                    |
| `--base-url <url>`     | string | no       | API base URL                                                                                                               |

#### Notes

- Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then return immediately. The caller owns the polling cadence, so the CLI never holds the terminal.
- A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit); SUCCEEDED or still-running returns 0. With --follow, exceeding --poll-timeout raises a timeout error but does not cancel the cloud job.
- Queries the fine-tunes endpoint directly in the host (no sandbox runtime needed). For per-step training output use `finetune opd logs`.

#### Examples

```bash
bl finetune opd watch --job-id ft-xxx
```

```bash
bl finetune opd watch --job-id ft-xxx --output json
```

```bash
bl finetune opd watch --job-id ft-xxx --follow
```

```bash
bl finetune opd watch --job-id ft-xxx --follow --interval 5
```

```bash
bl finetune opd watch --job-id ft-xxx --follow --poll-timeout 3600
```

### `bl finetune params`

| Field              | Value                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune params`                                                                                                                                                                                               |
| **Description**    | Query the training hyper-parameter configuration for a base model                                                                                                                                               |
| **Authentication** | API Key                                                                                                                                                                                                         |
| **Usage**          | `bl finetune params --base-model <model> [--training-type <t>] [--param-type <hyper\|resource>] [--mtu-spec-code <code>] [--modality <text\|vision>] [--reasoning-mode <instruct\|thinking>] [--lang <locale>]` |

#### Flags

| Flag                                    | Type   | Required | Description                                                                                                                                                 |
| --------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base-model <model>`                  | string | yes      | Base model to query training parameters for (e.g. qwen3-8b)                                                                                                 |
| `--training-type <t>`                   | string | no       | Training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt (default: sft-lora). Mapped to the server's training_type (e.g. sft-lora -> efficient_sft).        |
| `--mtu-spec-code <code>`                | string | no       | MTU spec code, required for resource-group queries (e.g. MTU2)                                                                                              |
| `--param-type <hyper\|resource>`        | string | no       | Parameter group: hyper \| resource. Omit to return all groups.                                                                                              |
| `--modality <text\|vision>`             | string | no       | Training modality: text \| vision. Only meaningful for models with dynamic train options; sent as modality inside hyper_parameters.                         |
| `--reasoning-mode <instruct\|thinking>` | string | no       | Reasoning mode: instruct (non-thinking) \| thinking. Only meaningful for models with dynamic train options; sent as reasoning_mode inside hyper_parameters. |
| `--lang <locale>`                       | string | no       | Locale for server-side display text (e.g. en, zh). Omit for the server default.                                                                             |
| `--api-key <key>`                       | string | no       | API key                                                                                                                                                     |
| `--base-url <url>`                      | string | no       | API base URL                                                                                                                                                |
| `--console-region <region>`             | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                                    |
| `--console-site <site>`                 | string | no       | Console site: domestic, international                                                                                                                       |
| `--console-switch-agent <uid>`          | number | no       | Switch agent UID for delegated access                                                                                                                       |
| `--workspace-id <id>`                   | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                                                                                    |

#### Notes

- Queries GET /api/v1/fine-tunes/fine-tunes-params. Each hyper_params entry keeps server field names verbatim (recommend_value, defaultValue, is_advanced_parameter, ...).
- --modality / --reasoning-mode travel as one hyper_parameters query parameter (JSON). When a console session is available, the combination is prechecked against the model's supported combinations and omitted options are completed from its defaults; invalid combinations fail with a usage error. Without a console session the check is skipped with a warning and the server result is authoritative.
- resume_from_checkpoint in the output reports whether the training type supports resuming training.

#### Examples

```bash
bl finetune params --base-model qwen3-8b
```

```bash
bl finetune params --base-model qwen3-8b --training-type sft
```

```bash
bl finetune params --base-model qwen3-8b --training-type dpo-lora --param-type hyper
```

```bash
bl finetune params --base-model qwen3.7-plus-2026-05-26 --modality vision --reasoning-mode thinking
```

```bash
bl finetune params --base-model qwen3-8b --param-type resource --mtu-spec-code MTU2
```

```bash
bl finetune params --base-model qwen3-8b --output json
```

```bash
bl finetune params --base-model qwen3-8b --dry-run
```

### `bl finetune price`

| Field              | Value                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune price`                                                                                    |
| **Description**    | Estimate the training cost for a fine-tune job (token billing)                                      |
| **Authentication** | Console                                                                                             |
| **Usage**          | `bl finetune price --base-model <model> --datasets <ids> [--training-type <type>] [--n-epochs <n>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                        |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------ |
| `--base-model <model>`         | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name) |
| `--datasets <ids>`             | string | yes      | Training dataset file IDs, comma-separated (required)              |
| `--training-type <type>`       | string | no       | Training type: sft \| dpo \| cpt (default: sft)                    |
| `--n-epochs <n>`               | number | no       | Number of training epochs (default: 3)                             |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)           |
| `--console-site <site>`        | string | no       | Console site: domestic, international                              |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                              |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                           |

#### Notes

- Estimate only — the server computes token usage from the datasets; final cost is subject to the bill.
- Covers token billing for sft / dpo / cpt. Training-unit (MTU) billing is not supported by this command.
- Hyper-parameters other than --n-epochs are fixed at representative defaults for estimation.

#### Examples

```bash
bl finetune price --base-model qwen3-8b --datasets file-ft-xxx
```

```bash
bl finetune price --base-model qwen3-8b --datasets file-ft-xxx,file-ft-yyy --n-epochs 2
```

```bash
bl finetune price --base-model qwen3-8b --datasets file-ft-xxx --training-type cpt
```

### `bl finetune rl authorize`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune rl authorize`                                                                                          |
| **Description**    | Check and authorize reinforcement-learning access (whitelist, service roles, enablement)                         |
| **Authentication** | Console                                                                                                          |
| **Usage**          | `bl finetune rl authorize [--authorize]`                                                                         |
| **Risk**           | `high`                                                                                                           |
| **Risk message**   | With --authorize this enables the RL training mode for your account. The CLI never creates service-linked roles. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                                                                    |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--authorize`                  | switch | no       | Permit enabling RL once the service roles are manually authorized (read-only probe without it) |
| `--yes`                        | switch | no       | Confirm this high-risk operation                                                               |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                       |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                                          |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                                          |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                       |

#### Notes

- Service-linked roles must be authorized manually first (https://docs.bailian.console.aliyun.com/zh/model-studio/rl-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87); missing roles report REQUIRES_USER_ACTION and block enablement.
- Without --authorize this is a read-only probe. Each capability reports READY / MISSING / UNKNOWN / REQUIRES_USER_ACTION / FAILED; a failed query is UNKNOWN, never assumed enabled.
- Only RL is enabled; OPD is never auto-enabled. In CI pass --authorize --yes to permit changes; --yes alone does not expand permissions.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl finetune rl authorize
```

```bash
# Only after explicit user confirmation:
bl finetune rl authorize --authorize --yes
```

```bash
bl finetune rl authorize --dry-run
```

### `bl finetune rl cancel`

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Name**           | `finetune rl cancel`                                   |
| **Description**    | Cancel a running RL job                                |
| **Authentication** | API Key                                                |
| **Usage**          | `bl finetune rl cancel --job-id <id>`                  |
| **Risk**           | `high`                                                 |
| **Risk message**   | This cancels the running RL job; progress may be lost. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                      |
| ------------------ | ------ | -------- | -------------------------------- |
| `--job-id <id>`    | string | yes      | RL job ID (required)             |
| `--yes`            | switch | no       | Confirm this high-risk operation |
| `--api-key <key>`  | string | no       | API key                          |
| `--base-url <url>` | string | no       | API base URL                     |

#### Examples

```bash
bl finetune rl cancel --job-id rl-xxx
```

```bash
bl finetune rl cancel --job-id rl-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune rl cancel --job-id rl-xxx --yes
```

### `bl finetune rl delete`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `finetune rl delete`                                             |
| **Description**    | Delete an RL job record                                          |
| **Authentication** | API Key                                                          |
| **Usage**          | `bl finetune rl delete --job-id <id>`                            |
| **Risk**           | `high`                                                           |
| **Risk message**   | This permanently deletes the RL job record and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                      |
| ------------------ | ------ | -------- | -------------------------------- |
| `--job-id <id>`    | string | yes      | RL job ID (required)             |
| `--yes`            | switch | no       | Confirm this high-risk operation |
| `--api-key <key>`  | string | no       | API key                          |
| `--base-url <url>` | string | no       | API base URL                     |

#### Notes

- Deletes the job record via the fine-tunes endpoint directly in the host (no sandbox runtime needed); RL and OPD jobs share this backend.

#### Examples

```bash
bl finetune rl delete --job-id rl-xxx
```

```bash
bl finetune rl delete --job-id rl-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl finetune rl delete --job-id rl-xxx --yes
```

### `bl finetune rl get`

| Field              | Value                              |
| ------------------ | ---------------------------------- |
| **Name**           | `finetune rl get`                  |
| **Description**    | Get an RL job                      |
| **Authentication** | API Key                            |
| **Usage**          | `bl finetune rl get --job-id <id>` |

#### Flags

| Flag               | Type   | Required | Description          |
| ------------------ | ------ | -------- | -------------------- |
| `--job-id <id>`    | string | yes      | RL job ID (required) |
| `--api-key <key>`  | string | no       | API key              |
| `--base-url <url>` | string | no       | API base URL         |

#### Examples

```bash
bl finetune rl get --job-id rl-xxx
```

### `bl finetune rl list`

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Name**           | `finetune rl list`                              |
| **Description**    | List RL jobs                                    |
| **Authentication** | API Key                                         |
| **Usage**          | `bl finetune rl list [--page <n>] [--size <n>]` |

#### Flags

| Flag               | Type   | Required | Description  |
| ------------------ | ------ | -------- | ------------ |
| `--page <n>`       | number | no       | Page number  |
| `--size <n>`       | number | no       | Page size    |
| `--api-key <key>`  | string | no       | API key      |
| `--base-url <url>` | string | no       | API base URL |

#### Notes

- RL and OPD jobs share the same job backend; this lists the same job records as `finetune list` (including OPD jobs).

#### Examples

```bash
bl finetune rl list --page 1 --size 20
```

### `bl finetune rl logs`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `finetune rl logs`                                               |
| **Description**    | Fetch RL job logs                                                |
| **Authentication** | API Key                                                          |
| **Usage**          | `bl finetune rl logs --job-id <id> [--offset <n>] [--lines <n>]` |

#### Flags

| Flag               | Type   | Required | Description          |
| ------------------ | ------ | -------- | -------------------- |
| `--job-id <id>`    | string | yes      | RL job ID (required) |
| `--offset <n>`     | number | no       | Log offset           |
| `--lines <n>`      | number | no       | Number of log lines  |
| `--api-key <key>`  | string | no       | API key              |
| `--base-url <url>` | string | no       | API base URL         |

#### Examples

```bash
bl finetune rl logs --job-id rl-xxx
```

```bash
bl finetune rl logs --job-id rl-xxx --offset 0 --lines 100
```

### `bl finetune rl run`

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| **Name**           | `finetune rl run`                                                      |
| **Description**    | Submit a reinforcement-learning training job                           |
| **Authentication** | API Key                                                                |
| **Usage**          | `bl finetune rl run --model <id> [flags]`                              |
| **Risk**           | `high`                                                                 |
| **Risk message**   | This creates a billed RL training job that consumes compute resources. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                    | Type   | Required | Description                                                                             |
| --------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `--config-file <path>`                  | string | no       | Optional job YAML file; explicit CLI flags override it                                  |
| `--name <name>`                         | string | no       | Job name                                                                                |
| `--model <id>`                          | string | no       | Base model ID                                                                           |
| `--train-file <path>`                   | array  | no       | Local training file (repeatable)                                                        |
| `--train-file-id <id>`                  | array  | no       | Uploaded training file ID (repeatable)                                                  |
| `--validation-file <path>`              | array  | no       | Local validation file (repeatable)                                                      |
| `--validation-file-id <id>`             | array  | no       | Uploaded validation file ID (repeatable)                                                |
| `--code-dir <path>`                     | string | no       | Function package source directory                                                       |
| `--requirements <path>`                 | string | no       | Requirements path relative to the code dir                                              |
| `--include <glob>`                      | array  | no       | Package include glob (repeatable)                                                       |
| `--exclude <glob>`                      | array  | no       | Package exclude glob (repeatable)                                                       |
| `--rollout <classpath>`                 | string | no       | Rollout function classpath                                                              |
| `--reward <name=classpath>`             | array  | no       | Reward function (repeatable)                                                            |
| `--clear-functions`                     | switch | no       | Clear functions defined in the YAML                                                     |
| `--function-timeout <name=sec>`         | array  | no       | Function timeout in seconds (repeatable)                                                |
| `--function-runtime <name.field=value>` | array  | no       | Function runtime field (repeatable)                                                     |
| `--reward-weight <name=num>`            | array  | no       | Reward weight (repeatable)                                                              |
| `--reward-metric <name.metric=num>`     | array  | no       | Reward metric weight (repeatable)                                                       |
| `--function-env <name.KEY=value>`       | array  | no       | Function environment variable (repeatable)                                              |
| `--hp <key=value>`                      | array  | no       | Hyper-parameter (repeatable, parsed by type)                                            |
| `--charge-type <value>`                 | string | no       | Resource charge type                                                                    |
| `--mtu-spec <code>`                     | string | no       | MTU spec code                                                                           |
| `--mtu-count <int>`                     | number | no       | MTU capacity                                                                            |
| `--instance-id <id>`                    | string | no       | Prepaid resource instance ID                                                            |
| `--set <key=value>`                     | array  | no       | Top-level spec override (repeatable, JSON value)                                        |
| `--watch`                               | switch | no       | Wait for the job to reach a terminal state                                              |
| `--wait-timeout <seconds>`              | number | no       | Maximum seconds to poll with --watch (default: no limit; does not cancel the cloud job) |
| `--install-runtime`                     | switch | no       | Allow first-time managed runtime preparation                                            |
| `--yes`                                 | switch | no       | Confirm this high-risk operation                                                        |
| `--api-key <key>`                       | string | no       | API key                                                                                 |
| `--base-url <url>`                      | string | no       | API base URL                                                                            |

#### Notes

- Runs inside an isolated sandbox. Prepare the runtime first with `finetune runtime prepare`, or pass --install-runtime.
- Timing out with --watch stops waiting only; it does not cancel the cloud job.

#### Examples

```bash
bl finetune rl run --model qwen3.5-9b --train-file ./data/train.jsonl --code-dir . --rollout functions.rollout.MyRollout --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch
```

```bash
bl finetune rl run --config-file job.yaml --watch
```

```bash
bl finetune rl run --model qwen3.5-9b --train-file ./data/train.jsonl --dry-run
```

### `bl finetune rl watch`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune rl watch`                                                                                  |
| **Description**    | Probe an RL job's status (default: single non-blocking fetch). Pass --follow to poll until terminal. |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl finetune rl watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]`            |

#### Flags

| Flag                   | Type   | Required | Description                                                                                                                |
| ---------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--job-id <id>`        | string | yes      | RL job ID (required)                                                                                                       |
| `--follow`             | switch | no       | Block and poll until a terminal state. Without it, a single status probe is performed and the command returns immediately. |
| `--interval <sec>`     | number | no       | Seconds between polls with --follow (default: 10, min: 1). Ignored without --follow.                                       |
| `--poll-timeout <sec>` | number | no       | With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.                         |
| `--api-key <key>`      | string | no       | API key                                                                                                                    |
| `--base-url <url>`     | string | no       | API base URL                                                                                                               |

#### Notes

- Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then return immediately. The caller owns the polling cadence, so the CLI never holds the terminal.
- A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit); SUCCEEDED or still-running returns 0. With --follow, exceeding --poll-timeout raises a timeout error but does not cancel the cloud job.
- Queries the fine-tunes endpoint directly in the host (no sandbox runtime needed). For per-step training output use `finetune rl logs`.

#### Examples

```bash
bl finetune rl watch --job-id ft-xxx
```

```bash
bl finetune rl watch --job-id ft-xxx --output json
```

```bash
bl finetune rl watch --job-id ft-xxx --follow
```

```bash
bl finetune rl watch --job-id ft-xxx --follow --interval 5
```

```bash
bl finetune rl watch --job-id ft-xxx --follow --poll-timeout 3600
```

### `bl finetune runtime clean`

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune runtime clean`                                                                                |
| **Description**    | Reclaim orphaned sandbox run directories and superseded runtime versions                                |
| **Authentication** | No Auth                                                                                                 |
| **Usage**          | `bl finetune runtime clean [--ttl-hours <hours>] [--dry-run]`                                           |
| **Risk**           | `high`                                                                                                  |
| **Risk message**   | This permanently deletes orphaned run directories and superseded runtime versions; it cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                             |
| --------------------- | ------ | -------- | ------------------------------------------------------- |
| `--ttl-hours <hours>` | number | no       | Age threshold for orphaned run directories (default 24) |
| `--yes`               | switch | no       | Confirm this high-risk operation                        |

#### Notes

- Normal runs are disposed automatically when the invocation ends; only crash leftovers (older than the TTL) remain under runs/. Superseded runtime versions under runtimes/rl/ are reclaimed, keeping only the current reviewed baseline.
- Never touches the current baseline runtime, BAILIAN_RL_RUNTIME development directories, or the content-addressed download cache. Local only: no credentials, no cloud resources.
- Deletion is irreversible; preview the remove/keep plan with --dry-run first. Runtime reclamation requires a bundled manifest entry for this platform; otherwise only runs are pruned.

#### Examples

```bash
bl finetune runtime clean --dry-run
```

```bash
bl finetune runtime clean --ttl-hours 48
```

```bash
bl finetune runtime clean
```

### `bl finetune runtime doctor`

| Field              | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Name**           | `finetune runtime doctor`                                                               |
| **Description**    | Check the RL runtime and sandbox isolation (credential deny, home redirect, SDK import) |
| **Authentication** | No Auth                                                                                 |
| **Usage**          | `bl finetune runtime doctor`                                                            |

#### Flags

_No command-specific flags._

#### Notes

- Read-only self-check; it creates no cloud resources. Required checks must pass; when the runtime is missing they are skipped (not treated as passed) and the command exits non-zero.
- Enhanced hardening (kernel network enforcement, process tree, memory) degrades with a notice when unavailable and does not fail the overall check.
- Host network reachability (API / runtime download / PyPI hosts) is probed as an advisory check: blocked hosts degrade with guidance (agent sandboxes often block outbound network) and do not fail the overall check.

#### Examples

```bash
bl finetune runtime doctor
```

```bash
bl finetune runtime doctor --dry-run
```

```bash
bl finetune runtime doctor --output json
```

### `bl finetune runtime prepare`

| Field              | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Name**           | `finetune runtime prepare`                                     |
| **Description**    | Prepare the managed Python/SDK runtime used by RL and OPD jobs |
| **Authentication** | No Auth                                                        |
| **Usage**          | `bl finetune runtime prepare [--manifest <path>]`              |

#### Flags

| Flag                | Type   | Required | Description                                                                |
| ------------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `--manifest <path>` | string | no       | Optional runtime manifest file (defaults to the bundled reviewed manifest) |

#### Notes

- Downloads and verifies the runtime locally; it never creates a training job. Set BAILIAN_RL_RUNTIME to a local dashscope Python directory to reuse a development runtime instead.
- On an unsupported platform this reports RUNTIME_UNAVAILABLE; no cloud resources are created.
- CPython downloads fall back to a built-in npmmirror mirror when GitHub is unreachable; set BAILIAN_RL_PYTHON_MIRROR to a custom mirror prefix. Integrity is always verified against the reviewed SHA256 regardless of source.
- In regions where the PyPI CDN stalls, set BAILIAN_RL_PIP_INDEX_URL to a stable PyPI mirror (e.g. https://pypi.tuna.tsinghua.edu.cn/simple/ or https://mirrors.aliyun.com/pypi/simple/); pip still verifies every package hash via --require-hashes. Mirrors lag PyPI: if a mirror lacks a pinned version, pip reports 'No matching distribution found for X==ver' — use a fresher mirror or the default PyPI.
- Prepare also reclaims orphaned run directories older than 24 hours (crash leftovers); normal runs are disposed automatically when the invocation ends. Use runtime clean to preview or reclaim superseded runtime versions.

#### Examples

```bash
bl finetune runtime prepare
```

```bash
bl finetune runtime prepare --manifest ./runtime-manifest.json
```

```bash
bl finetune runtime prepare --dry-run
```

### `bl finetune text create`

| Field              | Value                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune text create`                                                                                                                                                                                                                                                                                                                                                                                     |
| **Description**    | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                                                                                                                                                                                                                                                                                              |
| **Authentication** | API Key                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Usage**          | `bl finetune text create --base-model <model> --datasets <id\|path,...> [--validations <id\|path,...>] [--job-name <name>] [--priority <L0\|L1\|L2\|L3>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>] [--max-length <n>] [--training-type <sft\|sft-lora\|dpo\|dpo-lora\|cpt>] [--modality <text\|vision>] [--reasoning-mode <instruct\|thinking>]` |

#### Flags

| Flag                                     | Type   | Required | Description                                                                                                                                                                                                    |
| ---------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base-model <model>`                   | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name)                                                                                                                                             |
| `--datasets <ids\|paths>`                | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image/video). Local paths are uploaded (validated) first, then their file-ids are used.                                       |
| `--validations <ids\|paths>`             | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                                                                    |
| `--model-name <name>`                    | string | no       | Output model name (after training)                                                                                                                                                                             |
| `--suffix <text>`                        | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                                                               |
| `--job-name <value>`                     | string | no       | Training job display name (job_name)                                                                                                                                                                           |
| `--priority <L0\|L1\|L2\|L3>`            | string | no       | Requested scheduling priority; verify the service response                                                                                                                                                     |
| `--eval-steps <value>`                   | number | no       | Validation interval in training steps                                                                                                                                                                          |
| `--lora-alpha <value>`                   | number | no       | LoRA scaling coefficient                                                                                                                                                                                       |
| `--lora-dropout <value>`                 | number | no       | LoRA dropout probability                                                                                                                                                                                       |
| `--lora-rank <value>`                    | number | no       | LoRA matrix rank                                                                                                                                                                                               |
| `--lr-scheduler-type <value>`            | string | no       | Learning rate scheduler supported by the selected model                                                                                                                                                        |
| `--save-strategy <epoch\|steps>`         | string | no       | Checkpoint saving strategy                                                                                                                                                                                     |
| `--save-total-limit <value>`             | number | no       | Maximum number of saved checkpoints                                                                                                                                                                            |
| `--save-steps <value>`                   | number | no       | Checkpoint saving interval for strategy=steps                                                                                                                                                                  |
| `--split <value>`                        | number | no       | Training fraction when no validation dataset is supplied                                                                                                                                                       |
| `--max-split-val-dataset-sample <value>` | number | no       | Maximum automatically split validation samples                                                                                                                                                                 |
| `--data-augmentation <true\|false>`      | string | no       | Mix platform training data (true or false)                                                                                                                                                                     |
| `--training-type <t>`                    | string | no       | Training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt (default: sft-lora). Mapping to the server happens at the interface boundary (e.g. sft-lora -> efficient_sft, dpo -> dpo_full).                       |
| `--n-epochs <n>`                         | number | no       | Number of epochs; valid values are checked against the selected model                                                                                                                                          |
| `--batch-size <n>`                       | number | no       | Per-device batch size; range and step are checked against the selected model                                                                                                                                   |
| `--learning-rate <str>`                  | string | no       | Learning rate as a string to preserve precision (e.g. "1.6e-5")                                                                                                                                                |
| `--max-length <n>`                       | number | no       | Max sequence length                                                                                                                                                                                            |
| `--modality <text\|vision>`              | string | no       | Training-option modality sent as hyper_parameters.modality (not the dataset format fixed by this subcommand). Only for models with dynamic train options; valid values come from the model's parameter schema. |
| `--reasoning-mode <instruct\|thinking>`  | string | no       | Reasoning mode sent as hyper_parameters.reasoning_mode. Only for models with dynamic train options; valid values come from the model's parameter schema.                                                       |
| `--api-key <key>`                        | string | no       | API key                                                                                                                                                                                                        |
| `--base-url <url>`                       | string | no       | API base URL                                                                                                                                                                                                   |
| `--console-region <region>`              | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                                                                                       |
| `--console-site <site>`                  | string | no       | Console site: domestic, international                                                                                                                                                                          |
| `--console-switch-agent <uid>`           | number | no       | Switch agent UID for delegated access                                                                                                                                                                          |
| `--workspace-id <id>`                    | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                                                                                                                                       |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`) or local paths. Local paths are validated and uploaded first, then their file-ids are submitted — a one-step upload-and-train.
- Training-type values use the `<method>` / `<method>-lora` convention: sft (full) | sft-lora (LoRA) | dpo (full) | dpo-lora (LoRA) | cpt. These map to the server's training_type at the interface boundary, so the rest of the CLI never sees the raw server strings.
- Before submitting (non dry-run) the job, the model's training capability is checked via listFoundationModels (no console login required); an unsupported training type fails fast with the list the model actually supports.
- Before upload, the command queries the selected model and training type's parameter schema. Explicit overrides must satisfy its editability, type, enum, range, and step constraints; omitted values use platform defaults.
- Learning rate is forwarded as a string to avoid JSON-number precision loss.
- Pre-submit gate: if the training dataset's sample count is not greater than batch_size, the job is rejected before upload or quota consumption (the platform would otherwise fail ~10 min in, after data processing).
- --modality / --reasoning-mode are training options forwarded as hyper_parameters entries, independent of the dataset format fixed by the subcommand. Models with dynamic train options require them to resolve the parameter schema (e.g. a vision-only CPT base needs --modality vision); models without dynamic options reject them. Invalid combinations are rejected by the server and surfaced as-is.

#### Examples

```bash
bl finetune text create --base-model qwen3-8b --datasets file-xxx
```

```bash
bl finetune text create --base-model qwen3-8b --datasets ./train.jsonl
```

```bash
bl finetune text create --base-model qwen3-8b --datasets ./train.jsonl --validations ./eval.jsonl
```

```bash
bl finetune text create --base-model qwen3-8b --datasets file-aaa,./extra.jsonl
```

```bash
bl finetune text create --base-model qwen3-8b --datasets ./train.jsonl --training-type sft
```

```bash
bl finetune text create --base-model qwen3-8b --datasets ./jev-train.jsonl --job-name jev-train-v1 --priority L0 --lora-rank 8 --lora-alpha 16 --lora-dropout 0.1 --lr-scheduler-type linear --eval-steps 50 --save-strategy epoch --save-total-limit 3 --split 0.9 --max-split-val-dataset-sample 1000 --data-augmentation false --dry-run
```

```bash
bl finetune text create --base-model qwen3-8b --datasets file-xxx --learning-rate "1.6e-5" --n-epochs 4
```

```bash
bl finetune text create --base-model qwen3.6-plus-base-2026-04-02 --datasets file-xxx --training-type cpt --modality vision --reasoning-mode instruct
```

```bash
bl finetune text create --base-model qwen3-8b --datasets file-xxx --output json
```

```bash
bl finetune text create --base-model qwen3-8b --datasets file-xxx --dry-run
```

### `bl finetune train-options`

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Name**           | `finetune train-options`                                                            |
| **Description**    | Query a base model's dynamic train options (modality / reasoning-mode combinations) |
| **Authentication** | Console                                                                             |
| **Usage**          | `bl finetune train-options --base-model <model> [--training-type <t>]`              |

#### Flags

| Flag                           | Type   | Required | Description                                                                                                                                     |
| ------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base-model <model>`         | string | yes      | Base model to query dynamic train options for (e.g. qwen3.6-plus-base-2026-04-02)                                                               |
| `--training-type <t>`          | string | no       | Training type: sft \| sft-lora \| dpo \| dpo-lora \| cpt (default: sft). Mapped to the server's training_type (e.g. sft-lora -> efficient_sft). |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                        |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                                                                                           |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                                                                                           |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                                                                        |

#### Notes

- Calls the console gateway model-train-options API and requires a console login session. The result keeps the server field names verbatim (optionKeys, optionDefinitions, defaults, supportedCombinations). Models without dynamic train options return training_options: null.
- supportedCombinations is the authority for valid option combinations. finetune params and finetune text create call this same API once as a best-effort precheck when a console session is available: omitted options are completed from defaults and invalid combinations are rejected; without a session the check is skipped with a warning.
- Pass the selected options to finetune params / finetune text create via --modality / --reasoning-mode; they travel as hyper_parameters to the training API.

#### Examples

```bash
bl finetune train-options --base-model qwen3.6-plus-base-2026-04-02
```

```bash
bl finetune train-options --base-model qwen3.6-plus-base-2026-04-02 --training-type cpt
```

```bash
bl finetune train-options --base-model qwen3-8b
```

```bash
bl finetune train-options --base-model qwen3-8b --dry-run
```

### `bl finetune video create`

| Field              | Value                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune video create`                                                                                                                                                                              |
| **Description**    | Create a video generation model fine-tune job (Wan i2v/kf2v, efficient_sft)                                                                                                                          |
| **Authentication** | API Key                                                                                                                                                                                              |
| **Usage**          | `bl finetune video create --base-model <model> --datasets <id\|path> [--validations <id\|path>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                                                                                                                              |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--base-model <model>`       | string | yes      | Base model to fine-tune (e.g. qwen3-8b; not the output model name)                                                                                                       |
| `--datasets <ids\|paths>`    | string | yes      | Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image/video). Local paths are uploaded (validated) first, then their file-ids are used. |
| `--validations <ids\|paths>` | string | no       | Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).                                                                              |
| `--model-name <name>`        | string | no       | Output model name (after training)                                                                                                                                       |
| `--suffix <text>`            | string | no       | Output suffix appended by the platform (finetuned_output_suffix)                                                                                                         |
| `--n-epochs <n>`             | number | no       | Training epochs (default: 50)                                                                                                                                            |
| `--batch-size <n>`           | number | no       | Batch size (default: model-specific, 1 for wan2.7, 4 for wan2.5/2.2)                                                                                                     |
| `--learning-rate <str>`      | string | no       | Learning rate as a string to preserve precision (default: "2e-5")                                                                                                        |
| `--api-key <key>`            | string | no       | API key                                                                                                                                                                  |
| `--base-url <url>`           | string | no       | API base URL                                                                                                                                                             |

#### Notes

- Creating a job uploads any local datasets and consumes training quota.
- Use --dry-run to preview the request body without submitting.
- --datasets / --validations accept either file-ids (from `dataset upload`) or local paths. Local paths are validated and uploaded first, then their file-ids are submitted — a one-step upload-and-train.
- Video generation training (Wan i2v/kf2v) runs efficient_sft with model-specific defaults: wan2.7 (batch_size=1, max_pixels=102400), wan2.5/2.2 (batch_size=4, max_pixels per model). Override with --batch-size/--n-epochs.
- Datasets are .zip archives with data.jsonl + frame images + videos.
- Recommended: ≥10 training samples, 20-100 for stable results.

#### Examples

```bash
bl finetune video create --base-model wan2.7-i2v --datasets file-xxx
```

```bash
bl finetune video create --base-model wan2.7-i2v --datasets ./i2v-data.zip
```

```bash
bl finetune video create --base-model wan2.2-kf2v-flash --datasets file-xxx --n-epochs 100
```

```bash
bl finetune video create --base-model wan2.7-i2v --datasets file-xxx --dry-run
```

### `bl finetune watch`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `finetune watch`                                                                                           |
| **Description**    | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal. |
| **Authentication** | API Key                                                                                                    |
| **Usage**          | `bl finetune watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]`                     |

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

- Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then return immediately. This is the mode meant for agents / scripts — the caller owns the polling cadence, so the CLI never holds the terminal.
- A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit); a SUCCEEDED or still-running status returns 0. With --follow, exceeding --poll-timeout raises a timeout error.
- Use --follow for the blocking, human-terminal-follow experience; use the default mode when driving the loop yourself (e.g. from an agent).
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
