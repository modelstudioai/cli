# 更新日志

`bailian-cli` 系列包的所有重要变更都记录在此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。`bailian-cli`、`bailian-cli-core`、`bailian-cli-runtime`、`bailian-cli-commands`、`knowledge-studio-cli` 共享一个版本号。

[English](CHANGELOG.md) · [README](README.zh.md) · [参与贡献](CONTRIBUTING.zh.md)

## [1.11.0] - 2026-07-28

### 新增

- **`bl config agent --key` / `--region`** —— 百炼控制台生成的命令可直接运行：`--key` 接收控制台编码后的 API Key 并在本地解码（与 `--api-key` 二选一）；`--region` 根据地域名自动派生 Token Plan 接入地址（与 `--base-url` 二选一）。
- **`bl config agent --context-window`** —— 设置写入 OpenClaw 配置的上下文窗口大小（默认 256000）。
- **`bl config agent --wire-api`** —— 选择写入 Codex 配置的通信协议；`chat` 仅保留给 Codex 0.80.0 及更早版本（会显示警告）。

### 变更

- `bl config agent` 配置 Codex 时默认写入 `wire_api = "responses"`，以适配已不再支持 `chat` 的新版 Codex。
- `bl config agent` 配置 Qwen Code 时改用 `DASHSCOPE_API_KEY` 环境变量，不再使用 `BAILIAN_CLI_API_KEY`。

### 修复

- `bl config agent` 写入的配置现已与各 Agent 官方格式对齐：Claude Code 尊重 `CLAUDE_CONFIG_DIR` 并清理残留的 `ANTHROPIC_API_KEY`；Qwen Code 采用 v3 配置 schema 并正确写入凭证，避免被系统级 `OPENAI_API_KEY` 干扰；OpenCode 支持带注释和尾部逗号的 JSONC 配置文件；OpenClaw 会将主模型注册进模型白名单并补齐计费元数据；Hermes 改用官方扁平 `model.*` 结构；Codex 写入官方 `env_key` 并支持 `auth.json` 兜底。
- `bl config agent` 写入配置时现会保留用户已有配置：合并而非覆盖，避免重复添加 provider 条目，并保留用户自定义的显示名。

## [1.10.1] - 2026-07-22

### 变更

- Token Plan 默认模型已更新为当前文本、图片，以及文生视频、图生视频和参考生视频的专用模型。
- 百炼 CLI Skill 现在能更准确地区分百炼专属任务与普通宿主 Agent 任务，并避免在已授权的工作流中重复征求同意。
- 已发布的 CLI 包现在支持 Node.js 18.17 及以上版本，最低版本要求由 Node.js 22.12 下调至 18.17。

### 修复

- Token Plan 现在能在图片编辑、图生视频、参考生视频和视觉理解中正确处理本地图片，无需另行托管为 URL。

## [1.10.0] - 2026-07-19

### 新增

- **`bl config agent`** —— 一键配置 Claude Code、Qwen Code、OpenCode、OpenClaw、Hermes Agent 和 Codex 接入百炼模型服务。

### 变更

- 百炼 CLI Skill 现在只将匹配的百炼任务与多模态任务路由到 `bl`，并会在调用与平台无关的远程或计费能力前征求同意。

### 修复

- 完整执行 `bl auth logout` 时会同时清除模型 Base URL，避免后续登录继承失效的自定义或 Token Plan 接入地址。

## [1.9.0] - 2026-07-17

### 新增

- **支持 Token Plan** —— 登录后即可直接调用支持的模型，无需手动配置接入地址。
- **命名 Config Profile** —— 支持创建、切换和管理相互隔离的配置，登录后会自动激活当前 Profile。
- **Console Access Token 自动化** —— 支持生成并自动刷新 Console Access Token。
- **`bl workspace init`** —— 一站式完成百炼工作空间初始化和所需服务开通。

### 修复

- 提升配置安全性与一致性，包括密钥脱敏和自定义配置字段保留。

## [1.8.3] - 2026-07-16

### 修复

- 修复 Windows 上 `bl text chat --messages-file -` 将标准输入当作 `/dev/stdin` 文件路径读取的问题；通过管道传入的 JSON 消息现在可以从标准输入正常读取。（#103）

## [1.8.2] - 2026-07-15

### 变更

- `bl model list` 现在默认以 JSON 输出；需要表格视图请传 `--output text`。

### 修复

- `bl model list --enrich` 现在能正确返回每个模型的输入参数 schema（predictConfig）；此前因未解包控制台网关响应信封而始终为空。

## [1.8.1] - 2026-07-14

### 变更

- 扩展 Command Pack 白名单，允许加载额外的内部命令扩展。

## [1.8.0] - 2026-07-13

### 新增

- **`bl model list`** —— 浏览百炼模型市场：列出模型家族，或用 `--model` 查看单个家族的完整详情；支持按 provider、能力、特性、上下文窗口过滤，分页（`--page` / `--page-size`）、价格展示，以及 `--enrich` 获取更丰富的元数据。
- **`bl usage summary`** —— 统一用量视图，一屏合并免费额度与近期用量概览；`--days` 设置概览时间窗口（默认 7 天）。
- **Command Pack 宿主支持** —— 新增面向白名单内部命令扩展包的加载能力。
- **音频与图像精调** —— 在原有文本流程之外新增 `bl finetune audio create`（CosyVoice 语音合成）与 `bl finetune image create`（万相图像生成）。`bl finetune image create` 支持 `--generation-type t2i|i2i` 显式选择文生图或图生图训练。
- **音频与图像部署** —— `bl deploy audio create` 与 `bl deploy image create` 可将精调后的语音合成与图像模型部署为推理接入点。
- **多模态数据集校验** —— `bl dataset upload` 与 `bl dataset validate` 现在支持使用 `tts`、`image` schema 的 `.zip` 压缩包，可校验包内引用的媒体文件，图像数据压缩包上限提升至 1 GB。

### 变更

- **精调与部署命令按模态拆分（BREAKING）**：`bl finetune create` → `bl finetune text create`，`bl deploy create` → `bl deploy text create`。请更新使用旧路径的脚本。
- **部署参数重命名（BREAKING）**：部署创建命令的 `--template-id` 更名为 `--deploy-spec`。
- **精调状态退出行为变更（BREAKING）**：`bl finetune watch` 不再使用退出码 3 表示任务运行中；运行中与成功均返回 0，失败与取消使用 CLI 的常规错误流程。
- `bl deploy audio create` 默认使用 `--plan mu`（按模型单元计费，符合 CosyVoice 部署契约）；文本与图像仍默认 `lora`。
- `bl finetune audio create` 现在会校验 CosyVoice 训练数据：音频必须为 `.wav`，每条 `wav_fn` 必须以 `train/` 开头，且只接受一个训练文件。
- `bl quota list` 与 `bl quota check` 现在会基于监控数据展示真实的 RPM/TPM 用量与限额，新增 `RPM Left` / `TPM Left` 列及剩余额度进度条。
- `bl usage free` 的输出现在与 `bl usage summary` 共用渲染逻辑，免费额度表格更一致。
- `bl advisor recommend` 不再依赖独立的意图识别模型来分析你的需求。

### 已移除

- **移除 `bl advisor recommend` 使用的 `tongyi-intent-detect-v3` 集成（BREAKING）**，同时移除 `intent_detect_base_url` 配置字段与 `DASHSCOPE_INTENT_DETECT_BASE_URL` 环境变量。

### 修复

- Skill 命令参考文档生成现在直接读取产品命令源码，并在发布检查中保持稳定格式。

## [1.7.0] - 2026-07-09

### 新增

- `bl auth login --open-api` 现在可以保存阿里云 OpenAPI AK/SK 凭据，供 Token Plan 命令使用；`bl auth status` 会分别展示 API Key、控制台和 OpenAPI 凭据状态，`bl auth logout --open-api` 可只清除 OpenAPI 凭据。
- `kscli` 的 help 与示例现在展示为 `kscli search`、`kscli chat`、`kscli retrieve` 等 Knowledge Studio 独立入口路径。

### 变更

- Token Plan 命令统一使用 OpenAPI AK/SK 凭据流程，支持登录持久化凭据和 `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET` 环境变量。
- 鉴权 flag 现在只对可使用它们的命令生效。把模型、控制台或 OpenAPI 凭据 flag 传给错误的命令时，现在会报 unknown flag，而不是接受后忽略。
- help 与命令参考现在只展示当前命令鉴权域适用的 flag，更容易区分模型、控制台和 OpenAPI 凭据。
- 缺少必填 flag 时现在返回用法错误并以退出码 2 退出，不再进入交互式补全或打印 help 后以退出码 0 退出。
- 图片、视频、语音任务类命令现在统一用 `--async` 表示提交任务后不等待；`--concurrent` 只在支持并发请求的命令上展示。
- 命令默认输出为文本；仅在显式设置 `--output json`、`DASHSCOPE_OUTPUT=json` 或配置文件要求 JSON 时输出 JSON。
- 更新检查节流调整为每天一次，并可在非 TTY / agent 场景展示更新提示。
- 代理配置现在只读取大写 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`，忽略小写代理环境变量。
- `bl auth login` 成功后不再额外打印 onboarding quick start 内容。

### 已移除

- 移除 `bl knowledge retrieve` 已废弃的 AK/SK 鉴权；知识库命令请使用 DashScope API Key。
- 移除 `--no-color`、`--non-interactive` 和 `--no-wait`。纯文本输出使用 `NO_COLOR=1`，提交任务后不等待使用 `--async`。
- 移除删除 / 登出类命令的 `--yes` 与交互式确认提示；执行破坏性操作前请用 `--dry-run` 预览。

### 修复

- 需要凭据的 `--dry-run` 路径现在会跳过鉴权前置检查，例如 Token Plan 可在未配置凭据时先打印请求信息。
- `--verbose` 的模型请求日志恢复输出请求方法、URL、鉴权来源与响应状态等信息。

## [1.6.1] - 2026-07-03

### 变更

- `bl vision describe` 的示例与 skill 参考文档中的模型 id 由旧版 `qwen-vl-plus` 更新为 `qwen3-vl-plus`，与命令默认模型保持一致。

## [1.6.0] - 2026-07-02

### 新增

- `bl knowledge search` — 基于新版 workspace RAG API 的知识库语义检索。支持 `--query`、`--agent-id`、`--workspace-id`、`--image`（多模态检索，可重复）和 `--query-history`（多轮对话上下文 JSON，用于查询重写）。
- `bl knowledge chat` — 知识库 SSE 流式问答。支持 `--message`（可重复，支持 `角色:内容` 前缀传入多轮历史）、`--agent-id`、`--workspace-id` 和 `--image`（多模态）。交互模式下实时展示检索、规划、生成等步骤进度。
- `bailian-cli-core` 新增 workspace 级知识 API 类型与端点：`KnowledgeSearchRequest` / `KnowledgeSearchResponse`、`KnowledgeChatRequest` / `KnowledgeChatStreamChunk` / `KnowledgeChatMessage` / `KnowledgeChatContentPart`，以及 `knowledgeSearchEndpoint` / `knowledgeChatEndpoint`。
- `kscli` 现已包含 `search` 和 `chat` 命令。

### 变更

- `bl knowledge retrieve` 描述中已标记为废弃，请改用 `bl knowledge search`。
- `kscli` README（中英文）更新，以 `search` 和 `chat` 为主推命令，`retrieve` 标记为废弃。

## [1.5.0] - 2026-07-01

### 新增

- 模型精调 —— `bl finetune`:创建、列出、查询、观察、取消训练任务;拉取训练日志;列出 checkpoint;将 checkpoint 导出为可部署模型;查询训练能力(按模型或按训练类型)。支持 `sft`、`sft-lora`、`dpo`、`dpo-lora`、`cpt` 训练类型。
- 模型部署 —— `bl deploy`:创建、列出、查询、更新(限流)、扩缩容、删除部署;列出可部署模型与套餐。
- 数据集管理 —— `bl dataset`:上传、列出、查询、删除数据集文件,并新增 `bl dataset validate` 在上传前本地校验 `.jsonl`(ChatML / DPO / CPT 格式)。
- Token Plan 管理 —— `bl token-plan`:列出订阅座位、添加成员、批量分配座位、为座位创建 API Key。
- 自动更新检查:命令执行完成后,CLI 会(节流地)检查 npm 上是否有新版本并提示 `Update available`;若与稳定版存在大版本差距则自动升级。`--quiet` 或执行 `bl update` 时跳过。
- 可组合包:`bailian-cli-runtime`(CLI 框架)与 `bailian-cli-commands`(命令库)现在与 `bailian-cli-core` 一起发布,并在其之上新增了同家族 CLI `knowledge-studio-cli`(`kscli`)。`bl` 行为保持不变。

### 已移除

- 移除 `bl config export-schema` 命令(原用于把 CLI 命令导出为 Anthropic/OpenAI 兼容的 JSON tool schema)。

### 修复

- 控制台网关类命令(`bl console call` 等)在网关返回非字符串 `errorCode` 时,现在会给出可读的错误信息,而不是 `[object Object]`。

## [1.4.2] - 2026-06-24

### 新增

- `bl omni --list-voices` 无需 API key 即可打印内置输出音色列表(ID、名称、描述、语言)并退出。内置音色表从 6 个扩展到 17 个,新增 Dylan、Sunny、Kiki 等方言音色。

### 变更

- `bl omni` 默认 `--voice` 改为 `Tina`(原为 `Cherry`)。`--voice` 帮助文案改为指向 `--list-voices`,不再内联列出全部音色。
- `bl speech synthesize --list-voices` 输出及缺少 `--voice` 时的提示中,新增官方 CosyVoice 音色文档链接。
- Agent skill 配置指引新增 console 站点选择说明(`--console-site domestic` / `international`),适用于 console 登录与网关类命令。

### 修复

- `bl speech synthesize` 修正 `cosyvoice-v3-flash` 内置音色 ID,由 `longanhuan` 改为 `longanhuan_v3`。

## [1.4.1] - 2026-06-22

### 变更

- 视频生成默认升级到 HappyHorse 1.1 模型,画面质量更佳。如需使用 1.0 模型,可通过 `--model` 指定。
- `bl update` 现在会把 agent skill 同步更新到所有 agent 应用(Claude Code、Cursor 等),即使 CLI 已是最新版本也会刷新 skill。

## [1.4.0] - 2026-06-17

### 新增

- 控制台网关支持多 region 与多站点：`cn-beijing` 与 `ap-southeast-1`，各含国内站 / 国际站变体，并新增 `switchAgent` 委托访问。
- 新增全局标志 `--console-region`、`--console-site`、`--console-switch-agent`；`bl console call` 另外新增 `--site` 与 `--switch-agent`。
- `bl auth login --base-url <url>`：使用 API Key 登录时可指定 base URL。
- `bl omni` 新增 `--voice` 选项（Chelsie、Cherry、Ethan、Serena、Sunny、Tina，默认 Cherry）。

### 变更

- 所有面向用户的 CLI 文案统一为英文。
- `bl advisor recommend` 内部意图 / 排序模型由 `qwen-turbo` 升级为 `qwen-flash`。
- 优化 `usage`、`quota`、`workspace` 命令的 JSON 输出。
- 配置文件中的 `base_url` 现在优先级高于环境变量 `DASHSCOPE_BASE_URL`。
- `bl config show` 现在展示 `config.json` 中的全部字段（敏感值已脱敏）。

### 移除

- 移除遗留的 `region` 配置字段及其相关选项。
- 清理 `model list` 命令移除后遗留的无效代码。

### 修复

- 当控制台会话未登录或已过期时，CLI 现在会给出明确的登录提示，不再是笼统的网关错误。
- 修正 `bl video` 命令 `--resolution` / `--ratio` / `--duration` 的帮助文案。

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
