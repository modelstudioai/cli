<div align="center">

<img src="https://img.alicdn.com/imgextra/i1/O1CN01RSQFUD1jN5IBzHORt_!!6000000004535-2-tps-2440-521.png" alt="Aliyun Model Studio CLI" width="420" />

# >\_ Aliyun Model Studio CLI

**The official command-line interface for Aliyun Model Studio (DashScope) AI Platform**

[![npm version](https://img.shields.io/npm/v/bailian-cli?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli) · [中文文档](https://github.com/modelstudioai/cli/blob/main/README_CN.md) · [API Documentation](https://help.aliyun.com/zh/model-studio/) · [Get API Key](https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key)

---

_Chat with Qwen, generate images & videos, understand images, call agents,_
_manage memory, search the web — all from your terminal._

_Built for AI Agents. Every command works as a structured tool call._

</div>

## Features

Equip your AI Agent out-of-the-box with these capabilities, composable across complex tasks:

- **Text chat** — Qwen3.7-max: major gains in agentic coding, frontend coding, and vibe coding
- **Multimodal (Omni)** — Full omni-modal support across text + image + audio + video
- **Image generation & editing** — Qwen-Image 2.0: pro text rendering, photorealism, strong semantic adherence, multi-image composition
- **Video generation & editing** — HappyHorse-1.0 series: text-/image-/reference-to-video and natural-language video editing (up to 9-image reference)
- **Speech synthesis & recognition** — CosyVoice streaming TTS, voice cloning from 5–20s samples; FunAudio-ASR covers 30 languages including 7 Chinese dialects and 20+ Mandarin accents
- **Image & video understanding** — Qwen-VL: long-form video analysis, chart/document parsing, visual reasoning, multilingual OCR
- **Knowledge base & memory** — Multimodal RAG retrieval and cross-session memory for personalized, coherent dialogue
- **App calls** — Invoke agents and workflows already published on Aliyun Model Studio
- **Web search** — Real-time internet retrieval for up-to-date, accurate answers
- **Console capabilities** — Browse Bailian apps (`app list`) and check free-tier quota (`usage free`)
- **Local file auto-upload** — Every URL parameter accepts a local path; uploaded to free temp storage with 48-hour validity

<p align="center">
  <img src="https://img.alicdn.com/imgextra/i1/O1CN01Df2LiL1IcCkXJROYz_!!6000000000913-2-tps-759-426.png" alt="bl --help" width="720" />
</p>

## Installation

```bash
npm install -g bailian-cli
npx skills add modelstudioai/skills --all -g
```

> Requires Node.js >= 22.12.

## Quick Start

```bash
# Authenticate
bl auth login --api-key sk-xxxxx

# Chat with Qwen
bl text chat --message "What is DashScope?"

# Multimodal chat (text + image + audio + video)
bl omni --message "Describe this image" --image ./photo.jpg

# Generate an image
bl image generate --prompt "A cat in a spacesuit" --out-dir ./images/

# Generate a video from local image
bl video generate --image ./cat.png --prompt "Make the cat move" --download cat.mp4

# Browser login (required for console capability commands)
bl auth login --console

# Browse apps / free-tier quota
bl app list
bl usage free --model qwen3-max
```

> More examples and scenarios: [Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli)

## Authentication

### DashScope API Key

Required for most commands. Get your key from the [DashScope Console](https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key).

```bash
# Option 1: Environment variable
export DASHSCOPE_API_KEY=sk-xxxxx

# Option 2: Login command (persisted to ~/.bailian/config.json)
bl auth login --api-key sk-xxxxx

# Option 3: Per-command flag
bl text chat --api-key sk-xxxxx --message "Hello"
```

### Console Login (OAuth)

Required for console capability commands (`app list`, `usage free`). Opens the Bailian console in your browser to sign in.

```bash
bl auth login --console
```

### Alibaba Cloud AK/SK (Knowledge Base only)

Required for `knowledge retrieve`. Get your AccessKey from [RAM Console](https://ram.console.aliyun.com/manage/ak).

> Recommended: create a RAM sub-account with minimum privileges instead of using the root account's AK/SK.

```bash
export ALIBABA_CLOUD_ACCESS_KEY_ID=LTAI5t...
export ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
export BAILIAN_WORKSPACE_ID=ws-...
```

## Configuration

```bash
# View current config
bl config show

# Set defaults
bl config set --key region --value us
bl config set --key default_text_model --value qwen-turbo
bl config set --key timeout --value 600

# Self-update to latest version
bl update
```

Config file location: `~/.bailian/config.json`

## Links

| Resource                     | URL                                                             |
| :--------------------------- | :-------------------------------------------------------------- |
| Aliyun Model Studio CLI Site | https://bailian.console.aliyun.com/cli                          |
| DashScope API Docs           | https://help.aliyun.com/zh/model-studio/                        |
| Qwen Model List              | https://help.aliyun.com/zh/model-studio/getting-started/models  |
| Aliyun Model Studio Console  | https://bailian.console.aliyun.com/                             |
| Get API Key                  | https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key |
| Get AccessKey                | https://ram.console.aliyun.com/manage/ak                        |

## Changelog

Release notes for every version live in [CHANGELOG.md](https://github.com/modelstudioai/cli/blob/main/CHANGELOG.md).

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup, repo layout, and the workflow for adding or changing commands.
