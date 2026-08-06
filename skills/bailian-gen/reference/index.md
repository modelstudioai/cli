# `bailian-gen` command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
This index only covers groups owned by this skill. Other `bl` groups live in sibling bailian-\* skills.
Use this index for the skill-scoped quick index and global flags.

## Quick index

| Command                | Description                                                                                           | Detail                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| `bl image edit`        | Edit an existing image with text instructions (Qwen-Image / Wan 2.7)                                  | [image.md](image.md)   |
| `bl image generate`    | Generate images (Qwen-Image / wan2.x)                                                                 | [image.md](image.md)   |
| `bl omni`              | Multimodal chat with text + audio output (Qwen-Omni)                                                  | [omni.md](omni.md)     |
| `bl speech recognize`  | Recognize speech from audio files (FunAudio-ASR)                                                      | [speech.md](speech.md) |
| `bl speech synthesize` | Synthesize speech from text (CosyVoice TTS)                                                           | [speech.md](speech.md) |
| `bl video download`    | Download a completed video by task ID                                                                 | [video.md](video.md)   |
| `bl video edit`        | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)                | [video.md](video.md)   |
| `bl video generate`    | Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v)            | [video.md](video.md)   |
| `bl video ref`         | Reference-to-video generation (happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice | [video.md](video.md)   |
| `bl video task get`    | Query async task status                                                                               | [video.md](video.md)   |
| `bl vision describe`   | Describe an image or video using Qwen-VL                                                              | [vision.md](vision.md) |

## By group

| Group    | Commands                                          | Reference              |
| -------- | ------------------------------------------------- | ---------------------- |
| `image`  | `edit`, `generate`                                | [image.md](image.md)   |
| `omni`   | `(root)`                                          | [omni.md](omni.md)     |
| `speech` | `recognize`, `synthesize`                         | [speech.md](speech.md) |
| `video`  | `download`, `edit`, `generate`, `ref`, `task get` | [video.md](video.md)   |
| `vision` | `describe`                                        | [vision.md](vision.md) |

## Global flags

Available on every command (in addition to command-specific flags):

| Flag                  | Type   | Required | Description                           |
| --------------------- | ------ | -------- | ------------------------------------- |
| `--output <format>`   | string | no       | Output format: text, json             |
| `--timeout <seconds>` | number | no       | Request timeout                       |
| `--quiet`             | switch | no       | Suppress non-essential output         |
| `--verbose`           | switch | no       | Print HTTP request/response details   |
| `--dry-run`           | switch | no       | Dry run mode                          |
| `--config <name>`     | string | no       | Use a config profile for this command |
| `--help`              | switch | no       | Show help                             |
| `--version`           | switch | no       | Print version                         |

## Model auth flags

Available on model-domain commands (API-key auth); also listed per command below:

| Flag               | Type   | Required | Description  |
| ------------------ | ------ | -------- | ------------ |
| `--api-key <key>`  | string | no       | API key      |
| `--base-url <url>` | string | no       | API base URL |

## Console auth flags

Available on console-domain commands (console login auth); also listed per command below:

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

## OpenAPI auth flags

Available on OpenAPI-domain commands (AK/SK auth); also listed per command below:

| Flag                        | Type   | Required | Description                                                            |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--access-key-id <key>`     | string | no       | Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)         |
| `--access-key-secret <key>` | string | no       | Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET) |
| `--security-token <token>`  | string | no       | Alibaba Cloud STS Security Token (env: ALIBABA_CLOUD_SECURITY_TOKEN)   |

## Notes

- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.
- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.
- Token Plan commands use OpenAPI AK/SK via `bl auth login --open-api` or `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`.
- Default output: **text** unless explicitly set to `json` with `--output`, `DASHSCOPE_OUTPUT`, or config.
