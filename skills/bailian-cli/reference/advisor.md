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
| **Usage**       | `bl advisor recommend <prompt> [flags]`                                                        |

#### Options

| Flag                | Type    | Required | Description                                                   |
| ------------------- | ------- | -------- | ------------------------------------------------------------- |
| `--message <text>`  | string  | no       | Describe your requirements (alternative to positional prompt) |
| `--dry-run`         | boolean | no       | Show intent analysis and candidate list without LLM ranking   |
| `--output <format>` | string  | no       | Output format: json (default), rich (boxen cards)             |

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
bl advisor recommend --message "Low-cost high-concurrency online customer service" --output rich
```

```bash
bl advisor recommend --message "Long document summarization" --dry-run
```

```bash
bl advisor recommend                                           # Interactive input
```
