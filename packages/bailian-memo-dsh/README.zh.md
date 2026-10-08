# bailian-memo-dsh

[English](./README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh` ≥ 0.2.1-alpha.1）的百炼个人记忆插件。

提供顶层回合自动召回、静默辅助筛选与可恢复异步写入、显式记住/遗忘工具，以及 Plugins 设置页。身份与授权保存在 `~/.bailian/personal-memory/config.json`（与 `bailian-memory` skill 共享）。API Key 使用 dsh credentials（`DASHSCOPE_API_KEY`）。

> **发布门槛：** stable 发布前需确认 Memory 主能力上线、画像值精确删除（`need_detail` + `PATCH profile_values`）实链路，以及 dsh 0.2.1 实机安装验证。此前仅用于内部 / channel 验证。

## 安装

```sh
dsh plugin --profile <profile> add bailian-memo-dsh
# 或本地路径：
dsh plugin --profile <profile> add /path/to/cli/packages/bailian-memo-dsh
```

打开 **侧边栏 → 插件 → 百炼个人记忆**，自动获取/更新凭据（或确保 `DASHSCOPE_API_KEY` 与 Workspace ID 已匹配），然后点击 **启用个人记忆**。这是独立的个人记忆页面，不是旧版知识库 Settings 区域。浏览器授权只是一次性获取凭据，并不建立持久登录会话。

已安装 Bundle 的 `bailian-memo-dsh#tool-bailian-memo` 行也提供**配置**入口；它会打开同一个页面并共享同一份草稿状态。

## 能力

| 能力        | 行为                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 自动召回    | 顶层 Agent 每个 turn 首个 step 搜索 observation/画像，注入带来源的上下文（`startsRequestSeries`）。失败不阻断。Subagent 默认跳过。 |
| 静默筛选    | 在 `turn-stopping` 用辅助 LLM 决定 commit/skip；提交走 `add-async` 并后台轮询。                                                    |
| 工具        | `bailian_memo_search` / `status` / `remember` / `forget` / `pause` / `resume`                                                      |
| 遗忘        | 候选定位 → dsh 审批 → 删除节点；画像值删除取决于 API 是否就绪                                                                      |
| 暂停 / 恢复 | 只改本地状态，不删云端数据                                                                                                         |

## 配置

- **个人身份：** `~/.bailian/personal-memory/config.json`（`status`：`unconfigured` / `initializing` / `active` / `paused`）
- **插件设置（Volatile）：** `enabled`、`autoRecall`、`autoCurate` 使用真实开关，并直接显示 `recallTopK` 召回结果数量和 `minScore` 最小分数阈值（默认 0）。该阈值用于自动召回，也用于未传 `min_score` 的手动检索。curator 与端点调优仍可通过部署配置设置，但本页面不再展示。
- **密钥：** 不写入个人配置文件；设置页只显示当前生效凭据是否已配置及其来源类别，绝不显示值
- **安全控制：** 暂停/恢复会保留云端数据；页面不提供全量清除
- **诊断：** 异步写入会区分已提交、成功且有变更、成功但无变更和失败。空检索会附带只含哈希与长度的脱敏范围；`bailian_memo_search` 支持可选 `min_score`。

自动更新会把 API Key 与 Workspace 作为同一组凭据接收并一起应用，并在显示**凭据已更新**前发起一次只读 Memory 请求验证。若 `DASHSCOPE_API_KEY` 来自启动 dsh 的环境变量，它具有更高优先级且无法在页面中替换：请在启动 dsh 的 Shell 或服务中取消该变量、重启 dsh 后重试。

若初始化显示服务端原始错误 `Endpoint.AccessDenied: Workspace endpoint access denied.`，请确认当前生效的 API Key 与 Workspace 属于同一个阿里云账号，再从本页面自动更新整组凭据。若凭据已匹配，请确认该账号已开通百炼 Memory 或已加入白名单。

## 隐私

- 启用授权后可自动记忆普通个人信息
- 敏感信息仅在用户明确要求时保存
- 密码 / API Key / 私钥永不保存
- 可随时暂停

## 卸载

```sh
dsh plugin --profile <profile> remove bailian-memo-dsh
```

卸载**不会**删除云端记忆，也不会删除 `~/.bailian/personal-memory/config.json`。

## 许可证

Apache-2.0
