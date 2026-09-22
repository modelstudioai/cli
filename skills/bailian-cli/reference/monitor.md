# `bl monitor` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                       | Authentication | Description                                                                                             |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `bl monitor delivery disable` | Console        | Disable monitor delivery for all models in the workspace                                                |
| `bl monitor delivery enable`  | Console        | Activate monitoring delivery: CMS SLR authorization, CMS service, and the dedicated Prometheus instance |
| `bl monitor delivery status`  | Console        | Show monitoring delivery (Prometheus instance) status                                                   |
| `bl monitor errors`           | Console        | Show failure breakdown by HTTP status code and error code                                               |
| `bl monitor metrics`          | Console        | Query time-series monitor metrics (RPM/TPM, latency percentiles, token usage)                           |
| `bl monitor models`           | Console        | List per-model / per-API-key call statistics with server-side sort and paging                           |
| `bl monitor overview`         | Console        | Show aggregated model call statistics (calls, failures, latency, token usage)                           |

## Command details

### `bl monitor delivery disable`

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Name**           | `monitor delivery disable`                               |
| **Description**    | Disable monitor delivery for all models in the workspace |
| **Authentication** | Console                                                  |
| **Usage**          | `bl monitor delivery disable [flags]`                    |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only the delivery switch is turned off; the CMS service and the Prometheus instance (with stored data) are kept. Re-enable with `monitor delivery enable`.

#### Examples

```bash
bl monitor delivery disable
```

```bash
bl monitor delivery disable --dry-run
```

```bash
bl monitor delivery disable --output json
```

### `bl monitor delivery enable`

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Name**           | `monitor delivery enable`                                                                               |
| **Description**    | Activate monitoring delivery: CMS SLR authorization, CMS service, and the dedicated Prometheus instance |
| **Authentication** | Console                                                                                                 |
| **Usage**          | `bl monitor delivery enable [--no-wait] [flags]`                                                        |

#### Flags

| Flag                           | Type   | Required | Description                                                         |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `--no-wait`                    | switch | no       | Submit the activation requests and return without waiting for Ready |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)            |
| `--console-site <site>`        | string | no       | Console site: domestic, international                               |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                               |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                            |

#### Notes

- Steps: 1) authorize the CMS service-linked role, 2) open the CMS service (async, polled via openStatus), 3) create the dedicated Prometheus instance (async, polled until Ready), 4) turn on the monitor delivery switch for all models. Server-side throttles duplicate submissions within 30s.

#### Examples

```bash
bl monitor delivery enable
```

```bash
bl monitor delivery enable --no-wait
```

```bash
bl monitor delivery enable --output json
```

### `bl monitor delivery status`

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Name**           | `monitor delivery status`                             |
| **Description**    | Show monitoring delivery (Prometheus instance) status |
| **Authentication** | Console                                               |
| **Usage**          | `bl monitor delivery status [flags]`                  |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl monitor delivery status
```

```bash
bl monitor delivery status --output json
```

### `bl monitor errors`

| Field              | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| **Name**           | `monitor errors`                                              |
| **Description**    | Show failure breakdown by HTTP status code and error code     |
| **Authentication** | Console                                                       |
| **Usage**          | `bl monitor errors [--model <model>] [--days <days>] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--days <days>`                | number | no       | Number of days to look back (default: 7)                 |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--api-key-id <id>`            | string | no       | API key ID(s), comma-separated                           |
| `--channel <channel>`          | string | no       | Call channel(s), comma-separated                         |
| `--source <source>`            | string | no       | Call source(s), comma-separated                          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only real-time (online) inference calls are counted in monitor statistics.

#### Examples

```bash
bl monitor errors
```

```bash
bl monitor errors --model qwen3.6-plus --days 1
```

```bash
bl monitor errors --model qwen3.6-plus --api-key-id 12345
```

```bash
bl monitor errors --output json
```

### `bl monitor metrics`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `monitor metrics`                                                             |
| **Description**    | Query time-series monitor metrics (RPM/TPM, latency percentiles, token usage) |
| **Authentication** | Console                                                                       |
| **Usage**          | `bl monitor metrics --metric <name>[,<name>...] [flags]`                      |

#### Flags

| Flag                                                                | Type   | Required | Description                                                                     |
| ------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--days <days>`                                                     | number | no       | Number of days to look back (default: 7)                                        |
| `--start-time <time>`                                               | string | no       | Range start (ISO date or ms epoch); overrides --days                            |
| `--end-time <time>`                                                 | string | no       | Range end (ISO date or ms epoch); default: now                                  |
| `--model <model>`                                                   | string | no       | Model name(s), comma-separated                                                  |
| `--api-key-id <id>`                                                 | string | no       | API key ID(s), comma-separated                                                  |
| `--channel <channel>`                                               | string | no       | Call channel(s), comma-separated                                                |
| `--source <source>`                                                 | string | no       | Call source(s), comma-separated                                                 |
| `--metric <name>[,<name>...]`                                       | string | yes      | Metric name(s), comma-separated; see notes for the full list                    |
| `--agg <sum\|avg\|max\|min\|p50\|p95\|p99\|cumsum\|cumavg\|sum_pm>` | string | no       | Aggregation method applied to every metric (default: sum)                       |
| `--step <seconds>`                                                  | number | no       | Data point interval in seconds: 60, 3600 or 86400 (default: auto by time range) |
| `--console-region <region>`                                         | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                        |
| `--console-site <site>`                                             | string | no       | Console site: domestic, international                                           |
| `--console-switch-agent <uid>`                                      | number | no       | Switch agent UID for delegated access                                           |
| `--workspace-id <id>`                                               | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                        |

#### Notes

- Metrics: model_call_count, model_call_duration, model_first_token_duration, model_generation_duration_per_token, model_call_failed_count, model_call_4xx_count, model_call_5xx_count, model_call_429_count, model_call_data_inspection_failed_count, model_total_amount, model_input_amount, model_output_amount, model_usage, model_tps_per_request, model_cache_hit_percent, model_ptu_token_quota, model_ptu_usage_quota, model_ptu_total_tokens, model_ptu_quota, model_ptu_utilization
- Only real-time (online) inference calls are counted in monitor statistics.

#### Examples

```bash
bl monitor metrics --metric model_call_count --days 1
```

```bash
bl monitor metrics --metric model_call_duration --agg p99 --model qwen3.6-plus --days 1
```

```bash
bl monitor metrics --metric model_call_count,model_call_failed_count --step 300 --start-time 2026-08-01
```

```bash
bl monitor metrics --metric model_total_amount --output json
```

### `bl monitor models`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `monitor models`                                                              |
| **Description**    | List per-model / per-API-key call statistics with server-side sort and paging |
| **Authentication** | Console                                                                       |
| **Usage**          | `bl monitor models [--model <model>] [--sort-by <field>] [flags]`             |

#### Flags

| Flag                                                                                                                                       | Type   | Required | Description                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--days <days>`                                                                                                                            | number | no       | Number of days to look back (default: 7)                 |
| `--start-time <time>`                                                                                                                      | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`                                                                                                                        | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--model <model>`                                                                                                                          | string | no       | Model name(s), comma-separated                           |
| `--api-key-id <id>`                                                                                                                        | string | no       | API key ID(s), comma-separated                           |
| `--channel <channel>`                                                                                                                      | string | no       | Call channel(s), comma-separated                         |
| `--source <source>`                                                                                                                        | string | no       | Call source(s), comma-separated                          |
| `--sort-by <modelAndWorkspaceId\|callCount\|callSuccessCount\|callFailedCount\|callFailedPercent\|avgCallDuration\|avgFirstTokenDuration>` | string | no       | Sort field (default: callCount)                          |
| `--order <ASC\|DESC>`                                                                                                                      | string | no       | Sort order (default: DESC)                               |
| `--max-results <n>`                                                                                                                        | number | no       | Rows per page, 1-50 (default: 10)                        |
| `--skip <n>`                                                                                                                               | number | no       | Rows to skip (default: 0)                                |
| `--next-token <token>`                                                                                                                     | string | no       | Pagination token from a previous response                |
| `--console-region <region>`                                                                                                                | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`                                                                                                                    | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`                                                                                                             | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`                                                                                                                      | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only real-time (online) inference calls are counted in monitor statistics.

#### Examples

```bash
bl monitor models
```

```bash
bl monitor models --model qwen3.6-plus --days 1
```

```bash
bl monitor models --sort-by callFailedPercent --order DESC
```

```bash
bl monitor models --max-results 50 --output json
```

### `bl monitor overview`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `monitor overview`                                                            |
| **Description**    | Show aggregated model call statistics (calls, failures, latency, token usage) |
| **Authentication** | Console                                                                       |
| **Usage**          | `bl monitor overview [--model <model>] [--days <days>] [flags]`               |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--days <days>`                | number | no       | Number of days to look back (default: 7)                 |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--api-key-id <id>`            | string | no       | API key ID(s), comma-separated                           |
| `--channel <channel>`          | string | no       | Call channel(s), comma-separated                         |
| `--source <source>`            | string | no       | Call source(s), comma-separated                          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only real-time (online) inference calls are counted in the overview.

#### Examples

```bash
bl monitor overview
```

```bash
bl monitor overview --days 30
```

```bash
bl monitor overview --model qwen3.6-plus
```

```bash
bl monitor overview --model qwen3.6-plus --api-key-id 12345 --days 7
```

```bash
bl monitor overview --output json
```
