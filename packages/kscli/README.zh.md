<div align="center">

# Knowledge Studio CLI

**阿里云 Model Studio 轻量级 RAG 命令行工具 — 专注知识库检索。**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Knowledge Studio 控制台](https://rag.console.aliyun.com/) · [English](README.md) · [API 文档](https://help.aliyun.com/zh/model-studio/) · [完整 CLI 指南](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md)

</div>

## 这是什么？

`kscli` 是阿里云 Model Studio (DashScope) 平台的**知识库检索**专用命令行工具，专为 RAG（检索增强生成）场景打造。覆盖知识库全生命周期管理 — 从创建知识库、文档导入到语义检索与对话问答。

## 功能特性

- **知识库管理** — 创建、更新、删除、查看知识库；查看存储与文档统计信息
- **文档管理** — 上传文件、从 OSS 导入、跟踪处理状态、打标签、删除文档
- **检索服务** — 创建、配置、部署、复制和管理检索服务，将知识库绑定到指定模型
- **Chunk 管理** — 在文档内新增、列出、更新、删除文本分片，实现细粒度内容控制
- **数据中心** — 管理工作区数据中心的独立文件，在挂载到知识库前进行预处理
- **集合与分类** — 通过集合组织知识库，通过分类对文档进行标记，实现范围检索
- **RAG 检索与对话** — 跨知识库语义检索，流式问答返回基于知识的回答
- **Agent 友好** — 支持 JSON 结构化输出（`--output json`）、预览模式（`--dry-run`）和静默模式（`--quiet`），便于脚本集成

## 安装

```bash
npm install -g knowledge-studio-cli
```

> 需要 Node.js >= 18.17。

## 快速开始

```bash
# 1. 创建知识库
kscli kb create \
  --name "my-kb" \
  --description "我的产品文档知识库" \
  --embedding-model text-embedding-v3 \
  --workspace-id <your-workspace-id>

# 2. 上传文档
kscli doc upload \
  --kb-id <kb-id> \
  --file ./product-docs.pdf \
  --workspace-id <your-workspace-id>

# 3. 查看处理状态
kscli doc status \
  --kb-id <kb-id> \
  --doc-id <doc-id> \
  --workspace-id <your-workspace-id>

# 4. 语义检索
kscli search \
  --query "什么是 Model Studio？" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>

# 5. 知识库问答（流式输出）
kscli chat \
  --message "什么是RAG？" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>
```

## 命令列表

### 知识库管理

| 命令        | 说明                         |
| :---------- | :--------------------------- |
| `kb list`   | 列出当前工作区的知识库       |
| `kb info`   | 查看知识库详情               |
| `kb create` | 创建新知识库                 |
| `kb update` | 更新知识库配置               |
| `kb delete` | 删除知识库                   |
| `kb stats`  | 查看知识库存储与文档统计信息 |

### 文档管理

| 命令             | 说明                    |
| :--------------- | :---------------------- |
| `doc list`       | 列出知识库中的文档      |
| `doc upload`     | 上传文档到知识库        |
| `doc status`     | 查看文档处理状态        |
| `doc delete`     | 从知识库中删除文档      |
| `doc tag`        | 添加或更新文档标签      |
| `doc import-oss` | 从 OSS 导入文档到知识库 |

### 检索服务

| 命令             | 说明                   |
| :--------------- | :--------------------- |
| `service list`   | 列出检索服务           |
| `service get`    | 查看检索服务详情       |
| `service create` | 创建检索服务           |
| `service update` | 更新检索服务配置       |
| `service deploy` | 部署或重新绑定检索服务 |
| `service delete` | 删除检索服务           |
| `service copy`   | 复制检索服务配置       |

### Chunk 管理

| 命令           | 说明               |
| :------------- | :----------------- |
| `chunk add`    | 向文档添加文本分片 |
| `chunk list`   | 列出文档中的分片   |
| `chunk update` | 更新文本分片       |
| `chunk delete` | 删除文档中的分片   |

### 数据中心文件

| 命令          | 说明                 |
| :------------ | :------------------- |
| `file list`   | 列出数据中心文件     |
| `file get`    | 查看数据中心文件详情 |
| `file delete` | 删除数据中心文件     |

### 集合与分类

| 命令                | 说明               |
| :------------------ | :----------------- |
| `collection create` | 在知识库中创建集合 |
| `collection get`    | 查看集合详情       |
| `category list`     | 列出知识库中的分类 |
| `category add`      | 向知识库添加分类   |
| `category delete`   | 删除知识库中的分类 |

### 检索与对话

| 命令       | 说明                                  |
| :--------- | :------------------------------------ |
| `search`   | 跨知识库语义检索（RAG）               |
| `chat`     | 知识库问答（流式输出）                |
| `retrieve` | 查询知识库（已弃用，请使用 `search`） |

### 工具命令

| 命令          | 说明             |
| :------------ | :--------------- |
| `config show` | 显示当前配置     |
| `config set`  | 设置配置项       |
| `update`      | 自更新到最新版本 |

> 完整参数说明、输出格式与使用示例请参阅 [CLI 指南](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md)。

## 认证方式

推荐使用 DashScope API Key 进行认证。前往 [DashScope 控制台](https://bailian.console.aliyun.com/?tab=app#/api-key) 获取。

```bash
# 方式一：环境变量
export DASHSCOPE_API_KEY=sk-xxxxx

# 方式二：持久化到配置文件（~/.bailian/config.json）
kscli config set --key api_key --value sk-xxxxx

# 方式三：命令行参数
kscli search --api-key sk-xxxxx --query "..." --agent-id <id> --workspace-id <id>
```

## 配置

```bash
# 查看当前配置
kscli config show

# 设置默认值
kscli config set --key base_url --value https://dashscope-us.aliyuncs.com
kscli config set --key timeout --value 600

# 设置默认工作区（可免去每次命令传 --workspace-id）
kscli config set --key workspace_id --value <your-workspace-id>

# 自更新
kscli update
```

配置文件位置：`~/.bailian/config.json`

> `--workspace-id` 的解析优先级：命令行参数 > 环境变量 `BAILIAN_WORKSPACE_ID` > 配置文件中的 `workspace_id`。

### 全局参数

所有命令均支持以下通用参数：

| 参数        | 说明                                     |
| :---------- | :--------------------------------------- |
| `--output`  | 输出格式：`text`（默认）或 `json`        |
| `--quiet`   | 静默模式，仅输出结果值，不显示表头和提示 |
| `--dry-run` | 预览请求结构，不实际发送到服务端         |
| `--timeout` | 请求超时时间，单位秒（默认 60）          |
| `--verbose` | 显示详细输出，包括 HTTP 请求详情         |
| `--config`  | 指定自定义配置文件路径                   |

## 相关链接

| 资源                    | 地址                                                                                                      |
| :---------------------- | :-------------------------------------------------------------------------------------------------------- |
| Knowledge Studio 控制台 | https://rag.console.aliyun.com/                                                                           |
| DashScope API 文档      | https://help.aliyun.com/zh/model-studio/                                                                  |
| 获取 API Key            | https://bailian.console.aliyun.com/?tab=app#/api-key                                                      |
| 完整 CLI 指南           | [docs/knowledge-cli-guide.md](https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md) |

## 参与贡献

欢迎提 Issue、Feature Request 和 PR。开发环境搭建与贡献流程请见 [CONTRIBUTING.zh.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.zh.md)。

## 许可证

[Apache 2.0](LICENSE)
