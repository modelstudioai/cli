# `bl image` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `bl image edit`     | Edit an existing image with text instructions (Qwen-Image / Wan 2.7) |
| `bl image generate` | Generate images (Qwen-Image / wan2.x)                                |

## Command details

### `bl image edit`

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| **Name**        | `image edit`                                                         |
| **Description** | Edit an existing image with text instructions (Qwen-Image / Wan 2.7) |
| **Usage**       | `bl image edit --image <url> --prompt <text> [flags]`                |

#### Flags

| Flag                        | Type    | Required | Description                                                             |
| --------------------------- | ------- | -------- | ----------------------------------------------------------------------- |
| `--image <url>`             | array   | yes      | Source image URL or local file path (repeatable for multi-image merge)  |
| `--prompt <text>`           | string  | yes      | Edit instruction text                                                   |
| `--model <model>`           | string  | no       | Model ID (default: qwen-image-2.0)                                      |
| `--size <W*H>`              | string  | no       | Output image size: ratio (3:4, 16:9) or pixels (2048\*2048)             |
| `--n <count>`               | number  | no       | Number of images (default: 1, max: 6)                                   |
| `--seed <n>`                | number  | no       | Random seed for reproducible results                                    |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                             |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to use CLI default (true). |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use CLI default (true).     |
| `--out-dir <dir>`           | string  | no       | Download images to directory                                            |
| `--out-prefix <prefix>`     | string  | no       | Filename prefix (default: edited)                                       |
| `--async`                   | switch  | no       | Return async task id without waiting                                    |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                    |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 3)                              |
| `--api-key <key>`           | string  | no       | API key                                                                 |
| `--base-url <url>`          | string  | no       | API base URL                                                            |

#### Examples

```bash
bl image edit --image ./photo.png --prompt "Replace the background with a beach"
```

```bash
bl image edit --image https://example.com/logo.png --prompt "Change color to blue" --n 3
```

```bash
bl image edit --image ./a.png --image ./b.png --prompt "Merge two images into one collage"
```

```bash
bl image edit --image https://example.com/photo.png --prompt "Remove the person" --model qwen-image-2.0-pro
```

```bash
bl image edit --image ./photo.png --prompt "Change the style" --model wan2.7-image
```

```bash
bl image edit --image ./photo.png --prompt "Replace the background with a beach" --watermark false
```

### `bl image generate`

| Field           | Value                                       |
| --------------- | ------------------------------------------- |
| **Name**        | `image generate`                            |
| **Description** | Generate images (Qwen-Image / wan2.x)       |
| **Usage**       | `bl image generate --prompt <text> [flags]` |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                              |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--prompt <text>`           | string  | yes      | Image description                                                                                                        |
| `--model <model>`           | string  | no       | Model ID (default: qwen-image-2.0)                                                                                       |
| `--size <W*H>`              | string  | no       | Image size: ratio (3:4, 16:9, 1:1) or pixels (2048\*2048)                                                                |
| `--n <count>`               | number  | no       | Number of images per request (default: 1, max: 6)                                                                        |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                                                  |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                                                                              |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag: true for qwen-image sync; parameter omitted on async models (API default). |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use CLI default (true).                                                      |
| `--async`                   | switch  | no       | Return async task id without waiting                                                                                     |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                                                     |
| `--out-dir <dir>`           | string  | no       | Download images to directory                                                                                             |
| `--out-prefix <prefix>`     | string  | no       | Filename prefix (default: image)                                                                                         |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 3)                                                                               |
| `--api-key <key>`           | string  | no       | API key                                                                                                                  |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                             |

#### Examples

```bash
bl image generate --prompt "A cat in a spacesuit on Mars"
```

```bash
bl image generate --prompt "Logo design" --n 3 --out-dir ./generated/
```

```bash
bl image generate --prompt "Mountain landscape" --size 2688*1536
```

```bash
bl image generate --prompt "A castle" --seed 42 --prompt-extend false
```

```bash
bl image generate --prompt "Logo" --watermark false
```

```bash
bl image generate --prompt "An alien in the space" --watermark false
```

```bash
bl image generate --prompt "sunset" --model wan2.6-t2i --async --quiet
```

```bash
bl image generate --prompt "Pro quality" --model qwen-image-2.0-pro
```

```bash
bl image generate --prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel
```
