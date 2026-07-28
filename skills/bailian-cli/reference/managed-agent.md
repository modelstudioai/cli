# `bl managed-agent` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                           | Description                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| `bl managed-agent apply`          | Apply planned changes to create/update/delete agent resources |
| `bl managed-agent destroy`        | Destroy all managed agent resources tracked in state          |
| `bl managed-agent init`           | Create a new agents.yaml template                             |
| `bl managed-agent plan`           | Show what changes would be applied to agent infrastructure    |
| `bl managed-agent session create` | Create a new session for an agent                             |
| `bl managed-agent session delete` | Delete a session                                              |
| `bl managed-agent session events` | List event history for a session                              |
| `bl managed-agent session get`    | Get details of a session                                      |
| `bl managed-agent session list`   | List sessions from the provider                               |
| `bl managed-agent session run`    | Create a session, send a message, and stream the response     |
| `bl managed-agent session send`   | Send a message to an existing session and stream the response |
| `bl managed-agent skill-list`     | List skills from the provider's skill catalog                 |
| `bl managed-agent state import`   | Import an existing remote resource into agents state          |
| `bl managed-agent state list`     | List resources tracked in agents state                        |
| `bl managed-agent state rm`       | Remove a resource from state without destroying it remotely   |
| `bl managed-agent state show`     | Show details of a resource in agents state                    |
| `bl managed-agent validate`       | Validate an agents.yaml configuration (offline)               |

## Command details

### `bl managed-agent apply`

| Field           | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent apply`                                                                    |
| **Description** | Apply planned changes to create/update/delete agent resources                            |
| **Usage**       | `bl managed-agent apply [--file <path>] [--provider <name>] [--yes] [--concurrency <n>]` |

#### Flags

| Flag                | Type   | Required | Description                                                          |
| ------------------- | ------ | -------- | -------------------------------------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                              |
| `--provider <name>` | string | no       | Target provider (default: all configured)                            |
| `--yes`             | switch | no       | Confirm and apply without an interactive prompt (required to mutate) |
| `--no-refresh`      | switch | no       | Skip refreshing state from remote before planning                    |
| `--concurrency <n>` | number | no       | Max independent resources to apply in parallel (default 6, max 10)   |
| `--api-key <key>`   | string | no       | API key                                                              |
| `--base-url <url>`  | string | no       | API base URL                                                         |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent apply --yes
```

```bash
bl managed-agent apply --provider bailian --yes
```

### `bl managed-agent destroy`

| Field           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| **Name**        | `managed-agent destroy`                                        |
| **Description** | Destroy all managed agent resources tracked in state           |
| **Usage**       | `bl managed-agent destroy [--file <path>] [--yes] [--cascade]` |

#### Flags

| Flag               | Type   | Required | Description                                                                |
| ------------------ | ------ | -------- | -------------------------------------------------------------------------- |
| `--file <path>`    | string | no       | Config file path (default: agents.yaml)                                    |
| `--yes`            | switch | no       | Confirm and destroy without an interactive prompt (required)               |
| `--cascade`        | switch | no       | Auto-delete dependent resources (e.g. sessions referencing an environment) |
| `--api-key <key>`  | string | no       | API key                                                                    |
| `--base-url <url>` | string | no       | API base URL                                                               |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent destroy --yes
```

```bash
bl managed-agent destroy --yes --cascade
```

### `bl managed-agent init`

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent init`                                                                        |
| **Description** | Create a new agents.yaml template                                                           |
| **Usage**       | `bl managed-agent init [--provider <name>] [--agent-name <name>] [--file <path>] [--force]` |

#### Flags

| Flag                                            | Type   | Required | Description                                                   |
| ----------------------------------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--provider <bailian\|claude\|qoder\|ark\|all>` | string | no       | Provider: bailian, claude, qoder, ark, all (default: bailian) |
| `--agent-name <name>`                           | string | no       | Name of the first agent (default: assistant)                  |
| `--file <path>`                                 | string | no       | Output config path (default: agents.yaml)                     |
| `--force`                                       | switch | no       | Overwrite an existing config file                             |

#### Examples

```bash
bl managed-agent init
```

```bash
bl managed-agent init --provider bailian --agent-name assistant
```

```bash
bl managed-agent init --provider all
```

### `bl managed-agent plan`

| Field           | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent plan`                                                                        |
| **Description** | Show what changes would be applied to agent infrastructure                                  |
| **Usage**       | `bl managed-agent plan [--file <path>] [--provider <name>] [--no-refresh] [--refresh-only]` |

#### Flags

| Flag                | Type   | Required | Description                                                    |
| ------------------- | ------ | -------- | -------------------------------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                        |
| `--provider <name>` | string | no       | Target provider (default: all configured)                      |
| `--no-refresh`      | switch | no       | Skip refreshing state from remote before planning              |
| `--refresh-only`    | switch | no       | Refresh state and show drift without planning remote mutations |
| `--api-key <key>`   | string | no       | API key                                                        |
| `--base-url <url>`  | string | no       | API base URL                                                   |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --no-refresh and --dry-run plan offline from local config and state: no remote requests, no state writes, provider keys are not checked.

#### Examples

```bash
bl managed-agent plan
```

```bash
bl managed-agent plan --provider bailian
```

```bash
bl managed-agent plan --no-refresh
```

### `bl managed-agent session create`

| Field           | Value                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent session create`                                                                              |
| **Description** | Create a new session for an agent                                                                           |
| **Usage**       | `bl managed-agent session create [--agent <name>] [--environment <name>] [--title <title>] [--file <path>]` |

#### Flags

| Flag                      | Type   | Required | Description                                                  |
| ------------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--file <path>`           | string | no       | Config file path (default: agents.yaml)                      |
| `--agent <name>`          | string | no       | Agent name (auto-detected when only one agent is configured) |
| `--environment <name>`    | string | no       | Override agent's declared environment                        |
| `--vault <name>`          | string | no       | Override agent's declared vault                              |
| `--memory-stores <names>` | string | no       | Override agent's memory stores (comma-separated)             |
| `--title <title>`         | string | no       | Session title                                                |
| `--provider <name>`       | string | no       | Target provider (multi-provider agents)                      |
| `--api-key <key>`         | string | no       | API key                                                      |
| `--base-url <url>`        | string | no       | API base URL                                                 |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
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

### `bl managed-agent session delete`

| Field           | Value                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent session delete`                                                          |
| **Description** | Delete a session                                                                        |
| **Usage**       | `bl managed-agent session delete --session-id <id> [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session delete --session-id sess_abc123
```

### `bl managed-agent session events`

| Field           | Value                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent session events`                                                            |
| **Description** | List event history for a session                                                          |
| **Usage**       | `bl managed-agent session events --session-id <id> [--limit <n>] [--all] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--limit <n>`       | number | no       | Maximum number of events to fetch       |
| `--all`             | switch | no       | Fetch all pages by following the cursor |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session events --session-id sess_abc123
```

```bash
bl managed-agent session events --session-id sess_abc123 --all
```

### `bl managed-agent session get`

| Field           | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| **Name**        | `managed-agent session get`                                                          |
| **Description** | Get details of a session                                                             |
| **Usage**       | `bl managed-agent session get --session-id <id> [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session get --session-id sess_abc123
```

### `bl managed-agent session list`

| Field           | Value                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent session list`                                                                 |
| **Description** | List sessions from the provider                                                              |
| **Usage**       | `bl managed-agent session list [--agent <name>] [--all] [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--agent <name>`    | string | no       | Filter by agent name                    |
| `--all`             | switch | no       | Fetch all pages by following the cursor |
| `--provider <name>` | string | no       | Target provider                         |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
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

| Field           | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent session run`                                                                   |
| **Description** | Create a session, send a message, and stream the response                                     |
| **Usage**       | `bl managed-agent session run --prompt <text> [--agent <name>] [--no-stream] [--file <path>]` |

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
| `--provider <name>`       | string | no       | Target provider                                              |
| `--no-stream`             | switch | no       | Use polling instead of SSE streaming                         |
| `--api-key <key>`         | string | no       | API key                                                      |
| `--base-url <url>`        | string | no       | API base URL                                                 |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- --output json emits one envelope: { session_id, provider, agent, events } — read session_id to chain `session send/get/events/delete`.

#### Examples

```bash
bl managed-agent session run --prompt "hello"
```

```bash
bl managed-agent session run --agent assistant --prompt "summarize this repo"
```

### `bl managed-agent session send`

| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Name**        | `managed-agent session send`                                                                     |
| **Description** | Send a message to an existing session and stream the response                                    |
| **Usage**       | `bl managed-agent session send --session-id <id> --message <text> [--no-stream] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--message <text>`  | string | yes      | Message to send (required)              |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--no-stream`       | switch | no       | Use polling instead of SSE streaming    |
| `--api-key <key>`   | string | no       | API key                                 |
| `--base-url <url>`  | string | no       | API base URL                            |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent session send --session-id sess_abc123 --message "continue"
```

### `bl managed-agent skill-list`

| Field           | Value                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Name**        | `managed-agent skill-list`                                                                         |
| **Description** | List skills from the provider's skill catalog                                                      |
| **Usage**       | `bl managed-agent skill-list [--source custom\|official\|all] [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                                                                                                  |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                                                                      |
| `--source <source>` | string | no       | Skill catalog: custom (workspace-uploaded, default), official (built-in), or all (both catalogs in one call) |
| `--provider <name>` | string | no       | Target provider                                                                                              |
| `--api-key <key>`   | string | no       | API key                                                                                                      |
| `--base-url <url>`  | string | no       | API base URL                                                                                                 |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.
- Providers without a skill listing API (e.g. ark) return an empty list.
- For agent-driven skill selection, use `--source all --output json`: one call returns both catalogs with per-skill `source` and `description` fields to pick from.
- When generating a task that needs a suitable skill, call this command to match official or custom skills before wiring them into the task.

#### Examples

```bash
bl managed-agent skill-list
```

```bash
bl managed-agent skill-list --source official
```

```bash
bl managed-agent skill-list --source all --output json
```

```bash
bl managed-agent skill-list --source custom --provider bailian
```

### `bl managed-agent state import`

| Field           | Value                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Name**        | `managed-agent state import`                                                                                             |
| **Description** | Import an existing remote resource into agents state                                                                     |
| **Usage**       | `bl managed-agent state import --address <provider.type.name> --remote-id <id> [--resource-version <n>] [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                                            |
| -------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)                      |
| `--remote-id <id>`               | string | yes      | Existing remote resource ID to import (required)       |
| `--resource-version <n>`         | number | no       | Resource version (for versioned resources like agents) |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml)                |
| `--api-key <key>`                | string | no       | API key                                                |
| `--base-url <url>`               | string | no       | API base URL                                           |

#### Notes

- Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).
- Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.
- Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.

#### Examples

```bash
bl managed-agent state import --address bailian.agent.assistant --remote-id agent-abc123
```

### `bl managed-agent state list`

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| **Name**        | `managed-agent state list`                    |
| **Description** | List resources tracked in agents state        |
| **Usage**       | `bl managed-agent state list [--file <path>]` |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent state list
```

```bash
bl managed-agent state list --file agents.yaml
```

### `bl managed-agent state rm`

| Field           | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| **Name**        | `managed-agent state rm`                                                   |
| **Description** | Remove a resource from state without destroying it remotely                |
| **Usage**       | `bl managed-agent state rm --address <provider.type.name> [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent state rm --address bailian.agent.assistant
```

### `bl managed-agent state show`

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| **Name**        | `managed-agent state show`                                                   |
| **Description** | Show details of a resource in agents state                                   |
| **Usage**       | `bl managed-agent state show --address <provider.type.name> [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent state show --address bailian.agent.assistant
```

### `bl managed-agent validate`

| Field           | Value                                           |
| --------------- | ----------------------------------------------- |
| **Name**        | `managed-agent validate`                        |
| **Description** | Validate an agents.yaml configuration (offline) |
| **Usage**       | `bl managed-agent validate [--file <path>]`     |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Runs fully offline against local files: no login or provider credentials required.

#### Examples

```bash
bl managed-agent validate
```

```bash
bl managed-agent validate --file agents.yaml
```
