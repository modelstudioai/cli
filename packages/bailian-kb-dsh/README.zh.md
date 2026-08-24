<div align="center">

# 百炼知识库 for DeepSeek Harness

**基于阿里云百炼（Aliyun Model Studio）的知识库检索工具，供 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 使用。**

[![npm version](https://img.shields.io/npm/v/bailian-kb-dsh?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-kb-dsh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[百炼控制台](https://bailian.console.aliyun.com/) · [English](README.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [API 文档](https://help.aliyun.com/zh/model-studio/)

</div>

## 这是什么？

`bailian-kb-dsh` 是一个 DeepSeek Harness 插件（同时是 dsh bundle），让 agent 能检索托管在[阿里云百炼](https://bailian.console.aliyun.com/)上的知识库。它注册两个面向模型的工具 —— `kb_search` 取原始证据、`kb_chat` 出成品答案 —— 并附带一个设置页和一份面向 [`bl` CLI](https://www.npmjs.com/package/bailian-cli) 的管理 skill。

检索经由你在百炼上部署的**检索服务**完成：一个服务把一个或多个知识库绑定到指定的向量 / 排序配置上，通过 `agent_id` 寻址。插件会把已部署服务的清单持续呈现给模型，让它能判断用户的问题是否落在你的知识范围内。

## 功能特性

- **两个面向模型的工具** — `kb_search` 返回带分数和来源的知识切片；`kb_chat` 返回基于知识的完整答案
- **服务感知** — 工作空间里已部署的检索服务会注入到会话上下文，模型据此知道自己能查什么，不必猜 `agent_id`
- **低门槛配置** — 在设置页登录百炼控制台即可自动填入 API 密钥与工作空间 ID；已有的 `bl` CLI 登录会被自动采纳
- **设置页** — Web UI 中的"百炼知识库"页，管理凭据、默认服务，并可查看服务缓存状态
- **管理 skill** — 随包分发的 `bailian-kb` skill，教 agent 用 `bl` CLI 完成建库、文档导入、服务部署

## 环境要求

- DeepSeek Harness 及其插件运行时（`@deepseek-ai/dsh-*`），Node.js >= 22.12
- 阿里云百炼账号：一个**工作空间 ID** 和一个 **DashScope API 密钥**（[去获取](https://bailian.console.aliyun.com/?tab=app#/api-key)）
- 该工作空间下至少有一个**已部署**的检索或问答服务 —— 可在[控制台](https://bailian.console.aliyun.com/)创建，或用 `bl knowledge service create` / `bl knowledge service deploy`

## 安装

```sh
dsh plugin --profile web add bailian-kb-dsh
```

CLI 会自动把 bundle 加入 profile 的层栈，无需手改 YAML。卸载：

```sh
dsh plugin --profile web remove bailian-kb-dsh
```

验证插件已装配：`dsh --profile web --dump-config` 应能看到 `tool-bailian-kb` row。

## 配置

### 方式一 — 设置页（推荐）

安装后，Web UI 的 **Settings → 百炼知识库** 页出现：

- **自动获取** — 在宿主机浏览器中拉起百炼控制台登录；登录完成后，该账号的 API 密钥与工作空间 ID 直接落到宿主机（明文密钥不经过浏览器）。每次登录都会请求签发新密钥，因此切换账号点一次即可。
- **API 密钥** — 只写不回显：存下的值不会再次显示，只显示"已配置 / 未配置"。
- **工作空间 ID / 默认检索服务 / 默认对话服务** — 可编辑且回显；两个服务 ID 可从缓存的服务清单里选。清空保存则回退到下层来源。
- **检索服务缓存** — 展示注入清单的上次拉取时间、各场景服务条数、是否被截断，并提供手动刷新（刚新建完服务想立刻生效时用）。

如果此前已运行过 `bl auth login`，启动时会从 `~/.bailian/config.json` 一次性采纳 API 密钥与工作空间 ID。被你主动清空的值不会被重新填回。

### 方式二 — 环境变量与凭据文件

```sh
# ~/.dsh/.env，或凭据存储 ~/.dsh/.credentials.yaml
DASHSCOPE_API_KEY=sk-xxx                    # 必填
BAILIAN_WORKSPACE_ID=ws-xxx                 # 必填
BAILIAN_DEFAULT_RETRIEVE_AGENT_ID=aid-xxx   # 选填
BAILIAN_DEFAULT_CHAT_AGENT_ID=aid-xxx       # 选填
```

### 方式三 — Profile patch

bundle 会向 profile 插入自己的 entry，你可以在 `~/.dsh/cordis.patch.yml` 或 profile 的 patch 文件里按 id 覆盖。覆盖时**替换整个 config 对象（无 deep-merge）**：

```yaml
- id: tool-bailian-kb
  config:
    defaultRetrieveAgentId: aid-search-service
    defaultChatAgentId: aid-chat-service
    chatTimeoutMs: 600000
```

禁用插件：`- id: tool-bailian-kb` 加 `disabled: true`。

### 配置字段

Config 同时注册为 `bailian-kb` settings section，因此在设置页或设置文档里的修改会在下一次调用生效，无需重启。

| 字段                     | 类型    | 默认值                         | 语义                                                                              |
| ------------------------ | ------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `workspaceId`            | string? | —                              | 百炼工作空间 ID；API host 为工作空间子域名 `https://<workspaceId>.<endpointHost>` |
| `endpointHost`           | string  | `cn-beijing.maas.aliyuncs.com` | host 后缀，其他 region 或私有化部署时替换                                         |
| `defaultRetrieveAgentId` | string? | —                              | 调用方省略 `agent_id` 时 `kb_search` 使用的服务                                   |
| `defaultChatAgentId`     | string? | —                              | 调用方省略 `agent_id` 时 `kb_chat` 使用的服务                                     |
| `agentVersion`           | string? | —                              | `beta`（草稿调试）或已发布版本号；默认调用最新发布版本。不暴露给模型              |
| `chatTimeoutMs`          | number  | `300000`                       | `kb_chat` 超时时间 —— 服务端是分钟级的多轮检索循环                                |

### 解析优先级

| 值                  | settings 用户层（设置页）   | entry config（profile patch） | 凭据存储 / 环境变量                 |
| ------------------- | --------------------------- | ----------------------------- | ----------------------------------- |
| `DASHSCOPE_API_KEY` | 只写控件                    | —                             | `DASHSCOPE_API_KEY`                 |
| 工作空间 ID         | ✅ `workspaceId`            | ✅ `workspaceId`              | `BAILIAN_WORKSPACE_ID`              |
| 默认检索服务        | ✅ `defaultRetrieveAgentId` | ✅ `defaultRetrieveAgentId`   | `BAILIAN_DEFAULT_RETRIEVE_AGENT_ID` |
| 默认对话服务        | ✅ `defaultChatAgentId`     | ✅ `defaultChatAgentId`       | `BAILIAN_DEFAULT_CHAT_AGENT_ID`     |

所有值每次调用重新解析，因此轮换密钥或切换工作空间即时生效。API 密钥与工作空间 ID 是必填项：缺失时工具调用会报错并指出上述配置路径。默认服务是选填的 —— 当某个场景下工作空间只有一个已部署服务时，直接用它。

## 工具

| 工具        | 参数                                                                                     | 返回                           |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| `kb_search` | `query`、`agent_id`（必填）、`top_k?`（默认 5，客户端截断）、`images?`（多模态图片 URL） | 带来源引用的评分切片，以及总数 |
| `kb_chat`   | `message`、`agent_id`（必填）                                                            | 完整答案，以及 `request_id`    |

两个工具的 schema 中 `agent_id` 均为必填：schema 无法告诉模型这套部署是否配了默认服务，而"调用时才发现没有默认值"会白费一轮。配置的默认服务仍对省略该参数的程序化调用生效。

已部署服务的清单（ID、名称、场景）以上下文消息的形式注入会话，周期性刷新，`bl knowledge service` 命令改动服务清单时也会刷新。清单过长时会截断并注明总数，避免模型把部分清单当成全部。

## 错误处理

- **HTTP 4xx** — 多数情况是 `agent_id` 已失效，因此会刷新服务清单并追加到错误信息里，便于立即纠正
- **HTTP 5xx** — 原样透传
- **凭据缺失** — 错误信息指出配置路径（`~/.dsh/.env`、`~/.dsh/.credentials.yaml`、设置页）并给出控制台取密钥的链接
- **`kb_chat` 超时** — 错误信息说明服务端多轮检索的特性，建议重试或改用 `kb_search`

## 已知限制

- `kb_chat` 会缓冲服务端流式输出，执行期间没有进展显示。
- `top_k` 是客户端截断：请求体不含该参数，服务端返回多少切片由检索服务配置决定。
- **服务名承载了路由信号。** 服务列表接口目前不返回描述字段，模型只能靠服务名判断一个服务能查什么。请按内容命名（`产品文档检索`，而不是`检索服务1`）。
- 每个场景最多拉取两页，超出时注入的清单会标明已截断。

## 开发

```sh
pnpm --filter bailian-kb-dsh run build       # tsc 出 dist/（node 半）+ tsdown 出 dist/web/client.js（浏览器半）
pnpm --filter bailian-kb-dsh run typecheck   # node 与 web 两套 tsconfig
pnpm --filter bailian-kb-dsh run test
```

本地联调时把工作副本装进 dev profile（patch 文件受 HMR 监听）：

```sh
dsh plugin --profile dev add <本仓库>/packages/bailian-kb-dsh
```

内部设计说明（上下文注入策略、服务缓存布局、刷新触发点）见 [docs/kb-dsh/runtime-behavior.md](https://github.com/modelstudioai/cli/blob/main/docs/kb-dsh/runtime-behavior.md)；维护清单见 [docs/agents/dsh-plugin.md](https://github.com/modelstudioai/cli/blob/main/docs/agents/dsh-plugin.md)。

## 参与贡献

欢迎提交 Bug 报告、功能建议和 PR。开发环境搭建与贡献流程见 [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md)。

## 许可证

[Apache 2.0](LICENSE)
