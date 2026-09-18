# `bl log` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Authentication | Description                                                                                                        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `bl log audit count`       | Console        | Count model audit logs in a time range (useful before exporting)                                                   |
| `bl log audit disable`     | Console        | Disable audit log delivery for all models in the workspace                                                         |
| `bl log audit enable`      | Console        | Enable audit log delivery to SLS (SLR authorization → SLS instance → log switch)                                   |
| `bl log audit get`         | Console        | Show a single audit log entry with its raw origin record                                                           |
| `bl log audit list`        | Console        | Query model audit logs (call metadata; request/response content is not recorded)                                   |
| `bl log inference count`   | Console        | Count model inference logs in a time range (useful before exporting)                                               |
| `bl log inference disable` | Console        | Disable inference log delivery for all models in the workspace                                                     |
| `bl log inference enable`  | Console        | Enable inference log delivery to SLS (SLR authorization → SLS instance → log switch)                               |
| `bl log inference get`     | Console        | Show a single inference log entry with full request/response content                                               |
| `bl log inference list`    | Console        | Query model inference logs (requires inference log delivery; use `log inference get` for request/response content) |
| `bl log status`            | Console        | Show model log delivery status (SLS authorization, audit / inference service and switches)                         |
| `bl log trace get`         | Console        | Show a single call trace with its span tree                                                                        |
| `bl log trace list`        | Console        | List call traces for a model or app                                                                                |
| `bl log trace stats`       | Console        | Show per-resource trace statistics (calls, tokens, latency)                                                        |

## Command details

### `bl log audit count`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `log audit count`                                                |
| **Description**    | Count model audit logs in a time range (useful before exporting) |
| **Authentication** | Console                                                          |
| **Usage**          | `bl log audit count [--model <model>] [--hours <n>] [flags]`     |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--api-key-id <id>`            | string | no       | API key ID(s), comma-separated                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl log audit count
```

```bash
bl log audit count --model qwen3.6-plus --hours 24
```

```bash
bl log audit count --output json
```

### `bl log audit disable`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `log audit disable`                                        |
| **Description**    | Disable audit log delivery for all models in the workspace |
| **Authentication** | Console                                                    |
| **Usage**          | `bl log audit disable [flags]`                             |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Refused while the inference log is still enabled — disable the inference log first (the console enforces the same rule).

#### Examples

```bash
bl log audit disable
```

```bash
bl log audit disable --dry-run
```

```bash
bl log audit disable --output json
```

### `bl log audit enable`

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Name**           | `log audit enable`                                                               |
| **Description**    | Enable audit log delivery to SLS (SLR authorization → SLS instance → log switch) |
| **Authentication** | Console                                                                          |
| **Usage**          | `bl log audit enable [--no-wait] [flags]`                                        |

#### Flags

| Flag                           | Type   | Required | Description                                                         |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `--no-wait`                    | switch | no       | Return right after submitting, without waiting for the SLS instance |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)            |
| `--console-site <site>`        | string | no       | Console site: domestic, international                               |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                               |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                            |

#### Notes

- Steps: 1) authorize the SLS service-linked role, 2) initialize the SLS store instance (async), 3) turn on audit log delivery for all models in the workspace.
- The audit log records call metadata only and is required before enabling the inference log.

#### Examples

```bash
bl log audit enable
```

```bash
bl log audit enable --no-wait
```

```bash
bl log audit enable --output json
```

### `bl log audit get`

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Name**           | `log audit get`                                          |
| **Description**    | Show a single audit log entry with its raw origin record |
| **Authentication** | Console                                                  |
| **Usage**          | `bl log audit get --request-id <id> [flags]`             |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--request-id <id>`            | string | yes      | Model request ID (from `log audit list`)                 |
| `--model <model>`              | string | no       | Model name (narrows the search)                          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Audit entries carry call metadata plus the raw audit record; request/response content lives in the inference log (`log inference get`).

#### Examples

```bash
bl log audit get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
bl log audit get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --hours 24
```

```bash
bl log audit get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --output json
```

### `bl log audit list`

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Name**           | `log audit list`                                                                 |
| **Description**    | Query model audit logs (call metadata; request/response content is not recorded) |
| **Authentication** | Console                                                                          |
| **Usage**          | `bl log audit list [--model <model>] [--hours <n>] [flags]`                      |

#### Flags

| Flag                              | Type   | Required | Description                                                                    |
| --------------------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `--hours <hours>`                 | number | no       | Hours to look back (default: 1)                                                |
| `--start-time <time>`             | string | no       | Range start (ISO date or ms epoch); overrides --days                           |
| `--end-time <time>`               | string | no       | Range end (ISO date or ms epoch); default: now                                 |
| `--model <model>`                 | string | no       | Model name(s), comma-separated                                                 |
| `--api-key-id <id>`               | string | no       | API key ID(s), comma-separated                                                 |
| `--channel <channel>`             | string | no       | Call channel(s), comma-separated                                               |
| `--source <source>`               | string | no       | Call source(s), comma-separated                                                |
| `--call-source <Online\|Offline>` | string | no       | Inference type: Online, Offline                                                |
| `--request-id <id>`               | string | no       | Exact model request ID                                                         |
| `--status-code <type>`            | string | no       | Status filter(s), comma-separated: SUCCESS, CLIENT_ERROR, SERVER_ERROR, CANCEL |
| `--max-results <n>`               | number | no       | Rows per page (default: 20)                                                    |
| `--skip <n>`                      | number | no       | Rows to skip (default: 0)                                                      |
| `--next-token <token>`            | string | no       | Pagination token from a previous response                                      |
| `--console-region <region>`       | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                       |
| `--console-site <site>`           | string | no       | Console site: domestic, international                                          |
| `--console-switch-agent <uid>`    | number | no       | Switch agent UID for delegated access                                          |
| `--workspace-id <id>`             | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                       |

#### Notes

- Audit logs carry call metadata only. For full request/response content, enable and query the inference log (`log inference list` / `log inference get`).

#### Examples

```bash
bl log audit list
```

```bash
bl log audit list --model qwen3.6-plus --hours 3
```

```bash
bl log audit list --status-code SERVER_ERROR,CLIENT_ERROR
```

```bash
bl log audit list --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
bl log audit list --output json
```

### `bl log inference count`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `log inference count`                                                |
| **Description**    | Count model inference logs in a time range (useful before exporting) |
| **Authentication** | Console                                                              |
| **Usage**          | `bl log inference count [--model <model>] [--hours <n>] [flags]`     |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--model <model>`              | string | no       | Model name(s), comma-separated                           |
| `--api-key-id <id>`            | string | no       | API key ID(s), comma-separated                           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only calls made while inference log delivery was enabled are counted.

#### Examples

```bash
bl log inference count
```

```bash
bl log inference count --model qwen3.6-plus --hours 24
```

```bash
bl log inference count --output json
```

### `bl log inference disable`

| Field              | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Name**           | `log inference disable`                                        |
| **Description**    | Disable inference log delivery for all models in the workspace |
| **Authentication** | Console                                                        |
| **Usage**          | `bl log inference disable [flags]`                             |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Only the inference log (request/response content) is disabled; the audit log keeps its own switch (`log audit disable`).

#### Examples

```bash
bl log inference disable
```

```bash
bl log inference disable --dry-run
```

```bash
bl log inference disable --output json
```

### `bl log inference enable`

| Field              | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Name**           | `log inference enable`                                                               |
| **Description**    | Enable inference log delivery to SLS (SLR authorization → SLS instance → log switch) |
| **Authentication** | Console                                                                              |
| **Usage**          | `bl log inference enable [--no-wait] [flags]`                                        |

#### Flags

| Flag                           | Type   | Required | Description                                                         |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `--no-wait`                    | switch | no       | Return right after submitting, without waiting for the SLS instance |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)            |
| `--console-site <site>`        | string | no       | Console site: domestic, international                               |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                               |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                            |

#### Notes

- Steps: 1) authorize the SLS service-linked role, 2) initialize the SLS store instance (async), 3) turn on inference log delivery for all models in the workspace.
- Requires the audit log to be enabled first (`log audit enable`) — the console enforces the same rule.

#### Examples

```bash
bl log inference enable
```

```bash
bl log inference enable --no-wait
```

```bash
bl log inference enable --output json
```

### `bl log inference get`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `log inference get`                                                  |
| **Description**    | Show a single inference log entry with full request/response content |
| **Authentication** | Console                                                              |
| **Usage**          | `bl log inference get --request-id <id> [flags]`                     |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--request-id <id>`            | string | yes      | Model request ID (from `log inference list`)             |
| `--model <model>`              | string | no       | Model name (narrows the search)                          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- The origin content is fetched back by request ID from the inference log store, so inference log delivery must have been enabled when the call happened.

#### Examples

```bash
bl log inference get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
bl log inference get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --hours 24
```

```bash
bl log inference get --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx --output json
```

### `bl log inference list`

| Field              | Value                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `log inference list`                                                                                               |
| **Description**    | Query model inference logs (requires inference log delivery; use `log inference get` for request/response content) |
| **Authentication** | Console                                                                                                            |
| **Usage**          | `bl log inference list [--model <model>] [--hours <n>] [flags]`                                                    |

#### Flags

| Flag                              | Type   | Required | Description                                                                    |
| --------------------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `--hours <hours>`                 | number | no       | Hours to look back (default: 1)                                                |
| `--start-time <time>`             | string | no       | Range start (ISO date or ms epoch); overrides --days                           |
| `--end-time <time>`               | string | no       | Range end (ISO date or ms epoch); default: now                                 |
| `--model <model>`                 | string | no       | Model name (the inference log API accepts a single model)                      |
| `--api-key-id <id>`               | string | no       | API key ID (the inference log API accepts a single ID)                         |
| `--call-source <Online\|Offline>` | string | no       | Inference type: Online, Offline                                                |
| `--request-id <id>`               | string | no       | Exact model request ID                                                         |
| `--status-code <type>`            | string | no       | Status filter(s), comma-separated: SUCCESS, CLIENT_ERROR, SERVER_ERROR, CANCEL |
| `--max-results <n>`               | number | no       | Rows per page (default: 20)                                                    |
| `--skip <n>`                      | number | no       | Rows to skip (default: 0)                                                      |
| `--console-region <region>`       | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                       |
| `--console-site <site>`           | string | no       | Console site: domestic, international                                          |
| `--console-switch-agent <uid>`    | number | no       | Switch agent UID for delegated access                                          |
| `--workspace-id <id>`             | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                       |

#### Notes

- Requires inference log delivery (`log inference enable`), which itself requires the audit log. Entries here mirror the audit trail; full request/response content is fetched per request via `log inference get`.

#### Examples

```bash
bl log inference list
```

```bash
bl log inference list --model qwen3.6-plus --hours 3
```

```bash
bl log inference list --status-code SERVER_ERROR,CLIENT_ERROR
```

```bash
bl log inference list --request-id 6f6b2f1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
bl log inference list --output json
```

### `bl log status`

| Field              | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Name**           | `log status`                                                                               |
| **Description**    | Show model log delivery status (SLS authorization, audit / inference service and switches) |
| **Authentication** | Console                                                                                    |
| **Usage**          | `bl log status [flags]`                                                                    |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Both log kinds have independent switches; the inference log additionally requires the audit log to stay on.

#### Examples

```bash
bl log status
```

```bash
bl log status --output json
```

### `bl log trace get`

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| **Name**           | `log trace get`                             |
| **Description**    | Show a single call trace with its span tree |
| **Authentication** | Console                                     |
| **Usage**          | `bl log trace get --trace-id <id> [flags]`  |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--trace-id <id>`              | string | yes      | Trace ID (from `log trace list`)                         |
| `--resource-id <id>`           | string | no       | Model name or app ID (narrows the search)                |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl log trace get --trace-id 0a1b2c3d4e5f --hours 24
```

```bash
bl log trace get --trace-id 0a1b2c3d4e5f --resource-id qwen3.6-plus
```

```bash
bl log trace get --trace-id 0a1b2c3d4e5f --output json
```

### `bl log trace list`

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Name**           | `log trace list`                               |
| **Description**    | List call traces for a model or app            |
| **Authentication** | Console                                        |
| **Usage**          | `bl log trace list --resource-id <id> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                          |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days     |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now           |
| `--resource-id <id>`           | string | yes      | Model name or app ID to query traces for                 |
| `--resource-type <model\|app>` | string | no       | Resource type: model, app (default: model)               |
| `--max-results <n>`            | number | no       | Rows per page (default: 20)                              |
| `--skip <n>`                   | number | no       | Rows to skip (default: 0)                                |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl log trace list --resource-id qwen3.6-plus
```

```bash
bl log trace list --resource-id qwen3.6-plus --hours 24 --max-results 50
```

```bash
bl log trace list --resource-id 123456 --resource-type app --output json
```

### `bl log trace stats`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `log trace stats`                                           |
| **Description**    | Show per-resource trace statistics (calls, tokens, latency) |
| **Authentication** | Console                                                     |
| **Usage**          | `bl log trace stats [--resource-id <id>] [flags]`           |

#### Flags

| Flag                           | Type   | Required | Description                                               |
| ------------------------------ | ------ | -------- | --------------------------------------------------------- |
| `--hours <hours>`              | number | no       | Hours to look back (default: 1)                           |
| `--start-time <time>`          | string | no       | Range start (ISO date or ms epoch); overrides --days      |
| `--end-time <time>`            | string | no       | Range end (ISO date or ms epoch); default: now            |
| `--resource-id <id>`           | string | no       | Model name(s) or app ID(s), comma-separated; omit for all |
| `--resource-type <model\|app>` | string | no       | Resource type: model, app (default: model)                |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)  |
| `--console-site <site>`        | string | no       | Console site: domestic, international                     |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                     |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                  |

#### Examples

```bash
bl log trace stats
```

```bash
bl log trace stats --resource-id qwen3.6-plus --hours 24
```

```bash
bl log trace stats --resource-type app --output json
```
