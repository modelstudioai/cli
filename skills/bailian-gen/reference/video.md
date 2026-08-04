# `bl video` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `bl video download` | Download a completed video by task ID                                                                 |
| `bl video edit`     | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)                |
| `bl video generate` | Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v)            |
| `bl video ref`      | Reference-to-video generation (happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice |
| `bl video task get` | Query async task status                                                                               |

## Command details

### `bl video download`

| Field           | Value                                           |
| --------------- | ----------------------------------------------- |
| **Name**        | `video download`                                |
| **Description** | Download a completed video by task ID           |
| **Usage**       | `bl video download --task-id <id> --out <path>` |

#### Flags

| Flag               | Type   | Required | Description              |
| ------------------ | ------ | -------- | ------------------------ |
| `--task-id <id>`   | string | yes      | Task ID to download from |
| `--out <path>`     | string | yes      | Output file path         |
| `--api-key <key>`  | string | no       | API key                  |
| `--base-url <url>` | string | no       | API base URL             |

#### Examples

```bash
bl video download --task-id 3b256896-xxxx --out video.mp4
```

```bash
bl video download --task-id 3b256896-xxxx --out video.mp4 --quiet
```

### `bl video edit`

| Field           | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| **Name**        | `video edit`                                                                           |
| **Description** | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.) |
| **Usage**       | `bl video edit --video <url> --prompt <text> [flags]`                                  |

#### Flags

| Flag                             | Type    | Required | Description                                                                             |
| -------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------- |
| `--model <model>`                | string  | no       | Model ID (default: happyhorse-1.0-video-edit)                                           |
| `--video <url>`                  | string  | yes      | Input video URL or local file (mp4/mov, 2-10s)                                          |
| `--prompt <text>`                | string  | no       | Edit instruction (e.g. "Convert the scene to a claymation style")                       |
| `--ref-image <url>`              | string  | no       | Reference image URL (up to 4, comma-separated)                                          |
| `--negative-prompt <text>`       | string  | no       | Negative prompt to exclude unwanted content                                             |
| `--resolution <res>`             | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                              |
| `--ratio <ratio>`                | string  | no       | Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)                                                |
| `--duration <seconds>`           | number  | no       | Output video duration in seconds (2-10)                                                 |
| `--audio-setting <auto\|origin>` | string  | no       | Audio: auto (default) or origin (keep original)                                         |
| `--prompt-extend <bool>`         | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default). |
| `--watermark <bool>`             | boolean | no       | Enable watermark (true/false). Omit flag to use CLI default (true).                     |
| `--seed <n>`                     | number  | no       | Random seed for reproducible generation                                                 |
| `--download <path>`              | string  | no       | Save video to file on completion                                                        |
| `--async`                        | switch  | no       | Return async task id without waiting                                                    |
| `--concurrent <n>`               | number  | no       | Run N parallel requests (default: 1)                                                    |
| `--poll-interval <seconds>`      | number  | no       | Polling interval when waiting (default: 15)                                             |
| `--api-key <key>`                | string  | no       | API key                                                                                 |
| `--base-url <url>`               | string  | no       | API base URL                                                                            |

#### Examples

```bash
bl video edit --video https://example.com/input.mp4 --prompt "Convert the entire scene to claymation style"
```

```bash
bl video edit --video https://example.com/input.mp4 --prompt "Replace the outfit with the style shown in the image" --ref-image https://example.com/clothes.png
```

```bash
bl video edit --video https://example.com/input.mp4 --prompt "Convert to anime style" --resolution 720P --download output.mp4
```

```bash
bl video edit --video https://example.com/input.mp4 --prompt "Put clothes on the kitten in the video" --watermark false
```

### `bl video generate`

| Field           | Value                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Name**        | `video generate`                                                                           |
| **Description** | Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v) |
| **Usage**       | `bl video generate --prompt <text> [--image <url>] [flags]`                                |

#### Flags

| Flag                        | Type    | Required | Description                                                                             |
| --------------------------- | ------- | -------- | --------------------------------------------------------------------------------------- |
| `--model <model>`           | string  | no       | Model ID (default: happyhorse-1.1-t2v, or happyhorse-1.1-i2v with --image)              |
| `--prompt <text>`           | string  | yes      | Video description                                                                       |
| `--image <url>`             | string  | no       | Input image URL for image-to-video generation                                           |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                                             |
| `--resolution <res>`        | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                              |
| `--ratio <ratio>`           | string  | no       | Aspect ratio (e.g. 16:9, 9:16, 1:1)                                                     |
| `--duration <seconds>`      | number  | no       | Video duration in seconds (default: 5)                                                  |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default). |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use CLI default (true).                     |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                 |
| `--download <path>`         | string  | no       | Save video to file on completion                                                        |
| `--async`                   | switch  | no       | Return async task id without waiting                                                    |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                    |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 5)                                              |
| `--api-key <key>`           | string  | no       | API key                                                                                 |
| `--base-url <url>`          | string  | no       | API base URL                                                                            |

#### Examples

```bash
bl video generate --prompt "A person reading a book, static shot"
```

```bash
bl video generate --prompt "Ocean waves at sunset." --download sunset.mp4
```

```bash
bl video generate --image https://example.com/cat.png --prompt "Make the cat in the scene move"
```

```bash
bl video generate --prompt "Mountain landscape" --resolution 720P --duration 5
```

```bash
bl video generate --prompt "A cat playing with a ball" --watermark false
```

### `bl video ref`

| Field           | Value                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Name**        | `video ref`                                                                                           |
| **Description** | Reference-to-video generation (happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice |
| **Usage**       | `bl video ref --prompt <text> --image <url>... [--ref-video <url>...] [flags]`                        |

#### Flags

| Flag                        | Type    | Required | Description                                                                             |
| --------------------------- | ------- | -------- | --------------------------------------------------------------------------------------- |
| `--model <model>`           | string  | no       | Model ID (default: happyhorse-1.1-r2v)                                                  |
| `--prompt <text>`           | string  | yes      | Video description with reference markers (image1, video1, etc.)                         |
| `--image <url>`             | array   | no       | Reference image URL or local file (repeatable for multiple subjects)                    |
| `--ref-video <url>`         | array   | no       | Reference video URL or local file (repeatable)                                          |
| `--image-voice <url>`       | array   | no       | Voice URL for corresponding image (pairs by position)                                   |
| `--video-voice <url>`       | array   | no       | Voice URL for corresponding ref-video (pairs by position)                               |
| `--resolution <res>`        | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                              |
| `--ratio <ratio>`           | string  | no       | Aspect ratio (16:9, 9:16, 1:1)                                                          |
| `--duration <seconds>`      | number  | no       | Video duration in seconds (default: 5)                                                  |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default). |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use CLI default (true).                     |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                 |
| `--download <path>`         | string  | no       | Save video to file on completion                                                        |
| `--async`                   | switch  | no       | Return async task id without waiting                                                    |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                    |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 15)                                             |
| `--api-key <key>`           | string  | no       | API key                                                                                 |
| `--base-url <url>`          | string  | no       | API base URL                                                                            |

#### Examples

```bash
bl video ref --prompt "Image1 running on the grass" --image person.jpg
```

```bash
bl video ref --prompt "Video 1 plays guitar, Image 1 walks over" --ref-video scene.mp4 --image person.jpg
```

```bash
bl video ref --prompt "Image 1 speaks" --image person.jpg --image-voice voice.mp3 --resolution 1080P
```

```bash
bl video ref --prompt "Image 1 and Image 2 have a conversation" --image a.jpg --image b.jpg --image-voice va.mp3 --image-voice vb.mp3
```

```bash
bl video ref --prompt "Image 1 drinks water" --image person.jpg --watermark false
```

### `bl video task get`

| Field           | Value                              |
| --------------- | ---------------------------------- |
| **Name**        | `video task get`                   |
| **Description** | Query async task status            |
| **Usage**       | `bl video task get --task-id <id>` |

#### Flags

| Flag               | Type   | Required | Description   |
| ------------------ | ------ | -------- | ------------- |
| `--task-id <id>`   | string | yes      | Async task ID |
| `--api-key <key>`  | string | no       | API key       |
| `--base-url <url>` | string | no       | API base URL  |

#### Examples

```bash
bl video task get --task-id 3b256896-3e70-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
bl video task get --task-id 3b256896-3e70-xxxx --output json
```
