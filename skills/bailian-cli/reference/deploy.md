# `bl deploy` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                  | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `bl deploy audio create` | Create an audio (TTS) model deployment                    |
| `bl deploy delete`       | Delete a model deployment (must be STOPPED or FAILED)     |
| `bl deploy get`          | Get details of a single model deployment                  |
| `bl deploy image create` | Create an image generation model deployment               |
| `bl deploy list`         | List model deployments                                    |
| `bl deploy models`       | List models available for deployment                      |
| `bl deploy scale`        | Scale a deployment's capacity                             |
| `bl deploy text create`  | Create a text model deployment                            |
| `bl deploy update`       | Update a deployment's rate limits (rpm_limit / tpm_limit) |

## Command details

### `bl deploy audio create`

| Field           | Value                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `deploy audio create`                                                                                                                                                                                             |
| **Description** | Create an audio (TTS) model deployment                                                                                                                                                                            |
| **Usage**       | `bl deploy audio create --model <model_name> --name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                     |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model <name>`            | string | yes      | Model name (catalog model or fine-tuned output) (required)                      |
| `--name <display_name>`     | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`             | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`        | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`            | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`      | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`           | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`          | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>` | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`           | string | no       | API key                                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-
- billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and
- --output-tpm are required (the platform rejects creation without an
- explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required.
- billing_method defaults to POST_PAY (only supported value); deploy_spec
- and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING.
- Invoke the deployed model with: bl text chat --model <deployed_model>
- WARNING: --model is overloaded across commands and refers to DIFFERENT
- values. `bl deploy <modality> create --model` takes the exported model_name
- (e.g. `qwen3-8b-ft-...`), but the create response also returns a
- `deployed_model` field (the deployment instance id, e.g.
- `qwen3-8b-5ecb5f068d79`). The inference call `bl text chat --model` must use
- the `deployed_model` from the create response — NOT the `model_name` you
- passed to `deploy <modality> create`. Do not reuse the value across the two
- commands.

#### Examples

```bash
bl deploy audio create --model my-cosyvoice-ft --name my-tts
```

```bash
bl deploy audio create --model my-cosyvoice-ft --name my-tts --deploy-spec dps-xxxx --capacity 1
```

```bash
bl deploy audio create --model my-cosyvoice-ft --name my-tts --dry-run
```

### `bl deploy delete`

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| **Name**        | `deploy delete`                                            |
| **Description** | Delete a model deployment (must be STOPPED or FAILED)      |
| **Usage**       | `bl deploy delete --deployed-model <id> [--skip-precheck]` |

#### Flags

| Flag                    | Type   | Required | Description                                   |
| ----------------------- | ------ | -------- | --------------------------------------------- |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required)          |
| `--skip-precheck`       | switch | no       | Skip the local STOPPED/FAILED status precheck |
| `--api-key <key>`       | string | no       | API key                                       |
| `--base-url <url>`      | string | no       | API base URL                                  |

#### Examples

```bash
bl deploy delete --deployed-model dep-...
```

```bash
bl deploy delete --deployed-model dep-... --dry-run
```

### `bl deploy get`

| Field           | Value                                    |
| --------------- | ---------------------------------------- |
| **Name**        | `deploy get`                             |
| **Description** | Get details of a single model deployment |
| **Usage**       | `bl deploy get --deployed-model <id>`    |

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

| Field           | Value                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `deploy image create`                                                                                                                                                                                             |
| **Description** | Create an image generation model deployment                                                                                                                                                                       |
| **Usage**       | `bl deploy image create --model <model_name> --name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                     |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model <name>`            | string | yes      | Model name (catalog model or fine-tuned output) (required)                      |
| `--name <display_name>`     | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`             | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`        | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`            | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`      | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`           | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`          | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>` | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`           | string | no       | API key                                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-
- billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and
- --output-tpm are required (the platform rejects creation without an
- explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required.
- billing_method defaults to POST_PAY (only supported value); deploy_spec
- and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING.
- Invoke the deployed model with: bl text chat --model <deployed_model>
- WARNING: --model is overloaded across commands and refers to DIFFERENT
- values. `bl deploy <modality> create --model` takes the exported model_name
- (e.g. `qwen3-8b-ft-...`), but the create response also returns a
- `deployed_model` field (the deployment instance id, e.g.
- `qwen3-8b-5ecb5f068d79`). The inference call `bl text chat --model` must use
- the `deployed_model` from the create response — NOT the `model_name` you
- passed to `deploy <modality> create`. Do not reuse the value across the two
- commands.

#### Examples

```bash
bl deploy image create --model my-wan-ft --name my-wan
```

```bash
bl deploy image create --model my-wan-ft --name my-wan-mu --plan mu
```

```bash
bl deploy image create --model my-wan-ft --name my-wan --dry-run
```

### `bl deploy list`

| Field           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| **Name**        | `deploy list`                                                  |
| **Description** | List model deployments                                         |
| **Usage**       | `bl deploy list [--page <n>] [--page-size <n>] [--status <s>]` |

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

| Field           | Value                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Name**        | `deploy models`                                                                                       |
| **Description** | List models available for deployment                                                                  |
| **Usage**       | `bl deploy models [--page <n>] [--page-size <n>] [--catalog-version <v>] [--source <custom\|public>]` |

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

### `bl deploy scale`

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Name**        | `deploy scale`                                                                              |
| **Description** | Scale a deployment's capacity                                                               |
| **Usage**       | `bl deploy scale --deployed-model <id> --capacity <n> [--input-tpm <n>] [--output-tpm <n>]` |

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

| Field           | Value                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `deploy text create`                                                                                                                                                                                             |
| **Description** | Create a text model deployment                                                                                                                                                                                   |
| **Usage**       | `bl deploy text create --model <model_name> --name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                     |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--model <name>`            | string | yes      | Model name (catalog model or fine-tuned output) (required)                      |
| `--name <display_name>`     | string | yes      | Console display name for the deployment (required)                              |
| `--plan <plan>`             | string | no       | Billing plan: lora (default, Token-billed) \| ptu (Token-billed) \| mu          |
| `--deploy-spec <id>`        | string | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                      |
| `--capacity <n>`            | number | no       | Resource units (plan=mu only; required by API; defaults to the template's unit) |
| `--billing-method <m>`      | string | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)     |
| `--input-tpm <n>`           | number | no       | PTU max input tokens/min (required for plan=ptu)                                |
| `--output-tpm <n>`          | number | no       | PTU max output tokens/min (required for plan=ptu)                               |
| `--thinking-output-tpm <n>` | number | no       | PTU max thinking-output tokens/min (optional, some models)                      |
| `--api-key <key>`           | string | no       | API key                                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-
- billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu (Token-billed, provisioned throughput), --input-tpm and
- --output-tpm are required (the platform rejects creation without an
- explicit ptu_capacity despite the doc listing defaults).
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required.
- billing_method defaults to POST_PAY (only supported value); deploy_spec
- and capacity are auto-picked from GET /deployments/models when omitted.
- Use `bl deploy models --source base` to inspect available templates.
- After creation, status starts at PENDING and transitions to RUNNING.
- Invoke the deployed model with: bl text chat --model <deployed_model>
- WARNING: --model is overloaded across commands and refers to DIFFERENT
- values. `bl deploy <modality> create --model` takes the exported model_name
- (e.g. `qwen3-8b-ft-...`), but the create response also returns a
- `deployed_model` field (the deployment instance id, e.g.
- `qwen3-8b-5ecb5f068d79`). The inference call `bl text chat --model` must use
- the `deployed_model` from the create response — NOT the `model_name` you
- passed to `deploy <modality> create`. Do not reuse the value across the two
- commands.

#### Examples

```bash
bl deploy text create --model my-qwen-sft --name my-sft-test
```

```bash
bl deploy text create --model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000
```

```bash
bl deploy text create --model qwen3-8b --name my-qwen3-mu --plan mu
```

```bash
bl deploy text create --model qwen3-8b --name my-qwen3 --plan mu --deploy-spec MU1 --capacity 2
```

### `bl deploy update`

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| **Name**        | `deploy update`                                                              |
| **Description** | Update a deployment's rate limits (rpm_limit / tpm_limit)                    |
| **Usage**       | `bl deploy update --deployed-model <id> [--rpm-limit <n>] [--tpm-limit <n>]` |

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
