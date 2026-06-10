# bailian-cli (`bl`) command reference

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
Use this index for the full quick index and global flags.

## Quick index

| Command                    | Description                                                                                           | Detail                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| `bl advisor recommend`     | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking)        | [advisor.md](advisor.md)     |
| `bl app call`              | Call a Bailian application (agent or workflow)                                                        | [app.md](app.md)             |
| `bl app list`              | List Bailian applications                                                                             | [app.md](app.md)             |
| `bl auth login`            | Authenticate with API key or console browser login (credentials can coexist)                          | [auth.md](auth.md)           |
| `bl auth logout`           | Clear stored credentials                                                                              | [auth.md](auth.md)           |
| `bl auth status`           | Show current authentication state                                                                     | [auth.md](auth.md)           |
| `bl config export-schema`  | Export all (or one) CLI command(s) as Anthropic/OpenAI-compatible JSON tool schemas                   | [config.md](config.md)       |
| `bl config set`            | Set a config value                                                                                    | [config.md](config.md)       |
| `bl config show`           | Display current configuration                                                                         | [config.md](config.md)       |
| `bl console call`          | Call a Bailian console API via the CLI gateway                                                        | [console.md](console.md)     |
| `bl file upload`           | Upload a local file to DashScope temporary storage (48h)                                              | [file.md](file.md)           |
| `bl image edit`            | Edit an existing image with text instructions (Qwen-Image)                                            | [image.md](image.md)         |
| `bl image generate`        | Generate images (Qwen-Image / wan2.x)                                                                 | [image.md](image.md)         |
| `bl knowledge retrieve`    | Retrieve from a Bailian knowledge base (requires AK/SK)                                               | [knowledge.md](knowledge.md) |
| `bl mcp call`              | Call a tool on an MCP server (tools/call)                                                             | [mcp.md](mcp.md)             |
| `bl mcp list`              | List MCP servers activated under your Bailian account                                                 | [mcp.md](mcp.md)             |
| `bl mcp tools`             | List tools exposed by an MCP server (tools/list)                                                      | [mcp.md](mcp.md)             |
| `bl memory add`            | Add memory from messages or custom content                                                            | [memory.md](memory.md)       |
| `bl memory delete`         | Delete a memory node                                                                                  | [memory.md](memory.md)       |
| `bl memory list`           | List memory nodes for a user                                                                          | [memory.md](memory.md)       |
| `bl memory profile create` | Create a user profile schema for memory profiling                                                     | [memory.md](memory.md)       |
| `bl memory profile get`    | Get user profile by schema ID and user ID                                                             | [memory.md](memory.md)       |
| `bl memory search`         | Search memory nodes by query or messages                                                              | [memory.md](memory.md)       |
| `bl memory update`         | Update a memory node content                                                                          | [memory.md](memory.md)       |
| `bl omni`                  | Multimodal chat with text + audio output (Qwen-Omni)                                                  | [omni.md](omni.md)           |
| `bl pipeline run`          | Run a pipeline workflow definition                                                                    | [pipeline.md](pipeline.md)   |
| `bl pipeline validate`     | Validate a pipeline definition without executing                                                      | [pipeline.md](pipeline.md)   |
| `bl quota check`           | 查看当前用量 vs 限流阈值 (Check current usage against rate limits)                                    | [quota.md](quota.md)         |
| `bl quota history`         | 查看提额历史记录 (View quota change history)                                                          | [quota.md](quota.md)         |
| `bl quota list`            | 查看模型 RPM/TPM 限流值 (View model rate limits)                                                      | [quota.md](quota.md)         |
| `bl quota request`         | 申请临时提额 (Request temporary quota increase)                                                       | [quota.md](quota.md)         |
| `bl search web`            | Search the web using DashScope MCP WebSearch service                                                  | [search.md](search.md)       |
| `bl speech recognize`      | Recognize speech from audio files (FunAudio-ASR)                                                      | [speech.md](speech.md)       |
| `bl speech synthesize`     | Synthesize speech from text (CosyVoice TTS)                                                           | [speech.md](speech.md)       |
| `bl text chat`             | Send a chat completion (OpenAI compatible, DashScope)                                                 | [text.md](text.md)           |
| `bl update`                | Update bl to the latest version                                                                       | [update.md](update.md)       |
| `bl usage free`            | Query free-tier quota for models (all models if --model is omitted)                                   | [usage.md](usage.md)         |
| `bl usage freetier`        | Enable or disable auto-stop (用完即停) for free-tier models. Enables by default; use --off to disable | [usage.md](usage.md)         |
| `bl usage stats`           | 查询模型用量统计 (Query model usage statistics)                                                       | [usage.md](usage.md)         |
| `bl video download`        | Download a completed video by task ID                                                                 | [video.md](video.md)         |
| `bl video edit`            | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)                | [video.md](video.md)         |
| `bl video generate`        | Generate a video from text or image (happyhorse-1.0-t2v / happyhorse-1.0-i2v / wan2.6-t2v)            | [video.md](video.md)         |
| `bl video ref`             | Reference-to-video generation (happyhorse-1.0-r2v / wan2.6-r2v): multi-subject, multi-shot with voice | [video.md](video.md)         |
| `bl video task get`        | Query async task status                                                                               | [video.md](video.md)         |
| `bl vision describe`       | Describe an image or video using Qwen-VL                                                              | [vision.md](vision.md)       |
| `bl workspace list`        | 列出所有业务空间 (List all workspaces)                                                                | [workspace.md](workspace.md) |

## By group

| Group       | Commands                                                                     | Reference                    |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------- |
| `advisor`   | `recommend`                                                                  | [advisor.md](advisor.md)     |
| `app`       | `call`, `list`                                                               | [app.md](app.md)             |
| `auth`      | `login`, `logout`, `status`                                                  | [auth.md](auth.md)           |
| `config`    | `export-schema`, `set`, `show`                                               | [config.md](config.md)       |
| `console`   | `call`                                                                       | [console.md](console.md)     |
| `file`      | `upload`                                                                     | [file.md](file.md)           |
| `image`     | `edit`, `generate`                                                           | [image.md](image.md)         |
| `knowledge` | `retrieve`                                                                   | [knowledge.md](knowledge.md) |
| `mcp`       | `call`, `list`, `tools`                                                      | [mcp.md](mcp.md)             |
| `memory`    | `add`, `delete`, `list`, `profile create`, `profile get`, `search`, `update` | [memory.md](memory.md)       |
| `omni`      | `(root)`                                                                     | [omni.md](omni.md)           |
| `pipeline`  | `run`, `validate`                                                            | [pipeline.md](pipeline.md)   |
| `quota`     | `check`, `history`, `list`, `request`                                        | [quota.md](quota.md)         |
| `search`    | `web`                                                                        | [search.md](search.md)       |
| `speech`    | `recognize`, `synthesize`                                                    | [speech.md](speech.md)       |
| `text`      | `chat`                                                                       | [text.md](text.md)           |
| `update`    | `(root)`                                                                     | [update.md](update.md)       |
| `usage`     | `free`, `freetier`, `stats`                                                  | [usage.md](usage.md)         |
| `video`     | `download`, `edit`, `generate`, `ref`, `task get`                            | [video.md](video.md)         |
| `vision`    | `describe`                                                                   | [vision.md](vision.md)       |
| `workspace` | `list`                                                                       | [workspace.md](workspace.md) |

## Global flags

Available on every command (in addition to command-specific options):

| Flag                  | Type    | Required | Description                          |
| --------------------- | ------- | -------- | ------------------------------------ |
| `--api-key <key>`     | string  | no       | API key                              |
| `--region <region>`   | string  | no       | API region: cn (default), us, intl   |
| `--base-url <url>`    | string  | no       | API base URL                         |
| `--output <format>`   | string  | no       | Output format: text, json            |
| `--timeout <seconds>` | number  | no       | Request timeout                      |
| `--quiet`             | boolean | no       | Suppress non-essential output        |
| `--verbose`           | boolean | no       | Print HTTP request/response details  |
| `--no-color`          | boolean | no       | Disable ANSI colors                  |
| `--dry-run`           | boolean | no       | Dry run mode                         |
| `--non-interactive`   | boolean | no       | Disable interactive prompts          |
| `--concurrent <n>`    | number  | no       | Run N parallel requests (default: 1) |
| `--help`              | boolean | no       | Show help                            |
| `--version`           | boolean | no       | Print version                        |

## Notes

- Console commands (`app list`, `usage free`, `console call`) require `bl auth login --console`.
- Most API commands use `DASHSCOPE_API_KEY` or `bl auth login --api-key`.
- Default output: **text** in TTY; **json** when piped.
