# `bl pipeline` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `bl pipeline run`      | Run a pipeline workflow definition               |
| `bl pipeline validate` | Validate a pipeline definition without executing |

## Command details

### `bl pipeline run`

| Field           | Value                                   |
| --------------- | --------------------------------------- |
| **Name**        | `pipeline run`                          |
| **Description** | Run a pipeline workflow definition      |
| **Usage**       | `bl pipeline run --file <path> [flags]` |

#### Flags

| Flag                       | Type   | Required | Description                          |
| -------------------------- | ------ | -------- | ------------------------------------ |
| `--file <path>`            | string | yes      | Pipeline definition file (YAML/JSON) |
| `--input <json>`           | string | no       | Runtime input as inline JSON         |
| `--input-file <path>`      | string | no       | Runtime input from a JSON file       |
| `--concurrency <n>`        | number | no       | Max parallel steps (default: 1)      |
| `--events <jsonl>`         | string | no       | Emit lifecycle events: jsonl         |
| `--step-timeout <seconds>` | number | no       | Default step timeout in seconds      |

#### Examples

```bash
bl pipeline run --file workflow.yaml --input '{"brief":"hello"}'
```

```bash
bl pipeline run --file workflow.json --input-file inputs.json --concurrency 3
```

```bash
bl pipeline run --file workflow.yaml --dry-run
```

```bash
bl pipeline run --file workflow.json --events jsonl
```

```bash
bl pipeline run --file workflow.yaml --output json
```

### `bl pipeline validate`

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| **Name**        | `pipeline validate`                              |
| **Description** | Validate a pipeline definition without executing |
| **Usage**       | `bl pipeline validate --file <path>`             |

#### Flags

| Flag            | Type   | Required | Description                          |
| --------------- | ------ | -------- | ------------------------------------ |
| `--file <path>` | string | yes      | Pipeline definition file (YAML/JSON) |

#### Examples

```bash
bl pipeline validate --file workflow.yaml
```

```bash
bl pipeline validate --file workflow.json --output json
```
