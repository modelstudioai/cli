# `bl image` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command              | Authentication | Description                                                          |
| -------------------- | -------------- | -------------------------------------------------------------------- |
| `bl image edit`      | API Key        | Edit an existing image with text instructions (Qwen-Image / Wan 2.7) |
| `bl image generate`  | API Key        | Generate images (Qwen-Image / wan2.x)                                |
| `bl image translate` | API Key        | Translate text in an image (Qwen-MT-Image)                           |

## Command details

### `bl image edit`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `image edit`                                                         |
| **Description**    | Edit an existing image with text instructions (Qwen-Image / Wan 2.7) |
| **Authentication** | API Key                                                              |
| **Usage**          | `bl image edit --image <url> --prompt <text> [flags]`                |

#### Flags

| Flag                        | Type    | Required | Description                                                                                       |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------- |
| `--image <url>`             | array   | yes      | Source image URL or local file path (repeatable for multi-image merge)                            |
| `--prompt <text>`           | string  | yes      | Edit instruction text                                                                             |
| `--model <model>`           | string  | no       | Model ID (default: qwen-image-3.0)                                                                |
| `--size <W*H>`              | string  | no       | Output image size: ratio (3:4, 16:9) or pixels (2048*2048)                                        |
| `--n <count>`               | number  | no       | Number of images (default: 1, max: 6)                                                             |
| `--seed <n>`                | number  | no       | Random seed for reproducible results                                                              |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                                                       |
| `--function <name>`         | string  | no       | wanx*-imageedit function (default: description_edit). Examples: stylization_all, description_edit |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag to use CLI default (true).                           |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true).        |
| `--out-dir <dir>`           | string  | no       | Download images to directory                                                                      |
| `--out-prefix <prefix>`     | string  | no       | Filename prefix (default: edited)                                                                 |
| `--async`                   | switch  | no       | Return async task id without waiting                                                              |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                              |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 3)                                                        |
| `--api-key <key>`           | string  | no       | API key                                                                                           |
| `--base-url <url>`          | string  | no       | API base URL                                                                                      |

#### Notes

- Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set; MCP-incompatible flags fail fast with a usage error instead of falling back to REST. Auto edit accepts a single --image only.

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
bl image edit --image ./photo.png --prompt "Place the subject on a table" --model wan2.5-i2i-preview
```

```bash
bl image edit --image ./photo.png --prompt "Convert to a picture-book style" --model wanx2.1-imageedit --function stylization_all
```

```bash
bl image edit --image ./photo.png --prompt "Replace the background with a beach" --watermark false
```

### `bl image generate`

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| **Name**           | `image generate`                            |
| **Description**    | Generate images (Qwen-Image / wan2.x)       |
| **Authentication** | API Key                                     |
| **Usage**          | `bl image generate --prompt <text> [flags]` |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                              |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--prompt <text>`           | string  | yes      | Image description                                                                                                        |
| `--model <model>`           | string  | no       | Model ID (default: qwen-image-3.0)                                                                                       |
| `--size <W*H>`              | string  | no       | Image size: ratio (3:4, 16:9, 1:1) or pixels (2048*2048)                                                                 |
| `--n <count>`               | number  | no       | Number of images per request (default: 1, max: 6)                                                                        |
| `--seed <n>`                | number  | no       | Random seed for reproducible generation                                                                                  |
| `--negative-prompt <text>`  | string  | no       | Negative prompt to exclude unwanted content                                                                              |
| `--prompt-extend <bool>`    | boolean | no       | Enable prompt extend (true/false). Omit flag: true for qwen-image sync; parameter omitted on async models (API default). |
| `--watermark <bool>`        | boolean | no       | Enable watermark (true/false). Omit flag to use the Profile setting or CLI default (true).                               |
| `--async`                   | switch  | no       | Return async task id without waiting                                                                                     |
| `--concurrent <n>`          | number  | no       | Run N parallel requests (default: 1)                                                                                     |
| `--out-dir <dir>`           | string  | no       | Download images to directory                                                                                             |
| `--out-prefix <prefix>`     | string  | no       | Filename prefix (default: image)                                                                                         |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 3)                                                                               |
| `--api-key <key>`           | string  | no       | API key                                                                                                                  |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                             |

#### Notes

- Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.

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
bl image generate --prompt "plush doll" --model z-image-turbo --size 1024*1024
```

```bash
bl image generate --prompt "sunset" --model wanx2.0-t2i-turbo --size 1024*1024
```

```bash
bl image generate --prompt "Pro quality" --model qwen-image-2.0-pro
```

```bash
bl image generate --prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel
```

### `bl image translate`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `image translate`                                                       |
| **Description**    | Translate text in an image (Qwen-MT-Image)                              |
| **Authentication** | API Key                                                                 |
| **Usage**          | `bl image translate --image <url-or-path> --target-lang <lang> [flags]` |

#### Flags

| Flag                        | Type    | Required | Description                                                        |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------ |
| `--image <url-or-path>`     | string  | yes      | Image URL or local file                                            |
| `--source-lang <lang>`      | string  | no       | Source language name or code (default: auto)                       |
| `--target-lang <lang>`      | string  | yes      | Target language name or code                                       |
| `--model <model>`           | string  | no       | Model ID (default: qwen-mt-image; optional: qwen-mt-image-2.0)     |
| `--domain-hint <text>`      | string  | no       | English domain hint (maps to ext.domainHint)                       |
| `--term <source=target>`    | array   | no       | Terminology pair source=target (repeatable; maps to terminologies) |
| `--image-segment <bool>`    | boolean | no       | Skip translating text on image subjects (ext.config.imageSegment)  |
| `--out-dir <path>`          | string  | no       | Download directory                                                 |
| `--async`                   | switch  | no       | Return async task id without waiting                               |
| `--poll-interval <seconds>` | number  | no       | Polling interval when waiting (default: 5)                         |
| `--api-key <key>`           | string  | no       | API key                                                            |
| `--base-url <url>`          | string  | no       | API base URL                                                       |

#### Notes

- Always submits asynchronously. Use --async to return the task ID immediately, or wait and download the translated JPG. Query with `video task get --task-id`. Local files upload to temporary OSS (requires OssResourceResolve).

#### Examples

```bash
bl image translate --image ./poster.png --target-lang en --dry-run --output json
```

```bash
bl image translate --image https://example.com/poster.png --source-lang zh --target-lang en --async --output json
```

```bash
bl image translate --image https://example.com/poster.png --target-lang en --term "百炼=Bailian" --domain-hint "ecommerce"
```
