<div align="center">

# Knowledge Studio CLI

**Lightweight RAG CLI for Aliyun Model Studio — focused on knowledge-base retrieval.**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
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

> Requires Node.js >= 22.12.

## Quick Start

```bash
# Retrieve from a knowledge base
kscli retrieve \
  --index-id <your-index-id> \
  --query "What is Model Studio?"
```

## Commands

| Command       | Description                       |
| :------------ | :-------------------------------- |
| `retrieve`    | Query a knowledge base (RAG)      |
| `config show` | Display current configuration     |
| `config set`  | Set a configuration value         |
| `update`      | Self-update to the latest version |

## Authentication

A DashScope API Key is recommended. Get yours from the [DashScope Console](https://bailian.console.aliyun.com/?tab=app#/api-key).

```bash
# Option 1: Environment variable
export DASHSCOPE_API_KEY=sk-xxxxx

# Option 2: Persist to config (~/.bailian/config.json)
kscli config set --key api_key --value sk-xxxxx

# Option 3: Per-command flag
kscli retrieve --api-key sk-xxxxx --index-id <id> --query "..."
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
