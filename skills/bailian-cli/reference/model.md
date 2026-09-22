# `bl model` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Authentication | Description                                                                        |
| ----------------- | -------------- | ---------------------------------------------------------------------------------- |
| `bl model code`   | No Auth        | Print a ready-to-run SDK sample for calling a model                                |
| `bl model list`   | No Auth        | Browse model families or show detailed model info in the Bailian model marketplace |
| `bl model search` | No Auth        | Search the model catalog by keyword, ranked by relevance                           |

## Command details

### `bl model code`

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Name**           | `model code`                                                                  |
| **Description**    | Print a ready-to-run SDK sample for calling a model                           |
| **Authentication** | No Auth                                                                       |
| **Usage**          | `bl model code --model <model> [--sdk <sdk>] [--api <style>] [--lang <lang>]` |

#### Flags

| Flag              | Type   | Required | Description                                                                                             |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `--model <model>` | string | yes      | Model to generate a sample for                                                                          |
| `--sdk <sdk>`     | string | no       | SDK flavour: openai (default) or dashscope                                                              |
| `--api <style>`   | string | no       | API style: completions (default) or responses; ignored when the SDK has one style                       |
| `--lang <lang>`   | string | no       | Language of the snippet (default: python). Published per model — pass an unsupported value to list them |

#### Notes

- Text output is the snippet alone, so it can be redirected straight into a file. Use --output json for the snippet plus its metadata.
- Samples use a `[workspace-id]` placeholder in the base URL — replace it, or set BAILIAN_WORKSPACE_ID and use the DashScope endpoint.
- Available combinations are published per model; pass an unknown value to see the list for that model.

#### Examples

```bash
bl model code --model qwen-max
```

```bash
bl model code --model qwen-max --lang curl
```

```bash
bl model code --model qwen-max --sdk dashscope --lang java
```

```bash
bl model code --model qwen-max --api responses --lang node
```

```bash
bl model code --model qwen-max --output json
```

### `bl model list`

| Field              | Value                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `model list`                                                                                                                                                                                          |
| **Description**    | Browse model families or show detailed model info in the Bailian model marketplace                                                                                                                    |
| **Authentication** | No Auth                                                                                                                                                                                               |
| **Usage**          | `bl model list [--model <model>] [--page <n>] [--page-size <n>] [--provider <p>] [--capability <c>] [--feature <f>] [--input-modality <m>] [--output-modality <m>] [--include-deprecated] [--enrich]` |

#### Flags

| Flag                                            | Type   | Required | Description                                                                           |
| ----------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `--model <model>`                               | string | no       | Show full details of a specific model family (switches to detail mode)                |
| `--page <n>`                                    | number | no       | Page number (default: 1)                                                              |
| `--page-size <n>`                               | number | no       | Results per page (default: 10)                                                        |
| `--provider <p>`                                | array  | no       | Filter by provider (repeatable, e.g. --provider alibaba --provider deepseek)          |
| `--capability <c>`                              | array  | no       | Filter by capability code (TG, Reasoning, VU, IG, VG, TTS, ASR, …)                    |
| `--feature <f>`                                 | array  | no       | Filter by feature (function-calling, web-search, structured-outputs, …)               |
| `--context-window <w>`                          | array  | no       | Filter by context window range bucket                                                 |
| `--input-modality <Text\|Image\|Video\|Audio>`  | array  | no       | Require an input modality (repeatable: Text, Image, Video, Audio)                     |
| `--output-modality <Text\|Image\|Video\|Audio>` | array  | no       | Require an output modality (repeatable: Text, Image, Video, Audio)                    |
| `--include-deprecated`                          | switch | no       | Include models that are already offline (hidden by default)                           |
| `--enrich`                                      | switch | no       | Also fetch input parameter schema (predictConfig) for trunk models (detail mode only) |

#### Notes

- Both the catalog and --enrich parameter-schema endpoints are public — no console login needed.
- Browse mode hides models that are already offline; use --include-deprecated to include them. Detail mode (--model) always lists every version and flags its status instead.

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
bl model list --input-modality Image --output-modality Text
```

```bash
bl model list --include-deprecated
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

### `bl model search`

| Field              | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Name**           | `model search`                                                                                        |
| **Description**    | Search the model catalog by keyword, ranked by relevance                                              |
| **Authentication** | No Auth                                                                                               |
| **Usage**          | `bl model search --keyword <kw> [--limit <n>] [--input-modality <m>] [--output-modality <m>] [flags]` |

#### Flags

| Flag                                            | Type   | Required | Description                                                                    |
| ----------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `--keyword <kw>`                                | string | yes      | Keyword matched against model id, name, capabilities, features and description |
| `--limit <n>`                                   | number | no       | Maximum results to return (default: 20)                                        |
| `--provider <p>`                                | array  | no       | Filter by provider (repeatable, e.g. --provider alibaba --provider deepseek)   |
| `--capability <c>`                              | array  | no       | Filter by capability code (TG, Reasoning, VU, IG, VG, TTS, ASR, …)             |
| `--feature <f>`                                 | array  | no       | Filter by feature (function-calling, web-search, structured-outputs, …)        |
| `--context-window <w>`                          | array  | no       | Filter by context window range bucket                                          |
| `--input-modality <Text\|Image\|Video\|Audio>`  | array  | no       | Require an input modality (repeatable: Text, Image, Video, Audio)              |
| `--output-modality <Text\|Image\|Video\|Audio>` | array  | no       | Require an output modality (repeatable: Text, Image, Video, Audio)             |
| `--include-deprecated`                          | switch | no       | Include models that are already offline (hidden by default)                    |

#### Notes

- Search scans the whole catalog so that ranking sees every candidate; models already offline are hidden unless --include-deprecated is set.
- The model catalog endpoint is public — no console login needed.

#### Examples

```bash
bl model search --keyword qwen
```

```bash
bl model search --keyword vision --output-modality Text
```

```bash
bl model search --keyword function-calling --provider alibaba
```

```bash
bl model search --keyword 长上下文 --limit 5
```

```bash
bl model search --keyword qwen --include-deprecated --output json
```
