# `bl console` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Description                                    |
| ----------------- | ---------------------------------------------- |
| `bl console call` | Call a Bailian console API via the CLI gateway |

## Command details

### `bl console call`

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| **Name**        | `console call`                                      |
| **Description** | Call a Bailian console API via the CLI gateway      |
| **Usage**       | `bl console call --api <api> --data <json> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                                              |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------ |
| `--api <api>`                  | string | yes      | API name (e.g. zeldaEasy.broadscope-bailian.memory-library.getLibraries) |
| `--data <json>`                | string | yes      | Request data as JSON string                                              |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                 |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                 |

#### Examples

```bash
bl console call --api zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota --data '{"queryFreeTierQuotaRequest":{"models":["qwen3-max"]}}'
```

```bash
bl console call --api some.api.name --data '{"key":"value"}' --console-region cn-beijing
```
