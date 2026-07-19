# Changelog

All notable changes to the `bailian-cli` packages are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `bailian-cli`, `bailian-cli-core`, `bailian-cli-runtime`, `bailian-cli-commands`, and `knowledge-studio-cli` packages share a single version number.

[中文版](CHANGELOG.zh.md) · [README](README.md) · [Contributing](CONTRIBUTING.md)

## [1.10.0] - 2026-07-19

### Added

- **`bl config agent`** — configure Claude Code, Qwen Code, OpenCode, OpenClaw, Hermes Agent, or Codex to use DashScope in one command.

### Changed

- The Bailian CLI Skill now routes only matching Bailian and multimodal tasks to `bl`, and asks for consent before provider-neutral remote or billable calls.

### Fixed

- Full `bl auth logout` now clears the model Base URL so later logins cannot inherit a stale custom or Token Plan endpoint.

## [1.9.0] - 2026-07-17

### Added

- **Token Plan support** — log in and call supported models directly without manually configuring the endpoint.
- **Named Config Profiles** — create, switch, and manage isolated configurations; logging in to a named Profile activates it automatically.
- **Console Access Token automation** — generate and automatically refresh Console Access Tokens.
- **`bl workspace init`** — initialize a Bailian workspace and activate the required services in one workflow.

### Fixed

- Improved configuration safety and consistency, including secret masking and preservation of custom configuration fields.

## [1.8.3] - 2026-07-16

### Fixed

- Fixed `bl text chat --messages-file -` failing on Windows by treating standard input as a `/dev/stdin` file path; piped JSON messages are now read from standard input correctly. (#103)

## [1.8.2] - 2026-07-15

### Changed

- `bl model list` now defaults to JSON output; pass `--output text` for the table view.

### Fixed

- `bl model list --enrich` now returns each model's input parameter schema (predictConfig); it was previously always empty because the console gateway response envelope was not unwrapped.

## [1.8.1] - 2026-07-14

### Changed

- Expanded the Command Pack allowlist to accept an additional internal command extension.

## [1.8.0] - 2026-07-13

### Added

- **`bl model list`** — browse the Bailian model marketplace: list model families or show full details for a single family (`--model`), with filters for provider, capability, feature, and context-window, pagination (`--page` / `--page-size`), pricing, and `--enrich` for richer metadata.
- **`bl usage summary`** — a unified usage view combining free-tier quota and a recent usage overview; `--days` sets the overview window (default 7).
- **Command Pack host support** — added support for allowlisted internal command extensions.
- **Audio & image fine-tuning** — `bl finetune audio create` (CosyVoice TTS) and `bl finetune image create` (Wan image generation) join the existing text flow. `bl finetune image create` supports `--generation-type t2i|i2i` to select text-to-image or image-to-image training.
- **Audio & image deployment** — `bl deploy audio create` and `bl deploy image create` deploy fine-tuned TTS and image models as endpoints.
- **Multimodal dataset validation** — `bl dataset upload` and `bl dataset validate` now accept `.zip` archives with `tts` and `image` schemas, validate referenced media files, and allow image archives up to 1 GB.

### Changed

- **Fine-tune and deploy commands are now split by modality (BREAKING)**: `bl finetune create` → `bl finetune text create`, and `bl deploy create` → `bl deploy text create`. Update any scripts that use the old paths.
- **Deployment option renamed (BREAKING)**: `--template-id` → `--deploy-spec` on deployment creation commands.
- **Fine-tune status exit behavior changed (BREAKING)**: `bl finetune watch` no longer reserves exit code 3 for running jobs. Running and succeeded jobs return 0; failed and canceled jobs use normal CLI errors.
- `bl deploy audio create` now defaults to `--plan mu` (model-unit billing, per the CosyVoice deployment contract); text and image continue to default to `lora`.
- `bl finetune audio create` now validates CosyVoice training data: audio files must be `.wav`, each `wav_fn` must start with `train/`, and exactly one training file is accepted.
- `bl quota list` and `bl quota check` now report real RPM/TPM usage against limits, adding `RPM Left` / `TPM Left` columns with remaining-quota progress bars sourced from monitoring data.
- `bl usage free` output now shares its rendering with `bl usage summary` for consistent free-tier tables.
- `bl advisor recommend` no longer depends on a dedicated intent-detection model to analyze your request.

### Removed

- **Removed the `tongyi-intent-detect-v3` integration (BREAKING)** used by `bl advisor recommend`, along with the `intent_detect_base_url` config field and the `DASHSCOPE_INTENT_DETECT_BASE_URL` environment variable.

### Fixed

- Skill command-reference generation now reads product command maps directly from source and produces stable formatting during release checks.

## [1.7.0] - 2026-07-09

### Added

- `bl auth login --open-api` now stores Alibaba Cloud OpenAPI AK/SK credentials for Token Plan commands; `bl auth status` reports API key, console, and OpenAPI credential state separately, and `bl auth logout --open-api` clears only OpenAPI credentials.
- `kscli` help and examples now render as Knowledge Studio paths such as `kscli search`, `kscli chat`, and `kscli retrieve`, matching the standalone CLI.

### Changed

- Token Plan commands now use the shared OpenAPI AK/SK credential flow, including persisted credentials and `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET` environment variables.
- Auth flags are now scoped to the commands that can use them. Passing model, console, or OpenAPI credential flags to the wrong command now reports an unknown flag instead of being accepted and ignored.
- Help and command reference output now show only the flags that apply to each command's auth mode, making model, console, and OpenAPI credentials easier to distinguish.
- Missing required flags now return usage errors with exit code 2 instead of opening interactive prompts or printing help with exit code 0.
- Image, video, and speech task commands now use `--async` consistently for returning task IDs without waiting; `--concurrent` is shown only on commands that support parallel requests.
- Default command output is text unless `--output json`, `DASHSCOPE_OUTPUT=json`, or config explicitly requests JSON.
- Update checks are throttled to once per day and can surface in non-TTY/agent runs.
- Proxy setup now reads uppercase `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` only; lowercase proxy environment variables are ignored.
- `bl auth login` no longer prints the onboarding quick start block after a successful login.

### Removed

- Deprecated AK/SK authentication for `bl knowledge retrieve`; use DashScope API key auth for knowledge commands.
- Removed `--no-color`, `--non-interactive`, and `--no-wait`. Use `NO_COLOR=1` for plain output and `--async` for task submission without waiting.
- Removed `--yes` and interactive confirmation prompts from delete/logout commands; use `--dry-run` to preview before running destructive operations.

### Fixed

- Credential-gated `--dry-run` paths now skip auth preflight so commands such as Token Plan can print request details without configured credentials.
- `--verbose` model requests again print request method, URL, auth source, and response status details.

## [1.6.1] - 2026-07-03

### Changed

- `bl vision describe` examples and skill reference now use `qwen3-vl-plus` instead of the legacy `qwen-vl-plus` model id, matching the command's default model.

## [1.6.0] - 2026-07-02

### Added

- `bl knowledge search` — semantic search across knowledge bases using the new workspace-based RAG API. Supports `--query`, `--agent-id`, `--workspace-id`, `--image` (multimodal retrieval, repeatable), and `--query-history` (JSON conversation context for multi-turn query rewriting).
- `bl knowledge chat` — knowledge-base Q&A with SSE streaming. Supports `--message` (repeatable, with `role:content` prefix for multi-turn history), `--agent-id`, `--workspace-id`, and `--image` (multimodal). Displays real-time progress with step-change labels (retrieval, planning, generation) in interactive mode.
- `bailian-cli-core` gains new types and endpoints for the workspace-based knowledge API: `KnowledgeSearchRequest` / `KnowledgeSearchResponse`, `KnowledgeChatRequest` / `KnowledgeChatStreamChunk` / `KnowledgeChatMessage` / `KnowledgeChatContentPart`, and `knowledgeSearchEndpoint` / `knowledgeChatEndpoint`.
- `kscli` now ships `search` and `chat` commands alongside the existing `retrieve`.

### Changed

- `bl knowledge retrieve` is now marked as deprecated in its description; use `bl knowledge search` instead.
- `kscli` README (EN + ZH) updated to feature `search` and `chat` as the primary commands, with `retrieve` marked deprecated.

## [1.5.0] - 2026-07-01

### Added

- Model fine-tuning — `bl finetune`: create, list, get, watch, and cancel jobs; fetch training logs; list checkpoints; export a checkpoint as a deployable model; and query training capability (by model or by training type). Supports `sft`, `sft-lora`, `dpo`, `dpo-lora`, and `cpt` training types.
- Model deployment — `bl deploy`: create, list, get, update (rate limits), scale, and delete deployments; list deployable models and plans.
- Dataset management — `bl dataset`: upload, list, get, and delete dataset files, plus `bl dataset validate` to check a local `.jsonl` before uploading (ChatML / DPO / CPT formats).
- Token Plan management — `bl token-plan`: list subscription seats, add members, batch-assign seats, and create a per-seat API key.
- Automatic update check: after a command finishes, the CLI checks npm for a newer release (throttled) and shows an `Update available` hint; a major stable-version gap upgrades itself automatically. Skipped with `--quiet` or when running `bl update`.
- Composable packages: `bailian-cli-runtime` (CLI framework) and `bailian-cli-commands` (command library) are now published alongside `bailian-cli-core`, and a new sibling CLI `knowledge-studio-cli` (`kscli`) ships on top of them. `bl` behavior is unchanged.

### Removed

- `bl config export-schema` (exported CLI commands as Anthropic/OpenAI-compatible JSON tool schemas) has been removed.

### Fixed

- Console gateway commands (`bl console call`, etc.) now surface a readable message when the gateway returns a non-string `errorCode`, instead of `[object Object]`.

## [1.4.2] - 2026-06-24

### Added

- `bl omni --list-voices` prints the built-in output voices (ID, name, description, language) and exits without needing an API key. The built-in voice table is expanded from 6 to 17 voices, including dialect voices such as Dylan, Sunny, and Kiki.

### Changed

- `bl omni` default `--voice` is now `Tina` (previously `Cherry`). The `--voice` help points at `--list-voices` instead of listing every option inline.
- `bl speech synthesize --list-voices` and its missing-`--voice` hint now include a link to the official CosyVoice voice documentation.
- Agent skill setup guidance now covers console site selection (`--console-site domestic` / `international`) for console login and gateway commands.

### Fixed

- `bl speech synthesize` corrects the `cosyvoice-v3-flash` built-in voice ID from `longanhuan` to `longanhuan_v3`.

## [1.4.1] - 2026-06-22

### Changed

- Video generation now defaults to the upgraded HappyHorse 1.1 model for better quality. The 1.0 models are still available via `--model`.
- `bl update` now keeps the agent skill in sync across all your agent apps (Claude Code, Cursor, etc.), and refreshes it even when the CLI is already up to date.

## [1.4.0] - 2026-06-17

### Added

- Console gateway now supports multiple regions and sites: `cn-beijing` and `ap-southeast-1`, each with domestic and international variants, plus `switchAgent` for delegated access.
- New global flags `--console-region`, `--console-site`, and `--console-switch-agent`; `bl console call` also gains `--site` and `--switch-agent`.
- `bl auth login --base-url <url>` to specify the base URL when logging in with an API key.
- `bl omni` gains a `--voice` option (Chelsie, Cherry, Ethan, Serena, Sunny, Tina; default Cherry).

### Changed

- All user-facing CLI text is now standardized to English.
- `bl advisor recommend` internal intent/ranking model upgraded from `qwen-turbo` to `qwen-flash`.
- Cleaner JSON output for `usage`, `quota`, and `workspace` commands.
- `base_url` from the config file now takes priority over the `DASHSCOPE_BASE_URL` environment variable.
- `bl config show` now displays all fields from `config.json`, with sensitive values masked.

### Removed

- The legacy `region` config field and its related options.
- Invalid leftover code for the removed `model list` command.

### Fixed

- When the console session is not logged in or has expired, the CLI now shows a clear sign-in prompt instead of a generic gateway error.
- Corrected `--resolution` / `--ratio` / `--duration` flag descriptions for `bl video` commands.

## [1.3.3] - 2026-06-16

### Changed

- `bl knowledge retrieve --help` now clearly indicates that `--api-key` is the recommended authentication method; AK/SK flags are explicitly marked as deprecated with guidance to use `--api-key` instead.

### Added

- `notes` field for command definitions — commands can now include contextual notes (auth requirements, deprecation notices, etc.) that are displayed in both `--help` output and the generated reference docs.

## [1.3.2] - 2026-06-12

### Fixed

- Fixed `bl omni --audio` always returning HTTP 400 (#54); audio inputs are now understood correctly.

## [1.3.1] - 2026-06-12

### Fixed

- `bl` now honors `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables (#35). Node's built-in `fetch` (undici) ignores proxy env vars by default, causing `ECONNRESET` for users behind a VPN or corporate proxy. A global proxy dispatcher is now installed at startup when these variables are set, and the `ECONNRESET` error hint points to `export HTTPS_PROXY=http://127.0.0.1:<port>`.

## [1.3.0] - 2026-06-10

### Added

- `bl knowledge retrieve` now supports API-Key authentication (DashScope gateway), in addition to AK/SK. API-Key is auto-detected and preferred when available.
- New retrieval options: `--dense-similarity-top-k`, `--sparse-similarity-top-k`, `--rerank-model`, `--rerank-mode`, `--rerank-instruct` — supported on both API-Key and AK/SK paths.
- `DashScopeKnowledgeRetrieveRequest` / `DashScopeKnowledgeRetrieveResponse` types and `knowledgeRetrieveEndpoint` added to `bailian-cli-core`.
- Comprehensive E2E tests for knowledge retrieve covering both auth paths, dry-run, rerank flags, and error cases.

- `bl usage` command group:
  - `bl usage free` — query free-tier quota for all models (or a specific model with `--model`).
  - `bl usage freetier` — enable (`--on`) or disable (`--off`) auto-stop for free-tier models.
  - `bl usage stats` — query model usage statistics (requires `--workspace-id`).
- `bl quota` command group:
  - `bl quota list` — view model RPM/TPM rate limits (filter with `--model`, show all with `--all`).
  - `bl quota check` — check current RPM/TPM usage against rate limits.
  - `bl quota history` — view quota change history with pagination.
  - `bl quota request` — request a temporary quota increase for a model.
- `bl workspace list` — list all workspaces with region and endpoint details.

### Changed

- Credential resolution priority: explicit API-Key → explicit AK/SK flags → auto-detected API-Key → fallback AK/SK from config/env.
- `--workspace-id` is now only required for AK/SK auth, no longer mandatory for API-Key mode.
- `--top-k` deprecated in favor of `--rerank-top-n`; emits a warning and maps to `--rerank-top-n` when used.
- `--access-key-id` / `--access-key-secret` flags marked as deprecated (API-Key is recommended).
- API Key and console links updated to direct key management pages across all docs.

### Fixed

- `--rerank` flag in AK/SK path now correctly sets `EnableReranking` instead of the non-functional `Rerank: true` boolean.

## [1.2.1] - 2026-06-09

### Changed

- Skill install command updated from `npx skills add modelstudioai/skills` to `npx skills add modelstudioai/cli --all -g` across all READMEs and docs.
- `bl update` now automatically updates the `bailian-cli` agent skill after CLI upgrade.
- Renamed `README_CN.md` to `README.zh.md` (ISO 639 convention) across the entire repo.

### Added

- Official skill (`skills/bailian-cli/`) now ships in this repository with pre-commit auto-generation of reference docs and SKILL.md version sync.
- Bilingual READMEs (EN + CN) for the `bailian-cli` skill.

## [1.2.0] - 2026-06-05

### Added

- `bl mcp` command group: `bl mcp list` to list MCP servers, `bl mcp tools <server>` to inspect available tools, and `bl mcp call <server>.<tool>` to invoke a tool with `--arg k=v` or `--json`.
- `bl advisor recommend` — describe your task in natural language and get intelligent model recommendations ranked by fit, with context-window, pricing, and capability details.

### Fixed

- Image/video watermark was always on regardless of config; now respects `bl config set watermark false`.
- Paired flags (e.g. `--watermark` / `--no-watermark`) are properly mutually exclusive.
- Null-value flag validation no longer crashes on missing optional arguments.
- **Security**: credentials no longer leak to on-disk logs; file permissions tightened.
- **Security**: `base_url` / `console_gateway_url` validated as real HTTP(S) URLs.
- **Security**: script/JS `code` fields require a string literal (blocks untrusted-code RCE).
- **Security**: URL path segments are percent-encoded; SSE buffer is bounded.
- **Security**: pipeline planning, pointer traversal, and concurrency hardened.
- MCP commands now handle auth _after_ arg validation and dry-run checks.

### Changed

- Flag default-value text is now unified and de-duplicated across all commands.
- Illegal/unknown flag names surface a clear error instead of silently ignoring.

## [1.1.3] - 2026-06-02

### Added

- `bl auth login --console` now also obtains and saves a DashScope API key when none is configured, so a single browser login covers both OAuth and API-key setup.

### Changed

- API-key validation is more resilient: retries on transient network / 401 / 5xx errors and caps each attempt at 30s.

## [1.1.2] - 2026-05-29

### Changed

- Default vision model upgraded from `qwen-vl` to `qwen3-vl-plus` for stronger visual reasoning and chart/document parsing.

### Fixed

- TypeScript / lint issues surfaced after the 1.1.0 open-source cut.

## [1.1.1] - 2026-05-29

Documentation-only release. No CLI or SDK behavior changes.

### Added

- `INSTALL.md` with AI-Agent-driven installation instructions.

### Changed

- README cross-links between root and `packages/cli` are now in sync; CN README aligned with EN.
- Removed unpkg links from README in favor of canonical sources.
- `tools/release.mjs` now asserts root and `packages/cli` READMEs stay in sync before publishing.

### Fixed

- `tools/release.mjs check` now builds packages before running type checks, so `bailian-cli-core` resolves correctly from a clean checkout (previously cascaded into ~80 spurious TS errors).

## [1.1.0] - 2026-05-28

Initial public release on GitHub. The CLI was previously developed internally; this is the first version published as open source under Apache-2.0.

### Added

Out-of-the-box capabilities your AI agent can compose across complex tasks:

**Model services**

| Capability           | Default                     | Description                                                                                     |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Text generation      | `qwen3.7-max`               | Flagship Max model for the agent era — strong at coding, office work, and long-horizon autonomy |
| Speech synthesis     | `cosyvoice-v3-flash`        | Multi-voice real-time streaming TTS with enhanced naturalness/emotion; clone from 5–20s samples |
| Speech recognition   | `fun-asr`                   | 7 Chinese dialects + 20+ Mandarin accents; covers 30 languages                                  |
| Image generation     | `qwen-image-2.0`            | Fused generation & editing, pro text rendering, photorealism, strong semantic adherence         |
| Image editing        | `qwen-image-2.0`            | Smart editing with multi-image composition                                                      |
| Image-to-video       | `happyhorse-1.0-i2v`        | Faithful text-semantic interpretation, smooth high-quality output                               |
| Text-to-video        | `happyhorse-1.0-t2v`        | Vivid motion reproduction with rich detail                                                      |
| Reference-to-video   | `happyhorse-1.0-r2v`        | Up to 9 reference images; stable subject & scene preservation                                   |
| Video editing        | `happyhorse-1.0-video-edit` | Natural-language video editing, up to 5 reference images                                        |
| Vision understanding | `qwen-vl`                   | Long-form video analysis, chart/document parsing, visual reasoning, multilingual OCR            |

**Application data**

| Capability     | Default                       | Description                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------------ |
| Knowledge base | Aliyun Model Studio Knowledge | Multimodal RAG CRUD and retrieval; requires AccessKey        |
| Memory         | Aliyun Model Studio Memory    | Cross-session persistence for personalized coherent dialogue |

**Application building**

| Capability     | Default          | Description                    |
| -------------- | ---------------- | ------------------------------ |
| Workflow calls | Workflow service | Invoke published workflow apps |
| Agent calls    | Agent service    | Invoke published agent apps    |

**Tools**

| Capability       | Default                                | Description                                                                   |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Web search       | `bailian_web_search`                   | Real-time internet retrieval for accuracy and freshness                       |
| Temp file upload | Temp upload service                    | Free temp storage; upload local files for URLs (48-hour validity)             |
| Free-quota query | Quota query                            | Check available free-tier quota by model id                                   |
| API reference    | Aliyun Model Studio API reference docs | Auto-integrate Aliyun Model Studio model and app capability APIs during build |
