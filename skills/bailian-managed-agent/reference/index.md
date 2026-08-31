# `bailian-managed-agent` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                                    | Authentication | Description                                                        | Detail                               |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `bl managed-agent apply`                   | API Key        | Apply planned changes to create/update/delete agent resources      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent destroy`                 | API Key        | Destroy all managed agent resources tracked in state               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent init`                    | No Auth        | Create an agents.yaml template                                     | [managed-agent.md](managed-agent.md) |
| `bl managed-agent plan`                    | API Key        | Show what changes would be applied to agent infrastructure         | [managed-agent.md](managed-agent.md) |
| `bl managed-agent playground`              | API Key        | Launch a Session Preview for an agents.yaml Agent                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project build`           | No Auth        | Organize directory source and generate the immutable Publish Build | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project init`            | No Auth        | Create a directory project or convert the local agents.yaml        | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project publish`         | API Key        | Publish the current directory-project Build and record a version   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project validate`        | No Auth        | Validate a directory Agent project                                 | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version disable` | No Auth        | Disable directory project versions                                 | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version enable`  | No Auth        | Enable directory project versions                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version list`    | No Auth        | List directory project versions                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version preview` | No Auth        | Preview a directory project version                                | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version restore` | No Auth        | Restore a version to the project working directory                 | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project version status`  | No Auth        | Show directory project version status                              | [managed-agent.md](managed-agent.md) |
| `bl managed-agent project workbench`       | API Key        | Launch the directory project Workbench                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session create`          | API Key        | Create a new session for an agent                                  | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session delete`          | API Key        | Delete a session                                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session events`          | API Key        | List event history for a session                                   | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session get`             | API Key        | Get details of a session                                           | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session list`            | API Key        | List sessions from the provider                                    | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session run`             | API Key        | Create a session, send a message, and stream the response          | [managed-agent.md](managed-agent.md) |
| `bl managed-agent session send`            | API Key        | Send a message to an existing session and stream the response      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent skill-list`              | API Key        | List skills from the provider's skill catalog                      | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state import`            | API Key        | Import an existing remote resource into agents state               | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state list`              | No Auth        | List resources tracked in agents state                             | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state rm`                | No Auth        | Remove a resource from state without destroying it remotely        | [managed-agent.md](managed-agent.md) |
| `bl managed-agent state show`              | No Auth        | Show details of a resource in agents state                         | [managed-agent.md](managed-agent.md) |
| `bl managed-agent validate`                | No Auth        | Validate an agents.yaml configuration (offline)                    | [managed-agent.md](managed-agent.md) |

## By group

| Group           | Commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reference                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `managed-agent` | `apply`, `destroy`, `init`, `plan`, `playground`, `project build`, `project init`, `project publish`, `project validate`, `project version disable`, `project version enable`, `project version list`, `project version preview`, `project version restore`, `project version status`, `project workbench`, `session create`, `session delete`, `session events`, `session get`, `session list`, `session run`, `session send`, `skill-list`, `state import`, `state list`, `state rm`, `state show`, `validate` | [managed-agent.md](managed-agent.md) |

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
