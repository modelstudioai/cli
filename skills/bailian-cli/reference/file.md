# `bl file` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `bl file upload` | Upload a local file to DashScope temporary storage (48h) |

## Command details

### `bl file upload`

| Field           | Value                                                    |
| --------------- | -------------------------------------------------------- |
| **Name**        | `file upload`                                            |
| **Description** | Upload a local file to DashScope temporary storage (48h) |
| **Usage**       | `bl file upload --file <path> --model <model>`           |

#### Flags

| Flag               | Type   | Required | Description                                     |
| ------------------ | ------ | -------- | ----------------------------------------------- |
| `--file <path>`    | string | yes      | Local file to upload (image, video, audio)      |
| `--model <model>`  | string | yes      | Target model name (file is bound to this model) |
| `--api-key <key>`  | string | no       | API key                                         |
| `--base-url <url>` | string | no       | API base URL                                    |

#### Examples

```bash
bl file upload --file photo.jpg --model qwen3-vl-plus
```

```bash
bl file upload --file video.mp4 --model wan2.1-t2v-plus
```

```bash
bl file upload --file audio.wav --model qwen3-asr-flash
```

```bash
bl file upload --file cat.png --model qwen-image-2.0
```
