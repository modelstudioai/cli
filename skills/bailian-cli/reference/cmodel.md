# `bl cmodel` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                 | Authentication | Description                                                                                                      |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bl cmodel base-models` | Console        | List base models that can be imported as custom models                                                           |
| `bl cmodel delete`      | API Key        | Delete a custom model and its Bailian-side import record                                                         |
| `bl cmodel get`         | API Key        | Get details of a custom model (import job)                                                                       |
| `bl cmodel import`      | API Key        | Import a custom model from OSS (creates an import job)                                                           |
| `bl cmodel list`        | API Key        | List custom models (import jobs)                                                                                 |
| `bl cmodel watch`       | API Key        | Probe a custom model's import status (default: single non-blocking fetch). Pass --follow to poll until terminal. |

## Command details

### `bl cmodel base-models`

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Name**           | `cmodel base-models`                                   |
| **Description**    | List base models that can be imported as custom models |
| **Authentication** | Console                                                |
| **Usage**          | `bl cmodel base-models`                                |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- The list is returned dynamically by the console API and may change between releases. Import is currently available only in the Beijing region.

#### Examples

```bash
bl cmodel base-models
```

```bash
bl cmodel base-models --console-region cn-beijing
```

```bash
bl cmodel base-models --output json
```

### `bl cmodel delete`

| Field              | Value                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `cmodel delete`                                                                                                                          |
| **Description**    | Delete a custom model and its Bailian-side import record                                                                                 |
| **Authentication** | API Key                                                                                                                                  |
| **Usage**          | `bl cmodel delete --job-id <id>`                                                                                                         |
| **Risk**           | `high`                                                                                                                                   |
| **Risk message**   | This permanently deletes the Bailian-side import record and imported model copy; it cannot be undone. OSS source files are not modified. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                                          |
| ------------------ | ------ | -------- | ---------------------------------------------------- |
| `--job-id <id>`    | string | yes      | Import job ID returned by `cmodel import` (required) |
| `--yes`            | switch | no       | Confirm this high-risk operation                     |
| `--api-key <key>`  | string | no       | API key                                              |
| `--base-url <url>` | string | no       | API base URL                                         |

#### Notes

- This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.
- Irreversible: the import record and imported model are removed from Bailian and must be imported again to restore. OSS source files are untouched.
- Only SUCCESSED or FAILED jobs can be deleted; deleting a RUNNING job is rejected by the service (OperationDenied) and the error is surfaced verbatim.

#### Examples

```bash
bl cmodel delete --job-id 937b-xxxx
```

```bash
bl cmodel delete --job-id 937b-xxxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl cmodel delete --job-id 937b-xxxx --yes
```

### `bl cmodel get`

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| **Name**           | `cmodel get`                               |
| **Description**    | Get details of a custom model (import job) |
| **Authentication** | API Key                                    |
| **Usage**          | `bl cmodel get --job-id <id>`              |

#### Flags

| Flag               | Type   | Required | Description                                          |
| ------------------ | ------ | -------- | ---------------------------------------------------- |
| `--job-id <id>`    | string | yes      | Import job ID returned by `cmodel import` (required) |
| `--api-key <key>`  | string | no       | API key                                              |
| `--base-url <url>` | string | no       | API base URL                                         |

#### Notes

- This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.
- FAILED jobs include the server-provided error_code verbatim; the CLI does not translate it.

#### Examples

```bash
bl cmodel get --job-id 937b-xxxx
```

```bash
bl cmodel get --job-id 937b-xxxx --output json
```

### `bl cmodel import`

| Field              | Value                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `cmodel import`                                                                                                                  |
| **Description**    | Import a custom model from OSS (creates an import job)                                                                           |
| **Authentication** | API Key                                                                                                                          |
| **Usage**          | `bl cmodel import --base-model <model> --weight-type <lora\|full> --bucket <bucket> --object-key <dir/> [--display-name <name>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                                            |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `--base-model <model>`         | string | yes      | Base model ID used for tuning (required, e.g. qwen3-32b)                                               |
| `--weight-type <lora\|full>`   | string | yes      | Tuning weight type (required): lora or full                                                            |
| `--bucket <bucket>`            | string | yes      | OSS bucket containing the model files (required)                                                       |
| `--object-key <dir/>`          | string | yes      | OSS directory prefix containing the model files (required, must end with / and not be the bucket root) |
| `--display-name <name>`        | string | no       | Display name (optional, max 50 characters)                                                             |
| `--api-key <key>`              | string | no       | API key                                                                                                |
| `--base-url <url>`             | string | no       | API base URL                                                                                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                               |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                                                  |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                                                  |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                                               |

#### Notes

- This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.
- After submission, follow the job with `cmodel watch --job-id` and inspect it with `cmodel get` / `cmodel list`.
- The import API is currently available only in the Beijing region; use the console in other regions.
- The source is fixed to OSS in this release. The bucket must be tagged bailian-datahub-access=read, must not use archive/cold-archive/deep-archive storage or SSE-KMS, and the directory must contain the model files required by the platform (e.g. adapter_model.safetensors, adapter_config.json, config.json).
- When a valid console session is available, the base model is checked against the console-supported import list before submission: the ID is normalized to the catalog `model` value, and weight-type is checked against the model's supportTrainTypes (lora requires efficient_sft, full requires sft). Unsupported combinations fail immediately with a usage error. If the console session is missing or expired, the check is skipped with a warning and the import API's final result is authoritative.
- The current product version supports importing LoRA models; submitting weight-type=full may be rejected by the service. The API contract keeps both values, so the CLI does not hide `full`.

#### Examples

```bash
bl cmodel import --base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/
```

```bash
bl cmodel import --base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/ --display-name my-lora
```

```bash
bl cmodel import --base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/ --dry-run
```

### `bl cmodel list`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `cmodel list`                                                                             |
| **Description**    | List custom models (import jobs)                                                          |
| **Authentication** | API Key                                                                                   |
| **Usage**          | `bl cmodel list [--page <n>] [--page-size <n>] [--status <status>] [--model-name <name>]` |

#### Flags

| Flag                                             | Type   | Required | Description                                                                |
| ------------------------------------------------ | ------ | -------- | -------------------------------------------------------------------------- |
| `--page <n>`                                     | number | no       | Page number (default: 1)                                                   |
| `--page-size <n>`                                | number | no       | Results per page (default: 10, max 100)                                    |
| `--status <PENDING\|RUNNING\|SUCCESSED\|FAILED>` | string | no       | Filter by status (server-side)                                             |
| `--model-name <name>`                            | string | no       | Filter by the server-generated model identifier (exact match, server-side) |
| `--api-key <key>`                                | string | no       | API key                                                                    |
| `--base-url <url>`                               | string | no       | API base URL                                                               |

#### Notes

- This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.
- status and model-name are server-side filters over the whole result set (not local page filters). FAILED entries include the server-provided error_code.

#### Examples

```bash
bl cmodel list
```

```bash
bl cmodel list --status RUNNING
```

```bash
bl cmodel list --model-name qwen3-32b-offline-20240101-abc1
```

```bash
bl cmodel list --page-size 20
```

### `bl cmodel watch`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `cmodel watch`                                                                                                   |
| **Description**    | Probe a custom model's import status (default: single non-blocking fetch). Pass --follow to poll until terminal. |
| **Authentication** | API Key                                                                                                          |
| **Usage**          | `bl cmodel watch --job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]`                             |

#### Flags

| Flag                   | Type   | Required | Description                                                                                                                |
| ---------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--job-id <id>`        | string | yes      | Import job ID returned by `cmodel import` (required)                                                                       |
| `--follow`             | switch | no       | Block and poll until a terminal state. Without it, a single status probe is performed and the command returns immediately. |
| `--interval <sec>`     | number | no       | Seconds between polls with --follow (default: 10, min: 1). Ignored without --follow.                                       |
| `--poll-timeout <sec>` | number | no       | With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.                         |
| `--api-key <key>`      | string | no       | API key                                                                                                                    |
| `--base-url <url>`     | string | no       | API base URL                                                                                                               |

#### Notes

- This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.
- Default (no --follow) is a NON-BLOCKING single status probe for agents/scripts. Terminal statuses are SUCCESSED and FAILED; an unknown server status is surfaced verbatim and treated as non-terminal.
- A terminal FAILED status raises a normal CLI error (non-zero exit) with the server error_code preserved; SUCCEEDED and still-running statuses return 0. With --follow, exceeding --poll-timeout raises a timeout error.

#### Examples

```bash
bl cmodel watch --job-id 937b-xxxx
```

```bash
bl cmodel watch --job-id 937b-xxxx --output json
```

```bash
bl cmodel watch --job-id 937b-xxxx --follow
```

```bash
bl cmodel watch --job-id 937b-xxxx --follow --interval 5 --poll-timeout 3600
```
