# `bl pipeline` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command | Description |
| --- | --- |
| `bl pipeline run` | Run a pipeline workflow definition |
| `bl pipeline validate` | Validate a pipeline definition without executing |

## Command details

### `bl pipeline run`

| Field | Value |
| --- | --- |
| **Name** | `pipeline run` |
| **Description** | Run a pipeline workflow definition |
| **Usage** | `bl pipeline run <file> [flags]` |

#### Options

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--input <json>` | string | no | Runtime input as inline JSON |
| `--input-file <path>` | string | no | Runtime input from a JSON file |
| `--concurrency <n>` | number | no | Max parallel steps (default: 1) |
| `--events <format>` | string | no | Emit lifecycle events: jsonl |
| `--timeout <seconds>` | number | no | Default step timeout in seconds |

#### Examples

```bash
bl pipeline run workflow.yaml --input '{"brief":"hello"}'
```

```bash
bl pipeline run workflow.json --input-file inputs.json --concurrency 3
```

```bash
bl pipeline run workflow.yaml --dry-run
```

```bash
bl pipeline run workflow.json --events jsonl
```

```bash
bl pipeline run workflow.yaml --output json
```

### `bl pipeline validate`

| Field | Value |
| --- | --- |
| **Name** | `pipeline validate` |
| **Description** | Validate a pipeline definition without executing |
| **Usage** | `bl pipeline validate <file>` |

#### Options

_No command-specific options._

#### Examples

```bash
bl pipeline validate workflow.yaml
```

```bash
bl pipeline validate workflow.json --output json
```
