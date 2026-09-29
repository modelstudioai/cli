<div align="center">

# Knowledge Studio CLI

**阿里云 Model Studio 轻量级 RAG 命令行工具 — 专注知识库检索。**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Knowledge Studio 控制台](https://rag.console.aliyun.com/) · [English](README.md) · [API 文档](https://help.aliyun.com/zh/model-studio/) · [完整 CLI 指南](https://github.com/modelstudioai/cli/blob/main/docs/knowledge/knowledge-cli-guide.md)

</div>

## 这是什么？

`kscli` 是阿里云 Model Studio (DashScope) 平台的**知识库检索**专用命令行工具，专为 RAG（检索增强生成）场景打造。覆盖知识库全生命周期管理 — 从创建知识库、文档导入到语义检索与对话问答。

## 功能特性

- **知识库管理** — 创建、更新、删除、查看知识库；查看存储与文档统计信息
- **文档管理** — 上传文件、从 OSS 导入、跟踪处理状态、打标签、删除文档
- **检索服务** — 创建、配置、部署、复制和管理检索服务，将知识库绑定到指定模型
- **Chunk 管理** — 在文档内新增、列出、更新、删除文本分片，实现细粒度内容控制
- **数据中心** — 管理工作区数据中心的独立文件，在挂载到知识库前进行预处理
- **数据集与分类** — 通过数据集组织知识库，通过分类对文档进行标记，实现范围检索
- **RAG 检索与对话** — 跨知识库语义检索，流式问答返回基于知识的回答
- **Agent 友好** — 支持 JSON 结构化输出（`--output json`）、预览模式（`--dry-run`）和静默模式（`--quiet`），便于脚本集成

## 安装

```bash
npm install -g knowledge-studio-cli
```

> 需要 Node.js >= 18.17。

## 快速开始

先配置有效的 DashScope API Key（例如通过 `DASHSCOPE_API_KEY`），并准备有知识库权限的工作空间。下方占位 ID 请替换为实际值。

知识库创建成功后，即使不检索也持续按时计费。**标准版一次性 720 小时额度由多个知识库共享，新用户开通服务后 30 天内有效**；模型调用另计，CLI 不假定当前账户还剩多少额度。详见[计费规则](https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base)。

```bash
# 先预览：可能鉴权并读取已有资源，但不会写入。
kscli init --workspace-id <workspace-id> --dry-run
```

查看计划和计费说明，确认本次操作及范围后再执行：

```bash
kscli init --workspace-id <workspace-id> --yes
```

初始化会上传样例、创建或复用可确认归属的知识库与 beta 检索服务，并验证样例检索。不会自动创建问答服务或发布服务。保留返回的 ID 和 `.bailian/knowledge/init.json` 恢复记录。继续检索时使用返回的 **agent ID**，不要填知识库 index ID：

```bash
kscli search --agent-id <agent-id> --agent-version beta --query "RAG" --workspace-id <workspace-id>
```

关闭终端或后续步骤失败不会停止计费。请查看 init 输出的资源及清理动作，部分失败时也要核对已创建资源。仅清理不再需要的资源，复用资源不属于默认临时资源。查看具体知识库并确认删除后果后：

```bash
kscli kb delete --index-id <index-id> --workspace-id <workspace-id>
```

删除需要确认；只有确认范围后才添加 `--yes`。成功删除知识库才能停止其规格计费，仅删除文档或检索服务不行。源文件等其他资源可能需要另行清理。

### 通过 AI 助手使用

通过 `bl skill init` 安装知识库工作流，或用 `bl skill add --name bailian-protocol,bailian-knowledge` 选择安装。更新已安装 Skill 使用 `bl skill update`。安装渠道属于完整百炼 CLI，`kscli` 没有 `skill` 子命令。

助手先读取 `kscli --introspect` 确认当前能力，创建资源前预览变更并解释计费。当前 schema 未列出的能力不能视为已安装版本支持。

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

### 数据集与分类

| 命令                | 说明                 |
| :------------------ | :------------------- |
| `collection create` | 在知识库中创建数据集 |
| `collection get`    | 查看数据集详情       |
| `category list`     | 列出知识库中的分类   |
| `category add`      | 向知识库添加分类     |
| `category delete`   | 删除知识库中的分类   |

### 检索与对话

| 命令     | 说明                    |
| :------- | :---------------------- |
| `search` | 跨知识库语义检索（RAG） |
| `chat`   | 知识库问答（流式输出）  |

### 工具命令

| 命令          | 说明             |
| :------------ | :--------------- |
| `config show` | 显示当前配置     |
| `config set`  | 设置配置项       |
| `update`      | 自更新到最新版本 |

> 完整参数说明、输出格式与使用示例请参阅 [CLI 指南](https://github.com/modelstudioai/cli/blob/main/docs/knowledge/knowledge-cli-guide.md)。

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

| 资源                    | 地址                                                                                                                |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------ |
| Knowledge Studio 控制台 | https://rag.console.aliyun.com/                                                                                     |
| DashScope API 文档      | https://help.aliyun.com/zh/model-studio/                                                                            |
| 获取 API Key            | https://bailian.console.aliyun.com/?tab=app#/api-key                                                                |
| 完整 CLI 指南           | [docs/knowledge-cli-guide.md](https://github.com/modelstudioai/cli/blob/main/docs/knowledge/knowledge-cli-guide.md) |

## 参与贡献

欢迎提 Issue、Feature Request 和 PR。开发环境搭建与贡献流程请见 [CONTRIBUTING.zh.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.zh.md)。

## 许可证

[Apache 2.0](LICENSE)

### RAG 音视频接入

`kscli doc import --index-id <id> --doc-id <fileId>` 将历史文件导入已有库；`doc list --details` 查看文件级处理参数。支持音视频 parser、流式上传，以及检索/切片中的媒体来源展示。问答 JSON 将最终 answer 与 phases/tools/docs/usage/events 分开保存，quiet 仅输出最终回答。参阅 [命令指南](../../docs/knowledge/knowledge-cli-guide.md)。
