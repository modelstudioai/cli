# `bl advisor` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                | Description                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `bl advisor recommend` | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking) |

## Command details

### `bl advisor recommend`

| Field           | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Name**        | `advisor recommend`                                                                            |
| **Description** | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking) |
| **Usage**       | `bl advisor recommend --message <text> [flags]`                                                |

#### Flags

| Flag               | Type   | Required | Description                |
| ------------------ | ------ | -------- | -------------------------- |
| `--message <text>` | string | yes      | Describe your requirements |
| `--api-key <key>`  | string | no       | API key                    |
| `--base-url <url>` | string | no       | API base URL               |

#### Examples

```bash
bl advisor recommend --message "I need a visual-understanding chatbot"
```

```bash
bl advisor recommend --message "Build an Agent that auto-generates animations"
```

```bash
bl advisor recommend --message "Legal contract review, high precision required"
```

```bash
bl advisor recommend --message "Low-cost high-concurrency online customer service" --output text
```

```bash
bl advisor recommend --message "Long document summarization" --dry-run
```
