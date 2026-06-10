# `bl quota` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command            | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `bl quota check`   | 查看当前用量 vs 限流阈值 (Check current usage against rate limits) |
| `bl quota history` | 查看提额历史记录 (View quota change history)                       |
| `bl quota list`    | 查看模型 RPM/TPM 限流值 (View model rate limits)                   |
| `bl quota request` | 申请临时提额 (Request temporary quota increase)                    |

## Command details

### `bl quota check`

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| **Name**        | `quota check`                                                      |
| **Description** | 查看当前用量 vs 限流阈值 (Check current usage against rate limits) |
| **Usage**       | `bl quota check [--model <model>] [flags]`                         |

#### Options

| Flag                 | Type   | Required | Description                                                                    |
| -------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `--model <model>`    | string | no       | 模型名称，逗号分隔多个 (Model name(s), comma-separated)                        |
| `--period <minutes>` | string | no       | 查询最近 N 分钟的用量，默认 2 (Query usage for the last N minutes, default: 2) |
| `--region <region>`  | string | no       | API 区域，默认 cn-beijing (API region, default: cn-beijing)                    |

#### Examples

```bash
bl quota check
```

```bash
bl quota check --model qwen3.6-plus
```

```bash
bl quota check --period 5
```

```bash
bl quota check --model qwen3.6-plus,qwen-turbo
```

```bash
bl quota check --output json
```

### `bl quota history`

| Field           | Value                                        |
| --------------- | -------------------------------------------- |
| **Name**        | `quota history`                              |
| **Description** | 查看提额历史记录 (View quota change history) |
| **Usage**       | `bl quota history [flags]`                   |

#### Options

| Flag                | Type   | Required | Description                                                 |
| ------------------- | ------ | -------- | ----------------------------------------------------------- |
| `--page <n>`        | string | no       | 页码，默认 1 (Page number, default: 1)                      |
| `--page-size <n>`   | string | no       | 每页条数，默认 10 (Page size, default: 10)                  |
| `--model <model>`   | string | no       | 按模型名过滤 (Filter by model name)                         |
| `--region <region>` | string | no       | API 区域，默认 cn-beijing (API region, default: cn-beijing) |

#### Examples

```bash
bl quota history
```

```bash
bl quota history --page 2
```

```bash
bl quota history --page-size 20
```

```bash
bl quota history --model qwen-turbo
```

```bash
bl quota history --output json
```

### `bl quota list`

| Field           | Value                                            |
| --------------- | ------------------------------------------------ |
| **Name**        | `quota list`                                     |
| **Description** | 查看模型 RPM/TPM 限流值 (View model rate limits) |
| **Usage**       | `bl quota list [--model <model>] [flags]`        |

#### Options

| Flag                | Type    | Required | Description                                                                        |
| ------------------- | ------- | -------- | ---------------------------------------------------------------------------------- |
| `--model <model>`   | string  | no       | 模型名称，逗号分隔多个 (Model name(s), comma-separated)                            |
| `--all`             | boolean | no       | 显示全部模型，不仅限于支持自助提额的 (Show all models, not just self-service ones) |
| `--region <region>` | string  | no       | API 区域，默认 cn-beijing (API region, default: cn-beijing)                        |

#### Examples

```bash
bl quota list
```

```bash
bl quota list --model qwen3.6-plus
```

```bash
bl quota list --model qwen3.6-plus,qwen-turbo
```

```bash
bl quota list --all
```

```bash
bl quota list --output json
```

### `bl quota request`

| Field           | Value                                                    |
| --------------- | -------------------------------------------------------- |
| **Name**        | `quota request`                                          |
| **Description** | 申请临时提额 (Request temporary quota increase)          |
| **Usage**       | `bl quota request --model <model> --tpm <value> [flags]` |

#### Options

| Flag                | Type    | Required | Description                                                 |
| ------------------- | ------- | -------- | ----------------------------------------------------------- |
| `--model <model>`   | string  | yes      | 模型名称（必填）(Model name, required)                      |
| `--tpm <value>`     | string  | yes      | 目标 TPM 值（必填）(Target TPM value, required)             |
| `--yes`             | boolean | no       | 跳过降配确认 (Skip downgrade confirmation)                  |
| `--region <region>` | string  | no       | API 区域，默认 cn-beijing (API region, default: cn-beijing) |

#### Examples

```bash
bl quota request --model qwen-turbo --tpm 100000
```

```bash
bl quota request --model qwen3.6-plus --tpm 8000000 --yes
```

```bash
bl quota request --model qwen-turbo --tpm 100000 --output json
```
