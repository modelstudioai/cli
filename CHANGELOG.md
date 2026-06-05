# Changelog

All notable changes to `bailian-cli` and `bailian-cli-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The two packages share a single version number — they are always released together.

[中文版](CHANGELOG_CN.md) · [README](README.md) · [Contributing](CONTRIBUTING.md)

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
