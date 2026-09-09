# `bailian-sandbox` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                            | Authentication | Description                                                     | Detail                   |
| ---------------------------------- | -------------- | --------------------------------------------------------------- | ------------------------ |
| `bl sandbox connect`               | API Key        | Connect to a Sandbox instance and return connection information | [sandbox.md](sandbox.md) |
| `bl sandbox create`                | API Key        | Create a Sandbox instance                                       | [sandbox.md](sandbox.md) |
| `bl sandbox delete`                | API Key        | Release a Sandbox instance                                      | [sandbox.md](sandbox.md) |
| `bl sandbox get`                   | API Key        | Get Sandbox instance details                                    | [sandbox.md](sandbox.md) |
| `bl sandbox list`                  | API Key        | List Sandbox instances                                          | [sandbox.md](sandbox.md) |
| `bl sandbox official-images`       | No Auth        | List the built-in Sandbox base images (offline)                 | [sandbox.md](sandbox.md) |
| `bl sandbox pause`                 | API Key        | Pause a Sandbox instance                                        | [sandbox.md](sandbox.md) |
| `bl sandbox resume`                | API Key        | Resume a Sandbox instance and return connection information     | [sandbox.md](sandbox.md) |
| `bl sandbox template build-status` | API Key        | Get Sandbox template build status                               | [sandbox.md](sandbox.md) |
| `bl sandbox template create`       | API Key        | Create a Sandbox template                                       | [sandbox.md](sandbox.md) |
| `bl sandbox template delete`       | API Key        | Delete a Sandbox template                                       | [sandbox.md](sandbox.md) |
| `bl sandbox template get`          | API Key        | Get Sandbox template details                                    | [sandbox.md](sandbox.md) |
| `bl sandbox template list`         | API Key        | List Sandbox templates                                          | [sandbox.md](sandbox.md) |
| `bl sandbox template update`       | API Key        | Update a Sandbox template                                       | [sandbox.md](sandbox.md) |

## By group

| Group     | Commands                                                                                                                                                                                              | Reference                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `sandbox` | `connect`, `create`, `delete`, `get`, `list`, `official-images`, `pause`, `resume`, `template build-status`, `template create`, `template delete`, `template get`, `template list`, `template update` | [sandbox.md](sandbox.md) |

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
