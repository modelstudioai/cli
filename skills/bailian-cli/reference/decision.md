# `bl decision` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command       | Authentication | Description                                                                    |
| ------------- | -------------- | ------------------------------------------------------------------------------ |
| `bl decision` | API Key        | Run the decision model: typed choice / noul / score answers with probabilities |

## Command details

### `bl decision`

| Field              | Value                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `decision`                                                                                                                     |
| **Description**    | Run the decision model: typed choice / noul / score answers with probabilities                                                 |
| **Authentication** | API Key                                                                                                                        |
| **Usage**          | `bl decision (--state <text> \| --state-file <path>) (--questions <json> \| --questions-file <path>) \| --request-file <path>` |

#### Flags

| Flag                                    | Type   | Required | Description                                                                              |
| --------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `--model <model>`                       | string | no       | Decision model ID (default: decision-model-preview)                                      |
| `--state <text>`                        | string | no       | Business state to decide on, sent as a string                                            |
| `--state-file <path>`                   | string | no       | Read state from a file (.json is parsed as an object/array, others as text; - for stdin) |
| `--questions <json>`                    | string | no       | Question table JSON, keyed by question ID                                                |
| `--questions-file <path>`               | string | no       | Read the question table from a JSON file ({...} or {"questions":{...}})                  |
| `--request-file <path>`                 | string | no       | Full request JSON {state, questions}; label/target are stripped                          |
| `--workspace-id <id>`                   | string | no       | Workspace ID for the endpoint host (or set BAILIAN_WORKSPACE_ID)                         |
| `--region <cn-beijing\|ap-southeast-1>` | string | no       | Endpoint region: cn-beijing, ap-southeast-1 (default: cn-beijing)                        |
| `--api-key <key>`                       | string | no       | API key                                                                                  |
| `--base-url <url>`                      | string | no       | API base URL                                                                             |

#### Notes

- Endpoint: configured --base-url, DASHSCOPE_BASE_URL, or profile base_url takes precedence; otherwise https://{workspace}.{region}.maas.aliyuncs.com/compatible-mode/v1/systemone, with workspace from --workspace-id, BAILIAN_WORKSPACE_ID, then config workspace_id.
- Question types: choice (criteria: option → description, 1-255), noul (optional criteria with true/false descriptions), score (criteria: levels from low to high, 2-255; 3-7 recommended). Keep questions per request at 16 or fewer; latency grows roughly linearly.
- Output defaults to the full JSON response. Use --output text for one human-readable line per question; the request ID and usage summary are written to stderr.
- Training samples can be reused directly: label/target are stripped before sending. Sampling parameters (temperature, max_tokens, ...) are not supported by this API.

#### Examples

```bash
bl decision --workspace-id <id> --state "Is this review asking for a refund?" --questions '{"refund":{"type":"noul","instructions":"Asking for a refund?"}}'
```

```bash
bl decision --state-file ticket.json --questions-file workload.json
```

```bash
bl decision --request-file sample.json --model decision-model-preview
```

```bash
bl decision --region ap-southeast-1 --request-file sample.json
```

```bash
bl decision --request-file sample.json --dry-run
```
