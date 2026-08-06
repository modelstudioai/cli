# `bailian-finetune` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                    | Description                                                                                                                     | Detail                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `bl dataset delete`        | Delete a dataset file by ID                                                                                                     | [dataset.md](dataset.md)   |
| `bl dataset get`           | Get details of a single dataset file                                                                                            | [dataset.md](dataset.md)   |
| `bl dataset list`          | List uploaded dataset files                                                                                                     | [dataset.md](dataset.md)   |
| `bl dataset upload`        | Upload a dataset file (.jsonl or .zip) to Bailian                                                                               | [dataset.md](dataset.md)   |
| `bl dataset validate`      | Locally validate a dataset file (.jsonl or .zip) without uploading                                                              | [dataset.md](dataset.md)   |
| `bl deploy audio create`   | Create an audio (TTS) model deployment                                                                                          | [deploy.md](deploy.md)     |
| `bl deploy delete`         | Delete a model deployment (must be STOPPED or FAILED)                                                                           | [deploy.md](deploy.md)     |
| `bl deploy get`            | Get details of a single model deployment                                                                                        | [deploy.md](deploy.md)     |
| `bl deploy image create`   | Create an image generation model deployment                                                                                     | [deploy.md](deploy.md)     |
| `bl deploy list`           | List model deployments                                                                                                          | [deploy.md](deploy.md)     |
| `bl deploy models`         | List models available for deployment                                                                                            | [deploy.md](deploy.md)     |
| `bl deploy scale`          | Scale a deployment's capacity                                                                                                   | [deploy.md](deploy.md)     |
| `bl deploy text create`    | Create a text model deployment                                                                                                  | [deploy.md](deploy.md)     |
| `bl deploy update`         | Update a deployment's rate limits (rpm_limit / tpm_limit)                                                                       | [deploy.md](deploy.md)     |
| `bl finetune audio create` | Create an audio TTS model fine-tune job (sft-lora)                                                                              | [finetune.md](finetune.md) |
| `bl finetune cancel`       | Cancel a running fine-tune job                                                                                                  | [finetune.md](finetune.md) |
| `bl finetune capability`   | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) | [finetune.md](finetune.md) |
| `bl finetune checkpoints`  | List checkpoints produced by a fine-tune job                                                                                    | [finetune.md](finetune.md) |
| `bl finetune delete`       | Delete a fine-tune job record                                                                                                   | [finetune.md](finetune.md) |
| `bl finetune export`       | Publish a checkpoint as a deployable model                                                                                      | [finetune.md](finetune.md) |
| `bl finetune get`          | Get details of a single fine-tune job                                                                                           | [finetune.md](finetune.md) |
| `bl finetune image create` | Create an image generation model fine-tune job (sft-lora)                                                                       | [finetune.md](finetune.md) |
| `bl finetune list`         | List fine-tune jobs                                                                                                             | [finetune.md](finetune.md) |
| `bl finetune logs`         | Fetch training logs for a fine-tune job                                                                                         | [finetune.md](finetune.md) |
| `bl finetune text create`  | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                   | [finetune.md](finetune.md) |
| `bl finetune watch`        | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                      | [finetune.md](finetune.md) |

## By group

| Group      | Commands                                                                                                                                 | Reference                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `dataset`  | `delete`, `get`, `list`, `upload`, `validate`                                                                                            | [dataset.md](dataset.md)   |
| `deploy`   | `audio create`, `delete`, `get`, `image create`, `list`, `models`, `scale`, `text create`, `update`                                      | [deploy.md](deploy.md)     |
| `finetune` | `audio create`, `cancel`, `capability`, `checkpoints`, `delete`, `export`, `get`, `image create`, `list`, `logs`, `text create`, `watch` | [finetune.md](finetune.md) |

## Global flags

Available on every command (in addition to command-specific flags):

| Flag                  | Type   | Required | Description                           |
| --------------------- | ------ | -------- | ------------------------------------- |
| `--output <format>`   | string | no       | Output format: text, json             |
| `--timeout <seconds>` | number | no       | Request timeout                       |
| `--quiet`             | switch | no       | Suppress non-essential output         |
| `--verbose`           | switch | no       | Print HTTP request/response details   |
| `--dry-run`           | switch | no       | Dry run mode                          |
| `--config <name>`     | string | no       | Use a config profile for this command |
| `--help`              | switch | no       | Show help                             |
| `--version`           | switch | no       | Print version                         |

## Model auth flags

Available on model-domain commands (API-key auth); also listed per command below:

| Flag               | Type   | Required | Description  |
| ------------------ | ------ | -------- | ------------ |
| `--api-key <key>`  | string | no       | API key      |
| `--base-url <url>` | string | no       | API base URL |

## Console auth flags

Available on console-domain commands (console login auth); also listed per command below:

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

## OpenAPI auth flags

Available on OpenAPI-domain commands (AK/SK auth); also listed per command below:

| Flag                        | Type   | Required | Description                                                            |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--access-key-id <key>`     | string | no       | Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)         |
| `--access-key-secret <key>` | string | no       | Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET) |
| `--security-token <token>`  | string | no       | Alibaba Cloud STS Security Token (env: ALIBABA_CLOUD_SECURITY_TOKEN)   |

## Notes

- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.
- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.
- Token Plan commands use OpenAPI AK/SK via `bl auth login --open-api` or `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`.
- Default output: **text** unless explicitly set to `json` with `--output`, `DASHSCOPE_OUTPUT`, or config.
