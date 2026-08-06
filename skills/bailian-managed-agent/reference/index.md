# `bailian-managed-agent` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                           | Description                                                   | Detail                               |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `bl managed-agent apply`          | Apply planned changes to create/update/delete agent resources | [managed-agent.md](managed-agent.md) |
| `bl managed-agent destroy`        | Destroy all managed agent resources tracked in state          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent init`           | Create a new agents.yaml template                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent plan`           | Show what changes would be applied to agent infrastructure    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session create` | Create a new session for an agent                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session delete` | Delete a session                                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session events` | List event history for a session                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session get`    | Get details of a session                                      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session list`   | List sessions from the provider                               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session run`    | Create a session, send a message, and stream the response     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session send`   | Send a message to an existing session and stream the response | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill-list`     | List skills from the provider's skill catalog                 | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state import`   | Import an existing remote resource into agents state          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state list`     | List resources tracked in agents state                        | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state rm`       | Remove a resource from state without destroying it remotely   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state show`     | Show details of a resource in agents state                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent validate`       | Validate an agents.yaml configuration (offline)               | [managed-agent.md](managed-agent.md) |

## By group

| Group           | Commands                                                                                                                                                                                                                                 | Reference                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `managed-agent` | `apply`, `destroy`, `init`, `plan`, `session create`, `session delete`, `session events`, `session get`, `session list`, `session run`, `session send`, `skill-list`, `state import`, `state list`, `state rm`, `state show`, `validate` | [managed-agent.md](managed-agent.md) |

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
