# `bl agent` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `bl agent apply`          | Apply planned changes to create/update/delete agent resources |
| `bl agent destroy`        | Destroy all managed agent resources tracked in state          |
| `bl agent init`           | Create a new agents.yaml template                             |
| `bl agent plan`           | Show what changes would be applied to agent infrastructure    |
| `bl agent session create` | Create a new session for an agent                             |
| `bl agent session delete` | Delete a session                                              |
| `bl agent session events` | List event history for a session                              |
| `bl agent session get`    | Get details of a session                                      |
| `bl agent session list`   | List sessions from the provider                               |
| `bl agent session run`    | Create a session, send a message, and stream the response     |
| `bl agent session send`   | Send a message to an existing session and stream the response |
| `bl agent state import`   | Import an existing remote resource into agents state          |
| `bl agent state list`     | List resources tracked in agents state                        |
| `bl agent state rm`       | Remove a resource from state without destroying it remotely   |
| `bl agent state show`     | Show details of a resource in agents state                    |
| `bl agent validate`       | Validate an agents.yaml configuration (offline)               |

## Command details

### `bl agent apply`

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| **Name**        | `agent apply`                                                                    |
| **Description** | Apply planned changes to create/update/delete agent resources                    |
| **Usage**       | `bl agent apply [--file <path>] [--provider <name>] [--yes] [--concurrency <n>]` |

#### Flags

| Flag                | Type   | Required | Description                                                          |
| ------------------- | ------ | -------- | -------------------------------------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                              |
| `--provider <name>` | string | no       | Target provider (default: all configured)                            |
| `--yes`             | switch | no       | Confirm and apply without an interactive prompt (required to mutate) |
| `--no-refresh`      | switch | no       | Skip refreshing state from remote before planning                    |
| `--concurrency <n>` | number | no       | Max independent resources to apply in parallel (default 6, max 10)   |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent apply --yes
```

```bash
bl agent apply --provider bailian --yes
```

### `bl agent destroy`

| Field           | Value                                                  |
| --------------- | ------------------------------------------------------ |
| **Name**        | `agent destroy`                                        |
| **Description** | Destroy all managed agent resources tracked in state   |
| **Usage**       | `bl agent destroy [--file <path>] [--yes] [--cascade]` |

#### Flags

| Flag            | Type   | Required | Description                                                                |
| --------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml)                                    |
| `--yes`         | switch | no       | Confirm and destroy without an interactive prompt (required)               |
| `--cascade`     | switch | no       | Auto-delete dependent resources (e.g. sessions referencing an environment) |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent destroy --yes
```

```bash
bl agent destroy --yes --cascade
```

### `bl agent init`

| Field           | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| **Name**        | `agent init`                                                                        |
| **Description** | Create a new agents.yaml template                                                   |
| **Usage**       | `bl agent init [--provider <name>] [--agent-name <name>] [--file <path>] [--force]` |

#### Flags

| Flag                                            | Type   | Required | Description                                                   |
| ----------------------------------------------- | ------ | -------- | ------------------------------------------------------------- |
| `--provider <bailian\|claude\|qoder\|ark\|all>` | string | no       | Provider: bailian, claude, qoder, ark, all (default: bailian) |
| `--agent-name <name>`                           | string | no       | Name of the first agent (default: assistant)                  |
| `--file <path>`                                 | string | no       | Output config path (default: agents.yaml)                     |
| `--force`                                       | switch | no       | Overwrite an existing config file                             |

#### Examples

```bash
bl agent init
```

```bash
bl agent init --provider bailian --agent-name assistant
```

```bash
bl agent init --provider all
```

### `bl agent plan`

| Field           | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| **Name**        | `agent plan`                                                                        |
| **Description** | Show what changes would be applied to agent infrastructure                          |
| **Usage**       | `bl agent plan [--file <path>] [--provider <name>] [--no-refresh] [--refresh-only]` |

#### Flags

| Flag                | Type   | Required | Description                                                    |
| ------------------- | ------ | -------- | -------------------------------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml)                        |
| `--provider <name>` | string | no       | Target provider (default: all configured)                      |
| `--no-refresh`      | switch | no       | Skip refreshing state from remote before planning              |
| `--refresh-only`    | switch | no       | Refresh state and show drift without planning remote mutations |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent plan
```

```bash
bl agent plan --provider bailian
```

```bash
bl agent plan --no-refresh
```

### `bl agent session create`

| Field           | Value                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **Name**        | `agent session create`                                                                              |
| **Description** | Create a new session for an agent                                                                   |
| **Usage**       | `bl agent session create [--agent <name>] [--environment <name>] [--title <title>] [--file <path>]` |

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

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session create
```

```bash
bl agent session create --agent assistant
```

```bash
bl agent session create --agent assistant --title 'debug run'
```

### `bl agent session delete`

| Field           | Value                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| **Name**        | `agent session delete`                                                          |
| **Description** | Delete a session                                                                |
| **Usage**       | `bl agent session delete --session-id <id> [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session delete --session-id sess_abc123
```

### `bl agent session events`

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| **Name**        | `agent session events`                                                            |
| **Description** | List event history for a session                                                  |
| **Usage**       | `bl agent session events --session-id <id> [--limit <n>] [--all] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--limit <n>`       | number | no       | Maximum number of events to fetch       |
| `--all`             | switch | no       | Fetch all pages by following the cursor |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session events --session-id sess_abc123
```

```bash
bl agent session events --session-id sess_abc123 --all
```

### `bl agent session get`

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| **Name**        | `agent session get`                                                          |
| **Description** | Get details of a session                                                     |
| **Usage**       | `bl agent session get --session-id <id> [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session get --session-id sess_abc123
```

### `bl agent session list`

| Field           | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| **Name**        | `agent session list`                                                                 |
| **Description** | List sessions from the provider                                                      |
| **Usage**       | `bl agent session list [--agent <name>] [--all] [--provider <name>] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--agent <name>`    | string | no       | Filter by agent name                    |
| `--all`             | switch | no       | Fetch all pages by following the cursor |
| `--provider <name>` | string | no       | Target provider                         |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session list
```

```bash
bl agent session list --agent assistant
```

```bash
bl agent session list --all
```

### `bl agent session run`

| Field           | Value                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| **Name**        | `agent session run`                                                                   |
| **Description** | Create a session, send a message, and stream the response                             |
| **Usage**       | `bl agent session run --prompt <text> [--agent <name>] [--no-stream] [--file <path>]` |

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

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session run --prompt "hello"
```

```bash
bl agent session run --agent assistant --prompt "summarize this repo"
```

### `bl agent session send`

| Field           | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| **Name**        | `agent session send`                                                                     |
| **Description** | Send a message to an existing session and stream the response                            |
| **Usage**       | `bl agent session send --session-id <id> --message <text> [--no-stream] [--file <path>]` |

#### Flags

| Flag                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `--session-id <id>` | string | yes      | Session ID (required)                   |
| `--message <text>`  | string | yes      | Message to send (required)              |
| `--file <path>`     | string | no       | Config file path (default: agents.yaml) |
| `--provider <name>` | string | no       | Target provider                         |
| `--no-stream`       | switch | no       | Use polling instead of SSE streaming    |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent session send --session-id sess_abc123 --message "continue"
```

### `bl agent state import`

| Field           | Value                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Name**        | `agent state import`                                                                                             |
| **Description** | Import an existing remote resource into agents state                                                             |
| **Usage**       | `bl agent state import --address <provider.type.name> --remote-id <id> [--resource-version <n>] [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                                            |
| -------------------------------- | ------ | -------- | ------------------------------------------------------ |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)                      |
| `--remote-id <id>`               | string | yes      | Existing remote resource ID to import (required)       |
| `--resource-version <n>`         | number | no       | Resource version (for versioned resources like agents) |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml)                |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent state import --address bailian.agent.assistant --remote-id agent-abc123
```

### `bl agent state list`

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| **Name**        | `agent state list`                     |
| **Description** | List resources tracked in agents state |
| **Usage**       | `bl agent state list [--file <path>]`  |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent state list
```

```bash
bl agent state list --file agents.yaml
```

### `bl agent state rm`

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| **Name**        | `agent state rm`                                                   |
| **Description** | Remove a resource from state without destroying it remotely        |
| **Usage**       | `bl agent state rm --address <provider.type.name> [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent state rm --address bailian.agent.assistant
```

### `bl agent state show`

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| **Name**        | `agent state show`                                                   |
| **Description** | Show details of a resource in agents state                           |
| **Usage**       | `bl agent state show --address <provider.type.name> [--file <path>]` |

#### Flags

| Flag                             | Type   | Required | Description                             |
| -------------------------------- | ------ | -------- | --------------------------------------- |
| `--address <provider.type.name>` | string | yes      | Resource state address (required)       |
| `--file <path>`                  | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent state show --address bailian.agent.assistant
```

### `bl agent validate`

| Field           | Value                                           |
| --------------- | ----------------------------------------------- |
| **Name**        | `agent validate`                                |
| **Description** | Validate an agents.yaml configuration (offline) |
| **Usage**       | `bl agent validate [--file <path>]`             |

#### Flags

| Flag            | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `--file <path>` | string | no       | Config file path (default: agents.yaml) |

#### Notes

- Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).
- For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.

#### Examples

```bash
bl agent validate
```

```bash
bl agent validate --file agents.yaml
```
