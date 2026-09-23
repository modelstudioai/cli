# `bailian-memory` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                    | Authentication | Description                                                   | Detail                 |
| -------------------------- | -------------- | ------------------------------------------------------------- | ---------------------- |
| `bl memory add`            | API Key        | Add memory from messages or custom content (async extraction) | [memory.md](memory.md) |
| `bl memory delete`         | API Key        | Delete a memory node                                          | [memory.md](memory.md) |
| `bl memory list`           | API Key        | List memory nodes for a user                                  | [memory.md](memory.md) |
| `bl memory node show`      | API Key        | Show a single memory node with full detail                    | [memory.md](memory.md) |
| `bl memory profile create` | API Key        | Create a user profile schema for memory profiling             | [memory.md](memory.md) |
| `bl memory profile delete` | API Key        | Delete a profile schema                                       | [memory.md](memory.md) |
| `bl memory profile get`    | API Key        | Get the extracted user profile for a schema                   | [memory.md](memory.md) |
| `bl memory profile list`   | API Key        | List profile schemas                                          | [memory.md](memory.md) |
| `bl memory profile show`   | API Key        | Show a profile schema definition with attribute IDs           | [memory.md](memory.md) |
| `bl memory profile update` | API Key        | Update a profile schema, extraction scene, or billing tier    | [memory.md](memory.md) |
| `bl memory search`         | API Key        | Search memory nodes by query or messages                      | [memory.md](memory.md) |
| `bl memory skill export`   | API Key        | Export a skill memory node                                    | [memory.md](memory.md) |
| `bl memory update`         | API Key        | Update a memory node content                                  | [memory.md](memory.md) |

## By group

| Group    | Commands                                                                                                                                                                      | Reference              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `memory` | `add`, `delete`, `list`, `node show`, `profile create`, `profile delete`, `profile get`, `profile list`, `profile show`, `profile update`, `search`, `skill export`, `update` | [memory.md](memory.md) |

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
