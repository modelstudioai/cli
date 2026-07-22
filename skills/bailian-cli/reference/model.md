# `bl model` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command         | Description                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `bl model list` | Browse model families or show detailed model info in the Bailian model marketplace |

## Command details

### `bl model list`

| Field           | Value                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `model list`                                                                                                                    |
| **Description** | Browse model families or show detailed model info in the Bailian model marketplace                                              |
| **Usage**       | `bl model list [--model <model>] [--page <n>] [--page-size <n>] [--provider <p>] [--capability <c>] [--feature <f>] [--enrich]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                           |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------- |
| `--model <model>`              | string | no       | Show full details of a specific model family (switches to detail mode)                |
| `--page <n>`                   | number | no       | Page number (default: 1)                                                              |
| `--page-size <n>`              | number | no       | Results per page (default: 10)                                                        |
| `--provider <p>`               | array  | no       | Filter by provider (repeatable, e.g. --provider alibaba --provider deepseek)          |
| `--capability <c>`             | array  | no       | Filter by capability code (TG, Reasoning, VU, IG, VG, TTS, ASR, …)                    |
| `--feature <f>`                | array  | no       | Filter by feature (function-calling, web-search, structured-outputs, …)               |
| `--context-window <w>`         | array  | no       | Filter by context window range bucket                                                 |
| `--enrich`                     | switch | no       | Also fetch input parameter schema (predictConfig) for trunk models (detail mode only) |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                              |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                                 |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                                 |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                                              |

#### Examples

```bash
bl model list
```

```bash
bl model list --provider alibaba
```

```bash
bl model list --capability TG --capability Reasoning
```

```bash
bl model list --model qwen-max
```

```bash
bl model list --model qwen-max --enrich --output json
```

```bash
bl model list --feature function-calling --output json
```
