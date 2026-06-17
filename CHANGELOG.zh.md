# 更新日志

`bailian-cli` 和 `bailian-cli-core` 的所有重要变更都记录在此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。两个包共享一个版本号,总是一起发布。

[English](CHANGELOG.md) · [README](README.zh.md) · [参与贡献](CONTRIBUTING.zh.md)

## [1.4.0] - 2026-06-17

### 新增

- 控制台网关地址现在通过 **region + site** 映射表解析，不再依赖单一硬编码值。支持 `cn-beijing` 与 `ap-southeast-1` 两个 region，各含国内站 / 国际站变体，并新增 `switchAgent` 委托访问支持。
- 新增全局标志 `--console-region`、`--console-site`、`--console-switch-agent`，按 CLI 标志 → 配置文件 → 默认值的优先级流转，自动作用于所有控制台网关命令；`bl console call` 另外新增 `--site` 与 `--switch-agent`。
- `bl auth login --base-url <url>`：与 `--api-key` 配合使用时，会针对指定 base URL 校验 key 并持久化。
- `bl auth login --console` 现在会从登录回调中解析并持久化 `workspace_id`、`base_url`、`site`、`region` 和 `switchAgent`。
- `bl omni` 新增 `--voice` 选项（Chelsie、Cherry、Ethan、Serena、Sunny、Tina，默认 Cherry）。

### 变更

- 所有面向用户的 CLI 文案统一为英文。
- 命令是否需要默认 API-Key 引导改为在 `defineCommand` 上通过 `skipDefaultApiKeySetup` 声明，取代 `main.ts` 中集中的 `NO_AUTH_SETUP` 列表。
- 配置文件中的 `base_url` 现在优先级高于环境变量 `DASHSCOPE_BASE_URL`。
- `bl config show` 现在展示 `config.json` 中的全部字段（敏感值已脱敏），不再只展示精选子集，也不再显示已移除的 `region` 字段。
- 重构了 `usage` 与 `quota` 命令的访问令牌解析逻辑，控制台鉴权更可靠。
- 默认控制台登录页设为正式中国站地址（`https://bailian.console.aliyun.com`）。

### 移除

- 移除遗留的 `region` 配置字段及其全部相关逻辑、选项与埋点；region 现在由上述控制台网关解析推导得出。
- 清理 `model list` 命令移除后遗留的无效代码。

### 修复

- 当控制台会话未登录或已过期时，CLI 现在会抛出明确的 `AUTH` 错误并提示运行 `bl auth login --console`，不再是笼统的网关错误。

## [1.3.3] - 2026-06-16

### 变更

- `bl knowledge retrieve --help` 现在明确指出 `--api-key` 是推荐的鉴权方式；AK/SK 相关选项已标注废弃并引导用户使用 `--api-key`。

### 新增

- 命令定义新增 `notes` 字段 — 命令可以附带上下文说明（鉴权要求、废弃提示等），同时展示在 `--help` 输出和生成的命令手册中。

## [1.3.2] - 2026-06-12

### 修复

- 修复 `bl omni --audio` 始终返回 HTTP 400 的问题（#54），音频输入现已能正常理解。

## [1.3.1] - 2026-06-12

### 修复

- `bl` 现在会读取 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` 环境变量(#35)。Node 内置的 `fetch`(undici)默认忽略代理环境变量,导致 VPN 或公司代理下出现 `ECONNRESET`。现已在启动时根据这些变量安装全局代理 dispatcher,并在 `ECONNRESET` 报错提示中给出 `export HTTPS_PROXY=http://127.0.0.1:<port>` 的指引。

## [1.3.0] - 2026-06-11

### 新增

- `bl usage` 命令组：
  - `bl usage free` — 查询所有模型的免费额度（可通过 `--model` 指定模型）。
  - `bl usage freetier` — 启用（`--on`）或禁用（`--off`）免费额度模型的自动停服。
  - `bl usage stats` — 查询模型用量统计（需指定 `--workspace-id`）。
- `bl quota` 命令组：
  - `bl quota list` — 查看模型 RPM/TPM 速率限制（支持 `--model` 过滤，`--all` 展示全部）。
  - `bl quota check` — 查看当前 RPM/TPM 用量与速率限制。
  - `bl quota history` — 查看配额变更记录，支持分页。
  - `bl quota request` — 申请模型临时配额提升。
- `bl workspace list` — 列出所有业务空间，包含地域和 endpoint 信息。
- `bl knowledge retrieve` 新增 API-Key 鉴权（DashScope 网关），与原有 AK/SK 并存，可用时自动优先使用 API-Key。
- 新增检索参数：`--dense-similarity-top-k`、`--sparse-similarity-top-k`、`--rerank-model`、`--rerank-mode`、`--rerank-instruct`，API-Key 与 AK/SK 两条链路均支持。
- `bailian-cli-core` 新增 `DashScopeKnowledgeRetrieveRequest` / `DashScopeKnowledgeRetrieveResponse` 类型及 `knowledgeRetrieveEndpoint` 端点。
- 知识库检索全面 E2E 测试，覆盖两种鉴权路径、dry-run、rerank 参数及错误场景。

### 变更

- 凭据解析优先级：显式 API-Key → 显式 AK/SK flag → 自动检测 API-Key → 回退至配置/环境变量中的 AK/SK。
- `--workspace-id` 仅在 AK/SK 鉴权时必填，API-Key 模式下不再强制要求。
- `--top-k` 标记为废弃，改用 `--rerank-top-n`；使用时输出警告并自动映射。
- `--access-key-id` / `--access-key-secret` 标记为废弃（推荐使用 API-Key）。
- 全部文档中的 API Key 和控制台链接更新为直达密钥管理页面。

### 修复

- AK/SK 链路 `--rerank` 现在正确设置 `EnableReranking`，而非之前无效的 `Rerank: true` 布尔值。

## [1.2.1] - 2026-06-09

### 变更

- Skill 安装命令从 `npx skills add modelstudioai/skills` 更新为 `npx skills add modelstudioai/cli --all -g`，所有 README 和文档已同步。
- `bl update` 现在会在 CLI 升级后自动更新 `bailian-cli` agent skill。
- 全仓库 `README_CN.md` 统一重命名为 `README.zh.md`（ISO 639 命名规范）。

### 新增

- 官方 skill（`skills/bailian-cli/`）迁入本仓库，pre-commit 自动生成 reference 文档并同步 SKILL.md 版本号。
- `bailian-cli` skill 新增中英文双语 README。

## [1.2.0] - 2026-06-05

### 新增

- `bl mcp` 命令组：`bl mcp list` 列出 MCP 服务器，`bl mcp tools <server>` 查看可用工具，`bl mcp call <server>.<tool>` 通过 `--arg k=v` 或 `--json` 调用工具。
- `bl advisor recommend` — 用自然语言描述任务需求，智能推荐最合适的模型，展示上下文窗口、定价及能力详情。

### 修复

- 图片/视频水印始终开启的问题，现在正确遵守 `bl config set watermark false` 配置。
- 成对 flag（如 `--watermark` / `--no-watermark`）现已正确互斥。
- 可选参数为空时 flag 校验不再崩溃。
- **安全**：凭据不再泄漏到磁盘日志，文件权限已收紧。
- **安全**：校验 `base_url` / `console_gateway_url` 为合法 HTTP(S) URL。
- **安全**：script/JS `code` 字段强制为字符串字面量（阻止不可信代码 RCE）。
- **安全**：URL 路径段已百分号编码，SSE 缓冲区设上限。
- **安全**：流水线规划、指针遍历及并发安全加固。
- MCP 命令现在在参数校验和 dry-run 检查之后才处理鉴权。

### 变更

- 所有命令的 flag 默认值文案统一并去重。
- 非法/未知 flag 名称现在会报明确错误，而非静默忽略。

## [1.1.3] - 2026-06-02

### 新增

- `bl auth login --console` 在未配置 DashScope API Key 时会自动获取并保存,一次浏览器登录即可完成 OAuth 与 API Key 配置。

### 变更

- API Key 校验更稳健:网络 / 401 / 5xx 等瞬时错误会自动重试,单次请求超时上限收紧为 30 秒。

## [1.1.2] - 2026-05-29

### 变更

- 默认视觉模型由 `qwen-vl` 升级为 `qwen3-vl-plus`,视觉推理与图表/文档解析能力更强。

### 修复

- 修复 1.1.0 开源切换后暴露的 TypeScript / lint 问题。

## [1.1.1] - 2026-05-29

仅文档更新，CLI 与 SDK 行为无变化。

### 新增

- 新增 `INSTALL.md`，提供面向 AI Agent 的安装指引。

### 变更

- 同步根目录与 `packages/cli` 的 README 互链；中文 README 与英文版对齐。
- 移除 README 中的 unpkg 链接,改用官方来源。
- `tools/release.mjs` 在发布前会校验根目录与 `packages/cli` 的 README 保持同步。

### 修复

- `tools/release.mjs check` 现在会先构建包再执行类型检查,确保 `bailian-cli-core` 在干净检出环境下能正确解析(此前会级联出约 80 个虚假的 TS 错误)。

## [1.1.0] - 2026-05-28

GitHub 上的首次公开发布。本项目此前在内部开发,这是首个以 Apache-2.0 协议开源的版本。

### 新增

让您的 AI Agent 开箱就具备以下能力,并可在复杂任务中自动组合调用:

**模型服务**

| 能力       | 默认服务                    | 简介                                                             |
| ---------- | --------------------------- | ---------------------------------------------------------------- |
| 文本生成   | `qwen3.7-max`               | 面向智能体时代的旗舰 Max 模型,编程、办公与长周期自主执行能力出色 |
| 语音生成   | `cosyvoice-v3-flash`        | 多音色实时流式合成,自然度/情感增强,5-20s 样本即可克隆            |
| 语音识别   | `fun-asr`                   | 汉语七大方言 + 20+ 口音官话,覆盖 30 种语种                       |
| 图像生成   | `qwen-image-2.0`            | 图片生成与编辑融合,专业文字渲染、真实质感、强语义遵循            |
| 图像编辑   | `qwen-image-2.0`            | 智能编辑,支持多图合成                                            |
| 图生视频   | `happyhorse-1.0-i2v`        | 精准理解文本语义,输出流畅自然的高质量视频                        |
| 文生视频   | `happyhorse-1.0-t2v`        | 高度还原动态画面,细节丰富                                        |
| 参考生视频 | `happyhorse-1.0-r2v`        | 支持最多 9 张图片参考,稳定主体与场景保持                         |
| 视频编辑   | `happyhorse-1.0-video-edit` | 自然语言指令编辑视频,支持最多 5 张图片参考                       |
| 视觉理解   | `qwen-vl`                   | 长视频分析、图表/文档解析、视觉推理、多语言 OCR                  |

**应用数据**

| 能力   | 默认服务         | 简介                                           |
| ------ | ---------------- | ---------------------------------------------- |
| 知识库 | 阿里云百炼知识库 | 多模态数据知识库增删改查检索,需 AccessKey 认证 |
| 记忆库 | 阿里云百炼记忆库 | 跨会话持久化存储,提供个性化连贯对话体验        |

**应用构建**

| 能力       | 默认服务   | 简介                     |
| ---------- | ---------- | ------------------------ |
| 工作流调用 | 工作流服务 | 调用已有的工作流应用服务 |
| 智能体调用 | 智能体服务 | 调用已有的智能体应用服务 |

**工具能力**

| 能力         | 默认服务                            | 简介                                                              |
| ------------ | ----------------------------------- | ----------------------------------------------------------------- |
| 联网搜索     | `bailian_web_search`                | 实时互联网全栈信息检索,提升回答准确性及时效性                     |
| 临时文件上传 | 临时文件上传服务                    | 免费临时存储空间,上传本地文件获得 URL(有效期 48 小时)             |
| 模型额度查询 | 模型额度查询                        | 根据模型 id 查询可以使用的免费额度                                |
| 接口文档     | 阿里云百炼模型应用 API 调用参考文档 | 在构建应用的过程中,自动为您的应用集成阿里云百炼模型和应用能力 API |
