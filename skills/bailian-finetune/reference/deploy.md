# `bl deploy` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                                 | Authentication | Description                                                                       |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `bl deploy audio create`                | API Key        | Create an audio (TTS) model deployment                                            |
| `bl deploy capacity auto-renew disable` | API Key        | Disable automatic renewal for one prepaid capacity instance                       |
| `bl deploy capacity auto-renew enable`  | API Key        | Enable automatic renewal for one prepaid capacity instance                        |
| `bl deploy capacity create`             | API Key        | Purchase an additional capacity instance for a ModelCode                          |
| `bl deploy capacity delete`             | API Key        | Release a capacity instance without deleting its ModelCode                        |
| `bl deploy capacity get`                | API Key        | Get a throughput reservation capacity instance                                    |
| `bl deploy capacity list`               | API Key        | List throughput reservation capacity instances                                    |
| `bl deploy capacity renew`              | API Key        | Renew a prepaid capacity instance, optionally changing capacity                   |
| `bl deploy capacity scale`              | API Key        | Scale the absolute capacity of one reservation instance                           |
| `bl deploy capacity unsubscribe`        | No Auth        | Build the Aliyun billing console unsubscribe link for a prepaid capacity instance |
| `bl deploy delete`                      | API Key        | Delete a model deployment (PTU must be STOPPED with all capacity released)        |
| `bl deploy get`                         | API Key        | Get details of a single model deployment                                          |
| `bl deploy image create`                | API Key        | Create an image generation model deployment                                       |
| `bl deploy instances`                   | Console        | List Console independent deployment services                                      |
| `bl deploy list`                        | API Key        | List model deployments and throughput reservations                                |
| `bl deploy models`                      | API Key        | List models available for deployment                                              |
| `bl deploy operation get`               | API Key        | Query a throughput reservation capacity operation once                            |
| `bl deploy operation wait`              | API Key        | Wait for a capacity operation and refresh confirmed capacity                      |
| `bl deploy overflow`                    | API Key        | Set the overflow strategy for a throughput reservation ModelCode                  |
| `bl deploy pause`                       | Console        | Pause a running model deployment (stops billing for mu/ptu)                       |
| `bl deploy resume`                      | Console        | Resume a paused model deployment (brings service back online)                     |
| `bl deploy router create`               | API Key        | Create a postpaid model router                                                    |
| `bl deploy router delete`               | API Key        | Delete a model router                                                             |
| `bl deploy router get`                  | API Key        | Get model router details                                                          |
| `bl deploy router list`                 | API Key        | List model routers                                                                |
| `bl deploy router update`               | API Key        | Update selected fields of a running model router configuration                    |
| `bl deploy router versions`             | API Key        | List available model-routing versions and candidates                              |
| `bl deploy scale`                       | API Key        | Scale a deployment's capacity                                                     |
| `bl deploy text create`                 | API Key        | Create a text model deployment                                                    |
| `bl deploy update`                      | API Key        | Update a deployment's rate limits (rpm_limit / tpm_limit)                         |

## Command details

### `bl deploy audio create`

| Field              | Value                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy audio create`                                                                                                                                                                                                                          |
| **Description**    | Create an audio (TTS) model deployment                                                                                                                                                                                                         |
| **Authentication** | API Key                                                                                                                                                                                                                                        |
| **Usage**          | `bl deploy audio create --model-name <model_name> [--display-name <display_name>] [--plan <plan>] [--charge-type <type>] [--service-tier <tier>] [--suffix <suffix>] [--pricing-cycle <Day\|Hour>] [--input-tpm <n> --output-tpm <n>] [flags]` |
| **Risk**           | `high`                                                                                                                                                                                                                                         |
| **Risk message**   | Creating a deployment purchases or provisions resources and may incur charges.                                                                                                                                                                 |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                     | Type    | Required | Description                                                                                     |
| ---------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `--model-name <model_name>`              | string  | yes      | Model to deploy — fine-tuned output name or catalog model (required)                            |
| `--display-name <display_name>`          | string  | no       | Console display name (optional for PTU; required for other plans)                               |
| `--plan <plan>`                          | string  | no       | Billing plan: lora (default, Token-billed) \| ptu (throughput reservation) \| mu                |
| `--deploy-spec <id>`                     | string  | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                                      |
| `--capacity <n>`                         | number  | no       | Resource units (plan=mu only; required by API; defaults to the template's unit)                 |
| `--billing-method <m>`                   | string  | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)                     |
| `--input-tpm <kTPM>`                     | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                   |
| `--output-tpm <kTPM>`                    | number  | no       | Absolute output capacity in kTPM                                                                |
| `--thinking-output-tpm <n>`              | number  | no       | Thinking-output capacity in kTPM (plan=ptu); only some models support it, validated server-side |
| `--charge-type <pre_paid\|post_paid>`    | string  | no       | PTU payment type (required for plan=ptu): pre_paid or post_paid                                 |
| `--service-tier <ptu_fast\|ptu_default>` | string  | no       | PTU service tier: ptu_fast (default) or ptu_default (prepaid only)                              |
| `--suffix <suffix>`                      | string  | no       | Optional PTU ModelCode suffix; generated by the service when omitted                            |
| `--pricing-cycle <Day\|Hour>`            | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window    |
| `--duration <n>`                         | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                       |
| `--auto-renewal <true\|false>`           | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                            |
| `--auto-renewal-duration <days>`         | number  | no       | Automatic renewal duration; required when enabled                                               |
| `--auto-renewal-cycle <cycle>`           | string  | no       | Optional supported renewal cycle, e.g. Day                                                      |
| `--wait`                                 | switch  | no       | Wait for the returned capacity operation and refresh capacity                                   |
| `--interval <seconds>`                   | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                         |
| `--poll-timeout <seconds>`               | number  | no       | Wait budget after submission (default: 600 seconds)                                             |
| `--yes`                                  | switch  | no       | Confirm this high-risk operation                                                                |
| `--api-key <key>`                        | string  | no       | API key                                                                                         |
| `--base-url <url>`                       | string  | no       | API base URL                                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu, --charge-type, --input-tpm and --output-tpm are required. Capacity is in kTPM (1 kTPM = 1000 tokens/minute). Separate thinking-output capacity (--thinking-output-tpm) is only supported by some models and is validated server-side. Prepaid requires --duration and explicit --auto-renewal true|false.
- The 8-hour off-peak window is prepaid ptu_default only: --pricing-cycle Hour with --duration 8, --auto-renewal false and an explicit --service-tier ptu_default. Service hours must fall within 22:00–08:00, so orders are accepted only between 22:00 and 24:00 Beijing time; model support is validated by the server.
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `deploy models --source base` to inspect available templates.
- PTU creation preserves the original JSON and operation_id even with --quiet. --wait only queries the returned operation; pending capacity is not effective capacity. Check the actual status before invoking the model.
- --model-name identifies the source model; the returned deployed_model is the invocation identifier (ModelCode). Use it for inference (`text chat --model <deployed_model>`) and deployment lifecycle commands.
- Initial ModelCode creation does not support --request-id or promise idempotency. A timeout is not proof of failure: check whether the deployment was created before trying again. This command never automatically resubmits creation.
- Use --dry-run to preview without requests. Pass --yes only after confirming the costs.

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

### `bl deploy capacity auto-renew disable`

| Field              | Value                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity auto-renew disable`                                                                                                     |
| **Description**    | Disable automatic renewal for one prepaid capacity instance                                                                              |
| **Authentication** | API Key                                                                                                                                  |
| **Usage**          | `bl deploy capacity auto-renew disable --deployed-model <code> --instance-id <id> --cycle <Day> --auto-renewal-duration <days> [--wait]` |
| **Risk**           | `high`                                                                                                                                   |
| **Risk message**   | Disabling automatic renewal stops recurring charges at expiry.                                                                           |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                             | Type   | Required | Description                                                                                                    |
| -------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`        | string | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--instance-id <id>`             | string | yes      | Capacity instance ID returned by the API                                                                       |
| `--request-id <uuid>`            | string | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                         | switch | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`           | number | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`       | number | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--cycle <Day>`                  | string | yes      | Automatic renewal cycle; the service currently accepts only Day (case-sensitive)                               |
| `--auto-renewal-duration <days>` | number | yes      | Days renewed at each automatic renewal, positive integer                                                       |
| `--yes`                          | switch | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                | string | no       | API key                                                                                                        |
| `--base-url <url>`               | string | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Prepaid instances only; refreshes can_enable_auto_renew / can_disable_auto_renew before writing. 8-hour off-peak instances do not support automatic renewal. The operation usually completes synchronously and returns SUCCEEDED.

#### Examples

```bash
bl deploy capacity auto-renew disable --deployed-model example-code --instance-id example-instance --cycle Day --auto-renewal-duration 30 --dry-run
```

### `bl deploy capacity auto-renew enable`

| Field              | Value                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity auto-renew enable`                                                                                                     |
| **Description**    | Enable automatic renewal for one prepaid capacity instance                                                                              |
| **Authentication** | API Key                                                                                                                                 |
| **Usage**          | `bl deploy capacity auto-renew enable --deployed-model <code> --instance-id <id> --cycle <Day> --auto-renewal-duration <days> [--wait]` |
| **Risk**           | `high`                                                                                                                                  |
| **Risk message**   | Enabling automatic renewal starts recurring charges until it is disabled again.                                                         |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                             | Type   | Required | Description                                                                                                    |
| -------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`        | string | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--instance-id <id>`             | string | yes      | Capacity instance ID returned by the API                                                                       |
| `--request-id <uuid>`            | string | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                         | switch | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`           | number | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`       | number | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--cycle <Day>`                  | string | yes      | Automatic renewal cycle; the service currently accepts only Day (case-sensitive)                               |
| `--auto-renewal-duration <days>` | number | yes      | Days renewed at each automatic renewal, positive integer                                                       |
| `--yes`                          | switch | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                | string | no       | API key                                                                                                        |
| `--base-url <url>`               | string | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Prepaid instances only; refreshes can_enable_auto_renew / can_disable_auto_renew before writing. 8-hour off-peak instances do not support automatic renewal. The operation usually completes synchronously and returns SUCCEEDED.

#### Examples

```bash
bl deploy capacity auto-renew enable --deployed-model example-code --instance-id example-instance --cycle Day --auto-renewal-duration 30 --dry-run
```

### `bl deploy capacity create`

| Field              | Value                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity create`                                                                                                                                                                                               |
| **Description**    | Purchase an additional capacity instance for a ModelCode                                                                                                                                                               |
| **Authentication** | API Key                                                                                                                                                                                                                |
| **Usage**          | `bl deploy capacity create --deployed-model <code> --billing-method <PRE_PAY\|POST_PAY> --input-tpm <kTPM> --output-tpm <kTPM> [--pricing-cycle <Day\|Hour>] [--duration <n>] [--auto-renewal <true\|false>] [--wait]` |
| **Risk**           | `high`                                                                                                                                                                                                                 |
| **Risk message**   | Purchases additional throughput capacity and may enable recurring charges.                                                                                                                                             |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                   | Type    | Required | Description                                                                                                    |
| -------------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`              | string  | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--input-tpm <kTPM>`                   | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                                  |
| `--output-tpm <kTPM>`                  | number  | no       | Absolute output capacity in kTPM                                                                               |
| `--pricing-cycle <Day\|Hour>`          | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window                   |
| `--duration <n>`                       | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                                      |
| `--auto-renewal <true\|false>`         | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                                           |
| `--auto-renewal-duration <days>`       | number  | no       | Automatic renewal duration; required when enabled                                                              |
| `--auto-renewal-cycle <cycle>`         | string  | no       | Optional supported renewal cycle, e.g. Day                                                                     |
| `--request-id <uuid>`                  | string  | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                               | switch  | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`                 | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`             | number  | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--billing-method <PRE_PAY\|POST_PAY>` | string  | yes      | Capacity instance billing method (case-sensitive)                                                              |
| `--yes`                                | switch  | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                      | string  | no       | API key                                                                                                        |
| `--base-url <url>`                     | string  | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Keeps the ModelCode, model and performance tier. Only one unreleased postpaid instance is allowed per ModelCode; the server validates purchase eligibility and slot limits.
- The 8-hour off-peak window is an additional prepaid purchase: --pricing-cycle Hour with --duration 8, --auto-renewal false and no automatic-renewal duration. The selling window (22:00–24:00 Beijing time) and model support are validated by the server; created instances cannot be scaled, renewed, auto-renewed, released or unsubscribed and expire automatically.

#### Examples

```bash
bl deploy capacity create --deployed-model example-code --billing-method POST_PAY --input-tpm 10000 --output-tpm 1000 --dry-run
```

```bash
bl deploy capacity create --deployed-model example-code --billing-method PRE_PAY --input-tpm 10000 --output-tpm 1000 --duration 30 --auto-renewal false --dry-run
```

```bash
bl deploy capacity create --deployed-model example-code --billing-method PRE_PAY --pricing-cycle Hour --duration 8 --auto-renewal false --input-tpm 10000 --output-tpm 1000 --dry-run
```

### `bl deploy capacity delete`

| Field              | Value                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity delete`                                                                                                                      |
| **Description**    | Release a capacity instance without deleting its ModelCode                                                                                    |
| **Authentication** | API Key                                                                                                                                       |
| **Usage**          | `bl deploy capacity delete --deployed-model <code> --instance-id <id> [--reason <text>] [--wait]`                                             |
| **Risk**           | `high`                                                                                                                                        |
| **Risk message**   | Releases serving capacity and may interrupt requests; this cannot be undone by this command. This is not a prepaid unsubscribe/refund action. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                       | Type   | Required | Description                                                                                                    |
| -------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`  | string | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--instance-id <id>`       | string | yes      | Capacity instance ID returned by the API                                                                       |
| `--request-id <uuid>`      | string | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                   | switch | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`     | number | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>` | number | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--reason <text>`          | string | no       | Optional release reason, sent as a query parameter                                                             |
| `--yes`                    | switch | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`          | string | no       | API key                                                                                                        |
| `--base-url <url>`         | string | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Active prepaid instances must be unsubscribed via `deploy capacity unsubscribe` (billing console link), even when can_delete=true. Failed prepaid instances may have no associated order; only the server can decide whether direct release is supported. Release is asynchronous; verify deleted=true, not merely STOPPED or zero capacity.

#### Examples

```bash
bl deploy capacity delete --deployed-model example-code --instance-id example-instance --dry-run
```

### `bl deploy capacity get`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `deploy capacity get`                                               |
| **Description**    | Get a throughput reservation capacity instance                      |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl deploy capacity get --deployed-model <code> --instance-id <id>` |

#### Flags

| Flag                      | Type   | Required | Description                              |
| ------------------------- | ------ | -------- | ---------------------------------------- |
| `--deployed-model <code>` | string | yes      | Deployed model identifier (ModelCode)    |
| `--instance-id <id>`      | string | yes      | Capacity instance ID returned by the API |
| `--api-key <key>`         | string | no       | API key                                  |
| `--base-url <url>`        | string | no       | API base URL                             |

#### Notes

- Read-only; released instances can also be queried. Preserves the API envelope, capacity fields, can_scale/can_renew/can_delete and deleted. Capacities are kTPM; the instance must belong to this ModelCode.

#### Examples

```bash
bl deploy capacity get --deployed-model example-model-code --instance-id example-capacity-instance
```

### `bl deploy capacity list`

| Field              | Value                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity list`                                                                                                                                                             |
| **Description**    | List throughput reservation capacity instances                                                                                                                                     |
| **Authentication** | API Key                                                                                                                                                                            |
| **Usage**          | `bl deploy capacity list --deployed-model <code> [--page <n>] [--page-size <n>] [--include-deleted <true\|false>] [--statuses <status,...>] [--charge-types <pre_paid,post_paid>]` |

#### Flags

| Flag                                  | Type    | Required | Description                                                 |
| ------------------------------------- | ------- | -------- | ----------------------------------------------------------- |
| `--deployed-model <code>`             | string  | yes      | Deployed model identifier (ModelCode)                       |
| `--page <n>`                          | number  | no       | Page number (default: 1)                                    |
| `--page-size <n>`                     | number  | no       | Results per page (1–100, default: 20)                       |
| `--include-deleted <true\|false>`     | boolean | no       | Include released instances (default: true)                  |
| `--statuses <status,...>`             | string  | no       | Instance statuses, comma-separated (not ModelCode statuses) |
| `--charge-types <pre_paid,post_paid>` | string  | no       | Charge types: pre_paid, post_paid; comma-separated          |
| `--api-key <key>`                     | string  | no       | API key                                                     |
| `--base-url <url>`                    | string  | no       | API base URL                                                |

#### Notes

- Preserves the API envelope and records/items/page/itemsPerPage/pageCount pagination. Capacities are kTPM; effective, configured and target capacities are distinct. STOPPED alone does not mean released: inspect deleted.

#### Examples

```bash
bl deploy capacity list --deployed-model example-model-code
```

```bash
bl deploy capacity list --deployed-model example-model-code --include-deleted false --statuses RUNNING,STOPPED
```

### `bl deploy capacity renew`

| Field              | Value                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity renew`                                                                                                                                                                           |
| **Description**    | Renew a prepaid capacity instance, optionally changing capacity                                                                                                                                   |
| **Authentication** | API Key                                                                                                                                                                                           |
| **Usage**          | `bl deploy capacity renew --deployed-model <code> --instance-id <id> --duration <n> --auto-renewal <true\|false> [--is-change <true\|false>] [--input-tpm <kTPM>] [--output-tpm <kTPM>] [--wait]` |
| **Risk**           | `high`                                                                                                                                                                                            |
| **Risk message**   | Renews a paid capacity instance and may enable automatic recurring renewal.                                                                                                                       |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                             | Type    | Required | Description                                                                                                    |
| -------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`        | string  | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--instance-id <id>`             | string  | yes      | Capacity instance ID returned by the API                                                                       |
| `--input-tpm <kTPM>`             | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                                  |
| `--output-tpm <kTPM>`            | number  | no       | Absolute output capacity in kTPM                                                                               |
| `--pricing-cycle <Day\|Hour>`    | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window                   |
| `--duration <n>`                 | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                                      |
| `--auto-renewal <true\|false>`   | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                                           |
| `--auto-renewal-duration <days>` | number  | no       | Automatic renewal duration; required when enabled                                                              |
| `--auto-renewal-cycle <cycle>`   | string  | no       | Optional supported renewal cycle, e.g. Day                                                                     |
| `--request-id <uuid>`            | string  | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                         | switch  | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`           | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`       | number  | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--is-change <true\|false>`      | boolean | no       | Change capacity during renewal (default: false)                                                                |
| `--yes`                          | switch  | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                | string  | no       | API key                                                                                                        |
| `--base-url <url>`               | string  | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Prepaid only; refreshes can_renew. Different capacity requires --is-change true; an unchanged capacity may be sent with false. No order_type is accepted by this endpoint.

#### Examples

```bash
bl deploy capacity renew --deployed-model example-code --instance-id example-instance --duration 30 --auto-renewal false --dry-run
```

```bash
bl deploy capacity renew --deployed-model example-code --instance-id example-instance --duration 30 --auto-renewal true --auto-renewal-duration 30 --dry-run
```

### `bl deploy capacity scale`

| Field              | Value                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity scale`                                                                                                                                   |
| **Description**    | Scale the absolute capacity of one reservation instance                                                                                                   |
| **Authentication** | API Key                                                                                                                                                   |
| **Usage**          | `bl deploy capacity scale --deployed-model <code> --instance-id <id> --input-tpm <kTPM> --output-tpm <kTPM> [--order-type <UPGRADE\|DOWNGRADE>] [--wait]` |
| **Risk**           | `high`                                                                                                                                                    |
| **Risk message**   | Changes purchased capacity, may incur charges and can reduce serving capacity to zero.                                                                    |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                | Type    | Required | Description                                                                                                    |
| ----------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <code>`           | string  | yes      | Deployed model identifier (ModelCode)                                                                          |
| `--instance-id <id>`                | string  | yes      | Capacity instance ID returned by the API                                                                       |
| `--input-tpm <kTPM>`                | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                                  |
| `--output-tpm <kTPM>`               | number  | no       | Absolute output capacity in kTPM                                                                               |
| `--pricing-cycle <Day\|Hour>`       | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window                   |
| `--duration <n>`                    | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                                      |
| `--auto-renewal <true\|false>`      | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                                           |
| `--auto-renewal-duration <days>`    | number  | no       | Automatic renewal duration; required when enabled                                                              |
| `--auto-renewal-cycle <cycle>`      | string  | no       | Optional supported renewal cycle, e.g. Day                                                                     |
| `--order-type <UPGRADE\|DOWNGRADE>` | string  | no       | Optional order direction; otherwise the server decides                                                         |
| `--request-id <uuid>`               | string  | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                            | switch  | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`              | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`          | number  | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--yes`                             | switch  | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                   | string  | no       | API key                                                                                                        |
| `--base-url <url>`                  | string  | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- Refreshes can_scale before writing. Omitted prepaid settings remain omitted, so the server can reuse saved information. Postpaid instances cannot receive prepaid settings.

#### Examples

```bash
bl deploy capacity scale --deployed-model example-code --instance-id example-instance --input-tpm 20000 --output-tpm 2000 --dry-run
```

```bash
bl deploy capacity scale --deployed-model example-code --instance-id example-instance --input-tpm 0 --output-tpm 0 --dry-run
```

### `bl deploy capacity unsubscribe`

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| **Name**           | `deploy capacity unsubscribe`                                                     |
| **Description**    | Build the Aliyun billing console unsubscribe link for a prepaid capacity instance |
| **Authentication** | No Auth                                                                           |
| **Usage**          | `bl deploy capacity unsubscribe --instance-id <id>`                               |

#### Flags

| Flag                 | Type   | Required | Description                              |
| -------------------- | ------ | -------- | ---------------------------------------- |
| `--instance-id <id>` | string | yes      | Capacity instance ID returned by the API |

#### Notes

- No API is called and nothing is unsubscribed by this command; it only builds the refund page link. Open the link and finish the unsubscribe flow in the billing console with the account that placed the order.
- Only prepaid instances are unsubscribed this way; postpaid instances are released with `deploy capacity delete`. The ID is the capacity instance ID (see `deploy capacity list` / `get`), not the ModelCode. Unsubscription may interrupt serving and is irreversible; refund rules are decided by the billing console.

#### Examples

```bash
bl deploy capacity unsubscribe --instance-id example-instance
```

### `bl deploy delete`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `deploy delete`                                                               |
| **Description**    | Delete a model deployment (PTU must be STOPPED with all capacity released)    |
| **Authentication** | API Key                                                                       |
| **Usage**          | `bl deploy delete --deployed-model <id> [--skip-precheck]`                    |
| **Risk**           | `high`                                                                        |
| **Risk message**   | This permanently deletes the specified model deployment and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                    | Type   | Required | Description                                                                |
| ----------------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `--deployed-model <id>` | string | yes      | Deployed model identifier (required)                                       |
| `--skip-precheck`       | switch | no       | Skip local checks only; the service still validates deletion prerequisites |
| `--yes`                 | switch | no       | Confirm this high-risk operation                                           |
| `--api-key <key>`       | string | no       | API key                                                                    |
| `--base-url <url>`      | string | no       | API base URL                                                               |

#### Notes

- PTU deletion requires STOPPED, all capacity instances released, and no processing or queued capacity operations. Pausing or scaling to zero does not release an instance; prepaid capacity may require unsubscription.
- Local checks inspect the deployment, unreleased instances and any returned operation_id. There is no public queued-operation list API, so these checks cannot confirm all operations are finished; the service makes the final decision. --skip-precheck only omits local checks, never service validation or resource release requirements.

#### Examples

```bash
bl deploy delete --deployed-model dep-... --dry-run
```

```bash
# Only after explicit user confirmation:
bl deploy delete --deployed-model dep-... --yes  # Execute only after confirming deletion
```

### `bl deploy get`

| Field              | Value                                    |
| ------------------ | ---------------------------------------- |
| **Name**           | `deploy get`                             |
| **Description**    | Get details of a single model deployment |
| **Authentication** | API Key                                  |
| **Usage**          | `bl deploy get --deployed-model <id>`    |

#### Flags

| Flag                      | Type   | Required | Description                           |
| ------------------------- | ------ | -------- | ------------------------------------- |
| `--deployed-model <code>` | string | yes      | Deployed model identifier (ModelCode) |
| `--api-key <key>`         | string | no       | API key                               |
| `--base-url <url>`        | string | no       | API base URL                          |

#### Notes

- Preserves deployment fields including ptu_capacity (aggregate effective kTPM), ptu_service_tier, overflow_strategy and pre_paid_info. For mixed billing or multiple instances, query capacity list/get for each instance's status, expiry and capacity; ModelCode status is not instance status.

#### Examples

```bash
bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71
```

```bash
bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71 --output json
```

### `bl deploy image create`

| Field              | Value                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy image create`                                                                                                                                                                                                                          |
| **Description**    | Create an image generation model deployment                                                                                                                                                                                                    |
| **Authentication** | API Key                                                                                                                                                                                                                                        |
| **Usage**          | `bl deploy image create --model-name <model_name> [--display-name <display_name>] [--plan <plan>] [--charge-type <type>] [--service-tier <tier>] [--suffix <suffix>] [--pricing-cycle <Day\|Hour>] [--input-tpm <n> --output-tpm <n>] [flags]` |
| **Risk**           | `high`                                                                                                                                                                                                                                         |
| **Risk message**   | Creating a deployment purchases or provisions resources and may incur charges.                                                                                                                                                                 |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                     | Type    | Required | Description                                                                                     |
| ---------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `--model-name <model_name>`              | string  | yes      | Model to deploy — fine-tuned output name or catalog model (required)                            |
| `--display-name <display_name>`          | string  | no       | Console display name (optional for PTU; required for other plans)                               |
| `--plan <plan>`                          | string  | no       | Billing plan: lora (default, Token-billed) \| ptu (throughput reservation) \| mu                |
| `--deploy-spec <id>`                     | string  | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                                      |
| `--capacity <n>`                         | number  | no       | Resource units (plan=mu only; required by API; defaults to the template's unit)                 |
| `--billing-method <m>`                   | string  | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)                     |
| `--input-tpm <kTPM>`                     | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                   |
| `--output-tpm <kTPM>`                    | number  | no       | Absolute output capacity in kTPM                                                                |
| `--thinking-output-tpm <n>`              | number  | no       | Thinking-output capacity in kTPM (plan=ptu); only some models support it, validated server-side |
| `--charge-type <pre_paid\|post_paid>`    | string  | no       | PTU payment type (required for plan=ptu): pre_paid or post_paid                                 |
| `--service-tier <ptu_fast\|ptu_default>` | string  | no       | PTU service tier: ptu_fast (default) or ptu_default (prepaid only)                              |
| `--suffix <suffix>`                      | string  | no       | Optional PTU ModelCode suffix; generated by the service when omitted                            |
| `--pricing-cycle <Day\|Hour>`            | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window    |
| `--duration <n>`                         | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                       |
| `--auto-renewal <true\|false>`           | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                            |
| `--auto-renewal-duration <days>`         | number  | no       | Automatic renewal duration; required when enabled                                               |
| `--auto-renewal-cycle <cycle>`           | string  | no       | Optional supported renewal cycle, e.g. Day                                                      |
| `--wait`                                 | switch  | no       | Wait for the returned capacity operation and refresh capacity                                   |
| `--interval <seconds>`                   | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                         |
| `--poll-timeout <seconds>`               | number  | no       | Wait budget after submission (default: 600 seconds)                                             |
| `--yes`                                  | switch  | no       | Confirm this high-risk operation                                                                |
| `--api-key <key>`                        | string  | no       | API key                                                                                         |
| `--base-url <url>`                       | string  | no       | API base URL                                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu, --charge-type, --input-tpm and --output-tpm are required. Capacity is in kTPM (1 kTPM = 1000 tokens/minute). Separate thinking-output capacity (--thinking-output-tpm) is only supported by some models and is validated server-side. Prepaid requires --duration and explicit --auto-renewal true|false.
- The 8-hour off-peak window is prepaid ptu_default only: --pricing-cycle Hour with --duration 8, --auto-renewal false and an explicit --service-tier ptu_default. Service hours must fall within 22:00–08:00, so orders are accepted only between 22:00 and 24:00 Beijing time; model support is validated by the server.
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `deploy models --source base` to inspect available templates.
- PTU creation preserves the original JSON and operation_id even with --quiet. --wait only queries the returned operation; pending capacity is not effective capacity. Check the actual status before invoking the model.
- --model-name identifies the source model; the returned deployed_model is the invocation identifier (ModelCode). Use it for inference (`text chat --model <deployed_model>`) and deployment lifecycle commands.
- Initial ModelCode creation does not support --request-id or promise idempotency. A timeout is not proof of failure: check whether the deployment was created before trying again. This command never automatically resubmits creation.
- Use --dry-run to preview without requests. Pass --yes only after confirming the costs.

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

### `bl deploy instances`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy instances`                                                                                   |
| **Description**    | List Console independent deployment services                                                         |
| **Authentication** | Console                                                                                              |
| **Usage**          | `bl deploy instances [--page <n>] [--page-size <n>] [--keyword <keyword>] [--model-service-id <id>]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--page <n>`                   | number | no       | Page number (default: 1)                                 |
| `--page-size <n>`              | number | no       | Results per page (default: 10)                           |
| `--keyword <keyword>`          | string | no       | Server-side name keyword filter                          |
| `--model-service-id <id>`      | string | no       | Server-side model service ID filter                      |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Lists Console independent deployment services, not capacity instances or replicas. Fetches only the requested page; records is the list and items is the server's total count. Preserves all business-response fields without deriving callable status.
- --keyword and --model-service-id may be supplied together and are forwarded to the API without local filtering. Successful reading does not prove inference or pause permission. This command does not change the API-key deployment list contract.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl deploy instances
```

```bash
bl deploy instances --page 2 --page-size 20
```

```bash
bl deploy instances --keyword example --model-service-id example-service-id
```

### `bl deploy list`

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Name**           | `deploy list`                                                                       |
| **Description**    | List model deployments and throughput reservations                                  |
| **Authentication** | API Key                                                                             |
| **Usage**          | `bl deploy list [--page <n>] [--page-size <n>] [--plan <plan>] [--status <status>]` |

#### Flags

| Flag                | Type   | Required | Description                                                                        |
| ------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--page <n>`        | number | no       | Page number (default: 1)                                                           |
| `--page-size <n>`   | number | no       | Results per page (default: 10, max 100)                                            |
| `--plan <plan>`     | string | no       | Server-side plan filter; use ptu for throughput reservations                       |
| `--status <status>` | string | no       | Filter only the fetched page locally by ModelCode status; total remains unfiltered |
| `--api-key <key>`   | string | no       | API key                                                                            |
| `--base-url <url>`  | string | no       | API base URL                                                                       |

#### Notes

- The deployment list API supports page_no/page_size/plan, not status. --status filters only the requested page, not the entire account; an empty filtered page does not mean there are no matches on later pages. total is the server total before local filtering; local_filter reports the current-page match count. PTU capacities are kTPM.

#### Examples

```bash
bl deploy list
```

```bash
bl deploy list --plan ptu
```

```bash
bl deploy list --plan ptu --status RUNNING --page-size 100
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

### `bl deploy operation get`

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| **Name**           | `deploy operation get`                                                |
| **Description**    | Query a throughput reservation capacity operation once                |
| **Authentication** | API Key                                                               |
| **Usage**          | `bl deploy operation get --deployed-model <code> --operation-id <id>` |

#### Flags

| Flag                      | Type   | Required | Description                                       |
| ------------------------- | ------ | -------- | ------------------------------------------------- |
| `--deployed-model <code>` | string | yes      | Deployed model identifier (ModelCode)             |
| `--operation-id <id>`     | string | yes      | Capacity operation ID returned by a write request |
| `--api-key <key>`         | string | no       | API key                                           |
| `--base-url <url>`        | string | no       | API base URL                                      |

#### Notes

- Preserves the API envelope, including FAILED and its error fields; a successful GET returns exit code 0 regardless of operation status. Use operation wait to wait for success or fail with a non-zero exit. Use the actual returned operation ID; do not construct one.

#### Examples

```bash
bl deploy operation get --deployed-model example-model-code --operation-id 100001
```

### `bl deploy operation wait`

| Field              | Value                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `deploy operation wait`                                                                                                  |
| **Description**    | Wait for a capacity operation and refresh confirmed capacity                                                             |
| **Authentication** | API Key                                                                                                                  |
| **Usage**          | `bl deploy operation wait --deployed-model <code> --operation-id <id> [--interval <seconds>] [--poll-timeout <seconds>]` |

#### Flags

| Flag                       | Type   | Required | Description                                                                        |
| -------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--deployed-model <code>`  | string | yes      | Deployed model identifier (ModelCode)                                              |
| `--operation-id <id>`      | string | yes      | Capacity operation ID returned by a write request                                  |
| `--interval <seconds>`     | number | no       | Initial poll interval (1–3600 seconds, default: 2); doubles up to max(initial, 30) |
| `--poll-timeout <seconds>` | number | no       | Total wait budget including requests and refresh (default: 600 seconds)            |
| `--api-key <key>`          | string | no       | API key                                                                            |
| `--base-url <url>`         | string | no       | API base URL                                                                       |

#### Notes

- Read-only GET polling: PROCESSING continues, FAILED exits 1 with the server error, SUCCEEDED refreshes the instance (when an ID is returned) and deployment. Output preserves the operation envelope and adds instance/deployment response envelopes. Missing or unknown status fails rather than assuming success.
- --timeout limits each HTTP request; --poll-timeout bounds the entire wait (exit 5 on expiry). Ctrl-C stops local waiting, not the remote operation. No write is retried; use the original operation ID after a timeout or interruption.

#### Examples

```bash
bl deploy operation wait --deployed-model example-model-code --operation-id 100001
```

```bash
bl deploy operation wait --deployed-model example-model-code --operation-id 100001 --interval 2 --poll-timeout 600
```

### `bl deploy overflow`

| Field              | Value                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `deploy overflow`                                                                                                  |
| **Description**    | Set the overflow strategy for a throughput reservation ModelCode                                                   |
| **Authentication** | API Key                                                                                                            |
| **Usage**          | `bl deploy overflow --deployed-model <code> --strategy <enable\|disable>`                                          |
| **Risk**           | `high`                                                                                                             |
| **Risk message**   | Enabling overflow incurs pay-as-you-go charges beyond reserved capacity; disabling it rate-limits excess requests. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                                            |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------- |
| `--deployed-model <code>`      | string | yes      | Deployed model identifier (ModelCode)                                  |
| `--strategy <enable\|disable>` | string | yes      | Allow pay-as-you-go overflow or restrict requests to reserved capacity |
| `--yes`                        | switch | no       | Confirm this high-risk operation                                       |
| `--api-key <key>`              | string | no       | API key                                                                |
| `--base-url <url>`             | string | no       | API base URL                                                           |

#### Notes

- Applies to the whole ModelCode, not one capacity instance. Sends one update then one GET to confirm the strategy. Never retries the update automatically; a read-back failure does not mean the change was not applied.

#### Examples

```bash
bl deploy overflow --deployed-model example-code --strategy enable --dry-run
```

```bash
bl deploy overflow --deployed-model example-code --strategy disable --dry-run
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

### `bl deploy router create`

| Field              | Value                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy router create`                                                                                                              |
| **Description**    | Create a postpaid model router                                                                                                      |
| **Authentication** | API Key                                                                                                                             |
| **Usage**          | `bl deploy router create --name <name> --route-version <version> --strategy <EFFECT_FIRST\|COST_FIRST> --candidates <model-id,...>` |
| **Risk**           | `high`                                                                                                                              |
| **Risk message**   | Creating the model router starts it in RUNNING state immediately; postpaid routing may incur charges.                               |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                    | Type   | Required | Description                                            |
| --------------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--name <name>`                         | string | yes      | Router name (1–64 letters, digits or hyphens)          |
| `--route-version <version>`             | string | yes      | Model-routing version returned by the versions command |
| `--strategy <EFFECT_FIRST\|COST_FIRST>` | string | yes      | Routing optimization strategy                          |
| `--candidates <model-id,...>`           | string | yes      | Candidate model IDs, comma-separated                   |
| `--yes`                                 | switch | no       | Confirm this high-risk operation                       |
| `--api-key <key>`                       | string | no       | API key                                                |
| `--base-url <url>`                      | string | no       | API base URL                                           |

#### Notes

- Creation uses plan=mr and charge_type=post_paid. The router becomes RUNNING immediately and may incur postpaid charges; preview with --dry-run before confirming.

#### Examples

```bash
bl deploy router create --name my-router --route-version v1 --strategy EFFECT_FIRST --candidates qwen-plus,qwen-turbo --dry-run
```

### `bl deploy router delete`

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **Name**           | `deploy router delete`                                                    |
| **Description**    | Delete a model router                                                     |
| **Authentication** | API Key                                                                   |
| **Usage**          | `bl deploy router delete --deployed-model <id>`                           |
| **Risk**           | `high`                                                                    |
| **Risk message**   | This permanently deletes the specified model router and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                      | Type   | Required | Description                           |
| ------------------------- | ------ | -------- | ------------------------------------- |
| `--deployed-model <code>` | string | yes      | Deployed model identifier (ModelCode) |
| `--yes`                   | switch | no       | Confirm this high-risk operation      |
| `--api-key <key>`         | string | no       | API key                               |
| `--base-url <url>`        | string | no       | API base URL                          |

#### Notes

- Deletion is irreversible. The command verifies plan=mr first; a RUNNING model router does not need to be stopped before deletion.

#### Examples

```bash
bl deploy router delete --deployed-model router-example --dry-run
```

```bash
# Only after explicit user confirmation:
bl deploy router delete --deployed-model router-example --yes  # Execute only after confirmation
```

### `bl deploy router get`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `deploy router get`                          |
| **Description**    | Get model router details                     |
| **Authentication** | API Key                                      |
| **Usage**          | `bl deploy router get --deployed-model <id>` |

#### Flags

| Flag                      | Type   | Required | Description                           |
| ------------------------- | ------ | -------- | ------------------------------------- |
| `--deployed-model <code>` | string | yes      | Deployed model identifier (ModelCode) |
| `--api-key <key>`         | string | no       | API key                               |
| `--base-url <url>`        | string | no       | API base URL                          |

#### Notes

- The deployment is verified as plan=mr before its details are returned.

#### Examples

```bash
bl deploy router get --deployed-model router-example
```

```bash
bl deploy router get --deployed-model router-example --output json
```

### `bl deploy router list`

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Name**           | `deploy router list`                                   |
| **Description**    | List model routers                                     |
| **Authentication** | API Key                                                |
| **Usage**          | `bl deploy router list [--page <n>] [--page-size <n>]` |

#### Flags

| Flag               | Type   | Required | Description                           |
| ------------------ | ------ | -------- | ------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)              |
| `--page-size <n>`  | number | no       | Results per page (1–100, default: 10) |
| `--api-key <key>`  | string | no       | API key                               |
| `--base-url <url>` | string | no       | API base URL                          |

#### Notes

- This command always requests plan=mr and does not expose a plan override.

#### Examples

```bash
bl deploy router list
```

```bash
bl deploy router list --page 2 --page-size 20
```

### `bl deploy router update`

| Field              | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy router update`                                                                                                                            |
| **Description**    | Update selected fields of a running model router configuration                                                                                    |
| **Authentication** | API Key                                                                                                                                           |
| **Usage**          | `bl deploy router update --deployed-model <id> [--route-version <version>] [--strategy <EFFECT_FIRST\|COST_FIRST>] [--candidates <model-id,...>]` |

#### Flags

| Flag                                    | Type   | Required | Description                                            |
| --------------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--deployed-model <code>`               | string | yes      | Deployed model identifier (ModelCode)                  |
| `--route-version <version>`             | string | no       | Model-routing version returned by the versions command |
| `--strategy <EFFECT_FIRST\|COST_FIRST>` | string | no       | Routing optimization strategy                          |
| `--candidates <model-id,...>`           | string | no       | Candidate model IDs, comma-separated                   |
| `--api-key <key>`                       | string | no       | API key                                                |
| `--base-url <url>`                      | string | no       | API base URL                                           |

#### Notes

- Provide at least one routing field. The CLI reads the current router and preserves fields you do not provide; --candidates replaces the entire candidate list. Only RUNNING model routers can be updated.
- A dry-run with all three routing fields stays offline. A partial dry-run requires credentials and reads the current router, but never submits an update.

#### Examples

```bash
bl deploy router update --deployed-model router-example --strategy COST_FIRST --dry-run
```

```bash
bl deploy router update --deployed-model router-example --route-version v1 --strategy COST_FIRST --candidates qwen-plus,qwen-turbo --dry-run
```

### `bl deploy router versions`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `deploy router versions`                                   |
| **Description**    | List available model-routing versions and candidates       |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl deploy router versions [--page <n>] [--page-size <n>]` |

#### Flags

| Flag               | Type   | Required | Description                            |
| ------------------ | ------ | -------- | -------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)               |
| `--page-size <n>`  | number | no       | Results per page (1–1000, default: 50) |
| `--api-key <key>`  | string | no       | API key                                |
| `--base-url <url>` | string | no       | API base URL                           |

#### Notes

- Use the returned route_model_version, supported_strategies and supported_candidate_model_ids when creating or fully replacing a router configuration.

#### Examples

```bash
bl deploy router versions
```

```bash
bl deploy router versions --page 1 --page-size 100
```

### `bl deploy scale`

| Field              | Value                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy scale`                                                                                                            |
| **Description**    | Scale a deployment's capacity                                                                                             |
| **Authentication** | API Key                                                                                                                   |
| **Usage**          | `bl deploy scale --deployed-model <id> (--capacity <n> \| --input-tpm <n> --output-tpm <n>) [--instance-id <id>] [flags]` |
| **Risk**           | `high`                                                                                                                    |
| **Risk message**   | Scaling changes purchased capacity and may incur charges or reduce serving capacity.                                      |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                | Type    | Required | Description                                                                                                    |
| ----------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `--deployed-model <id>`             | string  | yes      | Deployed model identifier (required)                                                                           |
| `--capacity <n>`                    | number  | no       | MU target capacity: non-negative integer in plan units; must satisfy base_capacity                             |
| `--input-tpm <kTPM>`                | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                                  |
| `--output-tpm <kTPM>`               | number  | no       | Absolute output capacity in kTPM                                                                               |
| `--instance-id <id>`                | string  | no       | PTU capacity instance ID; required when multiple unreleased instances exist                                    |
| `--pricing-cycle <Day\|Hour>`       | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window                   |
| `--duration <n>`                    | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                                      |
| `--auto-renewal <true\|false>`      | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                                           |
| `--auto-renewal-duration <days>`    | number  | no       | Automatic renewal duration; required when enabled                                                              |
| `--auto-renewal-cycle <cycle>`      | string  | no       | Optional supported renewal cycle, e.g. Day                                                                     |
| `--request-id <uuid>`               | string  | no       | Request identifier; generated if omitted. Reuse with identical parameters only for the same capacity operation |
| `--wait`                            | switch  | no       | Wait for the returned capacity operation and refresh capacity                                                  |
| `--interval <seconds>`              | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                                        |
| `--poll-timeout <seconds>`          | number  | no       | Wait budget after submission (default: 600 seconds)                                                            |
| `--order-type <UPGRADE\|DOWNGRADE>` | string  | no       | Optional order direction; otherwise the server decides                                                         |
| `--yes`                             | switch  | no       | Confirm this high-risk operation                                                                               |
| `--api-key <key>`                   | string  | no       | API key                                                                                                        |
| `--base-url <url>`                  | string  | no       | API base URL                                                                                                   |

#### Notes

- Use --dry-run before confirming with --yes. A write is submitted once, never automatically retried. HTTP 200 is not operation success: inspect operation_status or pass --wait. After interruption or timeout, query the saved ModelCode/operation ID before considering another write.
- Capacities are absolute kTPM for one instance, not increments or ModelCode totals. Zero capacity is not release. Model-specific steps, limits and purchase periods are validated by the server. Automatic renewal is configured at purchase/renewal and changed via `deploy capacity auto-renew enable` / `disable`.
- PTU input/output values are the selected instance's absolute target capacity in kTPM (1 kTPM = 1000 tokens/minute), not deltas or deployment totals. Both zero is valid and does not release the instance. PTU options cannot be combined with --capacity.
- Without --instance-id, execution must confirm exactly one unreleased instance and recheck can_scale. Dry-run does not resolve an instance or validate its billing type. Pass --yes only after confirming the costs and target.

#### Examples

```bash
bl deploy scale --deployed-model dep-... --capacity 8 --dry-run
```

```bash
bl deploy scale --deployed-model dep-... --instance-id instance-... --input-tpm 20000 --output-tpm 2000 --order-type UPGRADE --dry-run
```

### `bl deploy text create`

| Field              | Value                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `deploy text create`                                                                                                                                                                                                                          |
| **Description**    | Create a text model deployment                                                                                                                                                                                                                |
| **Authentication** | API Key                                                                                                                                                                                                                                       |
| **Usage**          | `bl deploy text create --model-name <model_name> [--display-name <display_name>] [--plan <plan>] [--charge-type <type>] [--service-tier <tier>] [--suffix <suffix>] [--pricing-cycle <Day\|Hour>] [--input-tpm <n> --output-tpm <n>] [flags]` |
| **Risk**           | `high`                                                                                                                                                                                                                                        |
| **Risk message**   | Creating a deployment purchases or provisions resources and may incur charges.                                                                                                                                                                |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                                     | Type    | Required | Description                                                                                     |
| ---------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `--model-name <model_name>`              | string  | yes      | Model to deploy — fine-tuned output name or catalog model (required)                            |
| `--display-name <display_name>`          | string  | no       | Console display name (optional for PTU; required for other plans)                               |
| `--plan <plan>`                          | string  | no       | Billing plan: lora (default, Token-billed) \| ptu (throughput reservation) \| mu                |
| `--deploy-spec <id>`                     | string  | no       | Deploy spec (only used by plan=mu; auto-picked if omitted)                                      |
| `--capacity <n>`                         | number  | no       | Resource units (plan=mu only; required by API; defaults to the template's unit)                 |
| `--billing-method <m>`                   | string  | no       | Billing method (plan=mu only; default "POST_PAY", the only supported value)                     |
| `--input-tpm <kTPM>`                     | number  | no       | Absolute input capacity in kTPM (1 kTPM = 1000 tokens/minute)                                   |
| `--output-tpm <kTPM>`                    | number  | no       | Absolute output capacity in kTPM                                                                |
| `--thinking-output-tpm <n>`              | number  | no       | Thinking-output capacity in kTPM (plan=ptu); only some models support it, validated server-side |
| `--charge-type <pre_paid\|post_paid>`    | string  | no       | PTU payment type (required for plan=ptu): pre_paid or post_paid                                 |
| `--service-tier <ptu_fast\|ptu_default>` | string  | no       | PTU service tier: ptu_fast (default) or ptu_default (prepaid only)                              |
| `--suffix <suffix>`                      | string  | no       | Optional PTU ModelCode suffix; generated by the service when omitted                            |
| `--pricing-cycle <Day\|Hour>`            | string  | no       | Prepaid pricing cycle (case-sensitive): Day (default) or Hour for the 8-hour off-peak window    |
| `--duration <n>`                         | number  | no       | Prepaid duration: positive integer days for Day, exactly 8 hours for Hour                       |
| `--auto-renewal <true\|false>`           | boolean | no       | Explicitly enable or disable automatic renewal for prepaid purchases                            |
| `--auto-renewal-duration <days>`         | number  | no       | Automatic renewal duration; required when enabled                                               |
| `--auto-renewal-cycle <cycle>`           | string  | no       | Optional supported renewal cycle, e.g. Day                                                      |
| `--wait`                                 | switch  | no       | Wait for the returned capacity operation and refresh capacity                                   |
| `--interval <seconds>`                   | number  | no       | Initial wait poll interval (1–3600, default: 2 seconds)                                         |
| `--poll-timeout <seconds>`               | number  | no       | Wait budget after submission (default: 600 seconds)                                             |
| `--yes`                                  | switch  | no       | Confirm this high-risk operation                                                                |
| `--api-key <key>`                        | string  | no       | API key                                                                                         |
| `--base-url <url>`                       | string  | no       | API base URL                                                                                    |

#### Notes

- Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.
- For plan=ptu, --charge-type, --input-tpm and --output-tpm are required. Capacity is in kTPM (1 kTPM = 1000 tokens/minute). Separate thinking-output capacity (--thinking-output-tpm) is only supported by some models and is validated server-side. Prepaid requires --duration and explicit --auto-renewal true|false.
- The 8-hour off-peak window is prepaid ptu_default only: --pricing-cycle Hour with --duration 8, --auto-renewal false and an explicit --service-tier ptu_default. Service hours must fall within 22:00–08:00, so orders are accepted only between 22:00 and 24:00 Beijing time; model support is validated by the server.
- For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.
- Use `deploy models --source base` to inspect available templates.
- PTU creation preserves the original JSON and operation_id even with --quiet. --wait only queries the returned operation; pending capacity is not effective capacity. Check the actual status before invoking the model.
- --model-name identifies the source model; the returned deployed_model is the invocation identifier (ModelCode). Use it for inference (`text chat --model <deployed_model>`) and deployment lifecycle commands.
- Initial ModelCode creation does not support --request-id or promise idempotency. A timeout is not proof of failure: check whether the deployment was created before trying again. This command never automatically resubmits creation.
- Use --dry-run to preview without requests. Pass --yes only after confirming the costs.

#### Examples

```bash
bl deploy text create --model-name my-qwen-sft --display-name my-sft-test
```

```bash
bl deploy text create --model-name qwen3.6-flash-2026-04-16 --plan ptu --charge-type post_paid --input-tpm 10000 --output-tpm 1000 --dry-run
```

```bash
bl deploy text create --model-name qwen3.6-flash-2026-04-16 --plan ptu --charge-type pre_paid --service-tier ptu_default --input-tpm 10000 --output-tpm 1000 --duration 30 --auto-renewal false --dry-run
```

```bash
bl deploy text create --model-name qwen3.6-flash-2026-04-16 --plan ptu --charge-type pre_paid --service-tier ptu_default --pricing-cycle Hour --duration 8 --auto-renewal false --input-tpm 10000 --output-tpm 1000 --dry-run
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
