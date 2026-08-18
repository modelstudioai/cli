# `bl knowledge` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                          | Authentication | Description                                                                                      |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `bl knowledge category add`      | API Key        | Create a data-center category                                                                    |
| `bl knowledge category delete`   | API Key        | Delete a data-center category                                                                    |
| `bl knowledge category list`     | API Key        | List data-center categories                                                                      |
| `bl knowledge chat`              | API Key        | Chat with a Bailian knowledge base (RAG Q&A with streaming)                                      |
| `bl knowledge chunk add`         | API Key        | Add a chunk directly to a knowledge base                                                         |
| `bl knowledge chunk delete`      | API Key        | Delete chunks from a knowledge base (irreversible)                                               |
| `bl knowledge chunk list`        | API Key        | List chunks in a knowledge base with content and status                                          |
| `bl knowledge chunk update`      | API Key        | Update chunk content or toggle its retrieval visibility                                          |
| `bl knowledge collection create` | API Key        | Create a FILE data collection                                                                    |
| `bl knowledge collection get`    | API Key        | Show data collection details                                                                     |
| `bl knowledge create`            | API Key        | Create a knowledge base and import data-center files or categories                               |
| `bl knowledge delete`            | API Key        | Delete a knowledge base with all its documents and chunks                                        |
| `bl knowledge doc delete`        | API Key        | Delete documents and their chunks from a knowledge base                                          |
| `bl knowledge doc import-oss`    | API Key        | Batch import files from an authorized OSS bucket into the data center                            |
| `bl knowledge doc list`          | API Key        | List documents in a knowledge base with parse/index status                                       |
| `bl knowledge doc status`        | API Key        | Check knowledge base import job status                                                           |
| `bl knowledge doc tag`           | API Key        | Batch update tags on data-center files                                                           |
| `bl knowledge doc upload`        | API Key        | Upload local files or directories to the data center and optionally import into a knowledge base |
| `bl knowledge file delete`       | API Key        | Permanently delete a file from the data center                                                   |
| `bl knowledge file get`          | API Key        | Show data-center file details (size, MD5, tags, timestamps)                                      |
| `bl knowledge file list`         | API Key        | List files in a data-center category                                                             |
| `bl knowledge info`              | API Key        | Show knowledge base configuration details                                                        |
| `bl knowledge list`              | API Key        | List knowledge bases in the workspace                                                            |
| `bl knowledge retrieve`          | API Key        | Retrieve from a Bailian knowledge base (deprecated, use `search` instead)                        |
| `bl knowledge search`            | API Key        | Search a Bailian knowledge base (RAG semantic retrieval)                                         |
| `bl knowledge service copy`      | API Key        | Copy a service into a new draft (name gets a copy\_ prefix)                                      |
| `bl knowledge service create`    | API Key        | Create a retrieval / Q&A service (initial status: draft, version: beta)                          |
| `bl knowledge service delete`    | API Key        | Delete a retrieval / Q&A service (soft delete, idempotent)                                       |
| `bl knowledge service deploy`    | API Key        | Publish the beta draft of a service as a new version                                             |
| `bl knowledge service get`       | API Key        | Show service (agent) details including per-version configuration                                 |
| `bl knowledge service list`      | API Key        | List retrieval / Q&A services (agents) in the workspace                                          |
| `bl knowledge service update`    | API Key        | Update service name, description or draft configuration                                          |
| `bl knowledge stats`             | API Key        | Show knowledge base storage and QPS monitoring data                                              |
| `bl knowledge update`            | API Key        | Update knowledge base name, description or rerank threshold                                      |

## Command details

### `bl knowledge category add`

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| **Name**           | `knowledge category add`                          |
| **Description**    | Create a data-center category                     |
| **Authentication** | API Key                                           |
| **Usage**          | `bl knowledge category add --name <text> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                        |
| ---------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `--name <text>`        | string | yes      | Category name (1-20 chars)                                         |
| `--parent-id <id>`     | string | no       | Create as a sub-category of this category                          |
| `--collection-id <id>` | string | no       | Create under this collection (defaults to the platform collection) |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)    |
| `--api-key <key>`      | string | no       | API key                                                            |
| `--base-url <url>`     | string | no       | API base URL                                                       |

#### Notes

- Use categories to organize data-center files by business domain.

#### Examples

```bash
bl knowledge category add --name product-docs --workspace-id ws-xxx
```

```bash
bl knowledge category add --name sub --parent-id cate-xxx
```

### `bl knowledge category delete`

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Name**           | `knowledge category delete`                               |
| **Description**    | Delete a data-center category                             |
| **Authentication** | API Key                                                   |
| **Usage**          | `bl knowledge category delete --category-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--category-id <id>`  | string | yes      | Category ID to delete                                           |
| `--yes`               | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Behavior for categories containing files or sub-categories is server-defined — the server error is passed through as-is.

#### Examples

```bash
bl knowledge category delete --category-id cate-xxx --workspace-id ws-xxx
```

```bash
bl knowledge category delete --category-id cate-xxx --yes
```

### `bl knowledge category list`

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Name**           | `knowledge category list`            |
| **Description**    | List data-center categories          |
| **Authentication** | API Key                              |
| **Usage**          | `bl knowledge category list [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                           |
| ---------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `--collection-id <id>` | string | no       | Filter by exact collection ID                                         |
| `--parent-id <id>`     | string | no       | List sub-categories of this exact parent category                     |
| `--name <text>`        | string | no       | Filter by category name (exact match, unlike the knowledge base list) |
| `--next-token <token>` | string | no       | Cursor for the next page (from previous output)                       |
| `--max-result <n>`     | number | no       | Items per page (default: 20)                                          |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |
| `--api-key <key>`      | string | no       | API key                                                               |
| `--base-url <url>`     | string | no       | API base URL                                                          |

#### Notes

- Categories marked [default] are where files land when no category is specified.
- Pagination is cursor-based: reuse the printed next token to continue.

#### Examples

```bash
bl knowledge category list --workspace-id ws-xxx
```

```bash
bl knowledge category list --name my-category
```

```bash
bl knowledge category list --next-token <token>
```

### `bl knowledge chat`

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Name**           | `knowledge chat`                                             |
| **Description**    | Chat with a Bailian knowledge base (RAG Q&A with streaming)  |
| **Authentication** | API Key                                                      |
| **Usage**          | `bl knowledge chat --message <text> --agent-id <id> [flags]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                                                                            |
| --------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--message <text>`          | array  | no       | Message text (repeatable). Supports role:content prefix to set role (e.g. user:hello), defaults to user. Follows OpenAI message format |
| `--agent-id <id>`           | string | yes      | Q&A service ID (find in console knowledge Q&A page)                                                                                    |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                        |
| `--agent-version <version>` | string | no       | Service version to call: beta (draft for debugging) or a published number; default is the latest published version                     |
| `--image <url>`             | array  | no       | Image URL (repeatable). Attached to the last user message as multimodal content                                                        |
| `--api-key <key>`           | string | no       | API key                                                                                                                                |
| `--base-url <url>`          | string | no       | API base URL                                                                                                                           |

#### Notes

- Response is returned as SSE stream events. Event lifecycle: tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end. tool_calling → tool_return may loop multiple times.
- Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.
- Multi-turn: use --message "user:..." and --message "assistant:..." to pass conversation history.
- `--agent-version beta` calls the draft config for debugging before it is deployed.

#### Examples

```bash
bl knowledge chat --message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge chat --message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge chat --message "Describe these images" --image https://example.com/a.png --image https://example.com/b.png --agent-id aid-xxx --workspace-id ws-xxx
```

### `bl knowledge chunk add`

| Field              | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Name**           | `knowledge chunk add`                                                                |
| **Description**    | Add a chunk directly to a knowledge base                                             |
| **Authentication** | API Key                                                                              |
| **Usage**          | `bl knowledge chunk add --index-id <id> (--content <text> \| --field <k=v>) [flags]` |

#### Flags

| Flag                    | Type   | Required | Description                                                                                                                                               |
| ----------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--index-id <id>`       | string | yes      | Knowledge base ID                                                                                                                                         |
| `--doc-id <id>`         | string | no       | Owning document ID from the doc list command; required in practice for all knowledge base types                                                           |
| `--content <text>`      | string | no       | Chunk body text, up to 6000 chars (document-type); alternative to --content-file                                                                          |
| `--content-file <path>` | string | no       | Read chunk body from a UTF-8 plain text file (.md/.txt etc.)                                                                                              |
| `--title <text>`        | string | no       | Chunk title, up to 50 chars (document-type)                                                                                                               |
| `--image-url <url>`     | array  | no       | Chunk image URL (repeatable, up to 10; document-type)                                                                                                     |
| `--field <key=value>`   | array  | no       | Arbitrary field entry (repeatable) for table/image knowledge bases where keys are Excel column headers; mutually exclusive with content/title/image flags |
| `--workspace-id <id>`   | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                                           |
| `--api-key <key>`       | string | no       | API key                                                                                                                                                   |
| `--base-url <url>`      | string | no       | API base URL                                                                                                                                              |

#### Notes

- Document / table / image knowledge bases are supported; audio-video ones are not.
- --doc-id is required in practice for all knowledge base types. Use the document-level id from the doc list command; the per-row doc_id in chunk list output is not accepted.
- Image-type documents do not support text chunks. Target a text-type document (docx/pdf/txt) instead.
- The API is idempotent but rate-limited to 10 calls per second — throttle batch scripts.
- The response carries no chunk id; list chunks afterwards to find the new one.
- For table/image knowledge bases use --field with Excel column headers as keys; values are passed through as strings.

#### Examples

```bash
bl knowledge chunk add --index-id idx-xxx --content "chunk text" --title intro --workspace-id ws-xxx
```

```bash
bl knowledge chunk add --index-id idx-xxx --field 列A=v1 --field 列B=v2
```

### `bl knowledge chunk delete`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `knowledge chunk delete`                                            |
| **Description**    | Delete chunks from a knowledge base (irreversible)                  |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl knowledge chunk delete --index-id <id> --chunk-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                           |
| --------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                                     |
| `--chunk-id <id>`     | array  | yes      | Chunk ID to delete (repeatable; batches of 10 are sent automatically) |
| `--yes`               | switch | no       | Skip the confirmation prompt                                          |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |
| `--api-key <key>`     | string | no       | API key                                                               |
| `--base-url <url>`    | string | no       | API base URL                                                          |

#### Notes

- Accepts at most 10 chunk ids per call; larger sets are batched automatically.

#### Examples

```bash
bl knowledge chunk delete --index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --workspace-id ws-xxx
```

```bash
bl knowledge chunk delete --index-id idx-xxx --chunk-id chunk-a --yes
```

### `bl knowledge chunk list`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `knowledge chunk list`                                  |
| **Description**    | List chunks in a knowledge base with content and status |
| **Authentication** | API Key                                                 |
| **Usage**          | `bl knowledge chunk list --index-id <id> [flags]`       |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                               |
| `--doc-id <id>`       | string | no       | Only show chunks belonging to this document                     |
| `--page-number <n>`   | number | no       | Page number (default: 1)                                        |
| `--page-size <n>`     | number | no       | Page size per request                                           |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Use metadata.\_id as the chunk id and metadata.doc_id as the document id in chunk update/delete commands.
- Page size defaults to 20 (server default), max 100.

#### Examples

```bash
bl knowledge chunk list --index-id idx-xxx --workspace-id ws-xxx
```

```bash
bl knowledge chunk list --index-id idx-xxx --doc-id file-xxx --page-size 50
```

### `bl knowledge chunk update`

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| **Name**           | `knowledge chunk update`                                                          |
| **Description**    | Update chunk content or toggle its retrieval visibility                           |
| **Authentication** | API Key                                                                           |
| **Usage**          | `bl knowledge chunk update --index-id <id> --chunk-id <id> --doc-id <id> [flags]` |

#### Flags

| Flag                    | Type   | Required | Description                                                               |
| ----------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| `--index-id <id>`       | string | yes      | Knowledge base ID                                                         |
| `--chunk-id <id>`       | string | yes      | Chunk ID (metadata.\_id from the chunk list output)                       |
| `--doc-id <id>`         | string | yes      | Document ID owning the chunk (metadata.doc_id from the chunk list output) |
| `--content <text>`      | string | no       | New chunk content, 10-6000 chars; alternative to --content-file           |
| `--content-file <path>` | string | no       | Read new content from a UTF-8 plain text file (.md/.txt etc.)             |
| `--title <text>`        | string | no       | Chunk title, 0-50 chars (empty string clears it; omit to keep unchanged)  |
| `--exclude`             | switch | no       | Exclude this chunk from retrieval                                         |
| `--include`             | switch | no       | Include this chunk in retrieval (default)                                 |
| `--workspace-id <id>`   | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)           |
| `--api-key <key>`       | string | no       | API key                                                                   |
| `--base-url <url>`      | string | no       | API base URL                                                              |

#### Notes

- Content must be 10-6000 characters and within the knowledge base's max chunk size.
- --content-file expects a UTF-8 plain text file; document formats (.docx/.pdf) are not parsed here.
- Toggling --exclude/--include without new content re-submits the existing content automatically.

#### Examples

```bash
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --content "corrected text"
```

```bash
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --exclude
```

### `bl knowledge collection create`

| Field              | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| **Name**           | `knowledge collection create`                                               |
| **Description**    | Create a FILE data collection                                               |
| **Authentication** | API Key                                                                     |
| **Usage**          | `bl knowledge collection create --name <text> --description <text> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                     |
| ---------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--name <text>`        | string | yes      | Collection name                                                 |
| `--description <text>` | string | yes      | Collection description (required by the server)                 |
| `--store-type <type>`  | string | no       | Storage: platform (managed) or custom (your own OSS bucket)     |
| `--oss-region <id>`    | string | no       | OSS region id (required with --store-type custom)               |
| `--oss-bucket <name>`  | string | no       | OSS bucket name (required with --store-type custom)             |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`      | string | no       | API key                                                         |
| `--base-url <url>`     | string | no       | API base URL                                                    |

#### Notes

- Store type defaults to platform (managed storage); custom uses your authorized OSS bucket.
- Custom buckets must carry the bucket tag bailian-connector-access=ReadAndWrite (Bailian's tag-based access control); without it the server rejects creation with a misleading 'setBucketCORS failed' error.
- There is no collection delete API — create collections deliberately.

#### Examples

```bash
bl knowledge collection create --name my-collection --description 'team docs' --workspace-id ws-xxx
```

```bash
bl knowledge collection create --name oss-coll --description 'own bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket
```

### `bl knowledge collection get`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `knowledge collection get`                                                    |
| **Description**    | Show data collection details                                                  |
| **Authentication** | API Key                                                                       |
| **Usage**          | `bl knowledge collection get (--collection-id <id> \| --name <text>) [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                     |
| ---------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--collection-id <id>` | string | no       | Collection ID; alternative to --name                            |
| `--name <text>`        | string | no       | Collection name; alternative to --collection-id                 |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`      | string | no       | API key                                                         |
| `--base-url <url>`     | string | no       | API base URL                                                    |

#### Examples

```bash
bl knowledge collection get --collection-id conn-xxx --workspace-id ws-xxx
```

```bash
bl knowledge collection get --name my-collection
```

### `bl knowledge create`

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| **Name**           | `knowledge create`                                                                |
| **Description**    | Create a knowledge base and import data-center files or categories                |
| **Authentication** | API Key                                                                           |
| **Usage**          | `bl knowledge create --name <text> (--doc-id <id> \| --category-id <id>) [flags]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                          |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `--name <text>`             | string | yes      | Knowledge base name (1-20 chars, unique in workspace)                                |
| `--doc-id <id>`             | array  | no       | Data-center file id to import (repeatable); mutually exclusive with --category-id    |
| `--category-id <id>`        | array  | no       | Import every file under this category (repeatable); mutually exclusive with --doc-id |
| `--embedding-model <name>`  | string | no       | Embedding model name (default: text-embedding-v4)                                    |
| `--chunk-size <n>`          | number | no       | Chunk size in characters (default: 600, recommended 300-800)                         |
| `--wait`                    | switch | no       | Poll the initial import job to a terminal state                                      |
| `--poll-interval <seconds>` | number | no       | Polling interval when waiting (default: 5)                                           |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                      |
| `--api-key <key>`           | string | no       | API key                                                                              |
| `--base-url <url>`          | string | no       | API base URL                                                                         |

#### Notes

- Structure/sink types are fixed to the default document knowledge base (unstructured, BUILT_IN storage).
- Returns the knowledge base id (pipelineId) and the initial import job id (ingestionId).
- Use the import job status command (or --wait) to track the initial import.

#### Examples

```bash
bl knowledge create --name demo --doc-id file-xxx --workspace-id ws-xxx
```

```bash
bl knowledge create --name demo --category-id cate-xxx --wait
```

### `bl knowledge delete`

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Name**           | `knowledge delete`                                        |
| **Description**    | Delete a knowledge base with all its documents and chunks |
| **Authentication** | API Key                                                   |
| **Usage**          | `bl knowledge delete --index-id <id> [flags]`             |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                               |
| `--yes`               | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Irreversible — the knowledge base and all indexed content are permanently removed.
- Files in the data center are not affected; only the knowledge base index is deleted.

#### Examples

```bash
bl knowledge delete --index-id idx-xxx --workspace-id ws-xxx
```

```bash
bl knowledge delete --index-id idx-xxx --yes
```

### `bl knowledge doc delete`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `knowledge doc delete`                                          |
| **Description**    | Delete documents and their chunks from a knowledge base         |
| **Authentication** | API Key                                                         |
| **Usage**          | `bl knowledge doc delete --index-id <id> --doc-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                               |
| `--doc-id <id>`       | array  | yes      | Document ID to delete (repeatable)                              |
| `--yes`               | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Removes documents from the knowledge base index only; the source files remain in the data center.
- Use the doc_id from `knowledge doc list --quiet`, not the fileId from `knowledge doc upload`. For documents created via `knowledge create --doc-id`, the doc_id equals the fileId; for documents imported via `knowledge doc upload --index-id`, the doc_id may include a workspace suffix.
- Deletion may take up to ~30s to propagate — the document may still appear in the doc list briefly.
- The output lists the ids actually deleted.

#### Examples

```bash
bl knowledge doc delete --index-id idx-xxx --doc-id file-xxx --workspace-id ws-xxx
```

```bash
bl knowledge doc delete --index-id idx-xxx --doc-id file-a --doc-id file-b --yes
```

### `bl knowledge doc import-oss`

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Name**           | `knowledge doc import-oss`                                                          |
| **Description**    | Batch import files from an authorized OSS bucket into the data center               |
| **Authentication** | API Key                                                                             |
| **Usage**          | `bl knowledge doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--bucket <name>`     | string | yes      | Authorized OSS bucket name                                      |
| `--region <id>`       | string | yes      | OSS region id (e.g. cn-beijing)                                 |
| `--oss-key <key>`     | array  | yes      | OSS object key to import (repeatable, 1-10 per call)            |
| `--category-id <id>`  | string | no       | Target data-center category (default: the default category)     |
| `--tag <text>`        | array  | no       | File tag applied to every imported file (repeatable, up to 10)  |
| `--overwrite`         | switch | no       | Overwrite files previously imported from the same OSS keys      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The bucket must be authorized to the platform service role beforehand; permission errors from the server are passed through with a pointer to check AliyunServiceRoleForBailian in the RAM console.
- File names are derived from the OSS key basename.
- --overwrite replaces the previously imported file and issues a NEW fileId (the old one becomes invalid) — verified live.

#### Examples

```bash
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx
```

```bash
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite
```

### `bl knowledge doc list`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `knowledge doc list`                                       |
| **Description**    | List documents in a knowledge base with parse/index status |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl knowledge doc list --index-id <id> [flags]`            |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                               |
| `--page-number <n>`   | number | no       | Page number (default: 1)                                        |
| `--page-size <n>`     | number | no       | Page size per request                                           |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Documents with status FAILED are highlighted in text mode — use the import job status command to inspect failures.
- Page size defaults to 10 (server default), max 100.

#### Examples

```bash
bl knowledge doc list --index-id idx-xxx --workspace-id ws-xxx
```

```bash
bl knowledge doc list --index-id idx-xxx --page-size 100
```

### `bl knowledge doc status`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `knowledge doc status`                                          |
| **Description**    | Check knowledge base import job status                          |
| **Authentication** | API Key                                                         |
| **Usage**          | `bl knowledge doc status --index-id <id> --job-id <id> [flags]` |

#### Flags

| Flag                        | Type   | Required | Description                                                     |
| --------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`           | string | yes      | Knowledge base ID                                               |
| `--job-id <id>`             | string | yes      | Import job ID (ingestionId returned by import commands)         |
| `--page-number <n>`         | number | no       | Page number (default: 1)                                        |
| `--page-size <n>`           | number | no       | Page size per request                                           |
| `--wait`                    | switch | no       | Poll until the job reaches a terminal state                     |
| `--poll-interval <seconds>` | number | no       | Polling interval when waiting (default: 5)                      |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`           | string | no       | API key                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                    |

#### Notes

- Both --index-id and --job-id are required (passing only one returns SystemError).
- If you see a SystemError, the job may not exist — check the ingestion id in the document list output.
- Overall job states are PENDING / RUNNING / COMPLETED; per-document failures (for example PARSE_FAILED) exit non-zero with the error message passed through.

#### Examples

```bash
bl knowledge doc status --index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx
```

```bash
bl knowledge doc status --index-id idx-xxx --job-id job-xxx --wait --poll-interval 10
```

### `bl knowledge doc tag`

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Name**           | `knowledge doc tag`                                       |
| **Description**    | Batch update tags on data-center files                    |
| **Authentication** | API Key                                                   |
| **Usage**          | `bl knowledge doc tag --doc-id <id> --tag <text> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--doc-id <id>`       | array  | yes      | Data-center file ID to tag (repeatable, 1-20 per call)          |
| `--tag <text>`        | array  | yes      | Tag applied to every --doc-id (repeatable, each up to 32 chars) |
| `--mode <mode>`       | string | no       | Update mode: append (default) or overwrite                      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The same tag set is applied to every --doc-id; run the command multiple times for different tag sets.
- Server limits: up to 100 tags per file, total tag length up to 700 chars, tag up to 32 chars.

#### Examples

```bash
bl knowledge doc tag --doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx
```

```bash
bl knowledge doc tag --doc-id file-a --doc-id file-b --tag final --mode overwrite
```

### `bl knowledge doc upload`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `knowledge doc upload`                                                                           |
| **Description**    | Upload local files or directories to the data center and optionally import into a knowledge base |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl knowledge doc upload --file <path> [flags]`                                                  |

#### Flags

| Flag                        | Type   | Required | Description                                                                                                     |
| --------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| `--file <path>`             | array  | yes      | Local file or directory path (repeatable). Directories are scanned recursively; unsupported formats are skipped |
| `--index-id <id>`           | string | no       | Import into this knowledge base after registration (one job for all files)                                      |
| `--category-id <id>`        | string | no       | Target data-center category; defaults to the workspace default category                                         |
| `--tag <text>`              | array  | no       | File tag (repeatable), applied to every uploaded file                                                           |
| `--wait`                    | switch | no       | Poll the import job to a terminal state (needs --index-id)                                                      |
| `--poll-interval <seconds>` | number | no       | Polling interval when waiting (default: 5)                                                                      |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                 |
| `--api-key <key>`           | string | no       | API key                                                                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                                                                    |

#### Notes

- Pipeline: apply upload lease → PUT to OSS → register file → (with --index-id) create import job.
- Without --category-id the workspace default category is resolved automatically.
- Directories are scanned recursively; node_modules, .git, and similar are skipped automatically.
- Multiple files are processed sequentially; on failure, already-registered file ids are listed in the error hint.

#### Examples

```bash
bl knowledge doc upload --file ./a.md --workspace-id ws-xxx
```

```bash
bl knowledge doc upload --file ./a.md --file ./b.pdf --index-id idx-xxx --wait
```

```bash
bl knowledge doc upload --file ./docs/ --workspace-id ws-xxx
```

```bash
bl knowledge doc upload --file ./docs/ --dry-run --verbose
```

### `bl knowledge file delete`

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| **Name**           | `knowledge file delete`                           |
| **Description**    | Permanently delete a file from the data center    |
| **Authentication** | API Key                                           |
| **Usage**          | `bl knowledge file delete --file-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--file-id <id>`      | string | yes      | Data-center file ID to delete                                   |
| `--yes`               | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Irreversible. If knowledge bases reference this file, their related document indexes become invalid.
- To remove a document from a single knowledge base only, use the document delete command instead.

#### Examples

```bash
bl knowledge file delete --file-id file-xxx --workspace-id ws-xxx
```

```bash
bl knowledge file delete --file-id file-xxx --yes
```

### `bl knowledge file get`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `knowledge file get`                                        |
| **Description**    | Show data-center file details (size, MD5, tags, timestamps) |
| **Authentication** | API Key                                                     |
| **Usage**          | `bl knowledge file get --file-id <id> [flags]`              |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--file-id <id>`      | string | yes      | Data-center file ID                                             |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Examples

```bash
bl knowledge file get --file-id file-xxx --workspace-id ws-xxx
```

### `bl knowledge file list`

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Name**           | `knowledge file list`                               |
| **Description**    | List files in a data-center category                |
| **Authentication** | API Key                                             |
| **Usage**          | `bl knowledge file list --category-id <id> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                            |
| ---------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--category-id <id>`   | string | yes      | Category to list (find ids via the category list command); exact match |
| `--name <text>`        | string | no       | Filter by exact file name without its extension (a.md → pass a)        |
| `--file-id <id>`       | array  | no       | Filter by exact file ID (repeatable)                                   |
| `--next-token <token>` | string | no       | Cursor for the next page (from previous output)                        |
| `--max-result <n>`     | number | no       | Items per page                                                         |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)        |
| `--api-key <key>`      | string | no       | API key                                                                |
| `--base-url <url>`     | string | no       | API base URL                                                           |

#### Notes

- A real category id is required — the default value is not resolved here. Find the id via the category list command.
- --name matches the exact file name without its extension (for a.md pass a); partial keywords return no results.
- Pagination is cursor-based: reuse the printed next token to continue.

#### Examples

```bash
bl knowledge file list --category-id cate-xxx --workspace-id ws-xxx
```

```bash
bl knowledge file list --category-id cate-xxx --name report
```

### `bl knowledge info`

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| **Name**           | `knowledge info`                            |
| **Description**    | Show knowledge base configuration details   |
| **Authentication** | API Key                                     |
| **Usage**          | `bl knowledge info --index-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                               |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Indexing settings are immutable; changing them requires recreating the knowledge base.

#### Examples

```bash
bl knowledge info --index-id idx-xxx --workspace-id ws-xxx
```

### `bl knowledge list`

| Field              | Value                                 |
| ------------------ | ------------------------------------- |
| **Name**           | `knowledge list`                      |
| **Description**    | List knowledge bases in the workspace |
| **Authentication** | API Key                               |
| **Usage**          | `bl knowledge list [flags]`           |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--name <text>`       | string | no       | Filter by knowledge base name (fuzzy match, 1-20 chars)         |
| `--page-number <n>`   | number | no       | Page number (default: 1)                                        |
| `--page-size <n>`     | number | no       | Page size per request                                           |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Auth: uses DashScope API Key (Bearer token).
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.
- Use the returned id as --index-id in knowledge base / document management commands.

#### Examples

```bash
bl knowledge list --workspace-id ws-xxx
```

```bash
bl knowledge list --name demo --page-number 2 --page-size 50
```

### `bl knowledge retrieve`

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **Name**           | `knowledge retrieve`                                                      |
| **Description**    | Retrieve from a Bailian knowledge base (deprecated, use `search` instead) |
| **Authentication** | API Key                                                                   |
| **Usage**          | `bl knowledge retrieve --index-id <id> --query <text> [flags]`            |

#### Flags

| Flag                            | Type   | Required | Description                                        |
| ------------------------------- | ------ | -------- | -------------------------------------------------- |
| `--index-id <id>`               | string | yes      | Knowledge base index ID (required)                 |
| `--query <text>`                | string | yes      | Search query (required)                            |
| `--dense-similarity-top-k <n>`  | number | no       | Dense retrieval top K                              |
| `--sparse-similarity-top-k <n>` | number | no       | Sparse retrieval top K                             |
| `--rerank`                      | switch | no       | Enable reranking                                   |
| `--rerank-top-n <n>`            | number | no       | Rerank top N results                               |
| `--rerank-model <name>`         | string | no       | Rerank model, e.g. qwen3-rerank-hybrid             |
| `--rerank-mode <mode>`          | string | no       | Rerank mode: qa, similar, or custom                |
| `--rerank-instruct <text>`      | string | no       | Custom rerank instruction, when mode=custom        |
| `--top-k <n>`                   | number | no       | Number of results (deprecated, use --rerank-top-n) |
| `--api-key <key>`               | string | no       | API key                                            |
| `--base-url <url>`              | string | no       | API base URL                                       |

#### Examples

```bash
bl knowledge retrieve --index-id idx_xxx --query "How to use Alibaba Cloud Bailian"
```

```bash
bl knowledge retrieve --index-id idx_xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid
```

### `bl knowledge search`

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Name**           | `knowledge search`                                           |
| **Description**    | Search a Bailian knowledge base (RAG semantic retrieval)     |
| **Authentication** | API Key                                                      |
| **Usage**          | `bl knowledge search --query <text> --agent-id <id> [flags]` |

#### Flags

| Flag                        | Type   | Required | Description                                                                                                        |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `--query <text>`            | string | yes      | Search query text (required, cannot be empty)                                                                      |
| `--agent-id <id>`           | string | yes      | Retrieval service ID (find in console knowledge retrieval page)                                                    |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                    |
| `--agent-version <version>` | string | no       | Service version to call: beta (draft for debugging) or a published number; default is the latest published version |
| `--image <url>`             | array  | no       | Image URL for multimodal retrieval (repeatable)                                                                    |
| `--api-key <key>`           | string | no       | API key                                                                                                            |
| `--base-url <url>`          | string | no       | API base URL                                                                                                       |

#### Notes

- Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Only query and agent_id are required.
- Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.
- `--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.
- `--agent-version beta` calls the draft config for debugging before it is deployed.

#### Examples

```bash
bl knowledge search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge search --api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg
```

### `bl knowledge service copy`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `knowledge service copy`                                    |
| **Description**    | Copy a service into a new draft (name gets a copy\_ prefix) |
| **Authentication** | API Key                                                     |
| **Usage**          | `bl knowledge service copy --agent-id <id> [flags]`         |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--agent-id <id>`     | string | yes      | Source service (agent) ID to copy                               |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The copy starts as a beta draft; test it with --agent-version beta, then deploy to publish.
- Requires the knowledge-base create permission in the workspace.

#### Examples

```bash
bl knowledge service copy --agent-id aid-xxx --workspace-id ws-xxx
```

### `bl knowledge service create`

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Name**           | `knowledge service create`                                                 |
| **Description**    | Create a retrieval / Q&A service (initial status: draft, version: beta)    |
| **Authentication** | API Key                                                                    |
| **Usage**          | `bl knowledge service create --name <text> --scene <chat\|search> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                       |
| ---------------------- | ------ | -------- | ----------------------------------------------------------------- |
| `--name <text>`        | string | yes      | Service name (up to 200 chars, unique per scene in the workspace) |
| `--scene <scene>`      | string | yes      | Service scene: chat (Q&A) or search (retrieval)                   |
| `--description <text>` | string | no       | Service description (up to 1000 chars)                            |
| `--index-id <id>`      | string | no       | Bind this knowledge base; other settings use server defaults      |
| `--workspace-id <id>`  | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)   |
| `--api-key <key>`      | string | no       | API key                                                           |
| `--base-url <url>`     | string | no       | API base URL                                                      |

#### Notes

- Without an explicit configuration the server applies its default agent settings.
- The draft (beta) version can be tested via --agent-version beta on search/chat before deploying.
- Requires the knowledge-base create permission in the workspace.

#### Examples

```bash
bl knowledge service create --name my-qa --scene chat --workspace-id ws-xxx
```

```bash
bl knowledge service create --name my-search --scene search --index-id idx-xxx
```

### `bl knowledge service delete`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `knowledge service delete`                                 |
| **Description**    | Delete a retrieval / Q&A service (soft delete, idempotent) |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl knowledge service delete --agent-id <id> [flags]`      |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--agent-id <id>`     | string | yes      | Service (agent) ID                                              |
| `--yes`               | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- Deletion cannot be undone; the agent_id becomes unusable for search and chat calls.
- Idempotent — deleting an already-deleted service does not fail.
- Requires the knowledge-base delete permission in the workspace.

#### Examples

```bash
bl knowledge service delete --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge service delete --agent-id aid-xxx --yes
```

### `bl knowledge service deploy`

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Name**           | `knowledge service deploy`                            |
| **Description**    | Publish the beta draft of a service as a new version  |
| **Authentication** | API Key                                               |
| **Usage**          | `bl knowledge service deploy --agent-id <id> [flags]` |

#### Flags

| Flag                    | Type   | Required | Description                                                     |
| ----------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--agent-id <id>`       | string | yes      | Service (agent) ID                                              |
| `--version-desc <text>` | string | no       | Description for the newly published version                     |
| `--yes`                 | switch | no       | Skip the confirmation prompt                                    |
| `--workspace-id <id>`   | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`       | string | no       | API key                                                         |
| `--base-url <url>`      | string | no       | API base URL                                                    |

#### Notes

- The version number auto-increments; status becomes deployed.
- Publishing affects live callers — the confirmation prompt guards against accidents.
- Requires the knowledge-base modify permission in the workspace.

#### Examples

```bash
bl knowledge service deploy --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge service deploy --agent-id aid-xxx --version-desc 'tuned rerank params' --yes
```

### `bl knowledge service get`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `knowledge service get`                                          |
| **Description**    | Show service (agent) details including per-version configuration |
| **Authentication** | API Key                                                          |
| **Usage**          | `bl knowledge service get --agent-id <id> [flags]`               |

#### Flags

| Flag                        | Type   | Required | Description                                                                     |
| --------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `--agent-id <id>`           | string | yes      | Service (agent) ID                                                              |
| `--agent-version <version>` | string | no       | Specific version to inspect (beta or a published number); omit for all versions |
| `--workspace-id <id>`       | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                 |
| `--api-key <key>`           | string | no       | API key                                                                         |
| `--base-url <url>`          | string | no       | API base URL                                                                    |

#### Notes

- Without --agent-version all versions are returned (beta draft plus published numbers).
- The version value is passed through as-is; the valid set is server-side state.

#### Examples

```bash
bl knowledge service get --agent-id aid-xxx --workspace-id ws-xxx
```

```bash
bl knowledge service get --agent-id aid-xxx --agent-version beta
```

### `bl knowledge service list`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `knowledge service list`                                   |
| **Description**    | List retrieval / Q&A services (agents) in the workspace    |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl knowledge service list --scene <chat\|search> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                             |
| --------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `--scene <scene>`     | string | yes      | Service scene: chat (Q&A) or search (retrieval). Required by the server |
| `--status <status>`   | string | no       | Filter by status: draft, deployed (includes edited) or deleted          |
| `--name <text>`       | string | no       | Filter by service name (fuzzy match)                                    |
| `--agent-id <id>`     | string | no       | Filter by exact agent ID                                                |
| `--index-id <id>`     | string | no       | Filter by exact linked knowledge base (pipeline) ID                     |
| `--page-number <n>`   | number | no       | Page number (default: 1)                                                |
| `--page-size <n>`     | number | no       | Page size per request                                                   |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)         |
| `--api-key <key>`     | string | no       | API key                                                                 |
| `--base-url <url>`    | string | no       | API base URL                                                            |

#### Notes

- A scene (chat or search) is required — run once per scene to see both.
- Use the returned agent_id with the search or chat commands, or with service management commands.

#### Examples

```bash
bl knowledge service list --scene chat --workspace-id ws-xxx
```

```bash
bl knowledge service list --scene search --status deployed
```

### `bl knowledge service update`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `knowledge service update`                              |
| **Description**    | Update service name, description or draft configuration |
| **Authentication** | API Key                                                 |
| **Usage**          | `bl knowledge service update --agent-id <id> [flags]`   |

#### Flags

| Flag                           | Type   | Required | Description                                                                                                                          |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--agent-id <id>`              | string | yes      | Service (agent) ID                                                                                                                   |
| `--name <text>`                | string | no       | New service name (up to 200 chars)                                                                                                   |
| `--description <text>`         | string | no       | New service description (up to 1000 chars)                                                                                           |
| `--agent-version <version>`    | string | no       | Target version (default: beta draft). Published versions only accept --version-desc                                                  |
| `--version-desc <text>`        | string | no       | Version description                                                                                                                  |
| `--policy <policy>`            | string | no       | Agent policy: turbo (fast) or agentic (multi-turn)                                                                                   |
| `--model <name>`               | string | no       | Generation model code (must be in the platform allowlist)                                                                            |
| `--temperature <n>`            | number | no       | Sampling temperature, range 0-2                                                                                                      |
| `--max-llm-calls <n>`          | number | no       | Max LLM calls per request, range 1-30                                                                                                |
| `--enable-session-file <bool>` | string | no       | Enable session files: true or false                                                                                                  |
| `--enable-refusal <bool>`      | string | no       | Enable refusal answers: true or false                                                                                                |
| `--enable-anti-leak <bool>`    | string | no       | Enable anti prompt-leak: true or false                                                                                               |
| `--enable-rich-text <bool>`    | string | no       | Enable rich text output: true or false                                                                                               |
| `--enable-citation <bool>`     | string | no       | Enable citations: true or false                                                                                                      |
| `--config-file <path>`         | string | no       | JSON file replacing the whole agent_config (for nested settings like kb_search_configs); mutually exclusive with scalar config flags |
| `--workspace-id <id>`          | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                      |
| `--api-key <key>`              | string | no       | API key                                                                                                                              |
| `--base-url <url>`             | string | no       | API base URL                                                                                                                         |

#### Notes

- Configuration changes only apply to the beta draft; published versions accept --version-desc only.
- To change the configuration of a published version, first update the beta draft (this command without --agent-version or with --agent-version beta), then run service deploy to publish a new version.
- Scalar config flags merge into the current draft config (read-merge-write); --config-file replaces the whole config and is mutually exclusive with them.
- After updating the draft, verify with --agent-version beta on search/chat, then deploy.
- Requires the knowledge-base modify permission in the workspace.

#### Examples

```bash
bl knowledge service update --agent-id aid-xxx --temperature 0.7 --workspace-id ws-xxx
```

```bash
bl knowledge service update --agent-id aid-xxx --config-file ./agent-config.json
```

```bash
bl knowledge service update --agent-id aid-xxx --agent-version 1 --version-desc 'first stable release'
```

### `bl knowledge stats`

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Name**           | `knowledge stats`                                   |
| **Description**    | Show knowledge base storage and QPS monitoring data |
| **Authentication** | API Key                                             |
| **Usage**          | `bl knowledge stats --index-id <id> [flags]`        |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--index-id <id>`     | string | yes      | Knowledge base ID                                                                  |
| `--start <time>`      | string | no       | Range start: Unix seconds or ISO date, must be in the past (default: 24 hours ago) |
| `--end <time>`        | string | no       | Range end: Unix seconds or ISO date, must be in the past (default: now)            |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                    |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Defaults to the last 24 hours when --start/--end are omitted.
- Timestamps are normalized to epoch seconds as required by the server.
- Future timestamps are rejected for --start and clamped to now for --end, since the monitor API only returns past data.

#### Examples

```bash
bl knowledge stats --index-id idx-xxx --workspace-id ws-xxx
```

```bash
bl knowledge stats --index-id idx-xxx --start 2026-07-30 --end 2026-07-31
```

### `bl knowledge update`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `knowledge update`                                          |
| **Description**    | Update knowledge base name, description or rerank threshold |
| **Authentication** | API Key                                                     |
| **Usage**          | `bl knowledge update --index-id <id> [flags]`               |

#### Flags

| Flag                         | Type   | Required | Description                                                           |
| ---------------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `--index-id <id>`            | string | yes      | Knowledge base ID                                                     |
| `--name <text>`              | string | no       | New knowledge base name (1-20 chars)                                  |
| `--description <text>`       | string | no       | New knowledge base description                                        |
| `--rerank-min-score <score>` | number | no       | Rerank minimum score threshold, range 0-1 (chunks below are filtered) |
| `--workspace-id <id>`        | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |
| `--api-key <key>`            | string | no       | API key                                                               |
| `--base-url <url>`           | string | no       | API base URL                                                          |

#### Notes

- Indexing settings (embedding model, chunk size, etc.) are immutable — recreate the knowledge base to change them.

#### Examples

```bash
bl knowledge update --index-id idx-xxx --description 'product docs v2' --workspace-id ws-xxx
```

```bash
bl knowledge update --index-id idx-xxx --rerank-min-score 0.3
```
