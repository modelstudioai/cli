# `bl deploy` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                  | Authentication | Description                                                   |
| ------------------------ | -------------- | ------------------------------------------------------------- |
| `bl deploy audio create` | API Key        | Create an audio (TTS) model deployment                        |
| `bl deploy delete`       | API Key        | Delete a model deployment (must be STOPPED or FAILED)         |
| `bl deploy get`          | API Key        | Get details of a single model deployment                      |
| `bl deploy image create` | API Key        | Create an image generation model deployment                   |
| `bl deploy list`         | API Key        | List model deployments                                        |
| `bl deploy models`       | API Key        | List models available for deployment                          |
| `bl deploy pause`        | Console        | Pause a running model deployment (stops billing for mu/ptu)   |
| `bl deploy resume`       | Console        | Resume a paused model deployment (brings service back online) |
| `bl deploy scale`        | API Key        | Scale a deployment's capacity                                 |
| `bl deploy text create`  | API Key        | Create a text model deployment                                |
| `bl deploy update`       | API Key        | Update a deployment's rate limits (rpm_limit / tpm_limit)     |

## Command details

### `bl deploy audio create`

| Field              | Value                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `deploy audio create`                                                                                                                                                                                                          |
| **Description**    | Create an audio (TTS) model deployment                                                                                                                                                                                         |
| **Authentication** | API Key                                                                                                                                                                                                                        |
| **Usage**          | `bl deploy audio create --model-name <model_name> --display-name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                            | Type   | Required | Description                                                                     |
| ------------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model-name <model_name>`     | string | yes      | Model to deploy — fine-tuned output name or catalog model (required)            |
| `--display-name <display_name>` | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`                 | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`            | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`                | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`          | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`               | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`              | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>`     | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`               | string | no       | API key                                                                         |
| `--base-url <url>`              | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and --output-tpm are required (the platform rejects creation without an explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING. Invoke the deployed model with: bl text chat --model <deployed_model>
- NOTE: --model-name is the model being deployed (e.g. `qwen3-8b-ft-...`). The create response also returns a `deployed_model` field — the deployment instance id (e.g. `qwen3-8b-5ecb5f068d79`). Use that id for inference (`bl text chat --model <deployed_model>`) and lifecycle commands (`deploy get/scale/pause/resume/delete --deployed-model <id>`).

#### Examples

```bash
bl deploy audio create --model-name my-cosyvoice-ft --display-name my-tts
```

```bash
bl deploy audio create --model-name my-cosyvoice-ft --display-name my-tts --deploy-spec dps-xxxx --capacity 1
```

```bash
bl deploy audio create --model-name my-cosyvoice-ft --display-name my-tts --dry-run
```

### `bl deploy delete`

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Name**           | `deploy delete`                                                    |
| **Description**    | Delete a model deployment (must be STOPPED or FAILED)              |
| **Authentication** | API Key                                                            |
| **Usage**          | `bl deploy delete --deployed-model <id> [--skip-precheck] [--yes]` |

#### Flags

| Flag                    | Type   | Required | Description                                   |
| ----------------------- | ------ | -------- | --------------------------------------------- |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required)          |
| `--skip-precheck`       | switch | no       | Skip the local STOPPED/FAILED status precheck |
| `--yes`                 | switch | no       | Skip the confirmation prompt                  |
| `--api-key <key>`       | string | no       | API key                                       |
| `--base-url <url>`      | string | no       | API base URL                                  |

#### Notes

- Irreversible — the deployment is permanently destroyed.

#### Examples

```bash
bl deploy delete --deployed-model dep-...
```

```bash
bl deploy delete --deployed-model dep-... --dry-run
```

```bash
bl deploy delete --deployed-model dep-... --yes
```

### `bl deploy get`

| Field              | Value                                    |
| ------------------ | ---------------------------------------- |
| **Name**           | `deploy get`                             |
| **Description**    | Get details of a single model deployment |
| **Authentication** | API Key                                  |
| **Usage**          | `bl deploy get --deployed-model <id>`    |

#### Flags

| Flag                    | Type   | Required | Description                          |
| ----------------------- | ------ | -------- | ------------------------------------ |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required) |
| `--api-key <key>`       | string | no       | API key                              |
| `--base-url <url>`      | string | no       | API base URL                         |

#### Examples

```bash
bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71
```

```bash
bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71 --output json
```

### `bl deploy image create`

| Field              | Value                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `deploy image create`                                                                                                                                                                                                          |
| **Description**    | Create an image generation model deployment                                                                                                                                                                                    |
| **Authentication** | API Key                                                                                                                                                                                                                        |
| **Usage**          | `bl deploy image create --model-name <model_name> --display-name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                            | Type   | Required | Description                                                                     |
| ------------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model-name <model_name>`     | string | yes      | Model to deploy — fine-tuned output name or catalog model (required)            |
| `--display-name <display_name>` | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`                 | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`            | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`                | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`          | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`               | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`              | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>`     | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`               | string | no       | API key                                                                         |
| `--base-url <url>`              | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and --output-tpm are required (the platform rejects creation without an explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING. Invoke the deployed model with: bl text chat --model <deployed_model>
- NOTE: --model-name is the model being deployed (e.g. `qwen3-8b-ft-...`). The create response also returns a `deployed_model` field — the deployment instance id (e.g. `qwen3-8b-5ecb5f068d79`). Use that id for inference (`bl text chat --model <deployed_model>`) and lifecycle commands (`deploy get/scale/pause/resume/delete --deployed-model <id>`).

#### Examples

```bash
bl deploy image create --model-name my-wan-ft --display-name my-wan
```

```bash
bl deploy image create --model-name my-wan-ft --display-name my-wan-mu --plan mu
```

```bash
bl deploy image create --model-name my-wan-ft --display-name my-wan --dry-run
```

### `bl deploy list`

| Field              | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Name**           | `deploy list`                                                  |
| **Description**    | List model deployments                                         |
| **Authentication** | API Key                                                        |
| **Usage**          | `bl deploy list [--page <n>] [--page-size <n>] [--status <s>]` |

#### Flags

| Flag               | Type   | Required | Description                                             |
| ------------------ | ------ | -------- | ------------------------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)                                |
| `--page-size <n>`  | number | no       | Results per page (default: 10, max 100)                 |
| `--status <s>`     | string | no       | Filter by status (PENDING / RUNNING / STOPPED / FAILED) |
| `--api-key <key>`  | string | no       | API key                                                 |
| `--base-url <url>` | string | no       | API base URL                                            |

#### Examples

```bash
bl deploy list
```

```bash
bl deploy list --status RUNNING
```

```bash
bl deploy list --page-size 20 --output json
```

### `bl deploy models`

| Field              | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy models`                                                                                       |
| **Description**    | List models available for deployment                                                                  |
| **Authentication** | API Key                                                                                               |
| **Usage**          | `bl deploy models [--page <n>] [--page-size <n>] [--catalog-version <v>] [--source <custom\|public>]` |

#### Flags

| Flag                    | Type   | Required | Description                                                             |
| ----------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `--page <n>`            | number | no       | Page number (default: 1)                                                |
| `--page-size <n>`       | number | no       | Results per page (default: 100)                                         |
| `--catalog-version <v>` | string | no       | Catalog version filter (default: v1.0; required for new catalog models) |
| `--source <s>`          | string | no       | Model source filter: custom (fine-tuned) \| base (catalog) \| public    |
| `--api-key <key>`       | string | no       | API key                                                                 |
| `--base-url <url>`      | string | no       | API base URL                                                            |

#### Examples

```bash
bl deploy models
```

```bash
bl deploy models --source base
```

```bash
bl deploy models --source custom --page-size 50
```

```bash
bl deploy models --catalog-version v1.0 --output json
```

### `bl deploy pause`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `deploy pause`                                              |
| **Description**    | Pause a running model deployment (stops billing for mu/ptu) |
| **Authentication** | Console                                                     |
| **Usage**          | `bl deploy pause --deployed-model <id> [--skip-precheck]`   |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--deployed-model <id>`        | string | yes      | Deployed model identifier (required)                     |
| `--skip-precheck`              | switch | no       | Skip the local RUNNING/PENDING status precheck           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- While paused, billing ceases for mu/ptu plans. Use `deploy resume` to bring it back online or `deploy delete` to remove.
- Precheck verifies status is RUNNING/PENDING before issuing the pause; pass --skip-precheck to bypass.

#### Examples

```bash
bl deploy pause --deployed-model dep-...
```

```bash
bl deploy pause --deployed-model dep-... --skip-precheck
```

```bash
bl deploy pause --deployed-model dep-... --dry-run
```

### `bl deploy resume`

| Field              | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| **Name**           | `deploy resume`                                               |
| **Description**    | Resume a paused model deployment (brings service back online) |
| **Authentication** | Console                                                       |
| **Usage**          | `bl deploy resume --deployed-model <id> [--skip-precheck]`    |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--deployed-model <id>`        | string | yes      | Deployed model identifier (required)                     |
| `--skip-precheck`              | switch | no       | Skip the local STOPPED status precheck                   |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Precheck verifies status is STOPPED before issuing the resume; pass --skip-precheck to bypass.
- For mu/ptu plans, billing resumes once the service is back online.

#### Examples

```bash
bl deploy resume --deployed-model dep-...
```

```bash
bl deploy resume --deployed-model dep-... --skip-precheck
```

```bash
bl deploy resume --deployed-model dep-... --dry-run
```

### `bl deploy scale`

| Field              | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Name**           | `deploy scale`                                                                              |
| **Description**    | Scale a deployment's capacity                                                               |
| **Authentication** | API Key                                                                                     |
| **Usage**          | `bl deploy scale --deployed-model <id> --capacity <n> [--input-tpm <n>] [--output-tpm <n>]` |

#### Flags

| Flag                    | Type   | Required | Description                                                      |
| ----------------------- | ------ | -------- | ---------------------------------------------------------------- |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required)                             |
| `--capacity <n>`        | number | no       | New capacity in plan units (must be a multiple of base_capacity) |
| `--input-tpm <n>`       | number | no       | PTU only — input tokens per minute                               |
| `--output-tpm <n>`      | number | no       | PTU only — output tokens per minute                              |
| `--api-key <key>`       | string | no       | API key                                                          |
| `--base-url <url>`      | string | no       | API base URL                                                     |

#### Examples

```bash
bl deploy scale --deployed-model qwen-plus-...-b6d61c71 --capacity 8
```

```bash
bl deploy scale --deployed-model dep-... --capacity 2
```

### `bl deploy text create`

| Field              | Value                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy text create`                                                                                                                                                                                                          |
| **Description**    | Create a text model deployment                                                                                                                                                                                                |
| **Authentication** | API Key                                                                                                                                                                                                                       |
| **Usage**          | `bl deploy text create --model-name <model_name> --display-name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                            | Type   | Required | Description                                                                     |
| ------------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model-name <model_name>`     | string | yes      | Model to deploy — fine-tuned output name or catalog model (required)            |
| `--display-name <display_name>` | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`                 | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`            | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`                | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`          | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`               | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`              | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>`     | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`               | string | no       | API key                                                                         |
| `--base-url <url>`              | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and --output-tpm are required (the platform rejects creation without an explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING. Invoke the deployed model with: bl text chat --model <deployed_model>
- NOTE: --model-name is the model being deployed (e.g. `qwen3-8b-ft-...`). The create response also returns a `deployed_model` field — the deployment instance id (e.g. `qwen3-8b-5ecb5f068d79`). Use that id for inference (`bl text chat --model <deployed_model>`) and lifecycle commands (`deploy get/scale/pause/resume/delete --deployed-model <id>`).

#### Examples

```bash
bl deploy text create --model-name my-qwen-sft --display-name my-sft-test
```

```bash
bl deploy text create --model-name qwen3.6-flash-2026-04-16 --display-name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000
```

```bash
bl deploy text create --model-name qwen3-8b --display-name my-qwen3-mu --plan mu
```

```bash
bl deploy text create --model-name qwen3-8b --display-name my-qwen3 --plan mu --deploy-spec MU1 --capacity 2
```

### `bl deploy update`

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Name**           | `deploy update`                                                              |
| **Description**    | Update a deployment's rate limits (rpm_limit / tpm_limit)                    |
| **Authentication** | API Key                                                                      |
| **Usage**          | `bl deploy update --deployed-model <id> [--rpm-limit <n>] [--tpm-limit <n>]` |

#### Flags

| Flag                    | Type   | Required | Description                          |
| ----------------------- | ------ | -------- | ------------------------------------ |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required) |
| `--rpm-limit <n>`       | number | no       | Requests per minute                  |
| `--tpm-limit <n>`       | number | no       | Tokens per minute                    |
| `--api-key <key>`       | string | no       | API key                              |
| `--base-url <url>`      | string | no       | API base URL                         |

#### Notes

- At least one of --rpm-limit / --tpm-limit must be provided.

#### Examples

```bash
bl deploy update --deployed-model dep-... --rpm-limit 1000
```

```bash
bl deploy update --deployed-model dep-... --rpm-limit 1000 --tpm-limit 200000
```
