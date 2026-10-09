# bailian-memo-dsh

[English](./README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh` ≥ 0.2.1-alpha.1）的百炼个人记忆插件。

提供顶层回合自动召回、静默辅助筛选与可恢复异步写入、显式记住/遗忘工具，以及 Plugins 设置页。身份与授权保存在 `~/.bailian/personal-memory/config.json`（与 `bailian-memory` skill 共享）。API Key 使用 dsh credentials（`BAILIAN_MEMO_API_KEY`）。

> **发布门槛：** stable 发布前需确认 Memory 主能力上线、画像值精确删除（`need_detail` + `PATCH profile_values`）实链路，以及 dsh 0.2.1 实机安装验证。此前仅用于内部 / channel 验证。

## 安装

```sh
dsh plugin --profile <profile> add bailian-memo-dsh
# 或本地路径：
dsh plugin --profile <profile> add /path/to/cli/packages/bailian-memo-dsh
```

打开 **侧边栏 → 插件 → 百炼个人记忆**，自动获取/更新凭据（或确保 `BAILIAN_MEMO_API_KEY` 与 Workspace ID 已匹配），然后点击 **启用个人记忆**。这是独立的个人记忆页面，不是旧版知识库 Settings 区域。浏览器授权只是一次性获取凭据，并不建立持久登录会话。

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
- **插件设置（Volatile）：** `enabled`、`autoRecall`、`autoCurate` 使用真实开关，并直接显示 `recallTopK` 召回结果数量和 `minScore` 最小分数阈值（默认 0）。该阈值用于自动召回，也用于未传 `min_score` 的手动检索。`workspaceId` 与 curator 参数同样保存在 dsh 设置中；端点使用固定的 Memory 默认域名。
- **密钥：** 不写入个人配置文件；设置页只显示当前生效凭据是否已配置及其来源类别，绝不显示值
- **安全控制：** 暂停/恢复会保留云端数据；页面不提供全量清除
- **诊断：** 异步写入会区分已提交、成功且有变更、成功但无变更和失败。空检索会附带只含哈希与长度的脱敏范围；`bailian_memo_search` 支持可选 `min_score`。

自动更新将 API Key 与 Workspace 视为同一组凭据，先发起只读 Memory 请求验证，再保存两者并显示**凭据已更新**。若 `BAILIAN_MEMO_API_KEY` 来自启动 dsh 的环境变量，它具有更高优先级且无法在页面中替换：请在启动 dsh 的 Shell 或服务中取消该变量、重启 dsh 后重试。

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

首次启动时，仅在 dsh 未设置 `workspaceId` 时依次从个人身份绑定、当前激活的 `bl` Profile 导入；已有 dsh 值保持不变。`configInitialized` 标记完成迁移，因此主动清空后重启不会重新导入。缺失的 API Key 可导入个人记忆插件独立的 dsh `BAILIAN_MEMO_API_KEY` 凭据；请求期间不会回退读取 `bl` 或环境 Workspace。

个人文件只承担身份、授权、状态及 Workspace 绑定；实际请求 Workspace 始终读取 dsh 设置。若与身份绑定不同，请求和自动填充均拒绝执行，请在 dsh 中恢复原 Workspace。启用和自动填充将连接设置写入 dsh，绝不自动改变已有身份绑定。

在密码输入框填写新 API 密钥，点击**验证并保存**可同时更新密钥与工作空间；密钥留空则保留当前生效凭据。密钥和工作空间仅属于个人记忆插件，修改不会影响百炼知识库插件。页面不回显已存密钥，草稿仅保留在内存，成功保存或关闭页面后清空。连接设置与自动行为分别保存。

手动保存和自动获取都在持久化前通过只读 Memory 请求验证候选凭据组合，验证失败不修改原值。启动环境变量密钥不可在页面替换；但密钥留空时仍可使用它验证并保存 Workspace。

升级后不再读取原来共用的 `DASHSCOPE_API_KEY`，也不会修改或删除它。若插件专属 Key 尚未配置且 bl 没有可导入的默认值，请在各插件页面分别保存 Key。

## 用户画像抽取

**抽取用户画像**默认关闭，与自动行为一起保存在 dsh 设置中。开启后，每次新的显式记忆或自动整理提交前，都查询默认记忆库范围内已有的画像规则，再将选定 ID 传入 add-async。插件不创建模板、不修改云端规则；所选 `profileSchemaId` 保存在本插件的 dsh 设置中。关闭时 add-async 不传 `profile_schema`。

开启画像抽取后，在自动行为卡片中按规则名称和 schemaId 选择。尚未选择时默认使用完整接口列表的最后一项（按返回顺序，不表示创建时间）。点击保存会一起保存开关和所选 ID；已有选择保持不变，规则删除后提示重新选择，不静默切换。每次提交只使用一条规则。search 不需要 schemaId。已有画像召回独立于抽取开关，在调用 GetUserProfile 前查询规则；画像读取失败不阻断普通记忆召回。画像遗忘在操作开始时解析一次规则，同一次查看、删除和验证均使用该 ID。

个人身份文件升级为 v3，读取及后续写入时去掉旧 `profile_schema_id` / `profile_schema_version`，保留身份、授权、绑定和暂停状态；不删除已有云端模板或画像。初始化仅做只读连接检查，不再依赖画像模板。

同一回合中 `remember` 成功提交后，自动筛选跳过整个回合，避免重复写入相同事实。后续回合不受影响；提交失败不会阻止自动筛选。
