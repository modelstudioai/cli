# kscli command reference

> Generated from the same schema as `--introspect`. Do not edit by hand.
> Version: 2.0.1; schema: 1.

Cross-flag constraints are validated at execution and are not exported by this schema.

`config` and `update` are product utility commands, not knowledge-base operations.

## kscli category add

Create a data-center category

```sh
kscli category add --name <text> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                        |
| -------------------- | ------ | -------- | ------------------------------------------------------------------ |
| --api-key <key>      | string | —        | API key                                                            |
| --base-url <url>     | string | —        | API base URL                                                       |
| --collection-id <id> | string | —        | Create under this collection (defaults to the platform collection) |
| --config <name>      | string | —        | Use a config profile for this command                              |
| --dry-run            | switch | —        | Dry run mode                                                       |
| --help               | switch | —        | Show help                                                          |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit          |
| --name <text>        | string | yes      | Category name (1-20 chars)                                         |
| --output <format>    | string | —        | Output format: text, json                                          |
| --parent-id <id>     | string | —        | Create as a sub-category of this category                          |
| --quiet              | switch | —        | Suppress non-essential output                                      |
| --timeout <seconds>  | number | —        | Request timeout                                                    |
| --verbose            | switch | —        | Print HTTP request/response details                                |
| --version            | switch | —        | Print version                                                      |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)    |

### Notes

Use categories to organize data-center files by business domain.

### Examples

```sh
kscli category add --name product-docs --workspace-id ws-xxx
```

```sh
kscli category add --name sub --parent-id cate-xxx
```

## kscli category delete

Delete a data-center category

```sh
kscli category delete --category-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This deletes the selected data-center category and cannot be undone.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --category-id <id>  | string | yes      | Category ID to delete                                           |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes               | switch | —        | Confirm this high-risk operation                                |

### Notes

Behavior for categories containing files or sub-categories is server-defined — the server error is passed through as-is.

### Examples

```sh
kscli category delete --category-id cate-xxx --workspace-id ws-xxx
```

```sh
kscli category delete --category-id cate-xxx --yes
```

## kscli category list

List data-center categories

```sh
kscli category list [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                           |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| --api-key <key>      | string | —        | API key                                                               |
| --base-url <url>     | string | —        | API base URL                                                          |
| --collection-id <id> | string | —        | Filter by exact collection ID                                         |
| --config <name>      | string | —        | Use a config profile for this command                                 |
| --dry-run            | switch | —        | Dry run mode                                                          |
| --help               | switch | —        | Show help                                                             |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit             |
| --max-result <n>     | number | —        | Items per page (default: 20)                                          |
| --name <text>        | string | —        | Filter by category name (exact match, unlike the knowledge base list) |
| --next-token <token> | string | —        | Cursor for the next page (from previous output)                       |
| --output <format>    | string | —        | Output format: text, json                                             |
| --parent-id <id>     | string | —        | List sub-categories of this exact parent category                     |
| --quiet              | switch | —        | Suppress non-essential output                                         |
| --timeout <seconds>  | number | —        | Request timeout                                                       |
| --verbose            | switch | —        | Print HTTP request/response details                                   |
| --version            | switch | —        | Print version                                                         |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |

### Notes

Categories marked [default] are where files land when no category is specified.

Pagination is cursor-based: reuse the printed next token to continue.

### Examples

```sh
kscli category list --workspace-id ws-xxx
```

```sh
kscli category list --name my-category
```

```sh
kscli category list --next-token <token>
```

## kscli chat

Chat with a Bailian knowledge base (RAG Q&A with streaming)

```sh
kscli chat --message <text> --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                                 | Type    | Required | Description                                                                                                                            |
| ------------------------------------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| --agent-id <id>                      | string  | yes      | Q&A service ID (find in console knowledge Q&A page)                                                                                    |
| --agent-version <version>            | string  | —        | Service version to call: beta (draft for debugging) or a published number; default is the latest published version                     |
| --api-key <key>                      | string  | —        | API key                                                                                                                                |
| --base-url <url>                     | string  | —        | API base URL                                                                                                                           |
| --config <name>                      | string  | —        | Use a config profile for this command                                                                                                  |
| --dry-run                            | switch  | —        | Dry run mode                                                                                                                           |
| --enable-cache-control <true\|false> | boolean | —        | Explicit context cache control                                                                                                         |
| --help                               | switch  | —        | Show help                                                                                                                              |
| --image <url>                        | array   | —        | Image URL (repeatable). Attached to the last user message as multimodal content                                                        |
| --introspect                         | switch  | —        | Print the machine-readable command schema (JSON) and exit                                                                              |
| --message <text>                     | array   | —        | Message text (repeatable). Supports role:content prefix to set role (e.g. user:hello), defaults to user. Follows OpenAI message format |
| --messages-file <path>               | string  | —        | Complete messages JSON array, including tool history (excludes --message/--image)                                                      |
| --output <format>                    | string  | —        | Output format: text, json                                                                                                              |
| --quiet                              | switch  | —        | Suppress non-essential output                                                                                                          |
| --request-id <id>                    | string  | —        | Business request ID                                                                                                                    |
| --session-file-id <fileId>           | array   | —        | Session file ID (repeatable, up to 10; requires service file preprocessing)                                                            |
| --timeout <seconds>                  | number  | —        | Request timeout                                                                                                                        |
| --verbose                            | switch  | —        | Print HTTP request/response details                                                                                                    |
| --version                            | switch  | —        | Print version                                                                                                                          |
| --workspace-id <id>                  | string  | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                        |

### Notes

Response is returned as SSE stream events. Event lifecycle: tool_calling → tool_return → plan_start → planning → plan_end → generation_start → generating → generation_end. tool_calling → tool_return may loop multiple times.

Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.

`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.

Multi-turn: use --message "user:..." and --message "assistant:..." to pass conversation history.

`--agent-version beta` calls the draft config for debugging before it is deployed.

### Examples

```sh
kscli chat --message "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli chat --message "user:What is RAG?" --message "assistant:RAG is..." --message "How does it work?" --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli chat --message "Describe these images" --image https://example.com/a.png --image https://example.com/b.png --agent-id aid-xxx --workspace-id ws-xxx
```

## kscli chunk add

Add a chunk directly to a knowledge base

```sh
kscli chunk add --index-id <id> (--content <text> | --field <k=v>) [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                  | Type   | Required | Description                                                                                                                                               |
| --------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| --api-key <key>       | string | —        | API key                                                                                                                                                   |
| --base-url <url>      | string | —        | API base URL                                                                                                                                              |
| --config <name>       | string | —        | Use a config profile for this command                                                                                                                     |
| --content <text>      | string | —        | Chunk body text, up to 6000 chars (document-type); alternative to --content-file                                                                          |
| --content-file <path> | string | —        | Read chunk body from a UTF-8 plain text file (.md/.txt etc.)                                                                                              |
| --doc-id <id>         | string | —        | Owning document ID from the doc list command; required in practice for all knowledge base types                                                           |
| --dry-run             | switch | —        | Dry run mode                                                                                                                                              |
| --field <key=value>   | array  | —        | Arbitrary field entry (repeatable) for table/image knowledge bases where keys are Excel column headers; mutually exclusive with content/title/image flags |
| --help                | switch | —        | Show help                                                                                                                                                 |
| --image-url <url>     | array  | —        | Chunk image URL (repeatable, up to 10; document-type)                                                                                                     |
| --index-id <id>       | string | yes      | Knowledge base ID                                                                                                                                         |
| --introspect          | switch | —        | Print the machine-readable command schema (JSON) and exit                                                                                                 |
| --output <format>     | string | —        | Output format: text, json                                                                                                                                 |
| --quiet               | switch | —        | Suppress non-essential output                                                                                                                             |
| --timeout <seconds>   | number | —        | Request timeout                                                                                                                                           |
| --title <text>        | string | —        | Chunk title, up to 50 chars (document-type)                                                                                                               |
| --verbose             | switch | —        | Print HTTP request/response details                                                                                                                       |
| --version             | switch | —        | Print version                                                                                                                                             |
| --workspace-id <id>   | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                                           |

### Notes

Adding chunks to multimedia knowledge bases is not supported by the service.

Document / table / image knowledge bases are supported; audio-video ones are not.

--doc-id is required in practice for all knowledge base types. Use the document-level id from the doc list command; the per-row doc_id in chunk list output is not accepted.

Image-type documents do not support text chunks. Target a text-type document (docx/pdf/txt) instead.

The API is idempotent but rate-limited to 10 calls per second — throttle batch scripts.

The response carries no chunk id; list chunks afterwards to find the new one.

For table/image knowledge bases use --field with Excel column headers as keys; values are passed through as strings.

### Examples

```sh
kscli chunk add --index-id idx-xxx --content "chunk text" --title intro --workspace-id ws-xxx
```

```sh
kscli chunk add --index-id idx-xxx --field columnA=v1 --field columnB=v2
```

## kscli chunk delete

Delete chunks from a knowledge base (irreversible)

```sh
kscli chunk delete --index-id <id> --chunk-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This permanently deletes the selected chunks and cannot be undone.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                           |
| ------------------- | ------ | -------- | --------------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                               |
| --base-url <url>    | string | —        | API base URL                                                          |
| --chunk-id <id>     | array  | yes      | Chunk ID to delete (repeatable; batches of 10 are sent automatically) |
| --config <name>     | string | —        | Use a config profile for this command                                 |
| --dry-run           | switch | —        | Dry run mode                                                          |
| --help              | switch | —        | Show help                                                             |
| --index-id <id>     | string | yes      | Knowledge base ID                                                     |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit             |
| --output <format>   | string | —        | Output format: text, json                                             |
| --quiet             | switch | —        | Suppress non-essential output                                         |
| --timeout <seconds> | number | —        | Request timeout                                                       |
| --verbose           | switch | —        | Print HTTP request/response details                                   |
| --version           | switch | —        | Print version                                                         |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |
| --yes               | switch | —        | Confirm this high-risk operation                                      |

### Notes

Accepts at most 10 chunk ids per call; larger sets are batched automatically.

### Examples

```sh
kscli chunk delete --index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --workspace-id ws-xxx
```

```sh
kscli chunk delete --index-id idx-xxx --chunk-id chunk-a --yes
```

## kscli chunk list

List chunks in a knowledge base with content and status

```sh
kscli chunk list --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --doc-id <id>       | string | —        | Only show chunks belonging to this document                     |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | yes      | Knowledge base ID                                               |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --page-number <n>   | number | —        | Page number (default: 1)                                        |
| --page-size <n>     | number | —        | Page size per request                                           |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

Use metadata._id as the chunk id and metadata.doc_id as the document id in chunk update/delete commands.

Page size defaults to 20 (server default), max 100.

### Examples

```sh
kscli chunk list --index-id idx-xxx --workspace-id ws-xxx
```

```sh
kscli chunk list --index-id idx-xxx --doc-id file-xxx --page-size 50
```

## kscli chunk update

Update chunk content or toggle its retrieval visibility

```sh
kscli chunk update --index-id <id> --chunk-id <id> --doc-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                  | Type   | Required | Description                                                               |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| --api-key <key>       | string | —        | API key                                                                   |
| --base-url <url>      | string | —        | API base URL                                                              |
| --chunk-id <id>       | string | yes      | Chunk ID (metadata._id from the chunk list output)                        |
| --config <name>       | string | —        | Use a config profile for this command                                     |
| --content <text>      | string | —        | New chunk content, 10-6000 chars; alternative to --content-file           |
| --content-file <path> | string | —        | Read new content from a UTF-8 plain text file (.md/.txt etc.)             |
| --doc-id <id>         | string | yes      | Document ID owning the chunk (metadata.doc_id from the chunk list output) |
| --dry-run             | switch | —        | Dry run mode                                                              |
| --exclude             | switch | —        | Exclude this chunk from retrieval                                         |
| --help                | switch | —        | Show help                                                                 |
| --include             | switch | —        | Include this chunk in retrieval (default)                                 |
| --index-id <id>       | string | yes      | Knowledge base ID                                                         |
| --introspect          | switch | —        | Print the machine-readable command schema (JSON) and exit                 |
| --output <format>     | string | —        | Output format: text, json                                                 |
| --quiet               | switch | —        | Suppress non-essential output                                             |
| --timeout <seconds>   | number | —        | Request timeout                                                           |
| --title <text>        | string | —        | Chunk title, 0-50 chars (empty string clears it; omit to keep unchanged)  |
| --verbose             | switch | —        | Print HTTP request/response details                                       |
| --version             | switch | —        | Print version                                                             |
| --workspace-id <id>   | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)           |

### Notes

Content must be 10-6000 characters and within the knowledge base's max chunk size.

--content-file expects a UTF-8 plain text file; document formats (.docx/.pdf) are not parsed here.

Toggling --exclude/--include without new content re-submits the existing content automatically.

### Examples

```sh
kscli chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --content "corrected text"
```

```sh
kscli chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --exclude
```

## kscli collection create

Create a FILE collection

```sh
kscli collection create --name <text> --description <text> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                                         |
| -------------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| --api-key <key>      | string | —        | API key                                                                             |
| --base-url <url>     | string | —        | API base URL                                                                        |
| --config <name>      | string | —        | Use a config profile for this command                                               |
| --description <text> | string | yes      | What this collection holds and what it is for — tells collections apart in the list |
| --dry-run            | switch | —        | Dry run mode                                                                        |
| --help               | switch | —        | Show help                                                                           |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit                           |
| --name <text>        | string | yes      | Collection name                                                                     |
| --oss-bucket <name>  | string | —        | OSS bucket name (required with --store-type custom)                                 |
| --oss-region <id>    | string | —        | OSS region id (required with --store-type custom)                                   |
| --output <format>    | string | —        | Output format: text, json                                                           |
| --quiet              | switch | —        | Suppress non-essential output                                                       |
| --store-type <type>  | string | —        | Storage: platform (managed) or custom (your own OSS bucket)                         |
| --timeout <seconds>  | number | —        | Request timeout                                                                     |
| --verbose            | switch | —        | Print HTTP request/response details                                                 |
| --version            | switch | —        | Print version                                                                       |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                     |

### Notes

Store type defaults to platform (managed storage); custom uses your authorized OSS bucket.

Custom buckets must carry the bucket tag bailian-connector-access=ReadAndWrite (Bailian's tag-based access control); without it the server rejects creation with a misleading 'setBucketCORS failed' error.

There is no collection delete API — create collections deliberately.

### Examples

```sh
kscli collection create --name my-collection --description 'team docs' --workspace-id ws-xxx
```

```sh
kscli collection create --name oss-coll --description 'own bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket
```

## kscli collection get

Show collection details

```sh
kscli collection get (--collection-id <id> | --name <text>) [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                     |
| -------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>      | string | —        | API key                                                         |
| --base-url <url>     | string | —        | API base URL                                                    |
| --collection-id <id> | string | —        | Collection ID; alternative to --name                            |
| --config <name>      | string | —        | Use a config profile for this command                           |
| --dry-run            | switch | —        | Dry run mode                                                    |
| --help               | switch | —        | Show help                                                       |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --name <text>        | string | —        | Collection name; alternative to --collection-id                 |
| --output <format>    | string | —        | Output format: text, json                                       |
| --quiet              | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds>  | number | —        | Request timeout                                                 |
| --verbose            | switch | —        | Print HTTP request/response details                             |
| --version            | switch | —        | Print version                                                   |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Examples

```sh
kscli collection get --collection-id conn-xxx --workspace-id ws-xxx
```

```sh
kscli collection get --name my-collection
```

## kscli config set

Set a config value

```sh
kscli config set --key <key> --value <value>
```

- Authentication: none
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                                                                                                                                                           |
| ------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| --config <name>     | string | —        | Use a config profile for this command                                                                                                                                                                 |
| --dry-run           | switch | —        | Dry run mode                                                                                                                                                                                          |
| --help              | switch | —        | Show help                                                                                                                                                                                             |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit                                                                                                                                             |
| --key <key>         | string | yes      | Config key (language, base_url, output, output_dir, timeout, watermark, api_key, api_key_capabilities, access_token, access_key_id, access_key_secret, security_token, default_*_model, workspace_id) |
| --output <format>   | string | —        | Output format: text, json                                                                                                                                                                             |
| --quiet             | switch | —        | Suppress non-essential output                                                                                                                                                                         |
| --timeout <seconds> | number | —        | Request timeout                                                                                                                                                                                       |
| --value <value>     | string | yes      | Value to set                                                                                                                                                                                          |
| --verbose           | switch | —        | Print HTTP request/response details                                                                                                                                                                   |
| --version           | switch | —        | Print version                                                                                                                                                                                         |

### Examples

```sh
kscli config set --key language --value zh-CN
```

```sh
kscli config set --key output --value json
```

```sh
kscli config set --key timeout --value 600
```

```sh
kscli config set --key watermark --value false
```

```sh
kscli config set --key base_url --value https://dashscope.aliyuncs.com
```

```sh
kscli config set --config company-plan --key api-key-capabilities --value text.chat,image.generate
```

## kscli config show

Display current configuration

```sh
kscli config show
```

- Authentication: none
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                               |
| ------------------- | ------ | -------- | --------------------------------------------------------- |
| --config <name>     | string | —        | Use a config profile for this command                     |
| --dry-run           | switch | —        | Dry run mode                                              |
| --help              | switch | —        | Show help                                                 |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit |
| --output <format>   | string | —        | Output format: text, json                                 |
| --quiet             | switch | —        | Suppress non-essential output                             |
| --timeout <seconds> | number | —        | Request timeout                                           |
| --verbose           | switch | —        | Print HTTP request/response details                       |
| --version           | switch | —        | Print version                                             |

### Examples

```sh
kscli config show
```

```sh
kscli config show --output json
```

## kscli doc delete

Delete documents and their chunks from a knowledge base

```sh
kscli doc delete --index-id <id> --doc-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This permanently deletes the selected documents and all of their chunks.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --doc-id <id>       | array  | yes      | Document ID to delete (repeatable)                              |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | yes      | Knowledge base ID                                               |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes               | switch | —        | Confirm this high-risk operation                                |

### Notes

Removes documents from the knowledge base index only; the source files remain in the data center.

Use the doc_id from `knowledge doc list --quiet`, not the fileId from `knowledge doc upload`. For documents created via `knowledge create --doc-id`, the doc_id equals the fileId; for documents imported via `knowledge doc upload --index-id`, the doc_id may include a workspace suffix.

Deletion may take up to ~30s to propagate — the document may still appear in the doc list briefly.

The output lists the ids actually deleted.

### Examples

```sh
kscli doc delete --index-id idx-xxx --doc-id file-xxx --workspace-id ws-xxx --dry-run
```

```sh
kscli doc delete --index-id idx-xxx --doc-id file-a --doc-id file-b --yes
```

## kscli doc import

Import existing data-center files into an existing knowledge base

```sh
kscli doc import --index-id <id> (--doc-id <fileId> ... | --category-id <id> ...) [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                                                   | Type    | Required | Description                                                       |
| ------------------------------------------------------ | ------- | -------- | ----------------------------------------------------------------- |
| --api-key <key>                                        | string  | —        | API key                                                           |
| --base-url <url>                                       | string  | —        | API base URL                                                      |
| --category-id <id>                                     | array   | —        | Data-center category ID (repeatable; excludes --doc-id)           |
| --chunk-mode <h1\|h2\|h3\|h4\|h5\|length\|page\|regex> | string  | —        | Document chunk mode (not video time slicing)                      |
| --chunk-size <characters>                              | number  | —        | Document chunk size, 1-6000 characters                            |
| --config <name>                                        | string  | —        | Use a config profile for this command                             |
| --doc-id <fileId>                                      | array   | —        | Existing data-center file ID (repeatable; excludes --category-id) |
| --dry-run                                              | switch  | —        | Dry run mode                                                      |
| --enable-headers <true\|false>                         | boolean | —        | Enable document header extraction                                 |
| --help                                                 | switch  | —        | Show help                                                         |
| --index-id <id>                                        | string  | yes      | Existing knowledge base ID                                        |
| --introspect                                           | switch  | —        | Print the machine-readable command schema (JSON) and exit         |
| --output <format>                                      | string  | —        | Output format: text, json                                         |
| --overlap-size <characters>                            | number  | —        | Document overlap size, 0-1024 characters                          |
| --poll-interval <seconds>                              | number  | —        | Polling interval (default: 5 seconds)                             |
| --quiet                                                | switch  | —        | Suppress non-essential output                                     |
| --separator <regex>                                    | string  | —        | Separator for regex chunk mode                                    |
| --timeout <seconds>                                    | number  | —        | Request timeout                                                   |
| --verbose                                              | switch  | —        | Print HTTP request/response details                               |
| --version                                              | switch  | —        | Print version                                                     |
| --wait                                                 | switch  | —        | Wait for the import job to finish                                 |
| --workspace-id <id>                                    | string  | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)   |

### Notes

Reuses file IDs without uploading again. Importing may start parsing and indexing. --doc-id takes a data-center fileId.

### Examples

```sh
kscli doc import --index-id idx-xxx --doc-id file-xxx --wait
```

```sh
kscli doc import --index-id idx-xxx --category-id category-xxx --dry-run
```

## kscli doc import-oss

Batch import files from an authorized OSS bucket into the data center

```sh
kscli doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                        | Type   | Required | Description                                                     |
| --------------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>             | string | —        | API key                                                         |
| --base-url <url>            | string | —        | API base URL                                                    |
| --bucket <name>             | string | yes      | Authorized OSS bucket name                                      |
| --category-id <id>          | string | —        | Target data-center category (default: the default category)     |
| --config <name>             | string | —        | Use a config profile for this command                           |
| --dry-run                   | switch | —        | Dry run mode                                                    |
| --help                      | switch | —        | Show help                                                       |
| --introspect                | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --oss-key <key>             | array  | yes      | OSS object key to import (repeatable, 1-10 per call)            |
| --output <format>           | string | —        | Output format: text, json                                       |
| --overwrite                 | switch | —        | Overwrite files previously imported from the same OSS keys      |
| --parser <name>             | string | —        | File parser (e.g. AUTO_SELECT or DOCMIND_LLM_VERSION_MEDIA)     |
| --parser-config-file <path> | string | —        | JSON object containing parser configuration                     |
| --quiet                     | switch | —        | Suppress non-essential output                                   |
| --region <id>               | string | yes      | OSS region id (e.g. cn-beijing)                                 |
| --tag <text>                | array  | —        | File tag applied to every imported file (repeatable, up to 10)  |
| --timeout <seconds>         | number | —        | Request timeout                                                 |
| --verbose                   | switch | —        | Print HTTP request/response details                             |
| --version                   | switch | —        | Print version                                                   |
| --workspace-id <id>         | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

The bucket must be authorized to the platform service role beforehand; permission errors from the server are passed through with a pointer to check AliyunServiceRoleForBailian in the RAM console.

File names are derived from the OSS key basename.

--overwrite replaces the previously imported file and issues a NEW fileId (the old one becomes invalid) — verified live.

### Examples

```sh
kscli doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx
```

```sh
kscli doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite
```

## kscli doc list

List documents in a knowledge base with parse/index status

```sh
kscli doc list --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --details           | switch | —        | Include file-level chunk configuration (page size up to 10)     |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | yes      | Knowledge base ID                                               |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --page-number <n>   | number | —        | Page number (default: 1)                                        |
| --page-size <n>     | number | —        | Page size per request                                           |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

Documents with status FAILED are highlighted in text mode — use the import job status command to inspect failures.

Page size defaults to 10; max 100 normally, or 10 with --details.

### Examples

```sh
kscli doc list --index-id idx-xxx --workspace-id ws-xxx
```

```sh
kscli doc list --index-id idx-xxx --page-size 100
```

## kscli doc status

Check knowledge base import job status

```sh
kscli doc status --index-id <id> --job-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                      | Type   | Required | Description                                                     |
| ------------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>           | string | —        | API key                                                         |
| --base-url <url>          | string | —        | API base URL                                                    |
| --config <name>           | string | —        | Use a config profile for this command                           |
| --dry-run                 | switch | —        | Dry run mode                                                    |
| --help                    | switch | —        | Show help                                                       |
| --index-id <id>           | string | yes      | Knowledge base ID                                               |
| --introspect              | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --job-id <id>             | string | yes      | Import job ID (ingestionId returned by import commands)         |
| --output <format>         | string | —        | Output format: text, json                                       |
| --page-number <n>         | number | —        | Page number (default: 1)                                        |
| --page-size <n>           | number | —        | Page size per request                                           |
| --poll-interval <seconds> | number | —        | Polling interval when waiting (default: 5)                      |
| --quiet                   | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds>       | number | —        | Request timeout                                                 |
| --verbose                 | switch | —        | Print HTTP request/response details                             |
| --version                 | switch | —        | Print version                                                   |
| --wait                    | switch | —        | Poll until the job reaches a terminal state                     |
| --workspace-id <id>       | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

Both --index-id and --job-id are required (passing only one returns SystemError).

If you see a SystemError, the job may not exist — check the ingestion id in the document list output.

Overall job states are PENDING / RUNNING / COMPLETED; per-document failures (for example PARSE_FAILED) exit non-zero with the error message passed through.

### Examples

```sh
kscli doc status --index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx
```

```sh
kscli doc status --index-id idx-xxx --job-id job-xxx --wait --poll-interval 10
```

## kscli doc sync

Synchronize a local document directory to a knowledge base

```sh
kscli doc sync --dir <path> --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: read-only

**Risk: high (destructive)**

Sync may replace or delete managed index documents. Preview affected paths before confirming.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

`--dry-run` may authenticate and read remote resources; it makes no resource or checkpoint changes.

### Flags

| Flag                      | Type   | Required | Description                                                       |
| ------------------------- | ------ | -------- | ----------------------------------------------------------------- |
| --api-key <key>           | string | —        | API key                                                           |
| --base-url <url>          | string | —        | API base URL                                                      |
| --category-id <id>        | string | —        | Data-center category ID (default: workspace default on first run) |
| --config <name>           | string | —        | Use a config profile for this command                             |
| --delete                  | switch | —        | Delete managed index documents missing locally                    |
| --dir <path>              | string | yes      | Local document directory                                          |
| --dry-run                 | switch | —        | Dry run mode                                                      |
| --help                    | switch | —        | Show help                                                         |
| --index-id <id>           | string | yes      | Target knowledge base ID                                          |
| --introspect              | switch | —        | Print the machine-readable command schema (JSON) and exit         |
| --output <format>         | string | —        | Output format: text, json                                         |
| --poll-interval <seconds> | number | —        | Polling interval (default: 5 seconds)                             |
| --quiet                   | switch | —        | Suppress non-essential output                                     |
| --state-file <path>       | string | —        | Checkpoint path (default: <dir>/.bailian/sync-state.json)         |
| --sync-id <uuid>          | string | —        | Synchronization set UUID                                          |
| --timeout <seconds>       | number | —        | Request timeout                                                   |
| --verbose                 | switch | —        | Print HTTP request/response details                               |
| --version                 | switch | —        | Print version                                                     |
| --workspace-id <id>       | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)   |
| --yes                     | switch | —        | Confirm this high-risk operation                                  |

### Notes

Dry-run reads remote resources but makes no resource or checkpoint changes. Replacement and deletion require confirmation. Source files are retained.

Keep the state file and allow only one writer per synchronization set, including across CI machines. Model import charges may apply; deleting documents does not stop knowledge base charges.

### Examples

```sh
kscli doc sync --dir ./docs --index-id idx-example --dry-run
```

```sh
kscli doc sync --dir ./docs --index-id idx-example --yes
```

```sh
kscli doc sync --dir ./docs --index-id idx-example --delete --dry-run
```

## kscli doc tag

Batch update tags on data-center files

```sh
kscli doc tag --doc-id <id> --tag <text> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --doc-id <id>       | array  | yes      | Data-center file ID to tag (repeatable, 1-20 per call)          |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --mode <mode>       | string | —        | Update mode: append (default) or overwrite                      |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --tag <text>        | array  | yes      | Tag applied to every --doc-id (repeatable, each up to 32 chars) |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

The same tag set is applied to every --doc-id; run the command multiple times for different tag sets.

Server limits: up to 100 tags per file, total tag length up to 700 chars, tag up to 32 chars.

### Examples

```sh
kscli doc tag --doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx
```

```sh
kscli doc tag --doc-id file-a --doc-id file-b --tag final --mode overwrite
```

## kscli doc upload

Upload local files or directories to the data center and optionally import into a knowledge base

```sh
kscli doc upload --file <path> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                                         | Type   | Required | Description                                                                                                     |
| -------------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| --api-key <key>                              | string | —        | API key                                                                                                         |
| --base-url <url>                             | string | —        | API base URL                                                                                                    |
| --category-id <id>                           | string | —        | Target data-center category; defaults to the workspace default category                                         |
| --category-type <UNSTRUCTURED\|SESSION_FILE> | string | —        | File category type (SESSION_FILE for temporary chat attachments)                                                |
| --config <name>                              | string | —        | Use a config profile for this command                                                                           |
| --dry-run                                    | switch | —        | Dry run mode                                                                                                    |
| --file <path>                                | array  | yes      | Local file or directory path (repeatable). Directories are scanned recursively; unsupported formats are skipped |
| --help                                       | switch | —        | Show help                                                                                                       |
| --index-id <id>                              | string | —        | Import into this knowledge base after registration (one job for all files)                                      |
| --introspect                                 | switch | —        | Print the machine-readable command schema (JSON) and exit                                                       |
| --output <format>                            | string | —        | Output format: text, json                                                                                       |
| --parser <name>                              | string | —        | File parser (e.g. AUTO_SELECT or DOCMIND_LLM_VERSION_MEDIA)                                                     |
| --parser-config-file <path>                  | string | —        | JSON object containing parser configuration                                                                     |
| --poll-interval <seconds>                    | number | —        | Polling interval when waiting (default: 5)                                                                      |
| --quiet                                      | switch | —        | Suppress non-essential output                                                                                   |
| --tag <text>                                 | array  | —        | File tag (repeatable), applied to every uploaded file                                                           |
| --timeout <seconds>                          | number | —        | Request timeout                                                                                                 |
| --verbose                                    | switch | —        | Print HTTP request/response details                                                                             |
| --version                                    | switch | —        | Print version                                                                                                   |
| --wait                                       | switch | —        | Poll the import job to a terminal state (needs --index-id)                                                      |
| --workspace-id <id>                          | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                 |

### Notes

Audio/video files support up to 2 GiB (2,147,483,648 bytes) each. With --index-id, at most 50 local media files per call; no automatic splitting.

Pipeline: apply upload lease → PUT to OSS → register file → (with --index-id) create import job.

Without --category-id the workspace default category is resolved automatically.

Directories are scanned recursively; node_modules, .git, and similar are skipped automatically.

Multiple files are processed sequentially; on failure, already-registered file ids are listed in the error hint.

### Examples

```sh
kscli doc upload --file ./a.md --workspace-id ws-xxx
```

```sh
kscli doc upload --file ./a.md --file ./b.pdf --index-id idx-xxx --wait
```

```sh
kscli doc upload --file ./docs/ --workspace-id ws-xxx
```

```sh
kscli doc upload --file ./docs/ --dry-run --verbose
```

## kscli file delete

Permanently delete a file from the data center

```sh
kscli file delete --file-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This permanently deletes the data-center file. Knowledge-base document indexes that reference it may become invalid.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --file-id <id>      | string | yes      | Data-center file ID to delete                                   |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes               | switch | —        | Confirm this high-risk operation                                |

### Notes

Irreversible. If knowledge bases reference this file, their related document indexes become invalid.

To remove a document from a single knowledge base only, use the document delete command instead.

### Examples

```sh
kscli file delete --file-id file-xxx --workspace-id ws-xxx
```

```sh
kscli file delete --file-id file-xxx --yes
```

## kscli file get

Show data-center file details (size, MD5, tags, timestamps)

```sh
kscli file get --file-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --file-id <id>      | string | yes      | Data-center file ID                                             |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Examples

```sh
kscli file get --file-id file-xxx --workspace-id ws-xxx
```

## kscli file list

List files in a data-center category

```sh
kscli file list --category-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                            |
| -------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| --api-key <key>      | string | —        | API key                                                                |
| --base-url <url>     | string | —        | API base URL                                                           |
| --category-id <id>   | string | yes      | Category to list (find ids via the category list command); exact match |
| --config <name>      | string | —        | Use a config profile for this command                                  |
| --dry-run            | switch | —        | Dry run mode                                                           |
| --file-id <id>       | array  | —        | Filter by exact file ID (repeatable)                                   |
| --help               | switch | —        | Show help                                                              |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit              |
| --max-result <n>     | number | —        | Items per page                                                         |
| --name <text>        | string | —        | Filter by exact file name without its extension (a.md → pass a)        |
| --next-token <token> | string | —        | Cursor for the next page (from previous output)                        |
| --output <format>    | string | —        | Output format: text, json                                              |
| --quiet              | switch | —        | Suppress non-essential output                                          |
| --timeout <seconds>  | number | —        | Request timeout                                                        |
| --verbose            | switch | —        | Print HTTP request/response details                                    |
| --version            | switch | —        | Print version                                                          |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)        |

### Notes

A real category id is required — the default value is not resolved here. Find the id via the category list command.

--name matches the exact file name without its extension (for a.md pass a); partial keywords return no results.

Pagination is cursor-based: reuse the printed next token to continue.

### Examples

```sh
kscli file list --category-id cate-xxx --workspace-id ws-xxx
```

```sh
kscli file list --category-id cate-xxx --name report
```

## kscli init

Initialize a knowledge base and verify sample retrieval

```sh
kscli init [--name <name>] [--state-file <path>] [flags]
```

- Authentication: apiKey
- Preparation: read-only

**Risk: high (billing)**

Knowledge bases accrue running-time charges from creation, even without queries. The one-time 720-hour allowance is shared across Standard Edition knowledge bases and expires 30 days after service activation for new users. Model calls are billed separately. Your remaining allowance has not been verified. Delete unused knowledge bases to stop their running-time charges.
https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

`--dry-run` may authenticate and read remote resources; it makes no resource or checkpoint changes.

### Flags

| Flag                      | Type   | Required | Description                                                     |
| ------------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>           | string | —        | API key                                                         |
| --base-url <url>          | string | —        | API base URL                                                    |
| --config <name>           | string | —        | Use a config profile for this command                           |
| --dry-run                 | switch | —        | Dry run mode                                                    |
| --help                    | switch | —        | Show help                                                       |
| --introspect              | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --name <name>             | string | —        | Knowledge base name (1-20 characters; default: cli-demo)        |
| --output <format>         | string | —        | Output format: text, json                                       |
| --poll-interval <seconds> | number | —        | Polling interval (default: 5 seconds)                           |
| --quiet                   | switch | —        | Suppress non-essential output                                   |
| --state-file <path>       | string | —        | Recovery checkpoint (default: .bailian/knowledge/init.json)     |
| --timeout <seconds>       | number | —        | Request timeout                                                 |
| --verbose                 | switch | —        | Print HTTP request/response details                             |
| --version                 | switch | —        | Print version                                                   |
| --workspace-id <id>       | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes                     | switch | —        | Confirm this high-risk operation                                |

### Notes

Creating a knowledge base starts running-time billing. The 720-hour Standard Edition allowance is shared and time limited; remaining balance is not verified. Confirm creation with --yes.

--dry-run requires credentials and reads existing resources, but makes no resource or checkpoint changes. Keep the state file for recovery.

Creates a retrieval service using its beta draft; does not publish a service or create a chat service. Closing the CLI does not stop knowledge-base charges.

### Examples

```sh
kscli init --dry-run
```

```sh
kscli init --yes
```

```sh
kscli init --name my-demo --state-file .bailian/my-demo.json --yes
```

## kscli kb create

Create a knowledge base and import data-center files or categories

```sh
kscli kb create --name <text> --description <text> (--doc-id <id> | --category-id <id>) [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high (billing)**

Knowledge bases accrue running-time charges from creation, even without queries. The one-time 720-hour allowance is shared across Standard Edition knowledge bases and expires 30 days after service activation for new users. Model calls are billed separately. Your remaining allowance has not been verified. Delete unused knowledge bases to stop their running-time charges.
https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                                    | Type   | Required | Description                                                                                               |
| --------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| --api-key <key>                         | string | —        | API key                                                                                                   |
| --base-url <url>                        | string | —        | API base URL                                                                                              |
| --category-id <id>                      | array  | —        | Import every file under this category (repeatable); mutually exclusive with --doc-id                      |
| --chunk-size <n>                        | number | —        | Chunk size in characters (default: 600, recommended 300-800)                                              |
| --config <name>                         | string | —        | Use a config profile for this command                                                                     |
| --description <text>                    | string | yes      | What this knowledge base holds and what it is for — tells bases apart in the workspace list (1-500 chars) |
| --doc-id <id>                           | array  | —        | Data-center file id to import (repeatable); mutually exclusive with --category-id                         |
| --dry-run                               | switch | —        | Dry run mode                                                                                              |
| --embedding-model <name>                | string | —        | Embedding model name (document default: text-embedding-v4; multimedia/visual scene: qwen3-vl-embedding)   |
| --help                                  | switch | —        | Show help                                                                                                 |
| --introspect                            | switch | —        | Print the machine-readable command schema (JSON) and exit                                                 |
| --knowledge-scene <scene>               | string | —        | Knowledge scene (requires --knowledge-type)                                                               |
| --knowledge-type <document\|multimedia> | string | —        | Knowledge type: document or multimedia                                                                    |
| --multimodal-embedding-model <name>     | string | —        | Multimodal embedding model (multimedia/visual scene: alias of --embedding-model)                          |
| --name <text>                           | string | yes      | Knowledge base name (1-20 chars, unique in workspace)                                                     |
| --output <format>                       | string | —        | Output format: text, json                                                                                 |
| --poll-interval <seconds>               | number | —        | Polling interval when waiting (default: 5)                                                                |
| --quiet                                 | switch | —        | Suppress non-essential output                                                                             |
| --timeout <seconds>                     | number | —        | Request timeout                                                                                           |
| --verbose                               | switch | —        | Print HTTP request/response details                                                                       |
| --version                               | switch | —        | Print version                                                                                             |
| --wait                                  | switch | —        | Poll the initial import job to a terminal state                                                           |
| --workspace-id <id>                     | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                           |
| --yes                                   | switch | —        | Confirm this high-risk operation                                                                          |

### Notes

Structure/sink types are unstructured and BUILT_IN. Multimedia uses basic_multimedia_qa, qwen3-vl-embedding and qwen3-vl-rerank with similar reranking. Allowed explicit models are validated by the server.

Returns the knowledge base id (pipelineId) and the initial import job id (ingestionId).

Use the import job status command (or --wait) to track the initial import.

### Examples

```sh
kscli kb create --name media-demo --description media --doc-id file-xxx --knowledge-type multimedia
```

```sh
kscli kb create --name demo --description 'product docs' --doc-id file-xxx --workspace-id ws-xxx
```

```sh
kscli kb create --name demo --description 'product docs' --category-id cate-xxx --wait
```

## kscli kb delete

Delete a knowledge base with all its documents and chunks

```sh
kscli kb delete --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This permanently deletes the knowledge base and all of its documents and chunks. Data-center files are not deleted.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | yes      | Knowledge base ID                                               |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes               | switch | —        | Confirm this high-risk operation                                |

### Notes

Irreversible — the knowledge base and all indexed content are permanently removed.

Files in the data center are not affected; only the knowledge base index is deleted.

### Examples

```sh
kscli kb delete --index-id idx-xxx --workspace-id ws-xxx
```

```sh
kscli kb delete --index-id idx-xxx --yes
```

## kscli kb info

Show knowledge base configuration details

```sh
kscli kb info --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | yes      | Knowledge base ID                                               |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

Indexing settings are immutable; changing them requires recreating the knowledge base.

### Examples

```sh
kscli kb info --index-id idx-xxx --workspace-id ws-xxx
```

## kscli kb list

List knowledge bases in the workspace

```sh
kscli kb list [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --name <text>       | string | —        | Filter by knowledge base name (fuzzy match, 1-20 chars)         |
| --output <format>   | string | —        | Output format: text, json                                       |
| --page-number <n>   | number | —        | Page number (default: 1)                                        |
| --page-size <n>     | number | —        | Page size per request                                           |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

Auth: uses DashScope API Key (Bearer token).

`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.

Use the returned id as --index-id in knowledge base / document management commands.

### Examples

```sh
kscli kb list --workspace-id ws-xxx
```

```sh
kscli kb list --name demo --page-number 2 --page-size 50
```

## kscli kb stats

Show knowledge base storage and QPS monitoring data

```sh
kscli kb stats --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                                        |
| ------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| --api-key <key>     | string | —        | API key                                                                            |
| --base-url <url>    | string | —        | API base URL                                                                       |
| --config <name>     | string | —        | Use a config profile for this command                                              |
| --dry-run           | switch | —        | Dry run mode                                                                       |
| --end <time>        | string | —        | Range end: Unix seconds or ISO date, must be in the past (default: now)            |
| --help              | switch | —        | Show help                                                                          |
| --index-id <id>     | string | yes      | Knowledge base ID                                                                  |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit                          |
| --output <format>   | string | —        | Output format: text, json                                                          |
| --quiet             | switch | —        | Suppress non-essential output                                                      |
| --start <time>      | string | —        | Range start: Unix seconds or ISO date, must be in the past (default: 24 hours ago) |
| --timeout <seconds> | number | —        | Request timeout                                                                    |
| --verbose           | switch | —        | Print HTTP request/response details                                                |
| --version           | switch | —        | Print version                                                                      |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                    |

### Notes

Defaults to the last 24 hours when --start/--end are omitted.

Timestamps are normalized to epoch seconds as required by the server.

Future timestamps are rejected for --start and clamped to now for --end, since the monitor API only returns past data.

### Examples

```sh
kscli kb stats --index-id idx-xxx --workspace-id ws-xxx
```

```sh
kscli kb stats --index-id idx-xxx --start 2026-07-30 --end 2026-07-31
```

## kscli kb update

Update knowledge base name, description or rerank threshold

```sh
kscli kb update --index-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                       | Type   | Required | Description                                                           |
| -------------------------- | ------ | -------- | --------------------------------------------------------------------- |
| --api-key <key>            | string | —        | API key                                                               |
| --base-url <url>           | string | —        | API base URL                                                          |
| --config <name>            | string | —        | Use a config profile for this command                                 |
| --description <text>       | string | —        | New knowledge base description                                        |
| --dry-run                  | switch | —        | Dry run mode                                                          |
| --help                     | switch | —        | Show help                                                             |
| --index-id <id>            | string | yes      | Knowledge base ID                                                     |
| --introspect               | switch | —        | Print the machine-readable command schema (JSON) and exit             |
| --name <text>              | string | —        | New knowledge base name (1-20 chars)                                  |
| --output <format>          | string | —        | Output format: text, json                                             |
| --quiet                    | switch | —        | Suppress non-essential output                                         |
| --rerank-min-score <score> | number | —        | Rerank minimum score threshold, range 0-1 (chunks below are filtered) |
| --timeout <seconds>        | number | —        | Request timeout                                                       |
| --verbose                  | switch | —        | Print HTTP request/response details                                   |
| --version                  | switch | —        | Print version                                                         |
| --workspace-id <id>        | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)       |

### Notes

Indexing settings (embedding model, chunk size, etc.) are immutable — recreate the knowledge base to change them.

### Examples

```sh
kscli kb update --index-id idx-xxx --description 'product docs v2' --workspace-id ws-xxx
```

```sh
kscli kb update --index-id idx-xxx --rerank-min-score 0.3
```

## kscli search

Search a Bailian knowledge base (RAG semantic retrieval)

```sh
kscli search --agent-id <id> (--query <text> | --image <url>) [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                            | Type   | Required | Description                                                                                                        |
| ------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| --agent-id <id>                 | string | yes      | Retrieval service ID (find in console knowledge retrieval page)                                                    |
| --agent-version <version>       | string | —        | Service version to call: beta (draft for debugging) or a published number; default is the latest published version |
| --api-key <key>                 | string | —        | API key                                                                                                            |
| --base-url <url>                | string | —        | API base URL                                                                                                       |
| --config <name>                 | string | —        | Use a config profile for this command                                                                              |
| --dry-run                       | switch | —        | Dry run mode                                                                                                       |
| --help                          | switch | —        | Show help                                                                                                          |
| --image <url>                   | array  | —        | Image URL for multimodal retrieval (repeatable)                                                                    |
| --introspect                    | switch | —        | Print the machine-readable command schema (JSON) and exit                                                          |
| --kb-search-configs-file <path> | string | —        | JSON array of knowledge IDs and online search_filters                                                              |
| --output <format>               | string | —        | Output format: text, json                                                                                          |
| --query <text>                  | string | —        | Search text (or provide --image)                                                                                   |
| --quiet                         | switch | —        | Suppress non-essential output                                                                                      |
| --timeout <seconds>             | number | —        | Request timeout                                                                                                    |
| --verbose                       | switch | —        | Print HTTP request/response details                                                                                |
| --version                       | switch | —        | Print version                                                                                                      |
| --workspace-id <id>             | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                    |

### Notes

Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Provide agent_id and at least one query or image.

Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.

`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.

`--agent-version beta` calls the draft config for debugging before it is deployed.

### Examples

```sh
kscli search --query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli search --api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg
```

## kscli service copy

Copy a service into a new draft (name gets a copy_ prefix)

```sh
kscli service copy --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --agent-id <id>     | string | yes      | Source service (agent) ID to copy                               |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

The copy starts as a beta draft; test it with --agent-version beta, then deploy to publish.

Requires the knowledge-base create permission in the workspace.

### Examples

```sh
kscli service copy --agent-id aid-xxx --workspace-id ws-xxx
```

## kscli service create

Create a retrieval / Q&A service (initial status: draft, version: beta)

```sh
kscli service create --name <text> --scene <chat|search> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                 | Type   | Required | Description                                                                                                            |
| -------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| --api-key <key>      | string | —        | API key                                                                                                                |
| --base-url <url>     | string | —        | API base URL                                                                                                           |
| --config <name>      | string | —        | Use a config profile for this command                                                                                  |
| --config-file <path> | string | —        | Complete agent_config JSON file (excludes --index-id)                                                                  |
| --description <text> | string | —        | What this service answers and who it serves — recommended: agents read it to pick the right service (up to 1000 chars) |
| --dry-run            | switch | —        | Dry run mode                                                                                                           |
| --help               | switch | —        | Show help                                                                                                              |
| --index-id <id>      | string | —        | Bind this knowledge base; other settings use server defaults                                                           |
| --introspect         | switch | —        | Print the machine-readable command schema (JSON) and exit                                                              |
| --name <text>        | string | yes      | Service name (up to 200 chars, unique per scene in the workspace)                                                      |
| --output <format>    | string | —        | Output format: text, json                                                                                              |
| --quiet              | switch | —        | Suppress non-essential output                                                                                          |
| --scene <scene>      | string | yes      | Service scene: chat (Q&A) or search (retrieval)                                                                        |
| --timeout <seconds>  | number | —        | Request timeout                                                                                                        |
| --verbose            | switch | —        | Print HTTP request/response details                                                                                    |
| --version            | switch | —        | Print version                                                                                                          |
| --workspace-id <id>  | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                        |

### Notes

Rerank options depend on each knowledge base: image/multimedia or visual_perception_qa/basic_multimedia_qa use multimodal models (currently qwen3-vl-rerank). Hybrid rerank uses multimodal options if any bound base requires them. Explicit configs are preserved; the server validates model compatibility.

Without an explicit configuration the server applies its default agent settings.

The draft (beta) version can be tested via --agent-version beta on search/chat before deploying.

Requires the knowledge-base create permission in the workspace.

### Examples

```sh
kscli service create --name my-qa --scene chat --description 'answers product FAQs' --workspace-id ws-xxx
```

```sh
kscli service create --name my-search --scene search --index-id idx-xxx
```

## kscli service delete

Delete a retrieval / Q&A service (soft delete, idempotent)

```sh
kscli service delete --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This deletes the service and makes its agent ID unavailable for search and chat calls. The operation cannot be undone.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --agent-id <id>     | string | yes      | Service (agent) ID                                              |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>   | string | —        | Output format: text, json                                       |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes               | switch | —        | Confirm this high-risk operation                                |

### Notes

Deletion cannot be undone; the agent_id becomes unusable for search and chat calls.

Idempotent — deleting an already-deleted service does not fail.

Requires the knowledge-base delete permission in the workspace.

### Examples

```sh
kscli service delete --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli service delete --agent-id aid-xxx --yes
```

## kscli service deploy

Publish the beta draft of a service as a new version

```sh
kscli service deploy --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

**Risk: high**

This publishes the current draft as a new version and changes the behavior seen by live callers.

Use `--yes` only after the user has confirmed this operation and its scope. Exit code 7 is a confirmation request, not a bug.

### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| --agent-id <id>       | string | yes      | Service (agent) ID                                              |
| --api-key <key>       | string | —        | API key                                                         |
| --base-url <url>      | string | —        | API base URL                                                    |
| --config <name>       | string | —        | Use a config profile for this command                           |
| --dry-run             | switch | —        | Dry run mode                                                    |
| --help                | switch | —        | Show help                                                       |
| --introspect          | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --output <format>     | string | —        | Output format: text, json                                       |
| --quiet               | switch | —        | Suppress non-essential output                                   |
| --timeout <seconds>   | number | —        | Request timeout                                                 |
| --verbose             | switch | —        | Print HTTP request/response details                             |
| --version             | switch | —        | Print version                                                   |
| --version-desc <text> | string | —        | Description for the newly published version                     |
| --workspace-id <id>   | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| --yes                 | switch | —        | Confirm this high-risk operation                                |

### Notes

The version number auto-increments; status becomes deployed.

Publishing affects live callers — the confirmation prompt guards against accidents.

Requires the knowledge-base modify permission in the workspace.

### Examples

```sh
kscli service deploy --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli service deploy --agent-id aid-xxx --version-desc 'tuned rerank params' --yes
```

## kscli service get

Show service (agent) details including per-version configuration

```sh
kscli service get --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                      | Type   | Required | Description                                                                     |
| ------------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| --agent-id <id>           | string | yes      | Service (agent) ID                                                              |
| --agent-version <version> | string | —        | Specific version to inspect (beta or a published number); omit for all versions |
| --api-key <key>           | string | —        | API key                                                                         |
| --base-url <url>          | string | —        | API base URL                                                                    |
| --config <name>           | string | —        | Use a config profile for this command                                           |
| --dry-run                 | switch | —        | Dry run mode                                                                    |
| --help                    | switch | —        | Show help                                                                       |
| --introspect              | switch | —        | Print the machine-readable command schema (JSON) and exit                       |
| --output <format>         | string | —        | Output format: text, json                                                       |
| --quiet                   | switch | —        | Suppress non-essential output                                                   |
| --timeout <seconds>       | number | —        | Request timeout                                                                 |
| --verbose                 | switch | —        | Print HTTP request/response details                                             |
| --version                 | switch | —        | Print version                                                                   |
| --workspace-id <id>       | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                 |

### Notes

Without --agent-version all versions are returned (beta draft plus published numbers).

The version value is passed through as-is; the valid set is server-side state.

### Examples

```sh
kscli service get --agent-id aid-xxx --workspace-id ws-xxx
```

```sh
kscli service get --agent-id aid-xxx --agent-version beta
```

## kscli service list

List retrieval / Q&A services (agents) in the workspace

```sh
kscli service list --scene <chat|search> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| --agent-id <id>     | string | —        | Filter by exact agent ID                                        |
| --api-key <key>     | string | —        | API key                                                         |
| --base-url <url>    | string | —        | API base URL                                                    |
| --config <name>     | string | —        | Use a config profile for this command                           |
| --dry-run           | switch | —        | Dry run mode                                                    |
| --help              | switch | —        | Show help                                                       |
| --index-id <id>     | string | —        | Filter by exact linked knowledge base (pipeline) ID             |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit       |
| --name <text>       | string | —        | Filter by service name (fuzzy match)                            |
| --output <format>   | string | —        | Output format: text, json                                       |
| --page-number <n>   | number | —        | Page number (default: 1)                                        |
| --page-size <n>     | number | —        | Page size per request                                           |
| --quiet             | switch | —        | Suppress non-essential output                                   |
| --scene <scene>     | string | yes      | Service scene: chat (Q&A) or search (retrieval)                 |
| --status <status>   | string | —        | Filter by status: draft, deployed (includes edited) or deleted  |
| --timeout <seconds> | number | —        | Request timeout                                                 |
| --verbose           | switch | —        | Print HTTP request/response details                             |
| --version           | switch | —        | Print version                                                   |
| --workspace-id <id> | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |

### Notes

A scene (chat or search) is required — run once per scene to see both.

Use the returned agent_id with the search or chat commands, or with service management commands.

### Examples

```sh
kscli service list --scene chat --workspace-id ws-xxx
```

```sh
kscli service list --scene search --status deployed
```

## kscli service update

Update service name, description or draft configuration

```sh
kscli service update --agent-id <id> [flags]
```

- Authentication: apiKey
- Preparation: none

### Flags

| Flag                         | Type   | Required | Description                                                                                                                          |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| --agent-id <id>              | string | yes      | Service (agent) ID                                                                                                                   |
| --agent-version <version>    | string | —        | Target version (default: beta draft). Published versions only accept --version-desc                                                  |
| --api-key <key>              | string | —        | API key                                                                                                                              |
| --base-url <url>             | string | —        | API base URL                                                                                                                         |
| --config <name>              | string | —        | Use a config profile for this command                                                                                                |
| --config-file <path>         | string | —        | JSON file replacing the whole agent_config (for nested settings like kb_search_configs); mutually exclusive with scalar config flags |
| --description <text>         | string | —        | New service description (up to 1000 chars)                                                                                           |
| --dry-run                    | switch | —        | Dry run mode                                                                                                                         |
| --enable-anti-leak <bool>    | string | —        | Enable anti prompt-leak: true or false                                                                                               |
| --enable-citation <bool>     | string | —        | Enable citations: true or false                                                                                                      |
| --enable-refusal <bool>      | string | —        | Enable refusal answers: true or false                                                                                                |
| --enable-rich-text <bool>    | string | —        | Enable rich text output: true or false                                                                                               |
| --enable-session-file <bool> | string | —        | Enable session files: true or false                                                                                                  |
| --help                       | switch | —        | Show help                                                                                                                            |
| --introspect                 | switch | —        | Print the machine-readable command schema (JSON) and exit                                                                            |
| --max-llm-calls <n>          | number | —        | Max LLM calls per request, range 1-30                                                                                                |
| --model <name>               | string | —        | Generation model code (must be in the platform allowlist)                                                                            |
| --name <text>                | string | —        | New service name (up to 200 chars)                                                                                                   |
| --output <format>            | string | —        | Output format: text, json                                                                                                            |
| --policy <policy>            | string | —        | Agent policy: turbo (fast) or agentic (multi-turn)                                                                                   |
| --quiet                      | switch | —        | Suppress non-essential output                                                                                                        |
| --temperature <n>            | number | —        | Sampling temperature, range 0-2                                                                                                      |
| --timeout <seconds>          | number | —        | Request timeout                                                                                                                      |
| --verbose                    | switch | —        | Print HTTP request/response details                                                                                                  |
| --version                    | switch | —        | Print version                                                                                                                        |
| --version-desc <text>        | string | —        | Version description                                                                                                                  |
| --workspace-id <id>          | string | —        | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                                      |

### Notes

Rerank options depend on each knowledge base: image/multimedia or visual_perception_qa/basic_multimedia_qa use multimodal models (currently qwen3-vl-rerank). Hybrid rerank uses multimodal options if any bound base requires them. Explicit configs are preserved; the server validates model compatibility.

Configuration changes only apply to the beta draft; published versions accept --version-desc only.

To change the configuration of a published version, first update the beta draft (this command without --agent-version or with --agent-version beta), then run service deploy to publish a new version.

Scalar config flags merge into the current draft config (read-merge-write); --config-file replaces the whole config and is mutually exclusive with them.

After updating the draft, verify with --agent-version beta on search/chat, then deploy.

Requires the knowledge-base modify permission in the workspace.

### Examples

```sh
kscli service update --agent-id aid-xxx --temperature 0.7 --workspace-id ws-xxx
```

```sh
kscli service update --agent-id aid-xxx --config-file ./agent-config.json
```

```sh
kscli service update --agent-id aid-xxx --agent-version 1 --version-desc 'first stable release'
```

## kscli update

Update the CLI to the latest or a specified version

```sh
kscli update [--to <version>]
```

- Authentication: none
- Preparation: none

### Flags

| Flag                | Type   | Required | Description                                               |
| ------------------- | ------ | -------- | --------------------------------------------------------- |
| --config <name>     | string | —        | Use a config profile for this command                     |
| --dry-run           | switch | —        | Dry run mode                                              |
| --help              | switch | —        | Show help                                                 |
| --introspect        | switch | —        | Print the machine-readable command schema (JSON) and exit |
| --output <format>   | string | —        | Output format: text, json                                 |
| --quiet             | switch | —        | Suppress non-essential output                             |
| --timeout <seconds> | number | —        | Request timeout                                           |
| --to <version>      | string | —        | Install this exact version instead of the latest          |
| --verbose           | switch | —        | Print HTTP request/response details                       |
| --version           | switch | —        | Print version                                             |

### Examples

```sh
kscli update
```

```sh
kscli update --to 0.1.14
```
