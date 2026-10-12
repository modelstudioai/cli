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
- 管理面的事（建库、导入文档、部署服务）需要 [`bl` CLI](https://www.npmjs.com/package/bailian-cli)（`npm install -g bailian-cli`）。检索本身直连 API、从不起子进程，所以 `kb_search` / `kb_chat` 不装也能用

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

通过 dsh 插件设置页配置。API Key 独立使用 dsh credentials 中的 `BAILIAN_KB_API_KEY`（通常为 `~/.dsh/.credentials.yaml`，实际路径由宿主决定）。所有业务设置只保存到本插件的 dsh 配置：

| 字段                     | 含义                           | 默认值     |
| ------------------------ | ------------------------------ | ---------- |
| `workspaceId`            | 所有知识库调用使用的 Workspace | 必填       |
| `defaultRetrieveAgentId` | 默认检索服务                   | 未设置     |
| `defaultChatAgentId`     | 默认问答服务                   | 未设置     |
| `agentVersion`           | 草稿 `beta` 或已发布服务版本   | 最新发布版 |
| `chatTimeoutMs`          | 问答超时，毫秒                 | 300000     |

端点固定为 `cn-beijing.maas.aliyuncs.com`，不提供端点配置。在设置页保存后，下一次调用即生效。

启动时，缺失的 API Key 可以从 `~/.bailian/config.json` 当前激活的 Profile 导入。首次配置迁移时，缺失的 Workspace 和默认服务从旧 dsh 凭据导入，Workspace 再以 bl Profile 作为初始默认值；已有 dsh 设置优先。内部 `configInitialized` 标记确保清空的设置不会被再次填入。缺失的 API Key 仍允许在后续启动时补入。

初始化完成后，业务字段只读 dsh 插件配置，不再读取 bl 或旧凭据字段。清空 Workspace 后，调用会报缺配置。控制台登录把 Key 保存到 dsh credentials，把 Workspace 保存到 dsh 设置。kb 不创建 `personal-kb/config.json`。

连接区域支持在密码输入框中填写新 API Key，留空表示保留当前 Key。点击**验证并保存**会先验证 Key 与 Workspace 的组合，再保存；验证失败不修改配置，设置写入失败时尝试恢复原配置。旧 Key 不回显，保存成功后清空输入框。知识库和记忆插件各自使用独立的 Key 与 Workspace，修改互不影响。来自启动环境的 Key 需要在启动环境中修改。

管理操作使用 `kb_manage`，参数为 `bl knowledge` 之后的数组，例如 `{"args":["service","list","--scene","search"]}`。宿主内部执行已安装的 bl，使用临时隔离配置目录，并注入与原生工具相同的当前 Key 和 Workspace；不允许通过参数覆盖连接配置。密钥只通过子进程环境传递，不进入工具参数。直接在 shell 中运行 bl 仍是独立 CLI，不是插件管理入口。

## 工具

| 工具        | 参数                                                                                     | 返回                           |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| `kb_search` | `query`、`agent_id`（必填）、`top_k?`（默认 5，客户端截断）、`images?`（多模态图片 URL） | 带来源引用的评分切片，以及总数 |
| `kb_chat`   | `message`、`agent_id`（必填）                                                            | 完整答案，以及 `request_id`    |
| `kb_manage` | `args`                                                                                   | 使用 dsh 配置执行知识库管理    |

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

升级后不再读取原来共用的 `DASHSCOPE_API_KEY`，也不会修改或删除它。若插件专属 Key 尚未配置且 bl 没有可导入的默认值，请在各插件页面分别保存 Key。
