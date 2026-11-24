# `bl video` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Authentication | Description                                                                                                          |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bl video download` | API Key        | Download a completed video by task ID                                                                                |
| `bl video edit`     | API Key        | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)                               |
| `bl video generate` | API Key        | Generate a video from text or image (wan3.0-video / wan2.6-t2v / happyhorse-1.1-i2v)                                 |
| `bl video portrait` | API Key        | Drive a talking-head video with audio (VideoRetalk / videoretalk)                                                    |
| `bl video ref`      | API Key        | Reference-to-video generation (wan3.0-video / happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice |
| `bl video retouch`  | API Key        | Wan 2.1 VACE unified video edit (repaint / local edit / extension / outpainting / image reference)                   |
| `bl video style`    | API Key        | Restyle a video (video-style-transform)                                                                              |
| `bl video task get` | API Key        | Query async task status                                                                                              |

## Command details

### `bl video download`

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Name**           | `video download`                                |
| **Description**    | Download a completed video by task ID           |
| **Authentication** | API Key                                         |
| **Usage**          | `bl video download --task-id <id> --out <path>` |

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

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Name**           | `video edit`                                                                           |
| **Description**    | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.) |
| **Authentication** | API Key                                                                                |
| **Usage**          | `bl video edit --video <url> --prompt <text> [flags]`                                  |

#### Flags

| Flag                             | Type    | Required | Description                                                                                |
| -------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `--model <model>`                | string  | no       | Model ID (default: happyhorse-1.0-video-edit)                                              |
| `--video <url>`                  | string  | yes      | Input video URL or local file (mp4/mov, 2-10s)                                             |
| `--prompt <text>`                | string  | no       | Edit instruction (e.g. "Convert the scene to a claymation style")                          |
| `--ref-image <url>`              | string  | no       | Reference image URL (up to 4, comma-separated)                                             |
| `--negative-prompt <text>`       | string  | no       | Negative prompt to exclude unwanted content                                                |
| `--resolution <res>`             | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                                 |
| `--ratio <ratio>`                | string  | no       | Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)                                                   |
| `--duration <seconds>`           | number  | no       | Output video duration in seconds (2-10)                                                    |
| `--audio-setting <auto\|origin>` | string  | no       | Audio: auto (default) or origin (keep original)                                            |
| `--prompt-extend <bool>`         | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default).    |
| `--watermark <bool>`             | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true). |
| `--seed <n>`                     | number  | no       | Random seed for reproducible generation                                                    |
| `--download <path>`              | string  | no       | Save video to file on completion                                                           |
| `--async`                        | switch  | no       | Return async task id without waiting                                                       |
| `--concurrent <n>`               | number  | no       | Run N parallel requests (default: 1)                                                       |
| `--poll-interval <seconds>`      | number  | no       | Polling interval when waiting (default: 15)                                                |
| `--api-key <key>`                | string  | no       | API key                                                                                    |
| `--base-url <url>`               | string  | no       | API base URL                                                                               |

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

| Field              | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Name**           | `video generate`                                                                     |
| **Description**    | Generate a video from text or image (wan3.0-video / wan2.6-t2v / happyhorse-1.1-i2v) |
| **Authentication** | API Key                                                                              |
| **Usage**          | `bl video generate --prompt <text> [--image <url>] [flags]`                          |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                          |
| --------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `--model <model>`           | string  | no       | Model ID (default: wan3.0-video)                                                                                     |
| `--prompt <text>`           | string  | yes      | Video description                                                                                                    |
| `--image <url>`             | string  | no       | Input image URL for image-to-video generation                                                                        |
| `--last-frame <url>`        | string  | no       | Last frame image URL (with --image, enables kf2v first+last frame mode)                                              |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                                                                          |
| `--resolution <res>`        | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                                                           |
| `--ratio <ratio>`           | string  | no       | Aspect ratio (e.g. 16:9, 9:16, 1:1)                                                                                  |
| `--duration <seconds>`      | number  | no       | Video duration in seconds (default: 5)                                                                               |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default).                              |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true).                           |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                                              |
| `--download <path>`         | string  | no       | Save video to file on completion                                                                                     |
| `--file <url-or-path>`      | string  | no       | Reference file URL or local path for file-to-video (wan3.0-video only; mutually exclusive with --image/--last-frame) |
| `--prime`                   | switch  | no       | Use Prime mode with a workspace-scoped endpoint                                                                      |
| `--workspace-id <id>`       | string  | no       | Workspace ID for the default Prime endpoint (or set BAILIAN_WORKSPACE_ID)                                            |
| `--async`                   | switch  | no       | Return async task id without waiting                                                                                 |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                                                 |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 5)                                                                           |
| `--api-key <key>`           | string  | no       | API key                                                                                                              |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                         |

#### Notes

- Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.
- Prime mode requires an explicit model.
- Prime endpoint: configured --base-url, DASHSCOPE_BASE_URL, or profile base_url takes precedence; otherwise workspace is resolved from --workspace-id, BAILIAN_WORKSPACE_ID, then config workspace_id.

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

```bash
bl video generate --prime --workspace-id <id> --model wan3.0-video-prime --prompt "Ocean waves at sunset"
```

### `bl video portrait`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `video portrait`                                                        |
| **Description**    | Drive a talking-head video with audio (VideoRetalk / videoretalk)       |
| **Authentication** | API Key                                                                 |
| **Usage**          | `bl video portrait --video <url-or-path> --audio <url-or-path> [flags]` |

#### Flags

| Flag                        | Type    | Required | Description                                                                                |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `--video <url-or-path>`     | string  | yes      | Input video URL or local file (mp4/avi/mov)                                                |
| `--audio <url-or-path>`     | string  | yes      | Driving audio URL or local file (wav/mp3/aac)                                              |
| `--ref-image <url-or-path>` | string  | no       | Optional reference face image when the video has multiple people                           |
| `--video-extension <bool>`  | boolean | no       | Extend video by alternating reverse/forward playback when audio is longer (default: false) |
| `--face-threshold <n>`      | number  | no       | Face match threshold 120–200 (default: 170; only with --ref-image)                         |
| `--download <path>`         | string  | no       | Save video to file on completion (default: output dir)                                     |
| `--async`                   | switch  | no       | Return async task id without waiting                                                       |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 15)                                                |
| `--api-key <key>`           | string  | no       | API key                                                                                    |
| `--base-url <url>`          | string  | no       | API base URL                                                                               |

#### Notes

- Fixed model videoretalk (Beijing). Supports temporary OSS upload for local media. Requires model access on the account.

#### Examples

```bash
bl video portrait --video https://example.com/face.mp4 --audio https://example.com/speech.wav --download out.mp4
```

```bash
bl video portrait --video ./face.mp4 --audio ./speech.wav --ref-image ./person.jpg --face-threshold 170
```

### `bl video ref`

| Field              | Value                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `video ref`                                                                                                          |
| **Description**    | Reference-to-video generation (wan3.0-video / happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice |
| **Authentication** | API Key                                                                                                              |
| **Usage**          | `bl video ref --prompt <text> --image <url>... [--ref-video <url>...] [flags]`                                       |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                                                 |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model <model>`           | string  | no       | Model ID (default: wan3.0-video)                                                                                                            |
| `--prompt <text>`           | string  | yes      | Video description with reference markers (image1, video1, etc.)                                                                             |
| `--image <url>`             | array   | no       | Reference image URL or local file (repeatable for multiple subjects)                                                                        |
| `--ref-video <url>`         | array   | no       | Reference video URL or local file (repeatable)                                                                                              |
| `--image-voice <url>`       | array   | no       | Voice URL for corresponding image (pairs by position). On wan3.0-video emitted as reference_audio (refer to Audio 1, Audio 2 in prompt)     |
| `--video-voice <url>`       | array   | no       | Voice URL for corresponding ref-video (pairs by position). On wan3.0-video emitted as reference_audio (refer to Audio 1, Audio 2 in prompt) |
| `--resolution <res>`        | string  | no       | Resolution: 720P or 1080P (default: 1080P)                                                                                                  |
| `--ratio <ratio>`           | string  | no       | Aspect ratio (16:9, 9:16, 1:1)                                                                                                              |
| `--duration <seconds>`      | number  | no       | Video duration in seconds (default: 5)                                                                                                      |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default).                                                     |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true).                                                  |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                                                                     |
| `--download <path>`         | string  | no       | Save video to file on completion                                                                                                            |
| `--async`                   | switch  | no       | Return async task id without waiting                                                                                                        |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                                                                        |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 15)                                                                                                 |
| `--api-key <key>`           | string  | no       | API key                                                                                                                                     |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                                                |

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

### `bl video retouch`

| Field              | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Name**           | `video retouch`                                                                                    |
| **Description**    | Wan 2.1 VACE unified video edit (repaint / local edit / extension / outpainting / image reference) |
| **Authentication** | API Key                                                                                            |
| **Usage**          | `bl video retouch --prompt <text> [--function <mode>] [flags]`                                     |

#### Flags

| Flag                                                                                             | Type    | Required | Description                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt <text>`                                                                                | string  | yes      | Edit / generation prompt (max 800 characters; server may truncate)                                                                |
| `--function <video_repainting\|video_edit\|video_extension\|video_outpainting\|image_reference>` | string  | no       | VACE function: video_repainting (default), video_edit, video_extension, video_outpainting, image_reference                        |
| `--video <url-or-path>`                                                                          | string  | no       | Input video URL or local file (required for most functions)                                                                       |
| `--ref-image <url-or-path>`                                                                      | array   | no       | Reference image(s): image_reference 1–3; video_repainting/video_edit at most 1; unsupported for video_extension/video_outpainting |
| `--control-condition <mode>`                                                                     | string  | no       | Control condition (required for video_repainting; posebodyface/posebody/depth/scribble)                                           |
| `--strength <n>`                                                                                 | number  | no       | Repaint strength in [0, 1]                                                                                                        |
| `--seed <n>`                                                                                     | number  | no       | Random seed                                                                                                                       |
| `--prompt-extend <bool>`                                                                         | boolean | no       | Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default).                                           |
| `--watermark <bool>`                                                                             | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true).                                        |
| `--mask-image <url-or-path>`                                                                     | string  | no       | Mask image for video_edit (mutually exclusive with --mask-video)                                                                  |
| `--mask-video <url-or-path>`                                                                     | string  | no       | Mask video for video_edit (mutually exclusive with --mask-image)                                                                  |
| `--mask-frame-id <n>`                                                                            | number  | no       | Mask frame id starting at 1 (video_edit)                                                                                          |
| `--mask-type <tracking\|fixed>`                                                                  | string  | no       | Mask type: tracking or fixed (video_edit)                                                                                         |
| `--expand-ratio <n>`                                                                             | number  | no       | Expand ratio in [0, 1] (video_edit)                                                                                               |
| `--expand-mode <hull\|bbox\|original>`                                                           | string  | no       | Expand mode hull/bbox/original (image mask + tracking only)                                                                       |
| `--first-frame <url-or-path>`                                                                    | string  | no       | First-frame image for video_extension (extends forward)                                                                           |
| `--last-frame <url-or-path>`                                                                     | string  | no       | Last-frame image for video_extension (extends backward)                                                                           |
| `--first-clip <url-or-path>`                                                                     | string  | no       | First clip for video_extension (extends forward)                                                                                  |
| `--last-clip <url-or-path>`                                                                      | string  | no       | Last clip for video_extension (extends backward)                                                                                  |
| `--top-scale <n>`                                                                                | number  | no       | Outpainting top scale in [1, 2] (1 = no expand)                                                                                   |
| `--bottom-scale <n>`                                                                             | number  | no       | Outpainting bottom scale in [1, 2]                                                                                                |
| `--left-scale <n>`                                                                               | number  | no       | Outpainting left scale in [1, 2]                                                                                                  |
| `--right-scale <n>`                                                                              | number  | no       | Outpainting right scale in [1, 2]                                                                                                 |
| `--ref-role <obj\|bg>`                                                                           | array   | no       | Per-image role for image_reference (obj or bg; at most one bg)                                                                    |
| `--size <WxH>`                                                                                   | string  | no       | Output size for image_reference / video_edit (1280*720, 720*1280, 960*960, 832*1088, 1088*832)                                    |
| `--download <path>`                                                                              | string  | no       | Save video to file on completion (default: output dir)                                                                            |
| `--async`                                                                                        | switch  | no       | Return async task id without waiting                                                                                              |
| `--poll-interval <seconds>`                                                                      | number  | no       | Polling interval when waiting (default: 15)                                                                                       |
| `--api-key <key>`                                                                                | string  | no       | API key                                                                                                                           |
| `--base-url <url>`                                                                               | string  | no       | API base URL                                                                                                                      |

#### Notes

- Fixed model wanx2.1-vace-plus (Beijing/Singapore). Distinct from `video edit` (happyhorse). Output is silent MP4. video_extension: first-frame/clip extends forward, last-frame/clip extends backward; total output is 5s. Requires model access. Do not use a boolean --video-extension alias.

#### Examples

```bash
bl video retouch --prompt "Convert the scene to claymation" --function video_repainting --video https://example.com/in.mp4 --control-condition depth --strength 0.8
```

```bash
bl video retouch --prompt "Extend the shot" --function video_extension --first-frame https://example.com/first.png
```

```bash
bl video retouch --prompt "Generate from references" --function image_reference --ref-image https://example.com/a.png --ref-image https://example.com/b.png --ref-role obj --ref-role bg --size 1280*720
```

### `bl video style`

| Field              | Value                                   |
| ------------------ | --------------------------------------- |
| **Name**           | `video style`                           |
| **Description**    | Restyle a video (video-style-transform) |
| **Authentication** | API Key                                 |
| **Usage**          | `bl video style --video <url> [flags]`  |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                                                                      |
| --------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--video <url>`             | string  | yes      | Input video public URL (local paths not supported in v1)                                                                                                         |
| `--style <n>`               | number  | no       | Style ID 0–7 (default: 0). 0 Japanese comic, 1 American comic, 2 fresh comic, 3 3D cartoon, 4 Chinese cartoon, 5 paper art, 6 simple illustration, 7 Chinese ink |
| `--fps <n>`                 | number  | no       | Output video FPS 15–25 (maps to video_fps)                                                                                                                       |
| `--animate-emotion <bool>`  | boolean | no       | Animate facial emotion (server default: true)                                                                                                                    |
| `--min-len <n>`             | number  | no       | Short-side length 540 or 720 (server default: 720)                                                                                                               |
| `--super-resolution <bool>` | boolean | no       | Enable super-resolution (maps to use_SR; server default: false)                                                                                                  |
| `--download <path>`         | string  | no       | Save video to file on completion (default: output dir)                                                                                                           |
| `--async`                   | switch  | no       | Return async task id without waiting                                                                                                                             |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 15)                                                                                                                      |
| `--api-key <key>`           | string  | no       | API key                                                                                                                                                          |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                                                                     |

#### Notes

- Fixed model video-style-transform (Beijing only). Success field is output.output_video_url. Local paths are rejected until temporary OSS support is verified. Requires model access.

#### Examples

```bash
bl video style --video https://example.com/clip.mp4 --style 0 --download styled.mp4
```

```bash
bl video style --video https://example.com/clip.mp4 --style 4 --fps 15 --min-len 540 --super-resolution true
```

### `bl video task get`

| Field              | Value                              |
| ------------------ | ---------------------------------- |
| **Name**           | `video task get`                   |
| **Description**    | Query async task status            |
| **Authentication** | API Key                            |
| **Usage**          | `bl video task get --task-id <id>` |

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
