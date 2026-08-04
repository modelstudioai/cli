# `bl omni` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command   | Description                                          |
| --------- | ---------------------------------------------------- |
| `bl omni` | Multimodal chat with text + audio output (Qwen-Omni) |

## Command details

### `bl omni`

| Field           | Value                                                |
| --------------- | ---------------------------------------------------- |
| **Name**        | `omni`                                               |
| **Description** | Multimodal chat with text + audio output (Qwen-Omni) |
| **Usage**       | `bl omni --message <text> [flags]`                   |

#### Flags

| Flag                   | Type   | Required | Description                                                           |
| ---------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `--message <text>`     | array  | no       | Message text (repeatable, prefix role: to set role)                   |
| `--model <model>`      | string | no       | Model ID (default: qwen3.5-omni-plus)                                 |
| `--system <text>`      | string | no       | System prompt                                                         |
| `--image <url>`        | array  | no       | Image URL or local file (repeatable)                                  |
| `--audio <url>`        | array  | no       | Audio URL or local file (.wav/.mp3/.amr/.aac/.m4a/.ogg/.3gp/.3gpp)    |
| `--video <url>`        | array  | no       | Video file URL / local path, or comma-separated frame URLs            |
| `--voice <voice>`      | string | no       | Output voice ID (default: Tina). Use --list-voices to see all options |
| `--list-voices`        | switch | no       | List available output voices and exit                                 |
| `--audio-format <fmt>` | string | no       | Audio output format (default: wav)                                    |
| `--audio-out <path>`   | string | no       | Save audio to file (default: auto-generate)                           |
| `--text-only`          | switch | no       | Output text only, no audio generation                                 |
| `--max-tokens <n>`     | number | no       | Maximum tokens to generate                                            |
| `--temperature <n>`    | number | no       | Sampling temperature (0.0, 2.0]                                       |
| `--api-key <key>`      | string | no       | API key                                                               |
| `--base-url <url>`     | string | no       | API base URL                                                          |

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
bl omni --message "Hello" --text-only --output json
```

```bash
bl omni --message "Read this passage aloud" --audio-out greeting.wav
```
