# `bl app` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                   | Authentication | Description                                                      |
| ------------------------- | -------------- | ---------------------------------------------------------------- |
| `bl app call`             | API Key        | Call a Bailian application (agent or workflow)                   |
| `bl app copy`             | Console        | Copy a Bailian application (agent or workflow)                   |
| `bl app create`           | Console        | Create a Bailian application (agent or workflow)                 |
| `bl app delete`           | Console        | Delete a Bailian application (agent or workflow)                 |
| `bl app get`              | Console        | Get Bailian application details (agent or workflow)              |
| `bl app list`             | Console        | List Bailian applications                                        |
| `bl app publish`          | Console        | Publish a Bailian agent application                              |
| `bl app update`           | Console        | Update a Bailian application (agent config or workflow metadata) |
| `bl app versions`         | Console        | List published versions of a Bailian application                 |
| `bl app workflow export`  | Console        | Export a workflow as a DSL schema (download URL)                 |
| `bl app workflow get`     | Console        | Get a workflow canvas (draft or a published version)             |
| `bl app workflow publish` | Console        | Publish a workflow (publishes the current draft canvas)          |
| `bl app workflow save`    | Console        | Save a workflow canvas (replaces the current draft)              |

## Command details

### `bl app call`

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Name**           | `app call`                                          |
| **Description**    | Call a Bailian application (agent or workflow)      |
| **Authentication** | API Key                                             |
| **Usage**          | `bl app call --app-id <id> --prompt <text> [flags]` |

#### Flags

| Flag                   | Type   | Required | Description                                   |
| ---------------------- | ------ | -------- | --------------------------------------------- |
| `--app-id <id>`        | string | yes      | Application ID (required)                     |
| `--prompt <text>`      | string | yes      | Input prompt text                             |
| `--image <url>`        | array  | no       | Image URL(s) to pass to the app (repeatable)  |
| `--file-id <id>`       | array  | no       | Pre-uploaded file ID(s) (repeatable)          |
| `--session-id <id>`    | string | no       | Session ID for multi-turn conversation        |
| `--stream`             | switch | no       | Stream response (default: on in TTY)          |
| `--pipeline-ids <ids>` | string | no       | Knowledge base pipeline IDs (comma-separated) |
| `--memory-id <id>`     | string | no       | Memory ID for long-term memory                |
| `--biz-params <json>`  | string | no       | Business parameters JSON (workflow variables) |
| `--has-thoughts`       | switch | no       | Show agent thinking process                   |
| `--api-key <key>`      | string | no       | API key                                       |
| `--base-url <url>`     | string | no       | API base URL                                  |

#### Examples

```bash
bl app call --app-id abc123 --prompt "Hello"
```

```bash
bl app call --app-id abc123 --prompt "Describe this image" --image https://example.com/photo.jpg
```

```bash
bl app call --app-id abc123 --prompt "Analyze the image" --image img1.jpg --image img2.jpg
```

```bash
bl app call --app-id abc123 --prompt "Continue" --session-id sess_xxx --stream
```

```bash
bl app call --app-id abc123 --prompt "Search for materials" --pipeline-ids pipe1,pipe2
```

```bash
bl app call --app-id abc123 --prompt "Start" --biz-params '{"key":"value"}'
```

### `bl app copy`

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Name**           | `app copy`                                     |
| **Description**    | Copy a Bailian application (agent or workflow) |
| **Authentication** | Console                                        |
| **Usage**          | `bl app copy --app-id <id> [flags]`            |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                      |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl app copy --app-id abc123
```

### `bl app create`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `app create`                                     |
| **Description**    | Create a Bailian application (agent or workflow) |
| **Authentication** | Console                                          |
| **Usage**          | `bl app create --name <name> [flags]`            |

#### Flags

| Flag                           | Type   | Required | Description                                                        |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------ |
| `--name <name>`                | string | yes      | Application name (required)                                        |
| `--type <agent\|workflow>`     | string | no       | Application type: agent (default), workflow                        |
| `--description <text>`         | string | no       | Application description                                            |
| `--icon <key>`                 | string | no       | Application icon key                                               |
| `--model <model>`              | string | no       | Agent model ID (default: auto; agent only)                         |
| `--config-json <json>`         | string | no       | Config JSON string (mutually exclusive with --config-file)         |
| `--config-file <path>`         | string | no       | Path to a config JSON file (mutually exclusive with --config-json) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)           |
| `--console-site <site>`        | string | no       | Console site: domestic, international                              |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                              |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                           |

#### Notes

- Agent creation uses the app-control 2.0 API with a default config (model auto, dialog_round 3). --config-json/--config-file shallow-merges over the default config; --model overrides config.model.
- Workflow creation creates an empty draft canvas; edit it with `app workflow save` and publish with `app workflow publish`.

#### Examples

```bash
bl app create --name "Customer service"
```

```bash
bl app create --name "Customer service" --model qwen3-max --description "After-sales bot"
```

```bash
bl app create --name "Order flow" --type workflow
```

```bash
bl app create --name "My agent" --config-file ./agent-config.json
```

### `bl app delete`

| Field              | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Name**           | `app delete`                                                                                          |
| **Description**    | Delete a Bailian application (agent or workflow)                                                      |
| **Authentication** | Console                                                                                               |
| **Usage**          | `bl app delete --app-id <id> [flags]`                                                                 |
| **Risk**           | `high`                                                                                                |
| **Risk message**   | This permanently deletes the application and its configuration. Confirm the app ID before proceeding. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                      |
| `--yes`                        | switch | no       | Confirm this high-risk operation                         |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Deletion is irreversible. Run `app list` or `app get` first to confirm the app ID.

#### Examples

```bash
bl app delete --app-id abc123
```

```bash
# Only after explicit user confirmation:
bl app delete --app-id abc123 --yes
```

### `bl app get`

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Name**           | `app get`                                           |
| **Description**    | Get Bailian application details (agent or workflow) |
| **Authentication** | Console                                             |
| **Usage**          | `bl app get --app-id <id> [flags]`                  |

#### Flags

| Flag                           | Type   | Required | Description                                                           |
| ------------------------------ | ------ | -------- | --------------------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                                   |
| `--type <agent\|workflow>`     | string | no       | Application type: agent (default), workflow                           |
| `--scope <draft\|publish>`     | string | no       | Data scope: draft (default), publish                                  |
| `--agent-version <n>`          | number | no       | Agent version number (agent only; implies published scope by default) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)              |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                 |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                 |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                              |

#### Notes

- Agent details come from app-control 2.0; workflow details from app-data. For the workflow canvas config use `app workflow get`.

#### Examples

```bash
bl app get --app-id abc123
```

```bash
bl app get --app-id abc123 --scope publish
```

```bash
bl app get --app-id abc123 --agent-version 3
```

```bash
bl app get --app-id abc123 --type workflow
```

### `bl app list`

| Field              | Value                     |
| ------------------ | ------------------------- |
| **Name**           | `app list`                |
| **Description**    | List Bailian applications |
| **Authentication** | Console                   |
| **Usage**          | `bl app list [flags]`     |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--name <name>`                | string | no       | Filter by app name (keyword search)                      |
| `--page <n>`                   | number | no       | Page number (default: 1)                                 |
| `--page-size <n>`              | number | no       | Results per page (default: 30)                           |
| `--type <agent\|workflow>`     | string | no       | Application type: agent (default), workflow              |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl app list
```

```bash
bl app list --name customer service
```

```bash
bl app list --page 2 --page-size 10
```

```bash
bl app list --type workflow
```

```bash
bl app list --output json
```

### `bl app publish`

| Field              | Value                                  |
| ------------------ | -------------------------------------- |
| **Name**           | `app publish`                          |
| **Description**    | Publish a Bailian agent application    |
| **Authentication** | Console                                |
| **Usage**          | `bl app publish --app-id <id> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                      |
| `--description <text>`         | string | no       | Version description                                      |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Publishes the current agent draft via app-control 2.0. To publish a workflow, use `app workflow publish`.

#### Examples

```bash
bl app publish --app-id abc123
```

```bash
bl app publish --app-id abc123 --description "Release v2"
```

### `bl app update`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `app update`                                                     |
| **Description**    | Update a Bailian application (agent config or workflow metadata) |
| **Authentication** | Console                                                          |
| **Usage**          | `bl app update --app-id <id> [flags]`                            |

#### Flags

| Flag                           | Type   | Required | Description                                                        |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------ |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                                |
| `--type <agent\|workflow>`     | string | no       | Application type: agent (default), workflow                        |
| `--name <name>`                | string | no       | New application name                                               |
| `--description <text>`         | string | no       | New application description                                        |
| `--icon <key>`                 | string | no       | New application icon key                                           |
| `--model <model>`              | string | no       | Agent model ID (agent only; sets config.model)                     |
| `--instructions <text>`        | string | no       | Agent instructions (agent only; sets config.instruction)           |
| `--config-json <json>`         | string | no       | Config JSON string (mutually exclusive with --config-file)         |
| `--config-file <path>`         | string | no       | Path to a config JSON file (mutually exclusive with --config-json) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)           |
| `--console-site <site>`        | string | no       | Console site: domestic, international                              |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                              |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                           |

#### Notes

- Reads the current draft first, then merges: current config -> --config-json/--config-file (shallow) -> --model/--instructions. Only changed fields are sent. Requires a console token even for --dry-run (read-only planning).
- Agent updates use app-control 2.0. Workflow updates only change metadata (name/description/icon); edit the canvas with `app workflow save`.

#### Examples

```bash
bl app update --app-id abc123 --name "New name"
```

```bash
bl app update --app-id abc123 --model qwen3-max
```

```bash
bl app update --app-id abc123 --instructions "You are a helpful assistant"
```

```bash
bl app update --app-id abc123 --config-file ./agent-config.json
```

```bash
bl app update --app-id abc123 --type workflow --name "New flow name"
```

### `bl app versions`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `app versions`                                   |
| **Description**    | List published versions of a Bailian application |
| **Authentication** | Console                                          |
| **Usage**          | `bl app versions --app-id <id> [flags]`          |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                      |
| `--type <agent\|workflow>`     | string | no       | Application type: agent (default), workflow              |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl app versions --app-id abc123
```

```bash
bl app versions --app-id abc123 --type workflow
```

### `bl app workflow export`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `app workflow export`                            |
| **Description**    | Export a workflow as a DSL schema (download URL) |
| **Authentication** | Console                                          |
| **Usage**          | `bl app workflow export --app-id <id> [flags]`   |

#### Flags

| Flag                           | Type   | Required | Description                                               |
| ------------------------------ | ------ | -------- | --------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                       |
| `--flow-version <version>`     | string | no       | Published version to export (default: current draft)      |
| `--output-file <path>`         | string | no       | Download the DSL to this file instead of printing the URL |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)  |
| `--console-site <site>`        | string | no       | Console site: domestic, international                     |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                     |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                  |

#### Examples

```bash
bl app workflow export --app-id abc123
```

```bash
bl app workflow export --app-id abc123 --flow-version 3
```

```bash
bl app workflow export --app-id abc123 --output-file ./flow.dsl
```

### `bl app workflow get`

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Name**           | `app workflow get`                                   |
| **Description**    | Get a workflow canvas (draft or a published version) |
| **Authentication** | Console                                              |
| **Usage**          | `bl app workflow get --app-id <id> [flags]`          |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                      |
| `--flow-version <version>`     | string | no       | Published version to read (default: current draft)       |
| `--scope <draft\|publish>`     | string | no       | Data scope: draft (default), publish                     |
| `--output-file <path>`         | string | no       | Write the canvas config JSON to this file (overwrites)   |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Notes

- Without --flow-version, reads the current draft canvas (config + version). With --flow-version, reads a published version (scope defaults to publish). The canvas config is a JSON string; --output-file writes it parsed and pretty-printed.

#### Examples

```bash
bl app workflow get --app-id abc123
```

```bash
bl app workflow get --app-id abc123 --flow-version 3
```

```bash
bl app workflow get --app-id abc123 --output-file ./canvas.json
```

### `bl app workflow publish`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `app workflow publish`                                  |
| **Description**    | Publish a workflow (publishes the current draft canvas) |
| **Authentication** | Console                                                 |
| **Usage**          | `bl app workflow publish --app-id <id> [flags]`         |

#### Flags

| Flag                           | Type   | Required | Description                                                    |
| ------------------------------ | ------ | -------- | -------------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                            |
| `--description <text>`         | string | no       | Version description                                            |
| `--trigger-list <json>`        | string | no       | Trigger list JSON array (default: read from the current draft) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)       |
| `--console-site <site>`        | string | no       | Console site: domestic, international                          |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                          |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                       |

#### Notes

- Reads the current draft canvas and version, then publishes. Triggers are taken from the draft (applicationConfigDTO.triggerList, falling back to the Start node) unless --trigger-list is given; 'none' triggers are dropped. Requires a console token even for --dry-run (read-only planning).

#### Examples

```bash
bl app workflow publish --app-id abc123
```

```bash
bl app workflow publish --app-id abc123 --description "Release v2"
```

```bash
bl app workflow publish --app-id abc123 --trigger-list '[]'
```

### `bl app workflow save`

| Field              | Value                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Name**           | `app workflow save`                                                                         |
| **Description**    | Save a workflow canvas (replaces the current draft)                                         |
| **Authentication** | Console                                                                                     |
| **Usage**          | `bl app workflow save --app-id <id> (--config-json <json> \| --config-file <path>) [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                 |
| ------------------------------ | ------ | -------- | --------------------------------------------------------------------------- |
| `--app-id <id>`                | string | yes      | Application ID (app code, required)                                         |
| `--config-json <json>`         | string | no       | Config JSON string (mutually exclusive with --config-file)                  |
| `--config-file <path>`         | string | no       | Path to a config JSON file (mutually exclusive with --config-json)          |
| `--flow-version <version>`     | string | no       | Expected current version for optimistic locking (default: read from server) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                    |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                       |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                       |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                    |

#### Notes

- The canvas config is a whole-document replacement of the draft. Export it first with `app workflow get --output-file`, edit, then save. Without --flow-version the current version is read from the server (requires a console token, also for --dry-run).

#### Examples

```bash
bl app workflow save --app-id abc123 --config-file ./canvas.json
```

```bash
bl app workflow save --app-id abc123 --config-json '{"nodes":[],"edges":[]}'
```

```bash
bl app workflow save --app-id abc123 --config-file ./canvas.json --flow-version 5
```
