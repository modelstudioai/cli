# `bl parsex` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Authentication | Description                                            |
| -------------------------- | -------------- | ------------------------------------------------------ |
| `bl parsex extract result` | API Key        | Query ParseX extraction status, fields and citations   |
| `bl parsex extract submit` | API Key        | Submit ParseX structured field extraction              |
| `bl parsex parse result`   | API Key        | Query ParseX parsing status, results or a result slice |
| `bl parsex parse submit`   | API Key        | Submit a ParseX document or media parsing task         |

## Command details

### `bl parsex extract result`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `parsex extract result`                                     |
| **Description**    | Query ParseX extraction status, fields and citations        |
| **Authentication** | API Key                                                     |
| **Usage**          | `bl parsex extract result --biz-id <id> [--follow] [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                                                              |
| -------------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `--biz-id <id>`            | string | yes      | biz_id returned by the matching submit command                           |
| `--follow`                 | switch | no       | Poll until success or failed (Ctrl-C stops local polling only)           |
| `--interval <seconds>`     | number | no       | Polling interval, 1–3600 seconds (default: 2; --follow only)             |
| `--poll-timeout <seconds>` | number | no       | Total polling deadline, 1–86400 seconds (default: 600; --follow only)    |
| `--oss-config-file <path>` | string | no       | JSON file with OSS credentials; submit also requires bucket and endpoint |
| `--workspace-id <id>`      | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--api-key <key>`          | string | no       | API key                                                                  |
| `--base-url <url>`         | string | no       | API base URL                                                             |

#### Notes

- Uses a workspace-specific ParseX API and an ordinary API key. Set --workspace-id, BAILIAN_WORKSPACE_ID or workspace_id in the profile. --base-url overrides the origin (the CLI discards its path); cn-beijing.pre-maas.aliyuncs.com workspace hosts use pre-parse-x. Service availability depends on the workspace and rollout.
- Single queries preserve the complete API response and exit 0 even for a failed job. --follow emits one terminal response on stdout, progress on stderr; failed exits 1, deadline 5, Ctrl-C 130. Resume using the same biz_id; stopping locally does not cancel the task. ResultNotReady is polled again only with --follow. --timeout controls each HTTP request; --poll-timeout covers the whole polling loop.

#### Examples

```bash
bl parsex extract result --biz-id biz-example --workspace-id ws-example
```

```bash
bl parsex extract result --biz-id biz-example --follow --poll-timeout 600 --output json
```

### `bl parsex extract submit`

| Field              | Value                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `parsex extract submit`                                                                                                                                   |
| **Description**    | Submit ParseX structured field extraction                                                                                                                 |
| **Authentication** | API Key                                                                                                                                                   |
| **Usage**          | `bl parsex extract submit (--file-url <url> \| --parsed-file-biz-id <id>) (--schema-file <path> \| --processing-file <path> \| --config-id <id>) [flags]` |

#### Flags

| Flag                                | Type    | Required | Description                                                              |
| ----------------------------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `--file-url <url>`                  | string  | no       | Accessible source file URL                                               |
| `--file-name <name>`                | string  | no       | File name (alternative to --file-name-extension)                         |
| `--file-name-extension <extension>` | string  | no       | File extension, e.g. pdf                                                 |
| `--config-id <id>`                  | string  | no       | Saved ParseX configuration ID                                            |
| `--processing-file <path>`          | string  | no       | JSON object for the API processing field                                 |
| `--oss-config-file <path>`          | string  | no       | JSON file with OSS credentials; submit also requires bucket and endpoint |
| `--parsed-file-biz-id <id>`         | string  | no       | Completed parsing task to reuse (alternative to --file-url)              |
| `--schema-file <path>`              | string  | no       | JSON Schema object file (alternative to --processing-file)               |
| `--user-prompt <text>`              | string  | no       | Extraction instruction (with --schema-file)                              |
| `--citation-required <boolean>`     | boolean | no       | Include citations (with --schema-file; service default: true)            |
| `--allow-inference <boolean>`       | boolean | no       | Allow inference (with --schema-file; service default: false)             |
| `--workspace-id <id>`               | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--api-key <key>`                   | string  | no       | API key                                                                  |
| `--base-url <url>`                  | string  | no       | API base URL                                                             |

#### Notes

- Uses a workspace-specific ParseX API and an ordinary API key. Set --workspace-id, BAILIAN_WORKSPACE_ID or workspace_id in the profile. --base-url overrides the origin (the CLI discards its path); cn-beijing.pre-maas.aliyuncs.com workspace hosts use pre-parse-x. Service availability depends on the workspace and rollout.
- Returns data.biz_id without waiting; query the matching result command with --follow. Input must be an accessible HTTP(S) URL (including a signed OSS URL); local file upload is not part of this API. Inline processing takes precedence over config-id. Dry-run makes no business requests and redacts OSS credentials and URL query strings.
- schema.json example: {"type":"object","properties":{"title":{"type":"string"}}}. The schema is sent as an object, not a JSON string. Extraction does not support audio/video; reused parse results must still be retained by the service.

#### Examples

```bash
bl parsex extract submit --file-url "https://example.com/contract.pdf" --schema-file schema.json --workspace-id ws-example
```

```bash
bl parsex extract submit --parsed-file-biz-id parse-example --schema-file schema.json --citation-required true --allow-inference false
```

```bash
bl parsex extract submit --file-url "https://example.com/contract.pdf" --config-id config-example --output json
```

### `bl parsex parse result`

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Name**           | `parsex parse result`                                     |
| **Description**    | Query ParseX parsing status, results or a result slice    |
| **Authentication** | API Key                                                   |
| **Usage**          | `bl parsex parse result --biz-id <id> [--follow] [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                                                              |
| -------------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `--biz-id <id>`            | string | yes      | biz_id returned by the matching submit command                           |
| `--follow`                 | switch | no       | Poll until success or failed (Ctrl-C stops local polling only)           |
| `--interval <seconds>`     | number | no       | Polling interval, 1–3600 seconds (default: 2; --follow only)             |
| `--poll-timeout <seconds>` | number | no       | Total polling deadline, 1–86400 seconds (default: 600; --follow only)    |
| `--oss-config-file <path>` | string | no       | JSON file with OSS credentials; submit also requires bucket and endpoint |
| `--workspace-id <id>`      | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--step-start <n>`         | number | no       | Slice offset for layouts or media segments (service default: 0)          |
| `--step-size <n>`          | number | no       | Slice size (service default: 0)                                          |
| `--api-key <key>`          | string | no       | API key                                                                  |
| `--base-url <url>`         | string | no       | API base URL                                                             |

#### Notes

- Uses a workspace-specific ParseX API and an ordinary API key. Set --workspace-id, BAILIAN_WORKSPACE_ID or workspace_id in the profile. --base-url overrides the origin (the CLI discards its path); cn-beijing.pre-maas.aliyuncs.com workspace hosts use pre-parse-x. Service availability depends on the workspace and rollout.
- Single queries preserve the complete API response and exit 0 even for a failed job. --follow emits one terminal response on stdout, progress on stderr; failed exits 1, deadline 5, Ctrl-C 130. Resume using the same biz_id; stopping locally does not cancel the task. ResultNotReady is polled again only with --follow. --timeout controls each HTTP request; --poll-timeout covers the whole polling loop.
- --follow waits for task completion for the requested slice; it does not collect all slices. Advance --step-start explicitly to retrieve further layouts/segments. Output file URLs may appear only after all results have been retrieved.

#### Examples

```bash
bl parsex parse result --biz-id biz-example --workspace-id ws-example
```

```bash
bl parsex parse result --biz-id biz-example --follow --poll-timeout 600 --output json
```

### `bl parsex parse submit`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `parsex parse submit`                                                   |
| **Description**    | Submit a ParseX document or media parsing task                          |
| **Authentication** | API Key                                                                 |
| **Usage**          | `bl parsex parse submit --file-url <url> [--workspace-id <id>] [flags]` |

#### Flags

| Flag                                     | Type   | Required | Description                                                              |
| ---------------------------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `--file-url <url>`                       | string | yes      | Accessible source file URL                                               |
| `--file-name <name>`                     | string | no       | File name (alternative to --file-name-extension)                         |
| `--file-name-extension <extension>`      | string | no       | File extension, e.g. pdf                                                 |
| `--config-id <id>`                       | string | no       | Saved ParseX configuration ID                                            |
| `--processing-file <path>`               | string | no       | JSON object for the API processing field                                 |
| `--oss-config-file <path>`               | string | no       | JSON file with OSS credentials; submit also requires bucket and endpoint |
| `--output-file-format <markdown>`        | array  | no       | Result file format (markdown)                                            |
| `--layout-table-format <markdown\|html>` | string | no       | Table format inside Markdown results                                     |
| `--workspace-id <id>`                    | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--api-key <key>`                        | string | no       | API key                                                                  |
| `--base-url <url>`                       | string | no       | API base URL                                                             |

#### Notes

- Uses a workspace-specific ParseX API and an ordinary API key. Set --workspace-id, BAILIAN_WORKSPACE_ID or workspace_id in the profile. --base-url overrides the origin (the CLI discards its path); cn-beijing.pre-maas.aliyuncs.com workspace hosts use pre-parse-x. Service availability depends on the workspace and rollout.
- Returns data.biz_id without waiting; query the matching result command with --follow. Input must be an accessible HTTP(S) URL (including a signed OSS URL); local file upload is not part of this API. Inline processing takes precedence over config-id. Dry-run makes no business requests and redacts OSS credentials and URL query strings.
- processing.json example: {"doc_processing_config":{"page_index":"1-10","layout_position":true}}. For media use media_processing_config (diarization, synopsis and frame_extraction).

#### Examples

```bash
bl parsex parse submit --file-url "https://example.com/document.pdf" --file-name document.pdf --workspace-id ws-example
```

```bash
bl parsex parse submit --file-url "https://example.com/document.pdf" --processing-file processing.json --output-file-format markdown --output json
```

```bash
bl parsex parse submit --file-url "https://example.com/video.mp4" --config-id config-example --dry-run
```
