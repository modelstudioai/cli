# `bl managed-agent` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                                    | Authentication | Description                                                                  |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------------- |
| `bl managed-agent agent create`            | API Key        | Declare and create one Managed Agent through an isolated YAML apply          |
| `bl managed-agent agent get`               | API Key        | Get a Managed Agent                                                          |
| `bl managed-agent agent list`              | API Key        | List Managed Agents                                                          |
| `bl managed-agent agent search`            | API Key        | Search Managed Agents                                                        |
| `bl managed-agent agent versions`          | API Key        | List Managed Agent versions                                                  |
| `bl managed-agent apply`                   | API Key        | Apply planned changes to create/update/delete agent resources                |
| `bl managed-agent deployment create`       | API Key        | Declare and create one Managed Agent Deployment through a scoped YAML apply  |
| `bl managed-agent deployment get`          | API Key        | Get a Managed Agent deployment                                               |
| `bl managed-agent deployment list`         | API Key        | List Managed Agent deployments                                               |
| `bl managed-agent deployment pause`        | API Key        | Pause a Managed Agent deployment                                             |
| `bl managed-agent deployment run`          | API Key        | Run a Managed Agent deployment now                                           |
| `bl managed-agent deployment runs get`     | API Key        | Get a Managed Agent deployment run                                           |
| `bl managed-agent deployment runs list`    | API Key        | List runs for a Managed Agent deployment                                     |
| `bl managed-agent deployment search`       | API Key        | Search Managed Agent deployments                                             |
| `bl managed-agent deployment unpause`      | API Key        | Unpause a Managed Agent deployment                                           |
| `bl managed-agent destroy`                 | API Key        | Destroy all managed agent resources tracked in state                         |
| `bl managed-agent environment create`      | API Key        | Declare and create one Managed Agent Environment through a scoped YAML apply |
| `bl managed-agent environment get`         | API Key        | Get a Managed Agent environment                                              |
| `bl managed-agent environment list`        | API Key        | List Managed Agent environments                                              |
| `bl managed-agent environment search`      | API Key        | Search Managed Agent environments                                            |
| `bl managed-agent file delete`             | API Key        | Delete a Managed Agent file                                                  |
| `bl managed-agent file download`           | API Key        | Download Managed Agent file content                                          |
| `bl managed-agent file get`                | API Key        | Get Managed Agent file metadata                                              |
| `bl managed-agent file list`               | API Key        | List Managed Agent files                                                     |
| `bl managed-agent file search`             | API Key        | Search Managed Agent files                                                   |
| `bl managed-agent file upload`             | API Key        | Upload a Managed Agent file                                                  |
| `bl managed-agent init`                    | No Auth        | Create an agents.yaml template                                               |
| `bl managed-agent plan`                    | API Key        | Show what changes would be applied to agent infrastructure                   |
| `bl managed-agent playground`              | API Key        | Launch a Session Preview for an agents.yaml Agent                            |
| `bl managed-agent project build`           | No Auth        | Organize directory source and generate the immutable Publish Build           |
| `bl managed-agent project init`            | No Auth        | Create a directory project or convert the local agents.yaml                  |
| `bl managed-agent project publish`         | API Key        | Publish the current directory-project Build and record a version             |
| `bl managed-agent project validate`        | No Auth        | Validate a directory Agent project                                           |
| `bl managed-agent project version disable` | No Auth        | Disable directory project versions                                           |
| `bl managed-agent project version enable`  | No Auth        | Enable directory project versions                                            |
| `bl managed-agent project version list`    | No Auth        | List directory project versions                                              |
| `bl managed-agent project version preview` | No Auth        | Preview a directory project version                                          |
| `bl managed-agent project version restore` | No Auth        | Restore a version to the project working directory                           |
| `bl managed-agent project version status`  | No Auth        | Show directory project version status                                        |
| `bl managed-agent project workbench`       | API Key        | Launch the directory project Workbench                                       |
| `bl managed-agent session archive`         | API Key        | Archive a Managed Agent session                                              |
| `bl managed-agent session create`          | API Key        | Create a new session for an agent                                            |
| `bl managed-agent session debug`           | API Key        | Aggregate session diagnostics                                                |
| `bl managed-agent session delete`          | API Key        | Delete a session                                                             |
| `bl managed-agent session event list`      | API Key        | List events for a Managed Agent session                                      |
| `bl managed-agent session event send`      | API Key        | Send raw events to a Managed Agent session                                   |
| `bl managed-agent session event stream`    | API Key        | Stream events from a Managed Agent session                                   |
| `bl managed-agent session events`          | API Key        | List events for a Managed Agent session                                      |
| `bl managed-agent session export`          | API Key        | Export session diagnostics as a ZIP                                          |
| `bl managed-agent session get`             | API Key        | Get details of a session                                                     |
| `bl managed-agent session list`            | API Key        | List sessions from the provider                                              |
| `bl managed-agent session run`             | API Key        | Create a session, send a message, and stream the response                    |
| `bl managed-agent session search`          | API Key        | Search Managed Agent sessions                                                |
| `bl managed-agent session send`            | API Key        | Send a message to an existing session and stream the response                |
| `bl managed-agent session update`          | API Key        | Update a Managed Agent session                                               |
| `bl managed-agent skill create`            | API Key        | Declare and create one custom Managed Agent Skill from a local source        |
| `bl managed-agent skill download`          | API Key        | Download a Managed Agent skill version                                       |
| `bl managed-agent skill get`               | API Key        | Get a Managed Agent skill                                                    |
| `bl managed-agent skill list`              | API Key        | List Managed Agent skills                                                    |
| `bl managed-agent skill search`            | API Key        | Search Managed Agent skills                                                  |
| `bl managed-agent skill versions`          | API Key        | List Managed Agent skill versions                                            |
| `bl managed-agent skill-list`              | API Key        | List Managed Agent skills                                                    |
| `bl managed-agent state import`            | API Key        | Import an existing remote resource into agents state                         |
| `bl managed-agent state list`              | No Auth        | List resources tracked in agents state                                       |
| `bl managed-agent state rm`                | No Auth        | Remove a resource from state without destroying it remotely                  |
| `bl managed-agent state show`              | No Auth        | Show details of a resource in agents state                                   |
| `bl managed-agent validate`                | No Auth        | Validate an agents.yaml configuration (offline)                              |
| `bl managed-agent vault create`            | API Key        | Declare and create one empty Managed Agent Vault through a scoped YAML apply |
| `bl managed-agent vault credential create` | API Key        | Append and create one environment-variable Credential in a tracked Vault     |
| `bl managed-agent vault get`               | API Key        | Get a Managed Agent vault                                                    |
| `bl managed-agent vault list`              | API Key        | List Managed Agent vaults                                                    |
| `bl managed-agent vault search`            | API Key        | Search Managed Agent vaults                                                  |

## Command details

### `bl managed-agent agent create`

| Field              | Value                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent agent create`                                                                                                                                                                                                    |
| **Description**    | Declare and create one Managed Agent through an isolated YAML apply                                                                                                                                                             |
| **Authentication** | API Key                                                                                                                                                                                                                         |
| **Usage**          | `bl managed-agent agent create --name <name> --model <model> --instructions <text\|path> [--description <text>] [--skill <id>...] [--type custom\|official] [--skill-dir <path>...] [--tool <name>...] [--file <path>] [--yes]` |

#### Flags

| Flag                          | Type   | Required | Description                                                                                             |
| ----------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `--name <name>`               | string | yes      | Remote Agent display name; the YAML key is generated automatically                                      |
| `--model <model>`             | string | yes      | Model ID                                                                                                |
| `--instructions <text\|path>` | string | yes      | Inline instructions or a ./, ../, or absolute file path                                                 |
| `--description <text>`        | string | no       | Agent description                                                                                       |
| `--skill <id>`                | array  | no       | Existing remote Skill ID (repeatable)                                                                   |
| `--skill-dir <path>`          | array  | no       | Local Skill directory or ZIP to declare, upload, and attach through the same scoped create (repeatable) |
| `--type <custom\|official>`   | string | no       | Type applied to every --skill value (default: custom)                                                   |
| `--tool <name>`               | array  | no       | Builtin tool name (repeatable)                                                                          |
| `--file <path>`               | string | no       | Config file path (default: agents.yaml)                                                                 |
| `--yes`                       | switch | no       | Write YAML and run the scoped remote create                                                             |
| `--api-key <key>`             | string | no       | API key                                                                                                 |
| `--base-url <url>`            | string | no       | API base URL                                                                                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, previews the generated YAML key and scoped plan. --dry-run stays offline. Unrelated resources are not refreshed or drift-checked.
- --skill writes an external Skill reference directly into the Agent declaration. --type defaults to custom; use --type official for platform Skills. These Skills are not managed through the top-level skills map.
- --skill-dir accepts a local Skill directory or ZIP, writes it as a top-level custom Skill declaration, and writes its generated YAML key into the Agent skills list. Skill and Agent are created together in dependency order. --type applies only to --skill IDs.

#### Examples

```bash
bl managed-agent agent create --name assistant --model qwen3.8-max --instructions "You are helpful."
```

```bash
bl managed-agent agent create --name assistant --model qwen3.8-max --instructions ./prompts/assistant.md --skill skill_abc --yes
```

```bash
bl managed-agent agent create --name slides --model qwen3.8-max --instructions ./prompts/slides.md --skill skill_pptx --type official --yes
```

```bash
bl managed-agent agent create --name reviewer --model qwen3.8-max --instructions ./prompts/reviewer.md --skill-dir ./skills/code-review --yes
```

### `bl managed-agent agent get`

| Field              | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| **Name**           | `managed-agent agent get`                                                          |
| **Description**    | Get a Managed Agent                                                                |
| **Authentication** | API Key                                                                            |
| **Usage**          | `bl managed-agent agent get --agent-id <id> [--agent-version <n>] [--file <path>]` |

#### Flags

| Flag                  | Type   | Required | Description                             |
| --------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`       | string | no       | Config file path (default: agents.yaml) |
| `--agent-id <id>`     | string | yes      | Agent ID                                |
| `--agent-version <n>` | number | no       | Specific agent version                  |
| `--api-key <key>`     | string | no       | API key                                 |
| `--base-url <url>`    | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent agent get --agent-id agent_abc
```

```bash
bl managed-agent agent get --agent-id agent_abc --agent-version 3 --output json
```

### `bl managed-agent agent list`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent agent list`                                                                                 |
| **Description**    | List Managed Agents                                                                                        |
| **Authentication** | API Key                                                                                                    |
| **Usage**          | `bl managed-agent agent list [--limit <n>] [--page <cursor>] [--all] [--include-archived] [--file <path>]` |

#### Flags

| Flag                 | Type   | Required | Description                                       |
| -------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`        | number | no       | Page size (1-100)                                 |
| `--page <cursor>`    | string | no       | Opaque page cursor returned by a previous request |
| `--all`              | switch | no       | Fetch all pages by following opaque cursors       |
| `--include-archived` | switch | no       | Include archived resources                        |
| `--api-key <key>`    | string | no       | API key                                           |
| `--base-url <url>`   | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent agent list
```

```bash
bl managed-agent agent list --limit 50
```

```bash
bl managed-agent agent list --all --include-archived --output json
```

### `bl managed-agent agent search`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent agent search`                                                                         |
| **Description**    | Search Managed Agents                                                                                |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl managed-agent agent search --query <text> [--limit <n>] [--page-limit <n>] [--include-archived]` |

#### Flags

| Flag                 | Type   | Required | Description                                                   |
| -------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`        | number | no       | Page size (1-100)                                             |
| `--query <text>`     | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>`   | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--include-archived` | switch | no       | Include archived resources                                    |
| `--api-key <key>`    | string | no       | API key                                                       |
| `--base-url <url>`   | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent agent search --query assistant
```

```bash
bl managed-agent agent search --query code --page-limit 20 --output json
```

### `bl managed-agent agent versions`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent agent versions`                                                            |
| **Description**    | List Managed Agent versions                                                               |
| **Authentication** | API Key                                                                                   |
| **Usage**          | `bl managed-agent agent versions --agent-id <id> [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag               | Type   | Required | Description                                       |
| ------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`      | number | no       | Page size (1-100)                                 |
| `--page <cursor>`  | string | no       | Opaque page cursor returned by a previous request |
| `--all`            | switch | no       | Fetch all pages by following opaque cursors       |
| `--agent-id <id>`  | string | yes      | Agent ID                                          |
| `--api-key <key>`  | string | no       | API key                                           |
| `--base-url <url>` | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent agent versions --agent-id agent_abc
```

```bash
bl managed-agent agent versions --agent-id agent_abc --all --output json
```

### `bl managed-agent apply`

| Field              | Value                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent apply`                                                                           |
| **Description**    | Apply planned changes to create/update/delete agent resources                                   |
| **Authentication** | API Key                                                                                         |
| **Usage**          | `bl managed-agent apply [--file <path>] [--concurrency <n>]`                                    |
| **Risk**           | `high`                                                                                          |
| **Risk message**   | This applies the current plan and may create, update, or delete remote managed Agent resources. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                | Type   | Required | Description                                                        |
| ------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                            |
| `--no-refresh`      | switch | no       | Skip refreshing state from remote before planning                  |
| `--refresh-only`    | switch | no       | Refresh state without mutating remote resources                    |
| `--concurrency <n>` | number | no       | Max independent resources to apply in parallel (default 6, max 10) |
| `--yes`             | switch | no       | Confirm this high-risk operation                                   |
| `--api-key <key>`   | string | no       | API key                                                            |
| `--base-url <url>`  | string | no       | API base URL                                                       |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
# Only after explicit user confirmation:
bl managed-agent apply --yes
```

### `bl managed-agent deployment create`

| Field              | Value                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment create`                                                                                                                                                                                                                                                                                                                        |
| **Description**    | Declare and create one Managed Agent Deployment through a scoped YAML apply                                                                                                                                                                                                                                                                              |
| **Authentication** | API Key                                                                                                                                                                                                                                                                                                                                                  |
| **Usage**          | `bl managed-agent deployment create --name <name> --agent <yaml-key> (--message <text>... \| --event <json\|@path>...) [--agent-version <number>] [--environment <yaml-key>] [--vault <yaml-key>...] [--resource <json\|@path>...] [--schedule <cron> --timezone <timezone>] [--description <text>] [--metadata <key=value>...] [--file <path>] [--yes]` |

#### Flags

| Flag                       | Type   | Required | Description                                                             |
| -------------------------- | ------ | -------- | ----------------------------------------------------------------------- |
| `--name <name>`            | string | yes      | Remote Deployment display name; the YAML key is generated automatically |
| `--agent <yaml-key>`       | string | yes      | Existing Agent key from agents.yaml                                     |
| `--agent-version <number>` | number | no       | Agent version                                                           |
| `--environment <yaml-key>` | string | no       | Existing Environment key from agents.yaml                               |
| `--vault <yaml-key>`       | array  | no       | Existing Vault key from agents.yaml (repeatable)                        |
| `--message <text>`         | array  | no       | Initial user message (repeatable)                                       |
| `--event <json\|@path>`    | array  | no       | Initial user.message or system.message JSON (repeatable)                |
| `--resource <json\|@path>` | array  | no       | File Resource JSON with source or file_id (repeatable)                  |
| `--schedule <cron>`        | string | no       | Five-field cron expression                                              |
| `--timezone <timezone>`    | string | no       | IANA schedule timezone                                                  |
| `--description <text>`     | string | no       | Deployment description                                                  |
| `--metadata <key=value>`   | array  | no       | Metadata entry (repeatable)                                             |
| `--file <path>`            | string | no       | Config file path (default: agents.yaml)                                 |
| `--yes`                    | switch | no       | Write YAML and run the scoped remote create                             |
| `--api-key <key>`          | string | no       | API key                                                                 |
| `--base-url <url>`         | string | no       | API base URL                                                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.
- Initial Events must contain 1-50 user.message/system.message entries. --resource accepts only File Resources in this release.
- Use either repeatable --message values or repeatable --event values; the two input forms cannot be mixed.

#### Examples

```bash
bl managed-agent deployment create --name Daily --agent assistant --message "Generate the report"
```

```bash
bl managed-agent deployment create --name Daily --agent assistant --event '{"type":"system.message","content":"Be concise"}' --yes
```

### `bl managed-agent deployment get`

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Name**           | `managed-agent deployment get`                         |
| **Description**    | Get a Managed Agent deployment                         |
| **Authentication** | API Key                                                |
| **Usage**          | `bl managed-agent deployment get --deployment-id <id>` |

#### Flags

| Flag                   | Type   | Required | Description                             |
| ---------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml) |
| `--deployment-id <id>` | string | yes      | Deployment ID                           |
| `--api-key <key>`      | string | no       | API key                                 |
| `--base-url <url>`     | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment get --deployment-id dep_abc
```

### `bl managed-agent deployment list`

| Field              | Value                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment list`                                                                                        |
| **Description**    | List Managed Agent deployments                                                                                         |
| **Authentication** | API Key                                                                                                                |
| **Usage**          | `bl managed-agent deployment list [--agent-id <id>] [--status active\|paused] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                           | Type   | Required | Description                                       |
| ------------------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`                  | number | no       | Page size (1-100)                                 |
| `--page <cursor>`              | string | no       | Opaque page cursor returned by a previous request |
| `--all`                        | switch | no       | Fetch all pages by following opaque cursors       |
| `--agent-id <id>`              | string | no       | Filter by agent ID                                |
| `--status <active\|paused>`    | string | no       | Filter by deployment status                       |
| `--include-archived`           | switch | no       | Include archived resources                        |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this timestamp                |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this timestamp               |
| `--api-key <key>`              | string | no       | API key                                           |
| `--base-url <url>`             | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment list
```

```bash
bl managed-agent deployment list --status active --all --output json
```

### `bl managed-agent deployment pause`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment pause`                                                                     |
| **Description**    | Pause a Managed Agent deployment                                                                     |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl managed-agent deployment pause (--deployment <name> \| --deployment-id <id>)`                    |
| **Risk**           | `high`                                                                                               |
| **Risk message**   | This pauses the specified Managed Agent deployment and stops its scheduled executions until resumed. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                   | Type   | Required | Description                                  |
| ---------------------- | ------ | -------- | -------------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml)      |
| `--deployment <name>`  | string | no       | Logical deployment name in agents.yaml/state |
| `--deployment-id <id>` | string | no       | Direct deployment ID                         |
| `--yes`                | switch | no       | Confirm this high-risk operation             |
| `--api-key <key>`      | string | no       | API key                                      |
| `--base-url <url>`     | string | no       | API base URL                                 |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment pause --deployment daily-report --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent deployment pause --deployment-id dep_abc --yes
```

### `bl managed-agent deployment run`

| Field              | Value                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment run`                                                                                              |
| **Description**    | Run a Managed Agent deployment now                                                                                          |
| **Authentication** | API Key                                                                                                                     |
| **Usage**          | `bl managed-agent deployment run (--deployment <name> \| --deployment-id <id>)`                                             |
| **Risk**           | `high`                                                                                                                      |
| **Risk message**   | This immediately starts a run for the specified Managed Agent deployment and may incur usage or trigger configured actions. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                   | Type   | Required | Description                                  |
| ---------------------- | ------ | -------- | -------------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml)      |
| `--deployment <name>`  | string | no       | Logical deployment name in agents.yaml/state |
| `--deployment-id <id>` | string | no       | Direct deployment ID                         |
| `--yes`                | switch | no       | Confirm this high-risk operation             |
| `--api-key <key>`      | string | no       | API key                                      |
| `--base-url <url>`     | string | no       | API base URL                                 |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment run --deployment daily-report --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent deployment run --deployment-id dep_abc --yes
```

### `bl managed-agent deployment runs get`

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Name**           | `managed-agent deployment runs get`                  |
| **Description**    | Get a Managed Agent deployment run                   |
| **Authentication** | API Key                                              |
| **Usage**          | `bl managed-agent deployment runs get --run-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                             |
| ------------------ | ------ | -------- | --------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml) |
| `--run-id <id>`    | string | yes      | Deployment run ID                       |
| `--api-key <key>`  | string | no       | API key                                 |
| `--base-url <url>` | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment runs get --run-id run_abc
```

### `bl managed-agent deployment runs list`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment runs list`                                                                 |
| **Description**    | List runs for a Managed Agent deployment                                                             |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl managed-agent deployment runs list --deployment-id <id> [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                   | Type   | Required | Description                                       |
| ---------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml)           |
| `--deployment-id <id>` | string | yes      | Deployment ID                                     |
| `--limit <n>`          | number | no       | Page size (1-100)                                 |
| `--page <cursor>`      | string | no       | Opaque page cursor returned by a previous request |
| `--all`                | switch | no       | Fetch all pages by following opaque cursors       |
| `--api-key <key>`      | string | no       | API key                                           |
| `--base-url <url>`     | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment runs list --deployment-id dep_abc
```

```bash
bl managed-agent deployment runs list --deployment-id dep_abc --all --output json
```

### `bl managed-agent deployment search`

| Field              | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment search`                                                           |
| **Description**    | Search Managed Agent deployments                                                            |
| **Authentication** | API Key                                                                                     |
| **Usage**          | `bl managed-agent deployment search --query <text> [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                           | Type   | Required | Description                                                   |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`                  | number | no       | Page size (1-100)                                             |
| `--page <cursor>`              | string | no       | Opaque page cursor returned by a previous request             |
| `--all`                        | switch | no       | Fetch all pages by following opaque cursors                   |
| `--query <text>`               | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--agent-id <id>`              | string | no       | Filter by agent ID                                            |
| `--status <active\|paused>`    | string | no       | Filter by deployment status                                   |
| `--include-archived`           | switch | no       | Include archived resources                                    |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this timestamp                            |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this timestamp                           |
| `--api-key <key>`              | string | no       | API key                                                       |
| `--base-url <url>`             | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Deployment search maps --query to the provider's server-side keyword parameter.

#### Examples

```bash
bl managed-agent deployment search --query report
```

```bash
bl managed-agent deployment search --query nightly --all --output json
```

### `bl managed-agent deployment unpause`

| Field              | Value                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent deployment unpause`                                                                          |
| **Description**    | Unpause a Managed Agent deployment                                                                          |
| **Authentication** | API Key                                                                                                     |
| **Usage**          | `bl managed-agent deployment unpause (--deployment <name> \| --deployment-id <id>)`                         |
| **Risk**           | `high`                                                                                                      |
| **Risk message**   | This resumes the specified Managed Agent deployment and may restart scheduled executions and related usage. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                   | Type   | Required | Description                                  |
| ---------------------- | ------ | -------- | -------------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml)      |
| `--deployment <name>`  | string | no       | Logical deployment name in agents.yaml/state |
| `--deployment-id <id>` | string | no       | Direct deployment ID                         |
| `--yes`                | switch | no       | Confirm this high-risk operation             |
| `--api-key <key>`      | string | no       | API key                                      |
| `--base-url <url>`     | string | no       | API base URL                                 |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent deployment unpause --deployment daily-report --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent deployment unpause --deployment-id dep_abc --yes
```

### `bl managed-agent destroy`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent destroy`                                                                                    |
| **Description**    | Destroy all managed agent resources tracked in state                                                       |
| **Authentication** | API Key                                                                                                    |
| **Usage**          | `bl managed-agent destroy [--file <path>] [--cascade]`                                                     |
| **Risk**           | `high`                                                                                                     |
| **Risk message**   | This deletes every managed Agent resource tracked in state; --cascade may also delete dependent resources. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                                                                |
| ------------------ | ------ | -------- | -------------------------------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)                                    |
| `--cascade`        | switch | no       | Auto-delete dependent resources (e.g. sessions referencing an environment) |
| `--yes`            | switch | no       | Confirm this high-risk operation                                           |
| `--api-key <key>`  | string | no       | API key                                                                    |
| `--base-url <url>` | string | no       | API base URL                                                               |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
# Only after explicit user confirmation:
bl managed-agent destroy --yes
```

```bash
# Only after explicit user confirmation:
bl managed-agent destroy --yes --cascade
```

### `bl managed-agent environment create`

| Field              | Value                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent environment create`                                                                                                                                                                                                                            |
| **Description**    | Declare and create one Managed Agent Environment through a scoped YAML apply                                                                                                                                                                                  |
| **Authentication** | API Key                                                                                                                                                                                                                                                       |
| **Usage**          | `bl managed-agent environment create --name <name> [--description <text>] [--metadata <key=value>...] [--apt <package>...] [--pip <package>...] [--npm <package>...] [--cargo <package>...] [--gem <package>...] [--go <package>...] [--file <path>] [--yes]` |

#### Flags

| Flag                     | Type   | Required | Description                                                              |
| ------------------------ | ------ | -------- | ------------------------------------------------------------------------ |
| `--name <name>`          | string | yes      | Remote Environment display name; the YAML key is generated automatically |
| `--description <text>`   | string | no       | Environment description                                                  |
| `--metadata <key=value>` | array  | no       | Metadata entry (repeatable)                                              |
| `--apt <package>`        | array  | no       | APT package (repeatable)                                                 |
| `--pip <package>`        | array  | no       | pip package (repeatable)                                                 |
| `--npm <package>`        | array  | no       | npm package (repeatable)                                                 |
| `--cargo <package>`      | array  | no       | Cargo package (repeatable)                                               |
| `--gem <package>`        | array  | no       | Ruby gem package (repeatable)                                            |
| `--go <package>`         | array  | no       | Go package (repeatable)                                                  |
| `--file <path>`          | string | no       | Config file path (default: agents.yaml)                                  |
| `--yes`                  | switch | no       | Write YAML and run the scoped remote create                              |
| `--api-key <key>`        | string | no       | API key                                                                  |
| `--base-url <url>`       | string | no       | API base URL                                                             |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.
- Creates a cloud Environment with unrestricted networking. Without --yes, only previews the generated YAML key and scoped plan.

#### Examples

```bash
bl managed-agent environment create --name Development
```

```bash
bl managed-agent environment create --name Development --pip pandas --npm typescript --metadata owner=platform --yes
```

### `bl managed-agent environment get`

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Name**           | `managed-agent environment get`                          |
| **Description**    | Get a Managed Agent environment                          |
| **Authentication** | API Key                                                  |
| **Usage**          | `bl managed-agent environment get --environment-id <id>` |

#### Flags

| Flag                    | Type   | Required | Description                             |
| ----------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`         | string | no       | Config file path (default: agents.yaml) |
| `--environment-id <id>` | string | yes      | Environment ID                          |
| `--api-key <key>`       | string | no       | API key                                 |
| `--base-url <url>`      | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent environment get --environment-id env_abc
```

### `bl managed-agent environment list`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent environment list`                                                                 |
| **Description**    | List Managed Agent environments                                                                  |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl managed-agent environment list [--limit <n>] [--page <cursor>] [--all] [--include-archived]` |

#### Flags

| Flag                 | Type   | Required | Description                                       |
| -------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`        | number | no       | Page size (1-100)                                 |
| `--page <cursor>`    | string | no       | Opaque page cursor returned by a previous request |
| `--all`              | switch | no       | Fetch all pages by following opaque cursors       |
| `--include-archived` | switch | no       | Include archived resources                        |
| `--api-key <key>`    | string | no       | API key                                           |
| `--base-url <url>`   | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent environment list
```

```bash
bl managed-agent environment list --all --output json
```

### `bl managed-agent environment search`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent environment search`                                                                         |
| **Description**    | Search Managed Agent environments                                                                          |
| **Authentication** | API Key                                                                                                    |
| **Usage**          | `bl managed-agent environment search --query <text> [--limit <n>] [--page-limit <n>] [--include-archived]` |

#### Flags

| Flag                 | Type   | Required | Description                                                   |
| -------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`        | number | no       | Page size (1-100)                                             |
| `--query <text>`     | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>`   | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--include-archived` | switch | no       | Include archived resources                                    |
| `--api-key <key>`    | string | no       | API key                                                       |
| `--base-url <url>`   | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent environment search --query sandbox
```

```bash
bl managed-agent environment search --query production --page-limit 20 --output json
```

### `bl managed-agent file delete`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `managed-agent file delete`                                       |
| **Description**    | Delete a Managed Agent file                                       |
| **Authentication** | API Key                                                           |
| **Usage**          | `bl managed-agent file delete --file-id <id>`                     |
| **Risk**           | `high`                                                            |
| **Risk message**   | This permanently deletes the specified remote Managed Agent file. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                             |
| ------------------ | ------ | -------- | --------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml) |
| `--file-id <id>`   | string | yes      | Remote file ID                          |
| `--yes`            | switch | no       | Confirm this high-risk operation        |
| `--api-key <key>`  | string | no       | API key                                 |
| `--base-url <url>` | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file delete --file-id file_abc --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent file delete --file-id file_abc --yes
```

### `bl managed-agent file download`

| Field              | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| **Name**           | `managed-agent file download`                                                  |
| **Description**    | Download Managed Agent file content                                            |
| **Authentication** | API Key                                                                        |
| **Usage**          | `bl managed-agent file download --file-id <id> --output-file <path> [--force]` |

#### Flags

| Flag                   | Type   | Required | Description                             |
| ---------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml) |
| `--file-id <id>`       | string | yes      | Remote file ID                          |
| `--output-file <path>` | string | yes      | Destination path                        |
| `--force`              | switch | no       | Overwrite an existing output file       |
| `--api-key <key>`      | string | no       | API key                                 |
| `--base-url <url>`     | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file download --file-id file_abc --output-file ./artifact.pdf
```

### `bl managed-agent file get`

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| **Name**           | `managed-agent file get`                   |
| **Description**    | Get Managed Agent file metadata            |
| **Authentication** | API Key                                    |
| **Usage**          | `bl managed-agent file get --file-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                             |
| ------------------ | ------ | -------- | --------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml) |
| `--file-id <id>`   | string | yes      | Remote file ID                          |
| `--api-key <key>`  | string | no       | API key                                 |
| `--base-url <url>` | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file get --file-id file_abc
```

### `bl managed-agent file list`

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent file list`                                                              |
| **Description**    | List Managed Agent files                                                               |
| **Authentication** | API Key                                                                                |
| **Usage**          | `bl managed-agent file list [--scope-id <id>] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag               | Type   | Required | Description                                       |
| ------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`      | number | no       | Page size (1-100)                                 |
| `--page <cursor>`  | string | no       | Opaque page cursor returned by a previous request |
| `--all`            | switch | no       | Fetch all pages by following opaque cursors       |
| `--scope-id <id>`  | string | no       | Filter by scope ID                                |
| `--api-key <key>`  | string | no       | API key                                           |
| `--base-url <url>` | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file list
```

```bash
bl managed-agent file list --scope-id sess_abc --all --output json
```

### `bl managed-agent file search`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent file search`                                                                      |
| **Description**    | Search Managed Agent files                                                                       |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl managed-agent file search --query <text> [--scope-id <id>] [--limit <n>] [--page-limit <n>]` |

#### Flags

| Flag               | Type   | Required | Description                                                   |
| ------------------ | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`      | number | no       | Page size (1-100)                                             |
| `--query <text>`   | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>` | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--scope-id <id>`  | string | no       | Filter by scope ID                                            |
| `--api-key <key>`  | string | no       | API key                                                       |
| `--base-url <url>` | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file search --query report
```

```bash
bl managed-agent file search --query pdf --scope-id sess_abc --output json
```

### `bl managed-agent file upload`

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent file upload`                                                           |
| **Description**    | Upload a Managed Agent file                                                           |
| **Authentication** | API Key                                                                               |
| **Usage**          | `bl managed-agent file upload --path <path> [--filename <name>] [--mime-type <type>]` |

#### Flags

| Flag                 | Type   | Required | Description                             |
| -------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml) |
| `--path <path>`      | string | yes      | Local file path                         |
| `--filename <name>`  | string | no       | Remote filename override                |
| `--mime-type <type>` | string | no       | MIME type override                      |
| `--api-key <key>`    | string | no       | API key                                 |
| `--base-url <url>`   | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent file upload --path ./report.pdf
```

### `bl managed-agent init`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `managed-agent init`                                                    |
| **Description**    | Create an agents.yaml template                                          |
| **Authentication** | No Auth                                                                 |
| **Usage**          | `bl managed-agent init [--agent-name <name>] [--file <path>] [--force]` |

#### Flags

| Flag                  | Type   | Required | Description                                  |
| --------------------- | ------ | -------- | -------------------------------------------- |
| `--agent-name <name>` | string | no       | Name of the first agent (default: assistant) |
| `--file <path>`       | string | no       | Output config path (default: agents.yaml)    |
| `--force`             | switch | no       | Overwrite an existing config file            |

#### Examples

```bash
bl managed-agent init
```

```bash
bl managed-agent init --agent-name assistant
```

### `bl managed-agent plan`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `managed-agent plan`                                                    |
| **Description**    | Show what changes would be applied to agent infrastructure              |
| **Authentication** | API Key                                                                 |
| **Usage**          | `bl managed-agent plan [--file <path>] [--no-refresh] [--refresh-only]` |

#### Flags

| Flag               | Type   | Required | Description                                                    |
| ------------------ | ------ | -------- | -------------------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)                        |
| `--no-refresh`     | switch | no       | Skip refreshing state from remote before planning              |
| `--refresh-only`   | switch | no       | Refresh state and show drift without planning remote mutations |
| `--api-key <key>`  | string | no       | API key                                                        |
| `--base-url <url>` | string | no       | API base URL                                                   |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --no-refresh and --dry-run plan offline from local config and state: no remote requests, no state writes, provider keys are not checked.

#### Examples

```bash
bl managed-agent plan
```

```bash
bl managed-agent plan --no-refresh
```

### `bl managed-agent playground`

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent playground`                                                            |
| **Description**    | Launch a Session Preview for an agents.yaml Agent                                     |
| **Authentication** | API Key                                                                               |
| **Usage**          | `bl managed-agent playground [--file <path>] [--agent <id>] [--port <n>] [--no-open]` |

#### Flags

| Flag               | Type   | Required | Description                                                           |
| ------------------ | ------ | -------- | --------------------------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)                               |
| `--port <n>`       | number | no       | Local port (default: 4848)                                            |
| `--no-open`        | switch | no       | Do not open a browser automatically                                   |
| `--agent <id>`     | string | no       | Agent to preview (required when the project declares multiple Agents) |
| `--api-key <key>`  | string | no       | API key                                                               |
| `--base-url <url>` | string | no       | API base URL                                                          |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Session Preview requires Node.js 22+ and keeps using an agents.yaml source. Directory Workbench is available under managed-agent project workbench.

#### Examples

```bash
bl managed-agent playground
```

```bash
bl managed-agent playground --agent assistant
```

```bash
bl managed-agent playground --file agents.yaml --no-open
```

### `bl managed-agent project build`

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent project build`                                                         |
| **Description**    | Organize directory source and generate the immutable Publish Build                    |
| **Authentication** | No Auth                                                                               |
| **Usage**          | `bl managed-agent project build [--project <directory>]`                              |
| **Risk**           | `high`                                                                                |
| **Risk message**   | This organizes the directory project source and writes the previewed immutable Build. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |
| `--yes`                 | switch | no       | Confirm this high-risk operation                    |

#### Examples

```bash
bl managed-agent project build --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent project build --yes
```

```bash
# Only after explicit user confirmation:
bl managed-agent project build --project ./my-agent --yes
```

### `bl managed-agent project init`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `managed-agent project init`                                |
| **Description**    | Create a directory project or convert the local agents.yaml |
| **Authentication** | No Auth                                                     |
| **Usage**          | `bl managed-agent project init [--project <directory>]`     |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |

#### Examples

```bash
bl managed-agent project init
```

```bash
bl managed-agent project init --project ./my-agent
```

### `bl managed-agent project publish`

| Field              | Value                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent project publish`                                                                                      |
| **Description**    | Publish the current directory-project Build and record a version                                                     |
| **Authentication** | API Key                                                                                                              |
| **Usage**          | `bl managed-agent project publish [--project <directory>] [--no-refresh] [--concurrency <n>]`                        |
| **Risk**           | `high`                                                                                                               |
| **Risk message**   | This publishes the current directory-project Build and may create, update, or delete remote managed Agent resources. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |
| `--no-refresh`          | switch | no       | Skip remote refresh before planning                 |
| `--concurrency <n>`     | number | no       | Maximum parallel resource operations                |
| `--yes`                 | switch | no       | Confirm this high-risk operation                    |
| `--api-key <key>`       | string | no       | API key                                             |
| `--base-url <url>`      | string | no       | API base URL                                        |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
# Only after explicit user confirmation:
bl managed-agent project publish --yes
```

```bash
# Only after explicit user confirmation:
bl managed-agent project publish --project ./my-agent --yes
```

### `bl managed-agent project validate`

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Name**           | `managed-agent project validate`                            |
| **Description**    | Validate a directory Agent project                          |
| **Authentication** | No Auth                                                     |
| **Usage**          | `bl managed-agent project validate [--project <directory>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |

#### Examples

```bash
bl managed-agent project validate
```

```bash
bl managed-agent project validate --project ./my-agent
```

### `bl managed-agent project version disable`

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Name**           | `managed-agent project version disable`                            |
| **Description**    | Disable directory project versions                                 |
| **Authentication** | No Auth                                                            |
| **Usage**          | `bl managed-agent project version disable [--project <directory>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |

#### Examples

```bash
bl managed-agent project version disable
```

```bash
bl managed-agent project version disable --project ./my-agent
```

### `bl managed-agent project version enable`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `managed-agent project version enable`                            |
| **Description**    | Enable directory project versions                                 |
| **Authentication** | No Auth                                                           |
| **Usage**          | `bl managed-agent project version enable [--project <directory>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |

#### Examples

```bash
bl managed-agent project version enable
```

```bash
bl managed-agent project version enable --project ./my-agent
```

### `bl managed-agent project version list`

| Field              | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent project version list`                                                              |
| **Description**    | List directory project versions                                                                   |
| **Authentication** | No Auth                                                                                           |
| **Usage**          | `bl managed-agent project version list [--project <directory>] [--limit <n>] [--cursor <cursor>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |
| `--limit <n>`           | number | no       | Maximum versions to return                          |
| `--cursor <cursor>`     | string | no       | Pagination cursor                                   |

#### Examples

```bash
bl managed-agent project version list
```

```bash
bl managed-agent project version list --limit 20 --output json
```

### `bl managed-agent project version preview`

| Field              | Value                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent project version preview`                                                        |
| **Description**    | Preview a directory project version                                                            |
| **Authentication** | No Auth                                                                                        |
| **Usage**          | `bl managed-agent project version preview --version-id <full-version> [--project <directory>]` |

#### Flags

| Flag                          | Type   | Required | Description                                         |
| ----------------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>`       | string | no       | Directory project root (default: current directory) |
| `--version-id <full-version>` | string | yes      | Full project version ID                             |

#### Examples

```bash
bl managed-agent project version preview --version-id <full-version>
```

### `bl managed-agent project version restore`

| Field              | Value                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent project version restore`                                                                      |
| **Description**    | Restore a version to the project working directory                                                           |
| **Authentication** | No Auth                                                                                                      |
| **Usage**          | `bl managed-agent project version restore --version-id <full-version> [--project <directory>]`               |
| **Risk**           | `high`                                                                                                       |
| **Risk message**   | This restores the full directory source to the working tree. Version history and remote State will not move. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                          | Type   | Required | Description                                         |
| ----------------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>`       | string | no       | Directory project root (default: current directory) |
| `--version-id <full-version>` | string | yes      | Full project version ID                             |
| `--yes`                       | switch | no       | Confirm this high-risk operation                    |

#### Examples

```bash
bl managed-agent project version restore --version-id <full-version>
```

```bash
# Only after explicit user confirmation:
bl managed-agent project version restore --version-id <full-version> --yes
```

### `bl managed-agent project version status`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `managed-agent project version status`                            |
| **Description**    | Show directory project version status                             |
| **Authentication** | No Auth                                                           |
| **Usage**          | `bl managed-agent project version status [--project <directory>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |

#### Examples

```bash
bl managed-agent project version status
```

```bash
bl managed-agent project version status --project ./my-agent --output json
```

### `bl managed-agent project workbench`

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent project workbench`                                                     |
| **Description**    | Launch the directory project Workbench                                                |
| **Authentication** | API Key                                                                               |
| **Usage**          | `bl managed-agent project workbench [--project <directory>] [--port <n>] [--no-open]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--project <directory>` | string | no       | Directory project root (default: current directory) |
| `--port <n>`            | number | no       | Local port (default: 4848)                          |
| `--no-open`             | switch | no       | Do not open a browser                               |
| `--api-key <key>`       | string | no       | API key                                             |
| `--base-url <url>`      | string | no       | API base URL                                        |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent project workbench
```

```bash
bl managed-agent project workbench --project ./my-agent --no-open
```

### `bl managed-agent session archive`

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Name**           | `managed-agent session archive`                           |
| **Description**    | Archive a Managed Agent session                           |
| **Authentication** | API Key                                                   |
| **Usage**          | `bl managed-agent session archive --session-id <id>`      |
| **Risk**           | `high`                                                    |
| **Risk message**   | This archives the specified remote Managed Agent Session. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--session-id <id>` | string | yes      | Session ID                              |
| `--yes`             | switch | no       | Confirm this high-risk operation        |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session archive --session-id sess_abc --dry-run
```

```bash
# Only after explicit user confirmation:
bl managed-agent session archive --session-id sess_abc --yes
```

### `bl managed-agent session create`

| Field              | Value                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session create`                                                                              |
| **Description**    | Create a new session for an agent                                                                           |
| **Authentication** | API Key                                                                                                     |
| **Usage**          | `bl managed-agent session create [--agent <name>] [--environment <name>] [--title <title>] [--file <path>]` |

#### Flags

| Flag                      | Type   | Required | Description                                                  |
| ------------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--file <path>`           | string | no       | Config file path (default: agents.yaml)                      |
| `--agent <name>`          | string | no       | Agent name (auto-detected when only one agent is configured) |
| `--environment <name>`    | string | no       | Override agent's declared environment                        |
| `--vault <name>`          | string | no       | Override agent's declared vault                              |
| `--memory-stores <names>` | string | no       | Override agent's memory stores (comma-separated)             |
| `--title <title>`         | string | no       | Session title                                                |
| `--api-key <key>`         | string | no       | API key                                                      |
| `--base-url <url>`        | string | no       | API base URL                                                 |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session create
```

```bash
bl managed-agent session create --agent assistant
```

```bash
bl managed-agent session create --agent assistant --title 'debug run'
```

### `bl managed-agent session debug`

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| **Name**           | `managed-agent session debug`                      |
| **Description**    | Aggregate session diagnostics                      |
| **Authentication** | API Key                                            |
| **Usage**          | `bl managed-agent session debug --session-id <id>` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--session-id <id>` | string | yes      | Session ID                              |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session debug --session-id sess_abc
```

```bash
bl managed-agent session debug --session-id sess_abc --output json
```

### `bl managed-agent session delete`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `managed-agent session delete`                                      |
| **Description**    | Delete a session                                                    |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl managed-agent session delete --session-id <id> [--file <path>]` |
| **Risk**           | `high`                                                              |
| **Risk message**   | This deletes the specified remote managed Agent Session.            |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--yes`             | switch | no       | Confirm this high-risk operation        |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
# Only after explicit user confirmation:
bl managed-agent session delete --session-id sess_abc123 --yes
```

### `bl managed-agent session event list`

| Field              | Value                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session event list`                                                                                                    |
| **Description**    | List events for a Managed Agent session                                                                                               |
| **Authentication** | API Key                                                                                                                               |
| **Usage**          | `bl managed-agent session event list --session-id <id> [--types <types>] [--order asc\|desc] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                           | Type   | Required | Description                                       |
| ------------------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)           |
| `--session-id <id>`            | string | yes      | Session ID                                        |
| `--limit <n>`                  | number | no       | Page size (1-100)                                 |
| `--page <cursor>`              | string | no       | Opaque page cursor returned by a previous request |
| `--all`                        | switch | no       | Fetch all pages by following opaque cursors       |
| `--order <asc\|desc>`          | string | no       | Event order: asc or desc                          |
| `--types <types>`              | string | no       | Comma-separated raw event types                   |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this timestamp                |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this timestamp               |
| `--api-key <key>`              | string | no       | API key                                           |
| `--base-url <url>`             | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --types is applied client-side to each page returned by the provider.

#### Examples

```bash
bl managed-agent session event list --session-id sess_abc
```

```bash
bl managed-agent session event list --session-id sess_abc --all --output json
```

### `bl managed-agent session event send`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `managed-agent session event send`                                            |
| **Description**    | Send raw events to a Managed Agent session                                    |
| **Authentication** | API Key                                                                       |
| **Usage**          | `bl managed-agent session event send --session-id <id> --event <json\|@path>` |

#### Flags

| Flag                    | Type   | Required | Description                                   |
| ----------------------- | ------ | -------- | --------------------------------------------- |
| `--file <path>`         | string | no       | Config file path (default: agents.yaml)       |
| `--session-id <id>`     | string | yes      | Session ID                                    |
| `--event <json\|@path>` | string | yes      | Raw event object/array as JSON or @event.json |
| `--api-key <key>`       | string | no       | API key                                       |
| `--base-url <url>`      | string | no       | API base URL                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session event send --session-id sess_abc --event '{"type":"message","role":"user","content":[{"type":"text","text":"hello"}]}'
```

```bash
bl managed-agent session event send --session-id sess_abc --event @event.json
```

### `bl managed-agent session event stream`

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session event stream`                                              |
| **Description**    | Stream events from a Managed Agent session                                        |
| **Authentication** | API Key                                                                           |
| **Usage**          | `bl managed-agent session event stream --session-id <id> [--after-id <event-id>]` |

#### Flags

| Flag                    | Type   | Required | Description                             |
| ----------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`         | string | no       | Config file path (default: agents.yaml) |
| `--session-id <id>`     | string | yes      | Session ID                              |
| `--after-id <event-id>` | string | no       | Resume after this event ID              |
| `--api-key <key>`       | string | no       | API key                                 |
| `--base-url <url>`      | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- When the provider has no native event cursor, --after-id resumes through paginated history polling and event ID de-duplication.

#### Examples

```bash
bl managed-agent session event stream --session-id sess_abc
```

```bash
bl managed-agent session event stream --session-id sess_abc --after-id evt_123 --output json
```

### `bl managed-agent session events`

| Field              | Value                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session events`                                                                                                    |
| **Description**    | List events for a Managed Agent session                                                                                           |
| **Authentication** | API Key                                                                                                                           |
| **Usage**          | `bl managed-agent session events --session-id <id> [--types <types>] [--order asc\|desc] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                           | Type   | Required | Description                                       |
| ------------------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)           |
| `--session-id <id>`            | string | yes      | Session ID                                        |
| `--limit <n>`                  | number | no       | Page size (1-100)                                 |
| `--page <cursor>`              | string | no       | Opaque page cursor returned by a previous request |
| `--all`                        | switch | no       | Fetch all pages by following opaque cursors       |
| `--order <asc\|desc>`          | string | no       | Event order: asc or desc                          |
| `--types <types>`              | string | no       | Comma-separated raw event types                   |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this timestamp                |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this timestamp               |
| `--api-key <key>`              | string | no       | API key                                           |
| `--base-url <url>`             | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --types is applied client-side to each page returned by the provider.

#### Examples

```bash
bl managed-agent session events --session-id sess_abc
```

```bash
bl managed-agent session events --session-id sess_abc --all --output json
```

### `bl managed-agent session export`

| Field              | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session export`                                                     |
| **Description**    | Export session diagnostics as a ZIP                                                |
| **Authentication** | API Key                                                                            |
| **Usage**          | `bl managed-agent session export --session-id <id> --output-file <path> [--force]` |

#### Flags

| Flag                   | Type   | Required | Description                             |
| ---------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`        | string | no       | Config file path (default: agents.yaml) |
| `--session-id <id>`    | string | yes      | Session ID                              |
| `--output-file <path>` | string | yes      | Destination ZIP path                    |
| `--force`              | switch | no       | Overwrite an existing output file       |
| `--api-key <key>`      | string | no       | API key                                 |
| `--base-url <url>`     | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- The ZIP contains metadata only; file bodies and credential-like values are excluded/redacted.

#### Examples

```bash
bl managed-agent session export --session-id sess_abc --output-file ./session-debug.zip
```

### `bl managed-agent session get`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `managed-agent session get`                                      |
| **Description**    | Get details of a session                                         |
| **Authentication** | API Key                                                          |
| **Usage**          | `bl managed-agent session get --session-id <id> [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session get --session-id sess_abc123
```

### `bl managed-agent session list`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session list`                                                                                     |
| **Description**    | List sessions from the provider                                                                                  |
| **Authentication** | API Key                                                                                                          |
| **Usage**          | `bl managed-agent session list [--agent <name>] [--statuses <statuses>] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                           | Type   | Required | Description                                       |
| ------------------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)           |
| `--agent <name>`               | string | no       | Filter by agent name                              |
| `--all`                        | switch | no       | Fetch all pages by following the cursor           |
| `--limit <n>`                  | number | no       | Page size (1-100)                                 |
| `--page <cursor>`              | string | no       | Opaque page cursor returned by a previous request |
| `--statuses <statuses>`        | string | no       | Comma-separated session statuses                  |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this RFC 3339 timestamp       |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this RFC 3339 timestamp      |
| `--api-key <key>`              | string | no       | API key                                           |
| `--base-url <url>`             | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session list
```

```bash
bl managed-agent session list --agent assistant
```

```bash
bl managed-agent session list --all
```

### `bl managed-agent session run`

| Field              | Value                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session run`                                                                   |
| **Description**    | Create a session, send a message, and stream the response                                     |
| **Authentication** | API Key                                                                                       |
| **Usage**          | `bl managed-agent session run --prompt <text> [--agent <name>] [--no-stream] [--file <path>]` |

#### Flags

| Flag                      | Type   | Required | Description                                                  |
| ------------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--prompt <text>`         | string | yes      | Prompt to send (required)                                    |
| `--file <path>`           | string | no       | Config file path (default: agents.yaml)                      |
| `--agent <name>`          | string | no       | Agent name (auto-detected when only one agent is configured) |
| `--environment <name>`    | string | no       | Override agent's declared environment                        |
| `--vault <name>`          | string | no       | Override agent's declared vault                              |
| `--memory-stores <names>` | string | no       | Override agent's memory stores (comma-separated)             |
| `--title <title>`         | string | no       | Session title                                                |
| `--no-stream`             | switch | no       | Use polling instead of SSE streaming                         |
| `--api-key <key>`         | string | no       | API key                                                      |
| `--base-url <url>`        | string | no       | API base URL                                                 |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --output json emits one envelope: { session_id, provider, agent, events } — read session_id to chain `session send/get/events/delete`.

#### Examples

```bash
bl managed-agent session run --prompt "hello"
```

```bash
bl managed-agent session run --agent assistant --prompt "summarize this repo"
```

### `bl managed-agent session search`

| Field              | Value                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent session search`                                                                                             |
| **Description**    | Search Managed Agent sessions                                                                                              |
| **Authentication** | API Key                                                                                                                    |
| **Usage**          | `bl managed-agent session search --query <text> [--agent <name>] [--statuses <statuses>] [--limit <n>] [--page-limit <n>]` |

#### Flags

| Flag                           | Type   | Required | Description                                                   |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`                | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`                  | number | no       | Page size (1-100)                                             |
| `--query <text>`               | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>`             | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--agent <name>`               | string | no       | Filter by configured agent name                               |
| `--statuses <statuses>`        | string | no       | Comma-separated session statuses                              |
| `--created-at-gte <timestamp>` | string | no       | Created at or after this timestamp                            |
| `--created-at-lte <timestamp>` | string | no       | Created at or before this timestamp                           |
| `--api-key <key>`              | string | no       | API key                                                       |
| `--base-url <url>`             | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session search --query debug
```

```bash
bl managed-agent session search --query failed --statuses failed --output json
```

### `bl managed-agent session send`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent session send`                                                                     |
| **Description**    | Send a message to an existing session and stream the response                                    |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl managed-agent session send --session-id <id> --message <text> [--no-stream] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--message <text>`  | string | yes      | Message to send (required)              |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--no-stream`       | switch | no       | Use polling instead of SSE streaming    |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session send --session-id sess_abc123 --message "continue"
```

### `bl managed-agent session update`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent session update`                                                                   |
| **Description**    | Update a Managed Agent session                                                                   |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl managed-agent session update --session-id <id> [--title <title>] [--metadata <json\|@path>]` |

#### Flags

| Flag                       | Type   | Required | Description                             |
| -------------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`            | string | no       | Config file path (default: agents.yaml) |
| `--session-id <id>`        | string | yes      | Session ID                              |
| `--title <title>`          | string | no       | New session title                       |
| `--metadata <json\|@path>` | string | no       | String-valued metadata JSON or @file    |
| `--api-key <key>`          | string | no       | API key                                 |
| `--base-url <url>`         | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session update --session-id sess_abc --title 'investigation'
```

```bash
bl managed-agent session update --session-id sess_abc --metadata @metadata.json
```

### `bl managed-agent skill create`

| Field              | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent skill create`                                                                |
| **Description**    | Declare and create one custom Managed Agent Skill from a local source                       |
| **Authentication** | API Key                                                                                     |
| **Usage**          | `bl managed-agent skill create --source <directory\|zip\|SKILL.md> [--file <path>] [--yes]` |

#### Flags

| Flag                                  | Type   | Required | Description                                               |
| ------------------------------------- | ------ | -------- | --------------------------------------------------------- |
| `--source <directory\|zip\|SKILL.md>` | string | yes      | Local Skill directory, ZIP archive, or single SKILL.md    |
| `--file <path>`                       | string | no       | Config file path (default: agents.yaml)                   |
| `--yes`                               | switch | no       | Write YAML and upload the Skill through the scoped create |
| `--api-key <key>`                     | string | no       | API key                                                   |
| `--base-url <url>`                    | string | no       | API base URL                                              |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.
- The YAML key is derived from SKILL.md frontmatter name. Remote URLs remain available through handwritten YAML plus full apply.

#### Examples

```bash
bl managed-agent skill create --source ./skills/code-review
```

```bash
bl managed-agent skill create --source ./skill.zip --yes
```

### `bl managed-agent skill download`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent skill download`                                                                             |
| **Description**    | Download a Managed Agent skill version                                                                     |
| **Authentication** | API Key                                                                                                    |
| **Usage**          | `bl managed-agent skill download --skill-id <id> --skill-version <version> --output-file <path> [--force]` |

#### Flags

| Flag                        | Type   | Required | Description                             |
| --------------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`             | string | no       | Config file path (default: agents.yaml) |
| `--skill-id <id>`           | string | yes      | Skill ID                                |
| `--skill-version <version>` | string | yes      | Skill version                           |
| `--output-file <path>`      | string | yes      | Destination ZIP path                    |
| `--force`                   | switch | no       | Overwrite an existing output file       |
| `--api-key <key>`           | string | no       | API key                                 |
| `--base-url <url>`          | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent skill download --skill-id skill_abc --skill-version 3 --output-file ./skill.zip
```

### `bl managed-agent skill get`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `managed-agent skill get`                    |
| **Description**    | Get a Managed Agent skill                    |
| **Authentication** | API Key                                      |
| **Usage**          | `bl managed-agent skill get --skill-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                             |
| ------------------ | ------ | -------- | --------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml) |
| `--skill-id <id>`  | string | yes      | Skill ID                                |
| `--api-key <key>`  | string | no       | API key                                 |
| `--base-url <url>` | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent skill get --skill-id skill_abc
```

### `bl managed-agent skill list`

| Field              | Value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent skill list`                                                                             |
| **Description**    | List Managed Agent skills                                                                              |
| **Authentication** | API Key                                                                                                |
| **Usage**          | `bl managed-agent skill list [--source custom\|official\|all] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                               | Type   | Required | Description                                       |
| ---------------------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                    | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`                      | number | no       | Page size (1-100)                                 |
| `--page <cursor>`                  | string | no       | Opaque page cursor returned by a previous request |
| `--all`                            | switch | no       | Fetch all pages by following opaque cursors       |
| `--source <custom\|official\|all>` | string | no       | Skill catalog: custom (default), official, or all |
| `--api-key <key>`                  | string | no       | API key                                           |
| `--base-url <url>`                 | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --source all combines one page from each catalog, or every page with --all; it does not accept --page.

#### Examples

```bash
bl managed-agent skill list
```

```bash
bl managed-agent skill list --source official
```

```bash
bl managed-agent skill list --source all --all --output json
```

### `bl managed-agent skill search`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent skill search`                                                                                     |
| **Description**    | Search Managed Agent skills                                                                                      |
| **Authentication** | API Key                                                                                                          |
| **Usage**          | `bl managed-agent skill search --query <text> [--source custom\|official\|all] [--limit <n>] [--page-limit <n>]` |

#### Flags

| Flag                               | Type   | Required | Description                                                   |
| ---------------------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`                    | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`                      | number | no       | Page size (1-100)                                             |
| `--query <text>`                   | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>`                 | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--source <custom\|official\|all>` | string | no       | Skill catalog: custom (default), official, or all             |
| `--api-key <key>`                  | string | no       | API key                                                       |
| `--base-url <url>`                 | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent skill search --query browser --source official
```

```bash
bl managed-agent skill search --query report --source all --output json
```

### `bl managed-agent skill versions`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent skill versions`                                                            |
| **Description**    | List Managed Agent skill versions                                                         |
| **Authentication** | API Key                                                                                   |
| **Usage**          | `bl managed-agent skill versions --skill-id <id> [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag               | Type   | Required | Description                                       |
| ------------------ | ------ | -------- | ------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)           |
| `--skill-id <id>`  | string | yes      | Skill ID                                          |
| `--limit <n>`      | number | no       | Page size (1-100)                                 |
| `--page <cursor>`  | string | no       | Opaque page cursor returned by a previous request |
| `--all`            | switch | no       | Fetch all pages by following opaque cursors       |
| `--api-key <key>`  | string | no       | API key                                           |
| `--base-url <url>` | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent skill versions --skill-id skill_abc
```

```bash
bl managed-agent skill versions --skill-id skill_abc --all --output json
```

### `bl managed-agent skill-list`

| Field              | Value                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent skill-list`                                                                             |
| **Description**    | List Managed Agent skills                                                                              |
| **Authentication** | API Key                                                                                                |
| **Usage**          | `bl managed-agent skill-list [--source custom\|official\|all] [--limit <n>] [--page <cursor>] [--all]` |

#### Flags

| Flag                               | Type   | Required | Description                                       |
| ---------------------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`                    | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`                      | number | no       | Page size (1-100)                                 |
| `--page <cursor>`                  | string | no       | Opaque page cursor returned by a previous request |
| `--all`                            | switch | no       | Fetch all pages by following opaque cursors       |
| `--source <custom\|official\|all>` | string | no       | Skill catalog: custom (default), official, or all |
| `--api-key <key>`                  | string | no       | API key                                           |
| `--base-url <url>`                 | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --source all combines one page from each catalog, or every page with --all; it does not accept --page.

#### Examples

```bash
bl managed-agent skill-list
```

```bash
bl managed-agent skill-list --source official
```

```bash
bl managed-agent skill-list --source all --all --output json
```

### `bl managed-agent state import`

| Field              | Value                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent state import`                                                                                            |
| **Description**    | Import an existing remote resource into agents state                                                                    |
| **Authentication** | API Key                                                                                                                 |
| **Usage**          | `bl managed-agent state import --address <bailian.type.name> --remote-id <id> [--resource-version <n>] [--file <path>]` |

#### Flags

| Flag                            | Type   | Required | Description                                            |
| ------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--address <bailian.type.name>` | string | yes      | Resource state address (required)                      |
| `--remote-id <id>`              | string | yes      | Existing remote resource ID to import (required)       |
| `--resource-version <n>`        | number | no       | Resource version (for versioned resources like agents) |
| `--file <path>`                 | string | no       | Config file path (default: agents.yaml)                |
| `--api-key <key>`               | string | no       | API key                                                |
| `--base-url <url>`              | string | no       | API base URL                                           |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent state import --address bailian.agent.assistant --remote-id agent-abc123
```

### `bl managed-agent state list`

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| **Name**           | `managed-agent state list`                    |
| **Description**    | List resources tracked in agents state        |
| **Authentication** | No Auth                                       |
| **Usage**          | `bl managed-agent state list [--file <path>]` |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent state list
```

```bash
bl managed-agent state list --file agents.yaml
```

### `bl managed-agent state rm`

| Field              | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent state rm`                                                                                          |
| **Description**    | Remove a resource from state without destroying it remotely                                                       |
| **Authentication** | No Auth                                                                                                           |
| **Usage**          | `bl managed-agent state rm --address <provider.type.name> [--file <path>]`                                        |
| **Risk**           | `high`                                                                                                            |
| **Risk message**   | This removes the resource from local state without deleting it remotely, so this project will no longer track it. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |
| `--yes`                          | switch | no       | Confirm this high-risk operation        |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
# Only after explicit user confirmation:
bl managed-agent state rm --address bailian.agent.assistant --yes
```

### `bl managed-agent state show`

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Name**           | `managed-agent state show`                                                   |
| **Description**    | Show details of a resource in agents state                                   |
| **Authentication** | No Auth                                                                      |
| **Usage**          | `bl managed-agent state show --address <provider.type.name> [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent state show --address bailian.agent.assistant
```

### `bl managed-agent validate`

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Name**           | `managed-agent validate`                        |
| **Description**    | Validate an agents.yaml configuration (offline) |
| **Authentication** | No Auth                                         |
| **Usage**          | `bl managed-agent validate [--file <path>]`     |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent validate
```

```bash
bl managed-agent validate --file agents.yaml
```

### `bl managed-agent vault create`

| Field              | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent vault create`                                                                      |
| **Description**    | Declare and create one empty Managed Agent Vault through a scoped YAML apply                      |
| **Authentication** | API Key                                                                                           |
| **Usage**          | `bl managed-agent vault create --name <name> [--metadata <key=value>...] [--file <path>] [--yes]` |

#### Flags

| Flag                     | Type   | Required | Description                                                        |
| ------------------------ | ------ | -------- | ------------------------------------------------------------------ |
| `--name <name>`          | string | yes      | Remote Vault display name; the YAML key is generated automatically |
| `--metadata <key=value>` | array  | no       | Metadata entry (repeatable)                                        |
| `--file <path>`          | string | no       | Config file path (default: agents.yaml)                            |
| `--yes`                  | switch | no       | Write YAML and run the scoped remote create                        |
| `--api-key <key>`        | string | no       | API key                                                            |
| `--base-url <url>`       | string | no       | API base URL                                                       |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.
- Creates an empty Vault. Add secrets later with `vault credential create`.

#### Examples

```bash
bl managed-agent vault create --name Production
```

```bash
bl managed-agent vault create --name Production --metadata owner=platform --yes
```

### `bl managed-agent vault credential create`

| Field              | Value                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent vault credential create`                                                                                                                                      |
| **Description**    | Append and create one environment-variable Credential in a tracked Vault                                                                                                     |
| **Authentication** | API Key                                                                                                                                                                      |
| **Usage**          | `bl managed-agent vault credential create --vault <yaml-key> --name <name> --secret-name <name> --secret-env <env-name> [--metadata <key=value>...] [--file <path>] [--yes]` |

#### Flags

| Flag                      | Type   | Required | Description                                            |
| ------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--vault <yaml-key>`      | string | yes      | Existing tracked Vault key from agents.yaml            |
| `--name <name>`           | string | yes      | Credential display name                                |
| `--secret-name <name>`    | string | yes      | Environment variable name exposed to the Agent         |
| `--secret-env <env-name>` | string | yes      | Local environment variable containing the secret value |
| `--metadata <key=value>`  | array  | no       | Metadata entry (repeatable)                            |
| `--file <path>`           | string | no       | Config file path (default: agents.yaml)                |
| `--yes`                   | switch | no       | Write YAML and create the remote Credential            |
| `--api-key <key>`         | string | no       | API key                                                |
| `--base-url <url>`        | string | no       | API base URL                                           |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Without --yes, this command only previews. --dry-run is fully offline. The scoped flow checks only the target resource and its transitive dependencies; unrelated resources are not refreshed or drift-checked.
- --secret-env is an environment variable name, not the secret itself. The CLI auto-loads the nearest .env from the current directory upward; shell exports and CI secret injection also work.
- YAML stores only ${ENV_NAME}. Never commit .env; subsequent full apply runs must provide the same environment variable.

#### Examples

```bash
bl managed-agent vault credential create --vault production --name api-token --secret-name API_TOKEN --secret-env PROD_API_TOKEN
```

```bash
bl managed-agent vault credential create --vault production --name api-token --secret-name API_TOKEN --secret-env PROD_API_TOKEN --yes
```

### `bl managed-agent vault get`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `managed-agent vault get`                    |
| **Description**    | Get a Managed Agent vault                    |
| **Authentication** | API Key                                      |
| **Usage**          | `bl managed-agent vault get --vault-id <id>` |

#### Flags

| Flag               | Type   | Required | Description                             |
| ------------------ | ------ | -------- | --------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml) |
| `--vault-id <id>`  | string | yes      | Vault ID                                |
| `--api-key <key>`  | string | no       | API key                                 |
| `--base-url <url>` | string | no       | API base URL                            |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent vault get --vault-id vault_abc
```

### `bl managed-agent vault list`

| Field              | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Name**           | `managed-agent vault list`                                                                 |
| **Description**    | List Managed Agent vaults                                                                  |
| **Authentication** | API Key                                                                                    |
| **Usage**          | `bl managed-agent vault list [--limit <n>] [--page <cursor>] [--all] [--include-archived]` |

#### Flags

| Flag                 | Type   | Required | Description                                       |
| -------------------- | ------ | -------- | ------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)           |
| `--limit <n>`        | number | no       | Page size (1-100)                                 |
| `--page <cursor>`    | string | no       | Opaque page cursor returned by a previous request |
| `--all`              | switch | no       | Fetch all pages by following opaque cursors       |
| `--include-archived` | switch | no       | Include archived resources                        |
| `--api-key <key>`    | string | no       | API key                                           |
| `--base-url <url>`   | string | no       | API base URL                                      |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent vault list
```

```bash
bl managed-agent vault list --all --output json
```

### `bl managed-agent vault search`

| Field              | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Name**           | `managed-agent vault search`                                                                         |
| **Description**    | Search Managed Agent vaults                                                                          |
| **Authentication** | API Key                                                                                              |
| **Usage**          | `bl managed-agent vault search --query <text> [--limit <n>] [--page-limit <n>] [--include-archived]` |

#### Flags

| Flag                 | Type   | Required | Description                                                   |
| -------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--file <path>`      | string | no       | Config file path (default: agents.yaml)                       |
| `--limit <n>`        | number | no       | Page size (1-100)                                             |
| `--query <text>`     | string | yes      | Case-insensitive text to find in IDs, names, and descriptions |
| `--page-limit <n>`   | number | no       | Maximum pages to scan for client-side search (default: 10)    |
| `--include-archived` | switch | no       | Include archived resources                                    |
| `--api-key <key>`    | string | no       | API key                                                       |
| `--base-url <url>`   | string | no       | API base URL                                                  |

#### Notes

- bl managed-agent supports the Bailian provider only; configurations containing other providers are rejected.
- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent vault search --query github
```

```bash
bl managed-agent vault search --query production --page-limit 20 --output json
```
