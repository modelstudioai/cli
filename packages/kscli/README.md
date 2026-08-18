<div align="center">

# Knowledge Studio CLI

**Lightweight RAG CLI for Aliyun Model Studio — focused on knowledge-base retrieval.**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Knowledge Studio Console](https://rag.console.aliyun.com/) · [中文文档](README.zh.md) · [API Documentation](https://help.aliyun.com/zh/model-studio/) · [Full CLI Guide](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md)

</div>

## What is this?

`kscli` is a standalone CLI for **knowledge-base retrieval** on Aliyun Model Studio (DashScope), purpose-built for RAG (Retrieval-Augmented Generation) workflows. It covers the full lifecycle of knowledge bases — from creation and document ingestion to semantic search and conversational Q&A.

## Features

- **Knowledge base management** — Create, update, delete, and inspect knowledge bases; view storage and document statistics
- **Document management** — Upload files, import from OSS, track processing status, tag, and delete documents
- **Retrieval services** — Create, configure, deploy, copy, and manage retrieval services that bind knowledge bases to specific models
- **Chunk management** — Add, list, update, and delete text chunks within documents for fine-grained content control
- **Data center** — Manage standalone files in the workspace data center before attaching them to knowledge bases
- **Collections & categories** — Organize knowledge bases with collections and categorize documents for scoped retrieval
- **RAG retrieval & chat** — Semantic search across knowledge bases and streaming Q&A with grounded answers
- **Agent-friendly** — Structured JSON output (`--output json`), dry-run mode (`--dry-run`), and quiet mode (`--quiet`) for scripting

## Installation

```bash
npm install -g knowledge-studio-cli
```

> Requires Node.js >= 18.17.

## Quick Start

```bash
# 1. Create a knowledge base
kscli kb create \
  --name "my-kb" \
  --embedding-model text-embedding-v3 \
  --workspace-id <your-workspace-id>

# 2. Upload a document
kscli doc upload \
  --kb-id <kb-id> \
  --file ./product-docs.pdf \
  --workspace-id <your-workspace-id>

# 3. Check processing status
kscli doc status \
  --kb-id <kb-id> \
  --doc-id <doc-id> \
  --workspace-id <your-workspace-id>

# 4. Semantic search
kscli search \
  --query "What is Model Studio?" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>

# 5. Knowledge-base Q&A (streaming)
kscli chat \
  --message "What is RAG?" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>
```

## Commands

### Knowledge Base Management

| Command     | Description                                               |
| :---------- | :-------------------------------------------------------- |
| `kb list`   | List knowledge bases in the current workspace             |
| `kb info`   | Show details of a knowledge base                          |
| `kb create` | Create a new knowledge base                               |
| `kb update` | Update knowledge base settings                            |
| `kb delete` | Delete a knowledge base                                   |
| `kb stats`  | Show storage and document statistics for a knowledge base |

### Document Management

| Command          | Description                                     |
| :--------------- | :---------------------------------------------- |
| `doc list`       | List documents in a knowledge base              |
| `doc upload`     | Upload a document to a knowledge base           |
| `doc status`     | Show processing status of a document            |
| `doc delete`     | Delete a document from a knowledge base         |
| `doc tag`        | Add or update tags on a document                |
| `doc import-oss` | Import documents from OSS into a knowledge base |

### Retrieval Services

| Command          | Description                            |
| :--------------- | :------------------------------------- |
| `service list`   | List retrieval services                |
| `service get`    | Show details of a retrieval service    |
| `service create` | Create a retrieval service             |
| `service update` | Update retrieval service settings      |
| `service deploy` | Deploy or rebind a retrieval service   |
| `service delete` | Delete a retrieval service             |
| `service copy`   | Copy a retrieval service configuration |

### Chunk Management

| Command        | Description                    |
| :------------- | :----------------------------- |
| `chunk add`    | Add a text chunk to a document |
| `chunk list`   | List chunks in a document      |
| `chunk update` | Update a text chunk            |
| `chunk delete` | Delete a chunk from a document |

### Data Center Files

| Command       | Description                        |
| :------------ | :--------------------------------- |
| `file list`   | List files in the data center      |
| `file get`    | Show details of a data center file |
| `file delete` | Delete a file from the data center |

### Collections & Categories

| Command             | Description                             |
| :------------------ | :-------------------------------------- |
| `collection create` | Create a collection in a knowledge base |
| `collection get`    | Show details of a collection            |
| `category list`     | List categories in a knowledge base     |
| `category add`      | Add a category to a knowledge base      |
| `category delete`   | Delete a category from a knowledge base |

### Retrieval & Chat

| Command    | Description                                       |
| :--------- | :------------------------------------------------ |
| `search`   | Semantic search across knowledge bases (RAG)      |
| `chat`     | Knowledge-base Q&A with streaming (RAG)           |
| `retrieve` | Query a knowledge base (deprecated, use `search`) |

### Utility

| Command       | Description                       |
| :------------ | :-------------------------------- |
| `config show` | Display current configuration     |
| `config set`  | Set a configuration value         |
| `update`      | Self-update to the latest version |

> For full parameter details, output formats, and usage examples, see the [CLI Guide](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md).

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

### Global Flags

All commands support these common flags:

| Flag        | Description                                          |
| :---------- | :--------------------------------------------------- |
| `--output`  | Output format: `text` (default) or `json`            |
| `--quiet`   | Print only the result value, no headers or hints     |
| `--dry-run` | Preview the request without sending it to the server |
| `--timeout` | Request timeout in seconds (default: 60)             |
| `--verbose` | Show verbose output including HTTP details           |
| `--config`  | Path to a custom config file                         |

## Links

| Resource                 | URL                                                                                                       |
| :----------------------- | :-------------------------------------------------------------------------------------------------------- |
| Knowledge Studio Console | https://rag.console.aliyun.com/                                                                           |
| DashScope API Docs       | https://help.aliyun.com/zh/model-studio/                                                                  |
| Get API Key              | https://bailian.console.aliyun.com/?tab=app#/api-key                                                      |
| Full CLI Guide           | [docs/knowledge-cli-guide.md](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md) |

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup and contribution workflow.

## License

[Apache 2.0](LICENSE)
