<div align="center">

<img src="https://img.alicdn.com/imgextra/i1/O1CN01kGgO3z1N30OINgUoG_!!6000000001513-2-tps-1915-821.png" alt="Aliyun Model Studio CLI" />

**The official command-line interface for Aliyun Model Studio (DashScope) AI Platform**

[![npm version](https://img.shields.io/npm/v/bailian-cli?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli?source_channel=cli_github&) · [中文文档](https://github.com/modelstudioai/cli/blob/main/README.zh.md) · [API Documentation](https://help.aliyun.com/zh/model-studio/) · [Get API Key](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key)

---

_Chat with Qwen, generate and edit images and videos, understand images, synthesize_
_and recognize speech, call apps, manage memory, retrieve knowledge, search the web —_
_every AI capability, one command away._

_Built for AI Agents. Every command works as a structured tool call._

</div>

## Features

- **Model generation** — Full-modality generation across text, image, video, and speech, with editing and reference-based generation
- **Asset understanding** — Parse and ask questions about images, documents, audio, and long videos
- **App orchestration** — Call Managed Agents, agents, and workflows published on Aliyun Model Studio, wired to knowledge bases, memory, web search, and MCP tools
- **Training & deployment** — Validate and upload datasets, fine-tune models, deploy dedicated models as endpoints
- **Account operations** — Login, UI-based configuration, model marketplace, usage and quota, rate-limit increases, team seat management
- **Plan onboarding** — Connect subscription plans such as Token Plan to the CLI and common coding agents in one step

> **Note:** App orchestration, training & deployment, account operations, and plan onboarding are currently available only to China site (aliyun.com) account holders and are not yet supported for international / global site accounts.

## Showcase 1: A Cinematic Short Film from One Sentence

<p align="center">
  <a href="https://cloud.video.taobao.com/vod/dS2F4huqbw5Nfe5L3wwb3grz2q2DNYD3retq8dU-iHo.mp4">
    <img src="https://img.alicdn.com/imgextra/i1/O1CN01Q5052k232Hd36NodG_!!6000000007197-0-tps-2940-1656.jpg" alt="Click to play the demo video" width="720" />
  </a>
</p>

<p align="center"><i>👆 Click the cover to play the full 2-minute demo</i></p>

A complete **2-minute, 16:9 cinematic short film** — produced end-to-end from a single natural-language sentence, with **zero manual editing**. This showcase demonstrates how an AI Agent can compose a multi-step creative pipeline by orchestrating three primitives:

- **[Qwen Code](https://github.com/QwenLM/qwen-code)** — the agentic coding model that interprets the user's intent and drives the workflow
- **[Aliyun Model Studio CLI](https://github.com/modelstudioai/cli/)** — invokes **HappyHorse 1.1**, Aliyun Model Studio's text-/image-/reference-to-video generation model
- **[spark-video Skill](https://github.com/JohnKeating1997/spark-video)** — handles scene decomposition, storyboarding, shot continuity, and final stitching

### The single prompt

> _"Generate a roughly 2-minute video in Japanese cinematic style — a sweet, innocent first-love story about a high-school girl. The plot should be heart-fluttering enough to make viewers want to fall in love. Aspect ratio: 16:9."_

## Showcase 2: A Short-Film Director Managed Agent from One Sentence

<p align="center">
  <a href="https://cloud.video.taobao.com/vod/2v0GYLbJSQb2saj4iopTJDW3iRIHsintYlK-wTKbhqE.mp4">
    <img src="https://img.alicdn.com/imgextra/i4/6000000001674/O1CN01xhzixhxltbH3LxWu_!!6000000001674-0-tbvideo.jpg" alt="Click to play the demo video" width="720" />
  </a>
</p>

<p align="center"><i>👆 Click the cover to play the full demo</i></p>

One sentence builds a reusable cloud-side short-film director for storyboarding, storyboard image generation, and video creation:

- **[Qwen Code](https://github.com/QwenLM/qwen-code)** — understands the requirement and generates the agent configuration
- **[Aliyun Model Studio CLI](https://github.com/modelstudioai/cli/)** — validates the configuration, previews the changes, and completes the deployment
- **[Managed Agent](https://bailian.console.aliyun.com/cn-beijing/?tab=managed-agents#/managed-agents/quick-start)** — runs the director role along with its skills and tools in the cloud

### The single prompt

> _"Build me a Managed Agent app that can produce short films — a director expert that generates videos and can also design the matching storyboards."_

## Installation

**Agent install (recommended)**

Send the following to your Agent — it will detect your environment, then install and verify the CLI for you:

```text
Please read https://bailian.aliyun.com/cli/install.md and install the Aliyun Model Studio CLI for me
```

**Install with NPM**

```bash
npm install -g bailian-cli
bl skill init
```

> Requires Node.js >= 18.17.

**Install on macOS/Linux**

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash
```

> No Node.js required. The installer automatically installs Bailian Skills.

**Install on Windows**

```powershell
irm https://bailian.aliyun.com/cli/install.ps1 | iex
```

> No Node.js required. The installer automatically installs Bailian Skills.

## Quick Start

Once installed, just describe your task to your AI Agent — no need to assemble commands by hand.

| Scenario                 | What to say to your Agent                                                         |
| ------------------------ | --------------------------------------------------------------------------------- |
| Managed Agent            | "Create a Managed Agent that can generate short-film storyboards and videos."     |
| Image & video generation | "Generate an image of a cat in a spacesuit on Mars, then turn it into a video."   |
| Usage & quota            | "Show my recent model usage, free-tier quota, and rate limits."                   |
| Model selection          | "Recommend a model for image understanding and customer support."                 |
| About Bailian CLI        | "Tell me what Bailian CLI can do for me, and suggest how to use it for my needs." |

> More examples and scenarios: [Aliyun Model Studio CLI Site](https://bailian.console.aliyun.com/cli?source_channel=cli_github&)

## Authentication

### API Key

Required for most commands. Get your key from the [DashScope Console](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key).

```bash
bl auth login --api-key sk-xxxxx
```

Get or copy your Token Plan API key from the [Token Plan subscription overview](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview).

```bash
bl auth login --config token-plan --api-key sk-sp-xxxxx
```

### Console Login (OAuth)

Required for console capability commands (model list, app list, MCP list, workspace, usage queries, rate-limit increases, direct console calls). Opens the Bailian console in your browser to sign in.

```bash
bl auth login --console
```

### Alibaba Cloud OpenAPI AK/SK

Token Plan seat and member management requires an Alibaba Cloud AccessKey. Get yours from the [RAM Console](https://ram.console.aliyun.com/manage/ak).

> Recommended: create a RAM sub-account with minimum privileges instead of using the root account's AK/SK.

```bash
bl auth login --open-api --access-key-id LTAI5t... --access-key-secret ...
```

## Configuration

```bash
# View current config
bl config show

# List all config profiles
bl config list

# Switch config profile
bl config use --name token-plan
```

Config file location: `~/.bailian/config.json`

## Update

```bash
bl update
```

Upgrades the CLI to the latest version and refreshes the installed Agent Skills. Release notes for every version live in [CHANGELOG.md](https://github.com/modelstudioai/cli/blob/main/CHANGELOG.md).

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup, repo layout, and the workflow for adding or changing commands.

Scan the QR code to join the Aliyun Model Studio CLI DingTalk user group for usage help, troubleshooting, bug reports, and tips from other users.

<img src="https://img.alicdn.com/imgextra/i3/O1CN015uuhYGb6j0L12xJZ_!!6000000006304-2-tps-516-485.png" alt="Aliyun Model Studio CLI DingTalk user group" width="240" />

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
