# `bl memory` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                    | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `bl memory add`            | Add memory from messages or custom content                 |
| `bl memory delete`         | Delete a memory node                                       |
| `bl memory list`           | List memory nodes for a user                               |
| `bl memory profile create` | Create a user profile schema for memory profiling          |
| `bl memory profile delete` | Delete a profile schema                                    |
| `bl memory profile detail` | Show a profile schema and its attribute IDs                |
| `bl memory profile get`    | Get user profile by schema ID and user ID                  |
| `bl memory profile list`   | List profile schemas                                       |
| `bl memory profile update` | Update a profile schema's name, description, or attributes |
| `bl memory search`         | Search memory nodes by query or messages                   |
| `bl memory update`         | Update a memory node content                               |

## Command details

### `bl memory add`

| Field           | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| **Name**        | `memory add`                                                                  |
| **Description** | Add memory from messages or custom content                                    |
| **Usage**       | `bl memory add --user-id <id> [--messages <json>] [--content <text>] [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                                                        |
| -------------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `--user-id <id>`           | string | yes      | User ID (required)                                                 |
| `--messages <json>`        | string | no       | Messages JSON array: [{"role":"user","content":"..."},...]         |
| `--content <text>`         | string | no       | Custom content text to memorize                                    |
| `--profile-schema <id>`    | string | no       | Profile schema ID for user profiling                               |
| `--memory-library-id <id>` | string | no       | Memory library ID (isolate memory space)                           |
| `--project-id <id>`        | string | no       | Memory extraction rule ID (defaults to the library's default rule) |
| `--meta-data <json>`       | string | no       | Custom metadata JSON object: {"location":"Beijing"}                |
| `--api-key <key>`          | string | no       | API key                                                            |
| `--base-url <url>`         | string | no       | API base URL                                                       |

#### Examples

```bash
bl memory add --user-id user1 --content "The user likes Python programming"
```

```bash
bl memory add --user-id user1 --messages '[{"role":"user","content":"I like traveling"}]'
```

```bash
bl memory add --user-id user1 --content "Lives in Beijing" --profile-schema schema_xxx
```

```bash
bl memory add --user-id user1 --content "Lives in Beijing" --meta-data '{"source":"onboarding"}'
```

### `bl memory delete`

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| **Name**        | `memory delete`                                  |
| **Description** | Delete a memory node                             |
| **Usage**       | `bl memory delete --node-id <id> --user-id <id>` |

#### Flags

| Flag                       | Type   | Required | Description                             |
| -------------------------- | ------ | -------- | --------------------------------------- |
| `--node-id <id>`           | string | yes      | Memory node ID (required)               |
| `--user-id <id>`           | string | yes      | User ID (required)                      |
| `--memory-library-id <id>` | string | no       | Memory library ID (non-default library) |
| `--api-key <key>`          | string | no       | API key                                 |
| `--base-url <url>`         | string | no       | API base URL                            |

#### Examples

```bash
bl memory delete --node-id node_xxx --user-id user1
```

### `bl memory list`

| Field           | Value                                   |
| --------------- | --------------------------------------- |
| **Name**        | `memory list`                           |
| **Description** | List memory nodes for a user            |
| **Usage**       | `bl memory list --user-id <id> [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                                                        |
| -------------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `--user-id <id>`           | string | yes      | User ID (required)                                                 |
| `--page-size <n>`          | number | no       | Results per page (default: 10)                                     |
| `--page <n>`               | number | no       | Page number (default: 1)                                           |
| `--memory-library-id <id>` | string | no       | Memory library ID                                                  |
| `--project-id <id>`        | string | no       | Memory extraction rule ID (defaults to the library's default rule) |
| `--api-key <key>`          | string | no       | API key                                                            |
| `--base-url <url>`         | string | no       | API base URL                                                       |

#### Examples

```bash
bl memory list --user-id user1
```

```bash
bl memory list --user-id user1 --page-size 20 --page 2
```

### `bl memory profile create`

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| **Name**        | `memory profile create`                                              |
| **Description** | Create a user profile schema for memory profiling                    |
| **Usage**       | `bl memory profile create --name <name> --attributes <json> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                                 |
| ---------------------- | ------ | -------- | ----------------------------------------------------------- |
| `--name <name>`        | string | yes      | Schema name (required)                                      |
| `--description <text>` | string | no       | Schema description                                          |
| `--attributes <json>`  | string | yes      | Attributes JSON array: [{"name":"age","description":"age"}] |
| `--api-key <key>`      | string | no       | API key                                                     |
| `--base-url <url>`     | string | no       | API base URL                                                |

#### Examples

```bash
bl memory profile create --name "user_basic" --attributes '[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]'
```

### `bl memory profile delete`

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| **Name**        | `memory profile delete`                             |
| **Description** | Delete a profile schema                             |
| **Usage**       | `bl memory profile delete --schema-id <id> [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                  |
| -------------------------- | ------ | -------- | ---------------------------- |
| `--schema-id <id>`         | string | yes      | Profile schema ID (required) |
| `--memory-library-id <id>` | string | no       | Memory library ID            |
| `--api-key <key>`          | string | no       | API key                      |
| `--base-url <url>`         | string | no       | API base URL                 |

#### Examples

```bash
bl memory profile delete --schema-id schema_xxx
```

### `bl memory profile detail`

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| **Name**        | `memory profile detail`                             |
| **Description** | Show a profile schema and its attribute IDs         |
| **Usage**       | `bl memory profile detail --schema-id <id> [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                  |
| -------------------------- | ------ | -------- | ---------------------------- |
| `--schema-id <id>`         | string | yes      | Profile schema ID (required) |
| `--memory-library-id <id>` | string | no       | Memory library ID            |
| `--api-key <key>`          | string | no       | API key                      |
| `--base-url <url>`         | string | no       | API base URL                 |

#### Examples

```bash
bl memory profile detail --schema-id schema_xxx
```

### `bl memory profile get`

| Field           | Value                                                   |
| --------------- | ------------------------------------------------------- |
| **Name**        | `memory profile get`                                    |
| **Description** | Get user profile by schema ID and user ID               |
| **Usage**       | `bl memory profile get --schema-id <id> --user-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                  |
| ------------------ | ------ | -------- | ---------------------------- |
| `--schema-id <id>` | string | yes      | Profile schema ID (required) |
| `--user-id <id>`   | string | yes      | User ID (required)           |
| `--api-key <key>`  | string | no       | API key                      |
| `--base-url <url>` | string | no       | API base URL                 |

#### Examples

```bash
bl memory profile get --schema-id schema_xxx --user-id user1
```

### `bl memory profile list`

| Field           | Value                            |
| --------------- | -------------------------------- |
| **Name**        | `memory profile list`            |
| **Description** | List profile schemas             |
| **Usage**       | `bl memory profile list [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                    |
| -------------------------- | ------ | -------- | ------------------------------ |
| `--memory-library-id <id>` | string | no       | Memory library ID              |
| `--page-size <n>`          | number | no       | Results per page (default: 10) |
| `--page <n>`               | number | no       | Page number (default: 1)       |
| `--api-key <key>`          | string | no       | API key                        |
| `--base-url <url>`         | string | no       | API base URL                   |

#### Examples

```bash
bl memory profile list
```

```bash
bl memory profile list --page-size 20 --page 2
```

### `bl memory profile update`

| Field           | Value                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Name**        | `memory profile update`                                                                      |
| **Description** | Update a profile schema's name, description, or attributes                                   |
| **Usage**       | `bl memory profile update --schema-id <id> [--name <name>] [--attribute-ops <json>] [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                                                                                           |
| -------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `--schema-id <id>`         | string | yes      | Profile schema ID (required)                                                                          |
| `--name <name>`            | string | no       | New schema name                                                                                       |
| `--description <text>`     | string | no       | New schema description                                                                                |
| `--attribute-ops <json>`   | string | no       | Attribute operations JSON array: [{"op":"add","name":"plan"},{"op":"delete","attribute_id":"attr_1"}] |
| `--memory-library-id <id>` | string | no       | Memory library ID                                                                                     |
| `--api-key <key>`          | string | no       | API key                                                                                               |
| `--base-url <url>`         | string | no       | API base URL                                                                                          |

#### Notes

- Attribute IDs for update/delete operations come from `memory profile detail`.

#### Examples

```bash
bl memory profile update --schema-id schema_xxx --name "user_basic_v2"
```

```bash
bl memory profile update --schema-id schema_xxx --attribute-ops '[{"op":"add","name":"plan","description":"subscription plan"}]'
```

```bash
bl memory profile update --schema-id schema_xxx --attribute-ops '[{"op":"delete","attribute_id":"attr_1"}]'
```

### `bl memory search`

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| **Name**        | `memory search`                                            |
| **Description** | Search memory nodes by query or messages                   |
| **Usage**       | `bl memory search --user-id <id> [--query <text>] [flags]` |

#### Flags

| Flag                         | Type    | Required | Description                                                                                             |
| ---------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `--user-id <id>`             | string  | yes      | User ID (required)                                                                                      |
| `--query <text>`             | string  | no       | Search query text                                                                                       |
| `--messages <json>`          | string  | no       | Messages JSON array for context-based search                                                            |
| `--top-k <n>`                | number  | no       | Number of results to return (default: 10)                                                               |
| `--memory-library-id <id>`   | string  | no       | Memory library ID                                                                                       |
| `--project-ids <id>`         | array   | no       | Memory extraction rule ID for hybrid retrieval (repeatable)                                             |
| `--min-score <n>`            | number  | no       | Minimum similarity score, 0-1 (default: 0.3)                                                            |
| `--enable-rerank <bool>`     | boolean | no       | Rerank results. Also selects the billing tier: false bills lite, true bills pro (~50x). (default: true) |
| `--plan-version <lite\|pro>` | string  | no       | Documented billing tier. The service currently honors --enable-rerank instead, so prefer that flag      |
| `--enable-judge <bool>`      | boolean | no       | Enable the intent-discrimination callback (default: false)                                              |
| `--enable-rewrite <bool>`    | boolean | no       | Enable query rewriting (default: false)                                                                 |
| `--api-key <key>`            | string  | no       | API key                                                                                                 |
| `--base-url <url>`           | string  | no       | API base URL                                                                                            |

#### Examples

```bash
bl memory search --user-id user1 --query "programming preferences"
```

```bash
bl memory search --user-id user1 --messages '[{"role":"user","content":"recommend a book"}]' --top-k 5
```

```bash
bl memory search --user-id user1 --query "preferences" --enable-rerank false --min-score 0.5
```

### `bl memory update`

| Field           | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| **Name**        | `memory update`                                                   |
| **Description** | Update a memory node content                                      |
| **Usage**       | `bl memory update --node-id <id> --user-id <id> --content <text>` |

#### Flags

| Flag                         | Type   | Required | Description                                                            |
| ---------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--node-id <id>`             | string | yes      | Memory node ID (required)                                              |
| `--user-id <id>`             | string | yes      | User ID (required)                                                     |
| `--content <text>`           | string | yes      | New content for the memory node (required)                             |
| `--memory-library-id <id>`   | string | no       | Memory library ID (non-default library)                                |
| `--timestamp <unix-seconds>` | number | no       | When the remembered event happened (default: now)                      |
| `--meta-data <json>`         | string | no       | Custom metadata JSON object, merged incrementally: {"source":"manual"} |
| `--api-key <key>`            | string | no       | API key                                                                |
| `--base-url <url>`           | string | no       | API base URL                                                           |

#### Examples

```bash
bl memory update --node-id node_xxx --user-id user1 --content "updated memory content"
```
