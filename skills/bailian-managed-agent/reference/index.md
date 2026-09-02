# `bailian-managed-agent` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                                    | Authentication | Description                                                                  | Detail                               |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `bl managed-agent agent create`            | API Key        | Declare and create one Managed Agent through an isolated YAML apply          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent agent get`               | API Key        | Get a Managed Agent                                                          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent agent list`              | API Key        | List Managed Agents                                                          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent agent search`            | API Key        | Search Managed Agents                                                        | [managed-agent.md](managed-agent.md) |
| `bl managed-agent agent versions`          | API Key        | List Managed Agent versions                                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent apply`                   | API Key        | Apply planned changes to create/update/delete agent resources                | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment create`       | API Key        | Declare and create one Managed Agent Deployment through a scoped YAML apply  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment get`          | API Key        | Get a Managed Agent deployment                                               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment list`         | API Key        | List Managed Agent deployments                                               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment pause`        | API Key        | Pause a Managed Agent deployment                                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment run`          | API Key        | Run a Managed Agent deployment now                                           | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment runs get`     | API Key        | Get a Managed Agent deployment run                                           | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment runs list`    | API Key        | List runs for a Managed Agent deployment                                     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment search`       | API Key        | Search Managed Agent deployments                                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent deployment unpause`      | API Key        | Unpause a Managed Agent deployment                                           | [managed-agent.md](managed-agent.md) |
| `bl managed-agent destroy`                 | API Key        | Destroy all managed agent resources tracked in state                         | [managed-agent.md](managed-agent.md) |
| `bl managed-agent environment create`      | API Key        | Declare and create one Managed Agent Environment through a scoped YAML apply | [managed-agent.md](managed-agent.md) |
| `bl managed-agent environment get`         | API Key        | Get a Managed Agent environment                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent environment list`        | API Key        | List Managed Agent environments                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent environment search`      | API Key        | Search Managed Agent environments                                            | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file delete`             | API Key        | Delete a Managed Agent file                                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file download`           | API Key        | Download Managed Agent file content                                          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file get`                | API Key        | Get Managed Agent file metadata                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file list`               | API Key        | List Managed Agent files                                                     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file search`             | API Key        | Search Managed Agent files                                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent file upload`             | API Key        | Upload a Managed Agent file                                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent init`                    | No Auth        | Create a new agents.yaml template                                            | [managed-agent.md](managed-agent.md) |
| `bl managed-agent plan`                    | API Key        | Show what changes would be applied to agent infrastructure                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session archive`         | API Key        | Archive a Managed Agent session                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session create`          | API Key        | Create a new session for an agent                                            | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session debug`           | API Key        | Aggregate session diagnostics                                                | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session delete`          | API Key        | Delete a session                                                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session event list`      | API Key        | List events for a Managed Agent session                                      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session event send`      | API Key        | Send raw events to a Managed Agent session                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session event stream`    | API Key        | Stream events from a Managed Agent session                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session events`          | API Key        | List events for a Managed Agent session                                      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session export`          | API Key        | Export session diagnostics as a ZIP                                          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session get`             | API Key        | Get details of a session                                                     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session list`            | API Key        | List sessions from the provider                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session run`             | API Key        | Create a session, send a message, and stream the response                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session search`          | API Key        | Search Managed Agent sessions                                                | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session send`            | API Key        | Send a message to an existing session and stream the response                | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session update`          | API Key        | Update a Managed Agent session                                               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill create`            | API Key        | Declare and create one custom Managed Agent Skill from a local source        | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill download`          | API Key        | Download a Managed Agent skill version                                       | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill get`               | API Key        | Get a Managed Agent skill                                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill list`              | API Key        | List Managed Agent skills                                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill search`            | API Key        | Search Managed Agent skills                                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill versions`          | API Key        | List Managed Agent skill versions                                            | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill-list`              | API Key        | List Managed Agent skills                                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state import`            | API Key        | Import an existing remote resource into agents state                         | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state list`              | No Auth        | List resources tracked in agents state                                       | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state rm`                | No Auth        | Remove a resource from state without destroying it remotely                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state show`              | No Auth        | Show details of a resource in agents state                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent validate`                | No Auth        | Validate an agents.yaml configuration (offline)                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent vault create`            | API Key        | Declare and create one empty Managed Agent Vault through a scoped YAML apply | [managed-agent.md](managed-agent.md) |
| `bl managed-agent vault credential create` | API Key        | Append and create one environment-variable Credential in a tracked Vault     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent vault get`               | API Key        | Get a Managed Agent vault                                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent vault list`              | API Key        | List Managed Agent vaults                                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent vault search`            | API Key        | Search Managed Agent vaults                                                  | [managed-agent.md](managed-agent.md) |

## By group

| Group           | Commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reference                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `managed-agent` | `agent create`, `agent get`, `agent list`, `agent search`, `agent versions`, `apply`, `deployment create`, `deployment get`, `deployment list`, `deployment pause`, `deployment run`, `deployment runs get`, `deployment runs list`, `deployment search`, `deployment unpause`, `destroy`, `environment create`, `environment get`, `environment list`, `environment search`, `file delete`, `file download`, `file get`, `file list`, `file search`, `file upload`, `init`, `plan`, `session archive`, `session create`, `session debug`, `session delete`, `session event list`, `session event send`, `session event stream`, `session events`, `session export`, `session get`, `session list`, `session run`, `session search`, `session send`, `session update`, `skill create`, `skill download`, `skill get`, `skill list`, `skill search`, `skill versions`, `skill-list`, `state import`, `state list`, `state rm`, `state show`, `validate`, `vault create`, `vault credential create`, `vault get`, `vault list`, `vault search` | [managed-agent.md](managed-agent.md) |

## Global flags

Available on every command (in addition to command-specific flags):

| Flag                  | Type   | Required | Description                           |
| --------------------- | ------ | -------- | ------------------------------------- |
| `--output <format>`   | string | no       | Output format: text, json             |
| `--timeout <seconds>` | number | no       | Request timeout                       |
| `--quiet`             | switch | no       | Suppress non-essential output         |
| `--verbose`           | switch | no       | Print HTTP request/response details   |
| `--dry-run`           | switch | no       | Dry run mode                          |
| `--config <name>`     | string | no       | Use a config profile for this command |
| `--help`              | switch | no       | Show help                             |
| `--version`           | switch | no       | Print version                         |

## Model auth flags

Available on model-domain commands (API-key auth); also listed per command below:

| Flag               | Type   | Required | Description  |
| ------------------ | ------ | -------- | ------------ |
| `--api-key <key>`  | string | no       | API key      |
| `--base-url <url>` | string | no       | API base URL |

## Console auth flags

Available on console-domain commands (console login auth); also listed per command below:

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

## OpenAPI auth flags

Available on OpenAPI-domain commands (AK/SK auth); also listed per command below:

| Flag                        | Type   | Required | Description                                                            |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--access-key-id <key>`     | string | no       | Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)         |
| `--access-key-secret <key>` | string | no       | Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET) |
| `--security-token <token>`  | string | no       | Alibaba Cloud STS Security Token (env: ALIBABA_CLOUD_SECURITY_TOKEN)   |

## Notes

- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.
- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.
- Token Plan commands use OpenAPI AK/SK via `bl auth login --open-api` or `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`.
- Default output: **text** unless explicitly set to `json` with `--output`, `DASHSCOPE_OUTPUT`, or config.
