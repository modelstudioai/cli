<div align="center">

<img src="https://img.alicdn.com/imgextra/i1/O1CN01kGgO3z1N30OINgUoG_!!6000000001513-2-tps-1915-821.png" alt="Aliyun Model Studio CLI" />

**The official command-line interface for Aliyun Model Studio (DashScope) AI Platform**

[![npm version](https://img.shields.io/npm/v/bailian-cli?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli?source_channel=cli_github&) · [中文文档](https://github.com/modelstudioai/cli/blob/main/README.zh.md) · [API Documentation](https://help.aliyun.com/zh/model-studio/) · [Get API Key](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key)

---

_Chat with Qwen, generate images & videos, understand images, call agents,_
_manage memory, search the web — all from your terminal._

_Built for AI Agents. Every command works as a structured tool call._

</div>

## Features

Equip your AI Agent out-of-the-box with these capabilities, composable across complex tasks:

- **Text chat** — Qwen3.8-max: major gains in agentic coding, frontend coding, and vibe coding
- **Multimodal (Omni)** — Full omni-modal support across text + image + audio + video
- **Image generation & editing** — Qwen-Image 3.0: pro text rendering, photorealism, strong semantic adherence, multi-image composition
- **Video generation & editing** — happyhorse-1.1 series: text-/image-/reference-to-video and natural-language video editing (up to 9-image reference)
- **Speech synthesis & recognition** — CosyVoice streaming TTS, voice cloning from 5–20s samples; FunAudio-ASR covers 30 languages including 7 Chinese dialects and 20+ Mandarin accents
- **Image & video understanding** — Qwen-VL: long-form video analysis, chart/document parsing, visual reasoning, multilingual OCR
- **Coding agent setup** — Configure Claude Code, Qwen Code, OpenCode, OpenClaw, Hermes Agent, or Codex to use DashScope with `bl config agent`

> **Note:** The features below are currently available only to China site (aliyun.com) account holders and are not yet supported for international / global site accounts.

- **Knowledge base & memory** — Multimodal RAG retrieval and cross-session memory for personalized, coherent dialogue
- **App calls** — Invoke agents and workflows already published on Aliyun Model Studio
- **MCP integration** — Orchestrate Bailian MCP servers: list services, inspect tools, and invoke any tool directly from the terminal
- **Web search** — Real-time internet retrieval for up-to-date, accurate answers
- **Model recommendation** — Describe your scenario and get best-fit model suggestions; supports scoped search, model comparison, and alternative discovery
- **Fine-tuning & deployment** — Upload datasets, create text/audio/image fine-tune jobs (`finetune text|audio|image create`; text covers SFT/LoRA/DPO/CPT), probe job status non-blockingly (`finetune watch`), query per-model training capability (`finetune capability`), and deploy trained models as endpoints (`deploy text|audio|image create`)
- **Console capabilities** — Browse the model marketplace (`model list`) and Bailian apps (`app list`), review a unified usage view (`usage summary`), check free-tier quota (`usage free`), view model usage statistics (`usage stats`), manage workspaces (`workspace list`), and manage rate limits (`quota list/request/check/history`)
- **Local file auto-upload** — Every URL parameter accepts a local path; uploaded to free temp storage with 48-hour validity

## Showcase: One-Sentence Cinematic Video

<p align="center">
  <a href="https://cloud.video.taobao.com/vod/dS2F4huqbw5Nfe5L3wwb3grz2q2DNYD3retq8dU-iHo.mp4">
    <img src="https://img.alicdn.com/imgextra/i1/O1CN01Q5052k232Hd36NodG_!!6000000007197-0-tps-2940-1656.jpg" alt="Click to play the demo video" width="720" />
  </a>
</p>

<p align="center"><i>👆 Click the cover to play the full 2-minute demo</i></p>

A complete **2-minute, 16:9 cinematic short film** — produced end-to-end from a single natural-language sentence, with **zero manual editing**. This showcase demonstrates how an AI Agent can compose a multi-step creative pipeline by orchestrating three primitives:

- **[Qwen Code](https://github.com/QwenLM/qwen-code)** — the agentic coding model that interprets the user's intent and drives the workflow
- **[Aliyun Model Studio CLI](https://bailian.console.aliyun.com/cli?source_channel=cli_github&)** — invokes **HappyHorse 1.1**, Aliyun Model Studio's text-/image-/reference-to-video generation model
- **[spark-video Skill](https://github.com/JohnKeating1997/spark-video)** — handles scene decomposition, storyboarding, shot continuity, and final stitching

### The single prompt

> _"Generate a roughly 2-minute video in Japanese cinematic style — a sweet, innocent first-love story about a high-school girl. The plot should be heart-fluttering enough to make viewers want to fall in love. Aspect ratio: 16:9."_
>
> _(Original: "帮我生成一段日系影视风格，高中女生的青涩初恋故事，剧情高甜，让人看了想谈恋爱，2分钟左右的视频，尺寸是16:9")_

### How it works

1. **Qwen Code** parses the request, plans the narrative beats, and decides which tools to call.
2. The **spark-video Skill** breaks the story into shots, writes per-shot prompts, and enforces visual continuity (characters, lighting, palette, lens language).
3. **`bl video generate`** dispatches each shot to **HappyHorse 1.1** in parallel.
4. The skill stitches all clips back together into a single 16:9 / ~2-min deliverable.

No timeline scrubbing. No frame-by-frame editing. Just one sentence → one video.

## Installation

```bash
# Recommended — no Node required
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash

# Windows (PowerShell)
irm https://bailian.aliyun.com/cli/install.ps1 | iex

# Node users / developers (Node.js >= 18.17)
npm install -g bailian-cli

# Agent skills
npx skills add modelstudioai/cli --all -g
```

> Binary install does not require Node.js. `npm install -g` remains fully supported.

## Quick Start

```bash
# Authenticate, recommended
bl auth login --console

# Or authenticate with an API key
bl auth login --api-key sk-xxxxx

# Or use Token Plan (Base URL built in; the key is tested during login)
bl auth login --config token-plan --api-key sk-sp-xxxxx

# Configure a coding agent to use DashScope
bl config agent --agent codex --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxxxx --model qwen3-coder-plus

# Chat with Qwen
bl text chat --message "What is DashScope?"

# Multimodal chat (text + image + audio + video)
bl omni --message "Describe this image" --image ./photo.jpg

# Generate an image
bl image generate --prompt "A cat in a spacesuit" --out-dir ./images/

# Generate a video from local image
bl video generate --image ./cat.png --prompt "Make the cat move" --download cat.mp4

# Model recommendation — find the best model for your use case
bl advisor recommend --message "I need a visual-understanding chatbot"

# Compare specific models
bl advisor recommend --message "qwen-max vs deepseek-v3 for code generation"

# Browser login (required for console capability commands)
bl auth login --console

# Fine-tune & deploy — a one-shot train-to-serve workflow
bl dataset upload --file ./train.jsonl                 # Upload a .jsonl dataset (validated first)
bl finetune text create --model qwen3-8b --datasets ./train.jsonl --training-type sft-lora  # Local paths auto-upload
bl finetune watch --job-id ft-xxx --output json       # Non-blocking probe (running/succeeded return 0; failed/canceled report an error)
bl finetune capability --model qwen3-8b               # Which training types a model supports
bl deploy text create --model qwen3-8b --name my-svc --plan mu  # Deploy the trained model as an endpoint

# Browse models / apps / free-tier quota / usage statistics / workspaces
bl model list                                        # Browse model families and pricing
bl app list
bl usage summary                                     # Unified view: free-tier quota + recent usage overview
bl usage free                                         # Free-tier quota across models (add --model/--expiring/--sort)
bl usage stats --workspace-id <id>                    # Model usage statistics (add --model for per-model)
bl workspace list                                     # List all workspaces

# Rate limit management (list / check / request / history)
bl quota list                                         # View RPM/TPM limits (add --model to filter)
bl quota check                                        # Current usage vs rate limits (add --model/--period)
bl quota request --model qwen3.6-plus --tpm 6000000   # Request a temporary TPM increase
bl quota history                                      # View quota-change history

# Token Plan team management (requires AK/SK, see auth below)
bl token-plan list-seats                                # View subscription seat details
bl token-plan add-member --account-name dev --org-id org_xxx
bl token-plan assign-seats --workspace-id ws_xxx --seat-type standard --account-id acc_xxx
bl token-plan create-key --account-id acc_xxx --workspace-id ws_xxx
```

> More examples and scenarios: [Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli?source_channel=cli_github&)

## Authentication

### DashScope API Key

Required for most commands. Get your key from the [DashScope Console](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key).

```bash
# Option 1: Environment variable
export DASHSCOPE_API_KEY=sk-xxxxx

# Option 2: Login command (persisted to ~/.bailian/config.json)
bl auth login --api-key sk-xxxxx

# Option 3: Per-command flag
bl text chat --api-key sk-xxxxx --message "Hello"
```

### Token Plan API Key

Get or copy the API key from the [Token Plan subscription overview](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview).
The CLI has the default Token Plan Base URL built in. Login tests the key first, then saves and activates the `token-plan` config only when validation succeeds.

```bash
bl auth login --config token-plan --api-key sk-sp-xxxxx
```

### Console Login (OAuth)

Required for console capability commands (`model list`, `app list`, `usage summary/free/stats`, `workspace list`, `quota list/request/check/history`). Opens the Bailian console in your browser to sign in.

```bash
bl auth login --console
```

### Alibaba Cloud OpenAPI AK/SK (Token Plan only)

Required for the `token-plan` command group. Get your AccessKey from [RAM Console](https://ram.console.aliyun.com/manage/ak).

> Recommended: create a RAM sub-account with minimum privileges instead of using the root account's AK/SK.

```bash
# Option 1: Login command (persisted to ~/.bailian/config.json)
bl auth login --open-api --access-key-id LTAI5t... --access-key-secret ...

# Option 2: Environment variables
export ALIBABA_CLOUD_ACCESS_KEY_ID=LTAI5t...
export ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
export BAILIAN_WORKSPACE_ID=ws-...
```

## Configuration

```bash
# View current config
bl config show

# Set defaults
bl config set --key base_url --value https://dashscope-us.aliyuncs.com
bl config set --key default_text_model --value qwen-turbo
bl config set --key timeout --value 600

# Self-update to latest or a specific version
bl update
bl update --to 0.1.14
```

Config file location: `~/.bailian/config.json`

## Links

| Resource                     | URL                                                                                       |
| :--------------------------- | :---------------------------------------------------------------------------------------- |
| Aliyun Model Studio CLI Site | https://bailian.console.aliyun.com/cli?source_channel=cli_github&                         |
| DashScope API Docs           | https://help.aliyun.com/zh/model-studio/                                                  |
| Qwen Model List              | https://help.aliyun.com/zh/model-studio/getting-started/models                            |
| Aliyun Model Studio Console  | https://bailian.console.aliyun.com/?source_channel=cli_github                             |
| Get API Key                  | https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key |
| Get Token Plan API Key       | https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview         |
| Get AccessKey                | https://ram.console.aliyun.com/manage/ak                                                  |

## Changelog

Release notes for every version live in [CHANGELOG.md](https://github.com/modelstudioai/cli/blob/main/CHANGELOG.md).

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup, repo layout, and the workflow for adding or changing commands.
