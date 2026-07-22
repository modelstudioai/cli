<div align="center">

# Knowledge Studio CLI

**Lightweight RAG CLI for Aliyun Model Studio — focused on knowledge-base retrieval.**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Knowledge Studio Console](https://rag.console.aliyun.com/) · [中文文档](README.zh.md) · [API Documentation](https://help.aliyun.com/zh/model-studio/)

</div>

## What is this?

`kscli` is a standalone CLI for **knowledge-base retrieval** on Aliyun Model Studio (DashScope), purpose-built for RAG (Retrieval-Augmented Generation) workflows.

## Installation

```bash
npm install -g knowledge-studio-cli
```

> Requires Node.js >= 18.17.

## Quick Start

```bash
# Search a knowledge base
kscli search \
  --query "What is Model Studio?" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>

# Chat with a knowledge base
kscli chat \
  --message "What is RAG?" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>
```

## Commands

| Command       | Description                                       |
| :------------ | :------------------------------------------------ |
| `search`      | Semantic search across knowledge bases (RAG)      |
| `chat`        | Knowledge-base Q&A with streaming (RAG)           |
| `retrieve`    | Query a knowledge base (deprecated, use `search`) |
| `config show` | Display current configuration                     |
| `config set`  | Set a configuration value                         |
| `update`      | Self-update to the latest version                 |

## Authentication

A DashScope API Key is recommended. Get yours from the [DashScope Console](https://bailian.console.aliyun.com/?tab=app#/api-key).

```bash
# Option 1: Environment variable
export DASHSCOPE_API_KEY=sk-xxxxx

# Option 2: Persist to config (~/.bailian/config.json)
kscli config set --key api_key --value sk-xxxxx

# Option 3: Per-command flag
kscli search --api-key sk-xxxxx --query "..." --agent-id <id> --workspace-id <id>
```

## Configuration

```bash
# View current config
kscli config show

# Set defaults
kscli config set --key base_url --value https://dashscope-us.aliyuncs.com
kscli config set --key timeout --value 600

# Self-update
kscli update
```

Config file location: `~/.bailian/config.json`

## Links

| Resource                 | URL                                                  |
| :----------------------- | :--------------------------------------------------- |
| Knowledge Studio Console | https://rag.console.aliyun.com/                      |
| DashScope API Docs       | https://help.aliyun.com/zh/model-studio/             |
| Get API Key              | https://bailian.console.aliyun.com/?tab=app#/api-key |

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup and contribution workflow.

## License

[Apache 2.0](LICENSE)
