# `bl omni` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Authentication | Description                                             |
| ------------------- | -------------- | ------------------------------------------------------- |
| `bl omni`           | API Key        | Multimodal chat with text + audio output (Qwen-Omni)    |
| `bl omni translate` | API Key        | Translate a document, image or audio file (Qwen-MT-Uni) |

## Command details

### `bl omni`

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Name**           | `omni`                                               |
| **Description**    | Multimodal chat with text + audio output (Qwen-Omni) |
| **Authentication** | API Key                                              |
| **Usage**          | `bl omni --message <text> [flags]`                   |

#### Flags

| Flag                   | Type   | Required | Description                                                                                                                                                                                                   |
| ---------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--message <text>`     | array  | no       | Message text (repeatable, prefix role: to set role)                                                                                                                                                           |
| `--model <model>`      | string | no       | Model ID (default: qwen3.8-omni-flash; when --model is omitted and --text-only is absent, auto-switches to qwen3.5-omni-plus for audio output)                                                                |
| `--system <text>`      | string | no       | System prompt                                                                                                                                                                                                 |
| `--image <url>`        | array  | no       | Image URL or local file (repeatable)                                                                                                                                                                          |
| `--audio <url>`        | array  | no       | Audio URL or local file (.wav/.mp3/.amr/.aac/.m4a/.ogg/.3gp/.3gpp)                                                                                                                                            |
| `--video <url>`        | array  | no       | Video file URL / local path, or comma-separated frame URLs                                                                                                                                                    |
| `--voice <voice>`      | string | no       | Output voice ID (default: Tina). Use --list-voices for system voices. Cloned ids (qwen-omni-vc-*) must resolve to the speech voice clone --target-model; the qwen3.8-omni-flash audio auto-switch is rejected |
| `--list-voices`        | switch | no       | List available output voices and exit                                                                                                                                                                         |
| `--audio-format <fmt>` | string | no       | Audio output format (default: wav)                                                                                                                                                                            |
| `--audio-out <path>`   | string | no       | Save audio to file (default: auto-generate)                                                                                                                                                                   |
| `--text-only`          | switch | no       | Output text only, no audio generation                                                                                                                                                                         |
| `--max-tokens <n>`     | number | no       | Maximum tokens to generate                                                                                                                                                                                    |
| `--temperature <n>`    | number | no       | Sampling temperature (0.0, 2.0]                                                                                                                                                                               |
| `--api-key <key>`      | string | no       | API key                                                                                                                                                                                                       |
| `--base-url <url>`     | string | no       | API base URL                                                                                                                                                                                                  |

#### Notes

- For file translation (documents / images / audio), use `omni translate` instead of this multimodal chat entry.
- Cloned voices (qwen-omni-vc-*) are bound to the enrollment model. Omitting --model is rejected only when the resolved model is still qwen3.8-omni-flash, because audio output would auto-switch to qwen3.5-omni-plus. A Profile default_omni_model other than qwen3.8-omni-flash is used as-is.

#### Examples

```bash
bl omni --list-voices
```

```bash
bl omni --message "Hello, who are you?"
```

```bash
bl omni --message "Describe this image" --image ./photo.jpg
```

```bash
bl omni --message "What is this audio saying?" --audio https://example.com/audio.wav
```

```bash
bl omni --message "Summarize this video" --video https://example.com/video.mp4
```

```bash
bl omni --message "What is this video about?" --video ./local-video.mp4 --text-only
```

```bash
bl omni --message "Answer in Sichuan dialect: How's the weather today?" --voice Sunny
```

```bash
bl omni --message "Read this in my voice" --model qwen3.5-omni-flash --voice qwen-omni-vc-demo-voice-1-abcd
```

```bash
bl omni --message "Hello" --text-only --output json
```

```bash
bl omni --message "Read this passage aloud" --audio-out greeting.wav
```

### `bl omni translate`

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| **Name**           | `omni translate`                                                      |
| **Description**    | Translate a document, image or audio file (Qwen-MT-Uni)               |
| **Authentication** | API Key                                                               |
| **Usage**          | `bl omni translate --file <url-or-path> --target-lang <lang> [flags]` |

#### Flags

| Flag                        | Type    | Required | Description                                                                                        |
| --------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------- |
| `--file <url-or-path>`      | string  | yes      | Document, image or audio URL/local file                                                            |
| `--target-lang <lang>`      | string  | yes      | Target language code or name                                                                       |
| `--source-lang <lang>`      | string  | no       | Source language (omit to auto-detect; do not send auto)                                            |
| `--format-hint <type>`      | string  | no       | Format hint when URL has no extension (e.g. pdf, image)                                            |
| `--domain-hint <text>`      | string  | no       | English domain hint ≤200 words (ext.domainHint)                                                    |
| `--term <source=target>`    | array   | no       | Glossary pair source=target (repeatable; maps to ext.glossary, max 100; empty target keeps source) |
| `--sensitive <text>`        | array   | no       | Sensitive phrase kept untranslated on exact match (repeatable; maps to ext.sensitives, max 50)     |
| `--image-segment <bool>`    | boolean | no       | Skip translating text on image subjects (ext.config.imageSegment; images only)                     |
| `--out-dir <path>`          | string  | no       | Download directory                                                                                 |
| `--async`                   | switch  | no       | Return async task id without waiting                                                               |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 5)                                                         |
| `--api-key <key>`           | string  | no       | API key                                                                                            |
| `--base-url <url>`          | string  | no       | API base URL                                                                                       |

#### Notes

- Always submits asynchronously. Use --async to return the task ID immediately. Task SUCCEEDED still requires output.Success=true before download. Query with `video task get --task-id`. Supported: pdf/docx/pptx/xlsx/txt/html/md/png/jpg/mp3/wav. Video and legacy doc/ppt are rejected. --image-segment only affects image inputs.

#### Examples

```bash
bl omni translate --file ./brochure.pdf --target-lang en --dry-run --output json
```

```bash
bl omni translate --file https://example.com/brochure.pdf --target-lang en --format-hint pdf --async --output json
```

```bash
bl omni translate --file https://example.com/poster.png --target-lang en --term "应用程序接口=API" --sensitive "全场9折" --image-segment true --dry-run --output json
```
