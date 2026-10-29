# `bl advisor` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                | Authentication | Description                                                                                                      |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bl advisor recommend` | API Key        | Recommend the best models for your use case (intent → routing → recall → score → rank, with agent clarification) |

## Command details

### `bl advisor recommend`

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Name**           | `advisor recommend`                                                                                              |
| **Description**    | Recommend the best models for your use case (intent → routing → recall → score → rank, with agent clarification) |
| **Authentication** | API Key                                                                                                          |
| **Usage**          | `bl advisor recommend --message <text> [flags]`                                                                  |

#### Flags

| Flag               | Type   | Required | Description                                                                             |
| ------------------ | ------ | -------- | --------------------------------------------------------------------------------------- |
| `--message <text>` | string | yes      | Describe your requirements                                                              |
| `--top <n>`        | number | no       | Number of recommendations (default: 3)                                                  |
| `--model <model>`  | string | no       | LLM used for every stage: agent/intent/scoring/explain (default: qwen-flash-2025-07-28) |
| `--no-agent`       | switch | no       | Skip the agent loop and run the deterministic engine directly                           |
| `--trace`          | switch | no       | Emit full routing/performance trace to stderr                                           |
| `--think`          | switch | no       | Show the engine decision process to stderr                                              |
| `--no-thinking`    | switch | no       | Disable thinking mode for intent analysis (on by default)                               |
| `--api-key <key>`  | string | no       | API key                                                                                 |
| `--base-url <url>` | string | no       | API base URL                                                                            |

#### Examples

```bash
bl advisor recommend --message "Recommend a model for writing code"
```

```bash
bl advisor recommend --message "Build a digital-human livestream" --no-agent
```

```bash
bl advisor recommend --message "qwen-max vs deepseek-v3, which is better"
```

```bash
bl advisor recommend --message "Anything cheaper than qwen-plus" --output json
```
