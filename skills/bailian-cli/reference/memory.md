# `bl memory` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Authentication | Description                                                   |
| -------------------------- | -------------- | ------------------------------------------------------------- |
| `bl memory add`            | API Key        | Add memory from messages or custom content (async extraction) |
| `bl memory delete`         | API Key        | Delete a memory node                                          |
| `bl memory list`           | API Key        | List memory nodes for a user                                  |
| `bl memory node show`      | API Key        | Show a single memory node with full detail                    |
| `bl memory profile create` | API Key        | Create a user profile schema for memory profiling             |
| `bl memory profile delete` | API Key        | Delete a profile schema                                       |
| `bl memory profile get`    | API Key        | Get the extracted user profile for a schema                   |
| `bl memory profile list`   | API Key        | List profile schemas                                          |
| `bl memory profile show`   | API Key        | Show a profile schema definition with attribute IDs           |
| `bl memory profile update` | API Key        | Update a profile schema, extraction scene, or billing tier    |
| `bl memory search`         | API Key        | Search memory nodes by query or messages                      |
| `bl memory skill export`   | API Key        | Export a skill memory node                                    |
| `bl memory update`         | API Key        | Update a memory node content                                  |

## Command details

### `bl memory add`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `memory add`                                                                  |
| **Description**    | Add memory from messages or custom content (async extraction)                 |
| **Authentication** | API Key                                                                       |
| **Usage**          | `bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]` |

#### Flags

| Flag                            | Type   | Required | Description                                                                                                                |
| ------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--user-id <id>`                | string | yes      | Memory entity ID that owns the memory (required)                                                                           |
| `--messages <json>`             | string | no       | Messages JSON array: [{"role":"user","content":"..."},...]; role user/assistant/tool, OpenAI tool_calls supported (max 50) |
| `--content <text>`              | string | no       | Custom content to memorize verbatim; takes precedence over --messages                                                      |
| `--profile-schema <id>`         | string | no       | Profile schema ID; without it no user profile is extracted                                                                 |
| `--extract-mode <profile_only>` | string | no       | Extract only a user profile; requires --profile-schema and --messages, without --content                                   |
| `--skill-name <name>`           | string | no       | Skill name (skill memory; requires --skill-description and --skill-tags)                                                   |
| `--skill-description <text>`    | string | no       | Skill description (skill memory; requires --skill-name and --skill-tags)                                                   |
| `--skill-tags <tag>`            | array  | no       | Skill tag (repeatable; requires --skill-name and --skill-description)                                                      |
| `--meta-data <json>`            | string | no       | Custom metadata JSON object: {"location_name":"Beijing"}                                                                   |
| `--timestamp <seconds>`         | number | no       | Unix timestamp (seconds) of when the remembered event happened                                                             |
| `--wait <seconds>`              | number | no       | Polling budget in seconds before giving up (default: 120); 0 prints the event ID and returns right after submission        |
| `--project-id <id>`             | array  | no       | Memory fragment rule ID (repeatable for messages/search; custom content accepts one)                                       |
| `--library-id <id>`             | string | no       | Memory library ID (default: the account's default library)                                                                 |
| `--workspace-id <id>`           | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                            |
| `--api-key <key>`               | string | no       | API key                                                                                                                    |
| `--base-url <url>`              | string | no       | API base URL                                                                                                               |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- When --content is set, the server ignores --messages. Custom content accepts one --project-id; messages accept up to five.
- The command submits an async extraction task, then polls it internally until every task reaches a terminal state (budget: --wait, default 120s). One call can add, update or delete several memory nodes at once.
- On timeout the extraction may still finish in the background; check results later with `memory list` / `memory search` / `memory profile get`.
- Account-level rate limits: add 120 QPM, search 300 QPM, 3000 QPM across all memory APIs. On HTTP 429 back off and leave at least 1s between calls.

#### Examples

```bash
bl memory add --user-id user1 --content "The user likes Python programming" --workspace-id ws_xxx
```

```bash
bl memory add --user-id user1 --messages '[{"role":"user","content":"I like traveling"}]'
```

```bash
bl memory add --user-id user1 --messages '[{"role":"user","content":"I live in Beijing"}]' --profile-schema schema_xxx --extract-mode profile_only
```

```bash
bl memory add --user-id user1 --content "Summarize meeting minutes" --project-id skill_project_xxx --skill-name "meeting-summary" --skill-description "Extract key points and generate a summary" --skill-tags office --skill-tags summary
```

```bash
bl memory add --user-id user1 --content "Attended WAIC" --wait 0
```

### `bl memory delete`

| Field              | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| **Name**           | `memory delete`                                                                |
| **Description**    | Delete a memory node                                                           |
| **Authentication** | API Key                                                                        |
| **Usage**          | `bl memory delete --node-id <id> [flags]`                                      |
| **Risk**           | `high`                                                                         |
| **Risk message**   | This deletes the specified memory node. Confirm the node ID before proceeding. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                              |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `--node-id <id>`      | string | yes      | Memory node ID (required)                                                |
| `--user-id <id>`      | string | no       | Deprecated compatibility option; ignored, the node ID selects the memory |
| `--library-id <id>`   | string | no       | Memory library ID (default: the account's default library)               |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--yes`               | switch | no       | Confirm this high-risk operation                                         |
| `--api-key <key>`     | string | no       | API key                                                                  |
| `--base-url <url>`    | string | no       | API base URL                                                             |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Deleted nodes may remain readable with status=delete. Run `memory list` first to confirm the node ID.

#### Examples

```bash
bl memory delete --node-id node_xxx --workspace-id ws_xxx
```

```bash
# Only after explicit user confirmation:
bl memory delete --node-id node_xxx --yes
```

### `bl memory list`

| Field              | Value                                   |
| ------------------ | --------------------------------------- |
| **Name**           | `memory list`                           |
| **Description**    | List memory nodes for a user            |
| **Authentication** | API Key                                 |
| **Usage**          | `bl memory list --user-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--user-id <id>`      | string | yes      | Memory entity ID that owns the memory (required)                |
| `--page-size <n>`     | number | no       | Results per page (default: 10)                                  |
| `--page <n>`          | number | no       | Page number (default: 1)                                        |
| `--project-id <id>`   | string | no       | Memory fragment rule ID (default: the library's default rule)   |
| `--library-id <id>`   | string | no       | Memory library ID (default: the account's default library)      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Without --project-id, only the default rule is listed; other observation and skill projects require their project ID.

#### Examples

```bash
bl memory list --user-id user1 --workspace-id ws_xxx
```

```bash
bl memory list --user-id user1 --page-size 20 --page 2
```

```bash
bl memory list --user-id user1 --library-id lib_xxx --output json
```

### `bl memory node show`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `memory node show`                           |
| **Description**    | Show a single memory node with full detail   |
| **Authentication** | API Key                                      |
| **Usage**          | `bl memory node show --node-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--node-id <id>`      | string | yes      | Memory node ID (required)                                       |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Useful after `memory list` / `memory search`, and to check whether a node is a skill memory before `memory update`.

#### Examples

```bash
bl memory node show --node-id node_xxx --workspace-id ws_xxx
```

```bash
bl memory node show --node-id node_xxx --output json
```

### `bl memory profile create`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `memory profile create`                                              |
| **Description**    | Create a user profile schema for memory profiling                    |
| **Authentication** | API Key                                                              |
| **Usage**          | `bl memory profile create --name <name> --attributes <json> [flags]` |

#### Flags

| Flag                                       | Type   | Required | Description                                                                      |
| ------------------------------------------ | ------ | -------- | -------------------------------------------------------------------------------- |
| `--name <name>`                            | string | yes      | Schema name (required)                                                           |
| `--description <text>`                     | string | no       | Schema description                                                               |
| `--attributes <json>`                      | string | yes      | Attributes JSON array: [{"name":"age","description":"age","default_value":"18"}] |
| `--plan-version <pro\|lite>`               | string | no       | Strategy version: pro (rerank on) or lite (rerank off); billed differently       |
| `--extract-scene <efficient\|intelligent>` | string | no       | Extraction scene: efficient or intelligent (creation default: efficient)         |
| `--library-id <id>`                        | string | no       | Memory library ID (default: the account's default library)                       |
| `--workspace-id <id>`                      | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                  |
| `--api-key <key>`                          | string | no       | API key                                                                          |
| `--base-url <url>`                         | string | no       | API base URL                                                                     |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Each attribute needs a name; description and default_value are optional. --plan-version picks the extraction tier (pro / lite) and is billed differently.

#### Examples

```bash
bl memory profile create --name "user_basic" --attributes '[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]' --workspace-id ws_xxx
```

```bash
bl memory profile create --name "user_basic" --attributes '[{"name":"age"}]' --plan-version lite --library-id lib_xxx
```

### `bl memory profile delete`

| Field              | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `memory profile delete`                                                                                                                   |
| **Description**    | Delete a profile schema                                                                                                                   |
| **Authentication** | API Key                                                                                                                                   |
| **Usage**          | `bl memory profile delete --schema-id <id> [flags]`                                                                                       |
| **Risk**           | `high`                                                                                                                                    |
| **Risk message**   | This permanently deletes the profile schema and its attribute definitions. Profiles already extracted for this schema become unreachable. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--schema-id <id>`    | string | yes      | Profile schema ID (required)                                    |
| `--library-id <id>`   | string | no       | Memory library ID (default: the account's default library)      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--yes`               | switch | no       | Confirm this high-risk operation                                |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Irreversible — the schema and its attribute definitions are permanently removed. Profiles already extracted for this schema become unreachable.

#### Examples

```bash
bl memory profile delete --schema-id schema_xxx --workspace-id ws_xxx
```

```bash
# Only after explicit user confirmation:
bl memory profile delete --schema-id schema_xxx --yes
```

### `bl memory profile get`

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Name**           | `memory profile get`                                            |
| **Description**    | Get the extracted user profile for a schema                     |
| **Authentication** | API Key                                                         |
| **Usage**          | `bl memory profile get --schema-id <id> --user-id <id> [flags]` |

#### Flags

| Flag                   | Type    | Required | Description                                                                               |
| ---------------------- | ------- | -------- | ----------------------------------------------------------------------------------------- |
| `--schema-id <id>`     | string  | yes      | Profile schema ID (required)                                                              |
| `--user-id <id>`       | string  | yes      | Memory entity ID that owns the profile (required)                                         |
| `--need-detail <bool>` | boolean | no       | Return per-item value lists (item_id / status / value) instead of the joined value string |
| `--library-id <id>`    | string  | no       | Memory library ID (default: the account's default library)                                |
| `--workspace-id <id>`  | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                           |
| `--api-key <key>`      | string  | no       | API key                                                                                   |
| `--base-url <url>`     | string  | no       | API base URL                                                                              |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Values are extracted only when `memory add --profile-schema` used the same schema ID; otherwise every attribute comes back empty. Use `memory profile show` for the schema definition itself.
- --need-detail true expands each attribute into its value items with item_id and status, the handles for profile value management.

#### Examples

```bash
bl memory profile get --schema-id schema_xxx --user-id user1 --workspace-id ws_xxx
```

```bash
bl memory profile get --schema-id schema_xxx --user-id user1 --need-detail true
```

### `bl memory profile list`

| Field              | Value                            |
| ------------------ | -------------------------------- |
| **Name**           | `memory profile list`            |
| **Description**    | List profile schemas             |
| **Authentication** | API Key                          |
| **Usage**          | `bl memory profile list [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--page-size <n>`     | number | no       | Results per page (default: 10)                                  |
| `--page <n>`          | number | no       | Page number (default: 1)                                        |
| `--library-id <id>`   | string | no       | Memory library ID (default: the account's default library)      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.

#### Examples

```bash
bl memory profile list --workspace-id ws_xxx
```

```bash
bl memory profile list --page-size 20 --page 2
```

```bash
bl memory profile list --library-id lib_xxx --output json
```

### `bl memory profile show`

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Name**           | `memory profile show`                               |
| **Description**    | Show a profile schema definition with attribute IDs |
| **Authentication** | API Key                                             |
| **Usage**          | `bl memory profile show --schema-id <id> [flags]`   |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--schema-id <id>`    | string | yes      | Profile schema ID (required)                                    |
| `--library-id <id>`   | string | no       | Memory library ID (default: the account's default library)      |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- The attribute_id values returned here are the handles `memory profile update --attributes-operations` needs for update / delete operations.

#### Examples

```bash
bl memory profile show --schema-id schema_xxx --workspace-id ws_xxx
```

```bash
bl memory profile show --schema-id schema_xxx --output json
```

### `bl memory profile update`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `memory profile update`                                    |
| **Description**    | Update a profile schema, extraction scene, or billing tier |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl memory profile update --schema-id <id> [flags]`        |

#### Flags

| Flag                                       | Type   | Required | Description                                                                |
| ------------------------------------------ | ------ | -------- | -------------------------------------------------------------------------- |
| `--schema-id <id>`                         | string | yes      | Profile schema ID (required)                                               |
| `--name <name>`                            | string | no       | New schema name                                                            |
| `--description <text>`                     | string | no       | New schema description                                                     |
| `--attributes-operations <json>`           | string | no       | Attribute operations JSON array: [{"op":"add","name":"plan"}]              |
| `--plan-version <pro\|lite>`               | string | no       | Strategy version: pro (rerank on) or lite (rerank off); billed differently |
| `--extract-scene <efficient\|intelligent>` | string | no       | Extraction scene: efficient or intelligent (creation default: efficient)   |
| `--library-id <id>`                        | string | no       | Memory library ID (default: the account's default library)                 |
| `--workspace-id <id>`                      | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)            |
| `--api-key <key>`                          | string | no       | API key                                                                    |
| `--base-url <url>`                         | string | no       | API base URL                                                               |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Each operation needs "op": add (requires name), update / delete (require attribute_id). Run `memory profile show` first to get attribute IDs.

#### Examples

```bash
bl memory profile update --schema-id schema_xxx --name "user_basic_v2" --workspace-id ws_xxx
```

```bash
bl memory profile update --schema-id schema_xxx --attributes-operations '[{"op":"add","name":"plan","default_value":"free"},{"op":"delete","attribute_id":"attr_2"}]'
```

### `bl memory search`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `memory search`                                            |
| **Description**    | Search memory nodes by query or messages                   |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl memory search --user-id <id> [--query <text>] [flags]` |

#### Flags

| Flag                                  | Type    | Required | Description                                                                          |
| ------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| `--user-id <id>`                      | string  | yes      | Memory entity ID that owns the memory (required)                                     |
| `--query <text>`                      | string  | no       | Search text; sent as a single user message                                           |
| `--messages <json>`                   | string  | no       | Messages JSON array for context-based search; overrides --query                      |
| `--top-k <n>`                         | number  | no       | Max results, 1-100 (default: 10)                                                     |
| `--min-score <score>`                 | number  | no       | Minimum similarity score, 0-1 (default: 0.3)                                         |
| `--enable-rerank <bool>`              | boolean | no       | Rerank results (default: false); ignored when --plan-version is set                  |
| `--enable-judge <bool>`               | boolean | no       | Run the intent judge callback (default: false)                                       |
| `--enable-rewrite <bool>`             | boolean | no       | Rewrite the query before searching (default: false)                                  |
| `--memory-types <observation\|skill>` | array   | no       | Memory types to search (repeatable; server default: observation only)                |
| `--query-timestamp <seconds>`         | number  | no       | Query time as a Unix timestamp in seconds, used during query rewrite (default: now)  |
| `--project-id <id>`                   | array   | no       | Memory fragment rule ID (repeatable for messages/search; custom content accepts one) |
| `--plan-version <pro\|lite>`          | string  | no       | Strategy version: pro (rerank on) or lite (rerank off); billed differently           |
| `--library-id <id>`                   | string  | no       | Memory library ID (default: the account's default library)                           |
| `--workspace-id <id>`                 | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                      |
| `--api-key <key>`                     | string  | no       | API key                                                                              |
| `--base-url <url>`                    | string  | no       | API base URL                                                                         |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- --plan-version overrides --enable-rerank. With both omitted the plan is pro; --enable-rerank false alone selects lite. Plans are billed differently.
- Without --memory-types the server searches observation memories only; pass --memory-types skill (or both types) to include skill memories.
- Account-level rate limits: add 120 QPM, search 300 QPM, 3000 QPM across all memory APIs. On HTTP 429 back off and leave at least 1s between calls.

#### Examples

```bash
bl memory search --user-id user1 --query "programming preferences" --workspace-id ws_xxx
```

```bash
bl memory search --user-id user1 --messages '[{"role":"user","content":"recommend a book"}]' --top-k 5
```

```bash
bl memory search --user-id user1 --query "reminders" --plan-version lite --min-score 0
```

```bash
bl memory search --user-id user1 --query "meeting summary" --memory-types skill --project-id skill_project_xxx
```

### `bl memory skill export`

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Name**           | `memory skill export`                           |
| **Description**    | Export a skill memory node                      |
| **Authentication** | API Key                                         |
| **Usage**          | `bl memory skill export --node-id <id> [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                     |
| --------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--node-id <id>`      | string | yes      | Skill memory node ID (required)                                 |
| `--workspace-id <id>` | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--api-key <key>`     | string | no       | API key                                                         |
| `--base-url <url>`    | string | no       | API base URL                                                    |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- Returns skill body content without frontmatter; JSON also includes skill_name, skill_description and skill_tags. Find node IDs with `memory search --memory-types skill`.

#### Examples

```bash
bl memory skill export --node-id node_xxx --workspace-id ws_xxx
```

```bash
bl memory skill export --node-id node_xxx --output json
```

### `bl memory update`

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Name**           | `memory update`                                            |
| **Description**    | Update a memory node content                               |
| **Authentication** | API Key                                                    |
| **Usage**          | `bl memory update --node-id <id> --content <text> [flags]` |

#### Flags

| Flag                         | Type   | Required | Description                                                              |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `--node-id <id>`             | string | yes      | Memory node ID (required)                                                |
| `--user-id <id>`             | string | no       | Deprecated compatibility option; ignored, the node ID selects the memory |
| `--content <text>`           | string | yes      | New content for the memory node, max 512 characters (required)           |
| `--timestamp <seconds>`      | number | no       | Unix timestamp (seconds); omitted values preserve the existing timestamp |
| `--meta-data <json>`         | string | no       | Custom metadata JSON object, merged incrementally: {"key":"value"}       |
| `--skill-name <name>`        | string | no       | Skill name (skill memory; requires --skill-description and --skill-tags) |
| `--skill-description <text>` | string | no       | Skill description (skill memory; requires --skill-name and --skill-tags) |
| `--skill-tags <tag>`         | array  | no       | Skill tag (repeatable; requires --skill-name and --skill-description)    |
| `--library-id <id>`          | string | no       | Memory library ID (default: the account's default library)               |
| `--workspace-id <id>`        | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)          |
| `--api-key <key>`            | string | no       | API key                                                                  |
| `--base-url <url>`           | string | no       | API base URL                                                             |

#### Notes

- The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.
- --content replaces the node content in full; --meta-data merges incrementally.
- When the target node is a skill memory, the server requires the skill triple (--skill-name / --skill-description / --skill-tags); use `memory node show` to check the node type first.

#### Examples

```bash
bl memory update --node-id node_xxx --content "updated memory content" --workspace-id ws_xxx
```

```bash
bl memory update --node-id node_xxx --content "met at WAIC" --timestamp 1747278460 --meta-data '{"city":"Shanghai"}'
```

```bash
bl memory update --node-id node_xxx --content "Summarize meeting minutes" --skill-name "meeting-summary" --skill-description "Extract key points" --skill-tags office
```
