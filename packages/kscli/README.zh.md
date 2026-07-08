<div align="center">

# Knowledge Studio CLI

**阿里云 Model Studio 轻量级 RAG 命令行工具 — 专注知识库检索。**

[![npm version](https://img.shields.io/npm/v/knowledge-studio-cli?color=0969da&label=npm)](https://www.npmjs.com/package/knowledge-studio-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Knowledge Studio 控制台](https://rag.console.aliyun.com/) · [English](README.md) · [API 文档](https://help.aliyun.com/zh/model-studio/)

</div>

## 这是什么？

`kscli` 是阿里云 Model Studio (DashScope) 平台的**知识库检索**专用命令行工具，专为 RAG（检索增强生成）场景打造。

## 安装

```bash
npm install -g knowledge-studio-cli
```

> 需要 Node.js >= 22.12。

## 快速开始

```bash
# 检索知识库
kscli search \
  --query "什么是 Model Studio？" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>

# 知识库问答
kscli chat \
  --message "什么是RAG？" \
  --agent-id <your-agent-id> \
  --workspace-id <your-workspace-id>
```

## 命令列表

| 命令          | 说明                                  |
| :------------ | :------------------------------------ |
| `search`      | 知识库语义检索（RAG）                 |
| `chat`        | 知识库问答（流式输出）                |
| `retrieve`    | 查询知识库（已弃用，请使用 `search`） |
| `config show` | 显示当前配置                          |
| `config set`  | 设置配置项                            |
| `update`      | 自更新到最新版本                      |

## 认证方式

推荐使用 DashScope API Key 进行认证。前往 [DashScope 控制台](https://bailian.console.aliyun.com/?tab=app#/api-key) 获取。

```bash
# 方式一：环境变量
export DASHSCOPE_API_KEY=sk-xxxxx

# 方式二：登录命令（持久化到 ~/.bailian/config.json）
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

# 自更新
kscli update
```

配置文件位置：`~/.bailian/config.json`

## 相关链接

| 资源                    | 地址                                                 |
| :---------------------- | :--------------------------------------------------- |
| Knowledge Studio 控制台 | https://rag.console.aliyun.com/                      |
| DashScope API 文档      | https://help.aliyun.com/zh/model-studio/             |
| 获取 API Key            | https://bailian.console.aliyun.com/?tab=app#/api-key |

## 参与贡献

欢迎提 Issue、Feature Request 和 PR。开发环境搭建与贡献流程请见 [CONTRIBUTING.zh.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.zh.md)。

## 许可证

[Apache 2.0](LICENSE)
