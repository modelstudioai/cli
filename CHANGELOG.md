# Changelog

All notable changes to `bailian-cli` and `bailian-cli-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The two packages share a single version number — they are always released together.

[中文版](CHANGELOG_CN.md) · [README](README.md) · [Contributing](CONTRIBUTING.md)

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
