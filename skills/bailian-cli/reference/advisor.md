# `bl advisor` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command | Description |
| --- | --- |
| `bl advisor recommend` | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking) |

## Command details

### `bl advisor recommend`

| Field | Value |
| --- | --- |
| **Name** | `advisor recommend` |
| **Description** | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking) |
| **Usage** | `bl advisor recommend <prompt> [flags]` |

#### Options

| Flag | Type | Required | Description |
| --- | --- | --- | --- |
| `--message <text>` | string | no | Describe your requirements (alternative to positional prompt) |
| `--dry-run` | boolean | no | Show intent analysis and candidate list without LLM ranking |
| `--output <format>` | string | no | Output format: text (default in TTY), json, yaml |

#### Examples

```bash
bl advisor recommend --message "我要做一个能理解图片的客服机器人"
```

```bash
bl advisor recommend --message "做一个Agent自动根据用户意图生成动画片"
```

```bash
bl advisor recommend --message "法律合同审查，要求高精准度"
```

```bash
bl advisor recommend --message "做一个低成本高并发的在线客服" --output json
```

```bash
bl advisor recommend --message "长文本摘要" --dry-run
```

```bash
bl advisor recommend                                          # 交互式输入需求
```
