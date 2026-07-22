# bailian-cli (`bl`) command reference

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Command **details** are in sibling `<group>.md` files in this directory.
Use this index for the full quick index and global flags.

## Quick index

| Command                         | Description                                                                                                                     | Detail                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `bl advisor recommend`          | Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking)                                  | [advisor.md](advisor.md)       |
| `bl app call`                   | Call a Bailian application (agent or workflow)                                                                                  | [app.md](app.md)               |
| `bl app list`                   | List Bailian applications                                                                                                       | [app.md](app.md)               |
| `bl auth generate-access-token` | Generate a CLI access token using OpenAPI AK/SK                                                                                 | [auth.md](auth.md)             |
| `bl auth login`                 | Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist)                                    | [auth.md](auth.md)             |
| `bl auth logout`                | Clear stored credentials; full logout also clears the model Base URL                                                            | [auth.md](auth.md)             |
| `bl auth status`                | Show current authentication state                                                                                               | [auth.md](auth.md)             |
| `bl config agent`               | Configure a coding agent to use DashScope API                                                                                   | [config.md](config.md)         |
| `bl config list`                | List config profiles and show the active profile                                                                                | [config.md](config.md)         |
| `bl config set`                 | Set a config value                                                                                                              | [config.md](config.md)         |
| `bl config show`                | Display current configuration                                                                                                   | [config.md](config.md)         |
| `bl config ui`                  | Open a local web UI to manage config profiles                                                                                   | [config.md](config.md)         |
| `bl config use`                 | Set the active config profile                                                                                                   | [config.md](config.md)         |
| `bl console call`               | Call a Bailian console API via the CLI gateway                                                                                  | [console.md](console.md)       |
| `bl dataset delete`             | Delete a dataset file by ID                                                                                                     | [dataset.md](dataset.md)       |
| `bl dataset get`                | Get details of a single dataset file                                                                                            | [dataset.md](dataset.md)       |
| `bl dataset list`               | List uploaded dataset files                                                                                                     | [dataset.md](dataset.md)       |
| `bl dataset upload`             | Upload a dataset file (.jsonl or .zip) to Bailian                                                                               | [dataset.md](dataset.md)       |
| `bl dataset validate`           | Locally validate a dataset file (.jsonl or .zip) without uploading                                                              | [dataset.md](dataset.md)       |
| `bl deploy audio create`        | Create an audio (TTS) model deployment                                                                                          | [deploy.md](deploy.md)         |
| `bl deploy delete`              | Delete a model deployment (must be STOPPED or FAILED)                                                                           | [deploy.md](deploy.md)         |
| `bl deploy get`                 | Get details of a single model deployment                                                                                        | [deploy.md](deploy.md)         |
| `bl deploy image create`        | Create an image generation model deployment                                                                                     | [deploy.md](deploy.md)         |
| `bl deploy list`                | List model deployments                                                                                                          | [deploy.md](deploy.md)         |
| `bl deploy models`              | List models available for deployment                                                                                            | [deploy.md](deploy.md)         |
| `bl deploy scale`               | Scale a deployment's capacity                                                                                                   | [deploy.md](deploy.md)         |
| `bl deploy text create`         | Create a text model deployment                                                                                                  | [deploy.md](deploy.md)         |
| `bl deploy update`              | Update a deployment's rate limits (rpm_limit / tpm_limit)                                                                       | [deploy.md](deploy.md)         |
| `bl file upload`                | Upload a local file to DashScope temporary storage (48h)                                                                        | [file.md](file.md)             |
| `bl finetune audio create`      | Create an audio TTS model fine-tune job (sft-lora)                                                                              | [finetune.md](finetune.md)     |
| `bl finetune cancel`            | Cancel a running fine-tune job                                                                                                  | [finetune.md](finetune.md)     |
| `bl finetune capability`        | Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it) | [finetune.md](finetune.md)     |
| `bl finetune checkpoints`       | List checkpoints produced by a fine-tune job                                                                                    | [finetune.md](finetune.md)     |
| `bl finetune delete`            | Delete a fine-tune job record                                                                                                   | [finetune.md](finetune.md)     |
| `bl finetune export`            | Publish a checkpoint as a deployable model                                                                                      | [finetune.md](finetune.md)     |
| `bl finetune get`               | Get details of a single fine-tune job                                                                                           | [finetune.md](finetune.md)     |
| `bl finetune image create`      | Create an image generation model fine-tune job (sft-lora)                                                                       | [finetune.md](finetune.md)     |
| `bl finetune list`              | List fine-tune jobs                                                                                                             | [finetune.md](finetune.md)     |
| `bl finetune logs`              | Fetch training logs for a fine-tune job                                                                                         | [finetune.md](finetune.md)     |
| `bl finetune text create`       | Create a text model fine-tune job (sft \| sft-lora \| dpo \| dpo-lora \| cpt)                                                   | [finetune.md](finetune.md)     |
| `bl finetune watch`             | Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.                      | [finetune.md](finetune.md)     |
| `bl image edit`                 | Edit an existing image with text instructions (Qwen-Image / Wan 2.7)                                                            | [image.md](image.md)           |
| `bl image generate`             | Generate images (Qwen-Image / wan2.x)                                                                                           | [image.md](image.md)           |
| `bl knowledge chat`             | Chat with a Bailian knowledge base (RAG Q&A with streaming)                                                                     | [knowledge.md](knowledge.md)   |
| `bl knowledge retrieve`         | Retrieve from a Bailian knowledge base (deprecated, use `search` instead)                                                       | [knowledge.md](knowledge.md)   |
| `bl knowledge search`           | Search a Bailian knowledge base (RAG semantic retrieval)                                                                        | [knowledge.md](knowledge.md)   |
| `bl mcp call`                   | Call a tool on an MCP server (tools/call)                                                                                       | [mcp.md](mcp.md)               |
| `bl mcp list`                   | List MCP servers activated under your Bailian account                                                                           | [mcp.md](mcp.md)               |
| `bl mcp tools`                  | List tools exposed by an MCP server (tools/list)                                                                                | [mcp.md](mcp.md)               |
| `bl memory add`                 | Add memory from messages or custom content                                                                                      | [memory.md](memory.md)         |
| `bl memory delete`              | Delete a memory node                                                                                                            | [memory.md](memory.md)         |
| `bl memory list`                | List memory nodes for a user                                                                                                    | [memory.md](memory.md)         |
| `bl memory profile create`      | Create a user profile schema for memory profiling                                                                               | [memory.md](memory.md)         |
| `bl memory profile get`         | Get user profile by schema ID and user ID                                                                                       | [memory.md](memory.md)         |
| `bl memory search`              | Search memory nodes by query or messages                                                                                        | [memory.md](memory.md)         |
| `bl memory update`              | Update a memory node content                                                                                                    | [memory.md](memory.md)         |
| `bl model list`                 | Browse model families or show detailed model info in the Bailian model marketplace                                              | [model.md](model.md)           |
| `bl omni`                       | Multimodal chat with text + audio output (Qwen-Omni)                                                                            | [omni.md](omni.md)             |
| `bl pipeline run`               | Run a pipeline workflow definition                                                                                              | [pipeline.md](pipeline.md)     |
| `bl pipeline validate`          | Validate a pipeline definition without executing                                                                                | [pipeline.md](pipeline.md)     |
| `bl plugin install`             | Install or upgrade an allowlisted Command Pack                                                                                  | [plugin.md](plugin.md)         |
| `bl plugin link`                | Link an allowlisted local Command Pack for development                                                                          | [plugin.md](plugin.md)         |
| `bl plugin list`                | List installed Command Packs and their load status                                                                              | [plugin.md](plugin.md)         |
| `bl plugin remove`              | Remove an installed Command Pack                                                                                                | [plugin.md](plugin.md)         |
| `bl quota check`                | Check current usage against rate limits                                                                                         | [quota.md](quota.md)           |
| `bl quota history`              | View quota change history                                                                                                       | [quota.md](quota.md)           |
| `bl quota list`                 | View model RPM/TPM rate limits                                                                                                  | [quota.md](quota.md)           |
| `bl quota request`              | Request a temporary quota increase                                                                                              | [quota.md](quota.md)           |
| `bl search web`                 | Search the web using DashScope MCP WebSearch service                                                                            | [search.md](search.md)         |
| `bl speech recognize`           | Recognize speech from audio files (FunAudio-ASR)                                                                                | [speech.md](speech.md)         |
| `bl speech synthesize`          | Synthesize speech from text (CosyVoice TTS)                                                                                     | [speech.md](speech.md)         |
| `bl text chat`                  | Send a chat completion (OpenAI compatible, DashScope)                                                                           | [text.md](text.md)             |
| `bl token-plan add-member`      | Add a member to a Token Plan organization                                                                                       | [token-plan.md](token-plan.md) |
| `bl token-plan assign-seats`    | Batch assign Token Plan seats to members                                                                                        | [token-plan.md](token-plan.md) |
| `bl token-plan create-key`      | Create a Token Plan API key for a seat                                                                                          | [token-plan.md](token-plan.md) |
| `bl token-plan list-seats`      | List Token Plan subscription seat details                                                                                       | [token-plan.md](token-plan.md) |
| `bl update`                     | Update the CLI to the latest version                                                                                            | [update.md](update.md)         |
| `bl usage free`                 | Query free-tier quota for models (all models if --model is omitted)                                                             | [usage.md](usage.md)           |
| `bl usage freetier`             | Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable                                      | [usage.md](usage.md)           |
| `bl usage stats`                | Query model usage statistics                                                                                                    | [usage.md](usage.md)           |
| `bl usage summary`              | Show a unified usage summary: free-tier quota and recent usage overview                                                         | [usage.md](usage.md)           |
| `bl video download`             | Download a completed video by task ID                                                                                           | [video.md](video.md)           |
| `bl video edit`                 | Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)                                          | [video.md](video.md)           |
| `bl video generate`             | Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v)                                      | [video.md](video.md)           |
| `bl video ref`                  | Reference-to-video generation (happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice                           | [video.md](video.md)           |
| `bl video task get`             | Query async task status                                                                                                         | [video.md](video.md)           |
| `bl vision describe`            | Describe an image or video using Qwen-VL                                                                                        | [vision.md](vision.md)         |
| `bl workspace init`             | Initialize Bailian workspace and activate postpaid services                                                                     | [workspace.md](workspace.md)   |
| `bl workspace list`             | List all workspaces                                                                                                             | [workspace.md](workspace.md)   |

## By group

| Group        | Commands                                                                                                                                 | Reference                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `advisor`    | `recommend`                                                                                                                              | [advisor.md](advisor.md)       |
| `app`        | `call`, `list`                                                                                                                           | [app.md](app.md)               |
| `auth`       | `generate-access-token`, `login`, `logout`, `status`                                                                                     | [auth.md](auth.md)             |
| `config`     | `agent`, `list`, `set`, `show`, `ui`, `use`                                                                                              | [config.md](config.md)         |
| `console`    | `call`                                                                                                                                   | [console.md](console.md)       |
| `dataset`    | `delete`, `get`, `list`, `upload`, `validate`                                                                                            | [dataset.md](dataset.md)       |
| `deploy`     | `audio create`, `delete`, `get`, `image create`, `list`, `models`, `scale`, `text create`, `update`                                      | [deploy.md](deploy.md)         |
| `file`       | `upload`                                                                                                                                 | [file.md](file.md)             |
| `finetune`   | `audio create`, `cancel`, `capability`, `checkpoints`, `delete`, `export`, `get`, `image create`, `list`, `logs`, `text create`, `watch` | [finetune.md](finetune.md)     |
| `image`      | `edit`, `generate`                                                                                                                       | [image.md](image.md)           |
| `knowledge`  | `chat`, `retrieve`, `search`                                                                                                             | [knowledge.md](knowledge.md)   |
| `mcp`        | `call`, `list`, `tools`                                                                                                                  | [mcp.md](mcp.md)               |
| `memory`     | `add`, `delete`, `list`, `profile create`, `profile get`, `search`, `update`                                                             | [memory.md](memory.md)         |
| `model`      | `list`                                                                                                                                   | [model.md](model.md)           |
| `omni`       | `(root)`                                                                                                                                 | [omni.md](omni.md)             |
| `pipeline`   | `run`, `validate`                                                                                                                        | [pipeline.md](pipeline.md)     |
| `plugin`     | `install`, `link`, `list`, `remove`                                                                                                      | [plugin.md](plugin.md)         |
| `quota`      | `check`, `history`, `list`, `request`                                                                                                    | [quota.md](quota.md)           |
| `search`     | `web`                                                                                                                                    | [search.md](search.md)         |
| `speech`     | `recognize`, `synthesize`                                                                                                                | [speech.md](speech.md)         |
| `text`       | `chat`                                                                                                                                   | [text.md](text.md)             |
| `token-plan` | `add-member`, `assign-seats`, `create-key`, `list-seats`                                                                                 | [token-plan.md](token-plan.md) |
| `update`     | `(root)`                                                                                                                                 | [update.md](update.md)         |
| `usage`      | `free`, `freetier`, `stats`, `summary`                                                                                                   | [usage.md](usage.md)           |
| `video`      | `download`, `edit`, `generate`, `ref`, `task get`                                                                                        | [video.md](video.md)           |
| `vision`     | `describe`                                                                                                                               | [vision.md](vision.md)         |
| `workspace`  | `init`, `list`                                                                                                                           | [workspace.md](workspace.md)   |

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
