# `bl dataset` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command               | Authentication | Description                                                        |
| --------------------- | -------------- | ------------------------------------------------------------------ |
| `bl dataset delete`   | API Key        | Delete a dataset file by ID                                        |
| `bl dataset get`      | API Key        | Get details of a single dataset file                               |
| `bl dataset groups`   | Console        | List Console dataset groups                                        |
| `bl dataset list`     | API Key        | List uploaded dataset files                                        |
| `bl dataset upload`   | API Key        | Upload a dataset file (.jsonl or .zip) to Bailian                  |
| `bl dataset validate` | No Auth        | Locally validate a dataset file (.jsonl or .zip) without uploading |
| `bl dataset version`  | Console        | List Console dataset versions by group or get one version by ID    |

## Command details

### `bl dataset delete`

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **Name**           | `dataset delete`                                                          |
| **Description**    | Delete a dataset file by ID                                               |
| **Authentication** | API Key                                                                   |
| **Usage**          | `bl dataset delete --file-id <id>`                                        |
| **Risk**           | `high`                                                                    |
| **Risk message**   | This permanently deletes the specified dataset file and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                      |
| ------------------ | ------ | -------- | -------------------------------- |
| `--file-id <id>`   | string | yes      | Dataset file ID (required)       |
| `--yes`            | switch | no       | Confirm this high-risk operation |
| `--api-key <key>`  | string | no       | API key                          |
| `--base-url <url>` | string | no       | API base URL                     |

#### Examples

```bash
bl dataset delete --file-id file-id-xxx
```

```bash
bl dataset delete --file-id file-id-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl dataset delete --file-id file-id-xxx --yes
```

### `bl dataset get`

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Name**           | `dataset get`                        |
| **Description**    | Get details of a single dataset file |
| **Authentication** | API Key                              |
| **Usage**          | `bl dataset get --file-id <id>`      |

#### Flags

| Flag               | Type   | Required | Description                |
| ------------------ | ------ | -------- | -------------------------- |
| `--file-id <id>`   | string | yes      | Dataset file ID (required) |
| `--api-key <key>`  | string | no       | API key                    |
| `--base-url <url>` | string | no       | API base URL               |

#### Examples

```bash
bl dataset get --file-id file-xxx
```

```bash
bl dataset get --file-id file-xxx --output json
```

### `bl dataset groups`

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Name**           | `dataset groups`                                                   |
| **Description**    | List Console dataset groups                                        |
| **Authentication** | Console                                                            |
| **Usage**          | `bl dataset groups [--page <n>] [--page-size <n>] [--name <name>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                   |
| ------------------------------ | ------ | -------- | ----------------------------------------------------------------------------- |
| `--page <n>`                   | number | no       | Page number, a positive safe integer (default: 1)                             |
| `--page-size <n>`              | number | no       | Groups per page, a positive safe integer (default: 10)                        |
| `--name <name>`                | string | no       | Nonblank dataset group name for server-side filtering; trimmed before sending |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                      |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                         |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                         |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                      |

#### Notes

- Fetches only the requested page. records contains dataset groups; items is the server's total count for the query. All business-response fields are preserved. The API Key / file_id semantics of dataset list are unchanged.
- Each group's datasets is only a one-version preview, not its complete version list. Pass datasetGroupId to dataset version --dataset-group-id for {result:[...]} (no completeness guarantee or pagination); use dataset version --dataset-id with a version's datasetId for details (--include-status is detail-only). Exactly one ID flag is required; they cannot be combined. fileId is not datasetId.
- --name is trimmed and sent to the server without local filtering. No type filter is hardcoded, but server-side scope and defaults still affect results; this is not an account-wide exhaustive listing. There is no --all option.
- The preview requests one import task per version, without guaranteeing the latest task or all tasks. Status codes are preserved as returned; no release, validation, or training readiness is inferred.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl dataset groups
```

```bash
bl dataset groups --page 2 --page-size 20
```

```bash
bl dataset groups --name example-dataset --dry-run
```

### `bl dataset list`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `dataset list`                                                      |
| **Description**    | List uploaded dataset files                                         |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl dataset list [--page <n>] [--page-size <n>] [--purpose <name>]` |

#### Flags

| Flag               | Type   | Required | Description                                             |
| ------------------ | ------ | -------- | ------------------------------------------------------- |
| `--page <n>`       | number | no       | Page number (default: 1)                                |
| `--page-size <n>`  | number | no       | Results per page (default: 10, max 100)                 |
| `--purpose <name>` | string | no       | Filter by purpose (e.g. "fine-tune"). Omit to list all. |
| `--api-key <key>`  | string | no       | API key                                                 |
| `--base-url <url>` | string | no       | API base URL                                            |

#### Examples

```bash
bl dataset list
```

```bash
bl dataset list --purpose fine-tune
```

```bash
bl dataset list --page-size 20
```

```bash
bl dataset list --output json
```

### `bl dataset upload`

| Field              | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `dataset upload`                                                                                                                                  |
| **Description**    | Upload a dataset file (.jsonl or .zip) to Bailian                                                                                                 |
| **Authentication** | API Key                                                                                                                                           |
| **Usage**          | `bl dataset upload --file <path> [--purpose <name>] [--schema <chatml\|dpo\|cpt\|decision\|tts\|image\|video>] [--no-validate] [--full-validate]` |

#### Flags

| Flag               | Type   | Required | Description                                                                                                                                                                                                        |
| ------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--file <path>`    | string | yes      | Local dataset file (.jsonl or .zip; ≤200MB SFT/DPO, ≤300MB CPT/decision, ≤2GB media zip)                                                                                                                           |
| `--purpose <name>` | string | no       | Dataset purpose tag (default: "fine-tune")                                                                                                                                                                         |
| `--schema <s>`     | string | no       | Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "decision" (state/questions), "tts" (audio), "image" (image generation), or "video" (video generation). Default auto-detects per record. |
| `--no-validate`    | switch | no       | Skip the local JSONL pre-flight check (not recommended)                                                                                                                                                            |
| `--full-validate`  | switch | no       | JSON.parse every line instead of sampling (slower)                                                                                                                                                                 |
| `--api-key <key>`  | string | no       | API key                                                                                                                                                                                                            |
| `--base-url <url>` | string | no       | API base URL                                                                                                                                                                                                       |

#### Notes

- Supports .jsonl (text/decision) and .zip (audio/image/video archives with a data.jsonl manifest). Seven record schemas are recognized: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."}; decision = {state:{content}, questions:{...}}; tts = {wav_fn:"train/xxx.wav", text:"..."}; image = {img_path:"..."}; video = {first_frame_path:...}.
- With no --schema, state/questions is validated as decision data, wav_fn as TTS, img_path as image, chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML.
- Upload cap: 200MB SFT/DPO text, 300MB CPT/decision data, 2GB media zip. For decision files over 200MB, pass --schema decision so the correct cap is applied. Upload uses the OpenAI-compatible /compatible-mode/v1/files endpoint so the purpose tag is persisted.

#### Examples

```bash
bl dataset upload --file train.jsonl
```

```bash
bl dataset upload --file dpo.jsonl --schema dpo
```

```bash
bl dataset upload --file cpt.jsonl --schema cpt
```

```bash
bl dataset upload --file decision.jsonl --schema decision
```

```bash
bl dataset upload --file audio.zip --schema tts
```

```bash
bl dataset upload --file train.jsonl --full-validate
```

```bash
bl dataset upload --file train.jsonl --no-validate
```

### `bl dataset validate`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `dataset validate`                                                                                               |
| **Description**    | Locally validate a dataset file (.jsonl or .zip) without uploading                                               |
| **Authentication** | No Auth                                                                                                          |
| **Usage**          | `bl dataset validate --file <path> [--full-validate] [--schema <chatml\|dpo\|cpt\|decision\|tts\|image\|video>]` |

#### Flags

| Flag              | Type   | Required | Description                                                                                                                                                                                                        |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--file <path>`   | string | yes      | Local dataset file (.jsonl or .zip)                                                                                                                                                                                |
| `--full-validate` | switch | no       | JSON.parse every line instead of sampling (slower)                                                                                                                                                                 |
| `--schema <s>`    | string | no       | Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "decision" (state/questions), "tts" (audio), "image" (image generation), or "video" (video generation). Default auto-detects per record. |

#### Notes

- Default scan: every line gets a structural check, then ~160 lines (front 50, evenly spaced 100, last 10) are JSON.parsed against the active schema.
- Schemas: chatml = {messages:[...]}; dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."}; decision = {state:{content}, questions:{...}}; tts = {wav_fn:"train/xxx.wav", text:"..."}; image = {img_path:"..."}; video = {first_frame_path:"...", video_path:"..."}.
- With no --schema, state/questions is validated as decision data, wav_fn as TTS, img_path as image, first_frame_path/video_path as video, chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML.
- ZIP archives (.zip) are validated structurally (data.jsonl present, media references resolve) in addition to per-record content checks. Use --full-validate to JSON.parse every line.

#### Examples

```bash
bl dataset validate --file train.jsonl
```

```bash
bl dataset validate --file dpo.jsonl --schema dpo
```

```bash
bl dataset validate --file cpt.jsonl --schema cpt
```

```bash
bl dataset validate --file decision.jsonl --schema decision
```

```bash
bl dataset validate --file audio.zip --schema tts
```

```bash
bl dataset validate --file wan-i2v-training-dataset.zip --schema video
```

```bash
bl dataset validate --file eval.jsonl --full-validate
```

```bash
bl dataset validate --file train.jsonl --output json
```

### `bl dataset version`

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Name**           | `dataset version`                                                                      |
| **Description**    | List Console dataset versions by group or get one version by ID                        |
| **Authentication** | Console                                                                                |
| **Usage**          | `bl dataset version (--dataset-group-id <id> \| --dataset-id <id> [--include-status])` |

#### Flags

| Flag                           | Type   | Required | Description                                                                       |
| ------------------------------ | ------ | -------- | --------------------------------------------------------------------------------- |
| `--dataset-group-id <id>`      | string | no       | List versions of this Console dataset group; mutually exclusive with --dataset-id |
| `--dataset-id <id>`            | string | no       | Console dataset version ID, not an API file ID                                    |
| `--include-status`             | switch | no       | Also query import/release state; only valid with --dataset-id                     |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                          |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                             |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                             |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                          |

#### Notes

- Exactly one of --dataset-group-id or --dataset-id is required; they cannot be combined. --include-status is only valid with --dataset-id, not group listing. IDs are never inferred from their format.
- Find datasetGroupId with dataset groups, then list versions with --dataset-group-id and get details with a returned datasetId via --dataset-id. An optional fileId belongs to the file/training workflow and cannot substitute for either Console ID; dataset list still returns API file IDs.
- Group listing returns result and preserves all other service fields; a raw array is wrapped as result. There are no pagination flags and no guarantee of exhaustive results. Version/task fields are included when returned; listing does not issue individual detail queries.
- Uses the .m_efm APIs without guessing a corpus suffix. dataset contains metadata; --include-status adds version and status_query. The file query using --file-id remains separate.
- Version releaseStatus: 0 draft, 1 publishing, 2 published, 3 failed. Import taskStatus: 0 initializing, 3 importing, 10 failed, 20 succeeded, 23 partially succeeded. Codes are preserved; unknown/missing states never imply success. No separate validation result or training readiness is inferred.
- The status query requests one import task; it does not assert that task is the latest or includes all tasks. No exact match means status was not obtained, not that the version does not exist. A second-query failure preserves metadata and exits nonzero; a returned failed resource state is still a successful query.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl dataset version --dataset-group-id example-group-id
```

```bash
bl dataset version --dataset-group-id example-group-id --dry-run
```

```bash
bl dataset version --dataset-id example-version-id
```

```bash
bl dataset version --dataset-id example-version-id --include-status --output json
```
