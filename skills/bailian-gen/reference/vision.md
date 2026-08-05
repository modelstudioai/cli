# `bl vision` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `bl vision describe` | Describe an image or video using Qwen-VL |

## Command details

### `bl vision describe`

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| **Name**        | `vision describe`                                                            |
| **Description** | Describe an image or video using Qwen-VL                                     |
| **Usage**       | `bl vision describe --image <path-or-url> [--video <url>] [--prompt <text>]` |

#### Flags

| Flag                    | Type   | Required | Description                                         |
| ----------------------- | ------ | -------- | --------------------------------------------------- |
| `--image <path-or-url>` | string | no       | Local image path or URL                             |
| `--video <url>`         | array  | no       | Video file URL or local path (mp4/mov/avi/mkv/webm) |
| `--prompt <text>`       | string | no       | Question about the content (default: auto-detected) |
| `--model <model>`       | string | no       | Vision model (default: qwen3-vl-plus)               |
| `--api-key <key>`       | string | no       | API key                                             |
| `--base-url <url>`      | string | no       | API base URL                                        |

#### Examples

```bash
bl vision describe --image photo.jpg
```

```bash
bl vision describe --image https://example.com/photo.jpg --prompt "What breed is this dog?"
```

```bash
bl vision describe --video https://example.com/video.mp4 --prompt "Summarize the video content"
```

```bash
bl vision describe --video ./local-video.mp4
```

```bash
bl vision describe --image photo.png --prompt "Extract the text" --model qwen3-vl-plus
```
