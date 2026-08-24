# 百炼知识库 dsh 插件（out-of-tree bundle）设计

> 状态：设计已确认并实现（v0.1.0 待真实 API smoke 后打 tag）。

## 1. 背景与目标

为 DeepSeek Harness（dsh）提供阿里云百炼知识库（Knowledge Studio / RAG）垂类能力。经对比 MCP、CLI、API 三种接入通道后确定分层混合架构：

- **高频检索面走 API 直连原生工具**：结构化 schema、进程内 HTTP、结果可 snapshot、体验可打磨；
- **低频管理长尾走 kscli + skill**：`knowledge-studio-cli`（与 `bl knowledge` 同源实现的轻量发行面）覆盖建库/上传/部署等 34 个子命令，渐进式披露，零插件维护成本；
- **不做 MCP 通道**：托管 rag MCP 面向不拥有 API/CLI 的第三方宿主，非本方案投入点。

## 2. 范围

**做：**

- 三个模型面工具：`kb_service_list`、`kb_search`、`kb_chat`（API 直连）；
- 一个管理面 skill（引导 agent 使用 kscli）；
- bundle 分发形态与配置、凭证、错误、测试设计。

**不做（含理由）：**

| 项 | 理由 |
|---|---|
| `retrieve` 工具 | 服务端已弃用（`search` 取代）；新表面不携带 deprecated 能力，避免近义工具混淆 |
| MCP 通道 | 见 §1 |
| chat 进展流式 UI（模式 4） | 一期用缓冲式 + 期望管理，看真实使用反馈再决定（见 §7 与附录 A） |
| `run_in_background` 后台模式 | dsh jobs 机制已备好，出现真实需求再加 |
| skills 生态独立分发（B-3） | 一期 skill 随 bundle 注册；跨宿主分发留待后续 |
| 运行时 API/CLI fallback | 每个操作固定一条通道；双实现漂移与故障掩盖的代价大于收益 |

## 3. 总体形态

独立仓库维护的 **out-of-tree bundle**：`package.json` 声明 `dsh.bundle` 指向 patch 文件，安装进 dsh profile 的 patch 层；不进入 deepseek-harness 主仓库，不改变 modelstudioai/cli 仓库的定位。

命名：

- bundle 包：`bailian-kb-bundle`
- 插件包：`dsh-tool-bailian-kb`

仓库为独立 pnpm workspace（目录 `workspace/bailian-kb-bundle`，独立 git 仓库），两包结构：`packages/tool-bailian-kb`（插件本体：Config、client、三个工具、随包打包的 `skills/bailian-kb-management/SKILL.md`）与 `packages/bundle`（分发面：`dsh.bundle` 声明、`cordis.patch.yml`，`dependencies` 含插件包）。拆分依据：patch row 的 bare 插件名必须出现在 bundle 的 `dependencies`，插件包保持纯净（仅 `@deepseek-ai/cordis` peer + dsh 能力包依赖）。

插件为函数插件形态（`name` / `inject: ['tools']` / `Config` / `apply`），在 `apply(ctx, config)` 中构建共享 API client 并注册三个工具。

### 3.1 接入与配置流程

**bundle 侧接入契约**（`@deepseek-ai/dsh-base` 为模板）：

- `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，并在 `exports` 暴露 `./cordis.patch.yml`；
- `cordis.patch.yml` 用 `insert` 插入插件 row 与 skill 注册 row；row 中的 bare 插件名必须出现在 bundle 自身的 `dependencies`；
- 发布到 npm，或直接以 git spec 分发（`github:<org>/<repo>`）。

**用户安装**：

```sh
dsh plugin --profile web add bailian-kb-bundle
```

CLI 转发 pnpm 将 bundle 装为 profile dependency；安装后自动 reconcile——检测到 `dsh.bundle` 声明即加入 `dsh.profile.bundles` 层栈，无需手改 YAML。boot 层序为 `dsh-base` → … → 本 bundle patch → profile `cordis.patch.yml` → 家目录 `cordis.patch.yml`，用户 patch 层在本 bundle 之上，插入的任何 row 均可被按 id 覆盖或禁用。卸载 `dsh plugin --profile web remove bailian-kb-bundle` 自动收回层栈。

**配置落点**：用户 patch 是整 config 替换（无 deep-merge），因此 bundle row 的 config 默认从环境读取：

```yaml
config:
  workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

用户将 `BAILIAN_WORKSPACE_ID` 写入 `~/.dsh/.env` 即可运行（`DASHSCOPE_API_KEY` 放同处或 `.credentials.yaml`）；需要精细控制的部署再以 id-targeted patch 覆盖整个 config。`workspaceId` 缺失时按 §6 在加载期 fail loud，错误信息指向 `.env` 配置方式。验证入口：`dsh --profile web --dump-config` 可见本 bundle 的 row。

**本地开发迭代**：checkout 内 `dsh plugin --profile dev add .`（相对路径锚定调用目录）；patch 文件受 HMR 监听，编辑后自动 recompose。

## 4. 模型面工具

### 4.1 `kb_service_list`

发现当前 workspace 的检索/问答服务（百炼"检索服务"，即 `agent_id` 的来源）。

| 参数 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `scene` | enum `chat` \| `search` | 否 | 省略时插件内部对两个 scene 各查一次并合并；每个条目携带 scene 标记（指明该服务配 `kb_chat` 还是 `kb_search` 使用） |
| `name_filter` | string | 否 | 服务名模糊匹配，透传服务端 `agent_name` |

返回：服务条目数组（`agent_id`、名称、描述、scene、status、绑定的知识库）+ `total`。

**分页内部消化**：固定 `page_size=100, page_number=1`（服务端上限 100）。`total > 100` 时结果末尾附提示 `listed first 100 of N services; narrow with name_filter`。不向模型暴露翻页参数——模型的导航原语是名字过滤，不是页码。

**status 不作为参数**：条目携带 `status` 字段，description 提示优先使用 `deployed`；draft 服务仅在 `agentVersion: beta` 的调试部署下可调（部署期概念，不占模型参数面）。

### 4.2 `kb_search`

语义检索，返回原始知识片段供 agent 综合与引用。

| 参数 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `query` | string | 是 | 检索文本 |
| `agent_id` | string | 见 §5 | 检索服务 id（scene=search 的服务）；检索范围与策略（多库加权、路由、重排）由服务端配置决定 |
| `top_k` | integer | 否，默认 5 | 返回片段数上限。服务端 search API 无此参数（条数由检索服务配置决定），插件对按 score 降序的 `nodes` 做客户端截断；description 写明该语义 |
| `images` | string[] | 否 | 多模态检索的图片 URL |

返回：chunks 数组（内容 + 来源引用）。

### 4.3 `kb_chat`

知识库成品问答。服务端为 agentic loop（分析 → 多轮检索 → 生成），耗时可达分钟级。

| 参数 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `message` | string | 是 | 问题 |
| `agent_id` | string | 见 §5 | 问答服务 id（scene=chat） |

返回：完整答案文本（含 API 提供的引用信息时一并返回）。

### 4.4 description 路由策略

`kb_search` 与 `kb_chat` 的 description **互相指名分界**，把"该用谁"写成可判断条件而非形容词：

- `kb_search`：returns raw knowledge chunks with source references；用于需要核实、引用、或与其他上下文结合推理的场景；
- `kb_chat`：a complete, domain-tuned answer produced by a specialized RAG pipeline (retrieval + reranking + grounded generation)；知识问答场景通常优于自行检索综合（typically outperforms searching and synthesizing yourself when the question can be answered by the knowledge base alone）；并注明 may take a few minutes。

## 5. `agent_id` 的三种场景覆盖

| 场景 | 机制 | 插件成本 |
|---|---|---|
| 发现式 | `kb_service_list` → 选服务 → search/chat；`agent_id` 缺失或无效时，错误信息直接附当前服务清单，模型一步纠正 | 发现工具 + 错误增强 |
| 用户习惯固定 | 宿主 memory / 项目指令记住常用 `agent_id` | 零（skill 写入最佳实践） |
| 场景/部署固定 | Config 可选 `defaultAgentId`；配置后注册时将 `agent_id` 参数降为可选，description 注明缺省服务 | 一个可选配置字段 |

**Schema 形态在加载期由配置静态决定**（未配 `defaultAgentId` 则 `agent_id` 必填），不是运行时 fallback；每个部署只有一条清晰规则，KV cache 前缀与 snapshot 均稳定。与 dsh preset 组合可实现按场景绑定（如客服 preset 固定客服库）。

## 6. 配置与凭证

```ts
interface Config {
  /** 百炼工作空间 id。知识库 API 的 host 为 workspace 子域名：`https://<workspaceId>.<endpointHost>`。必填。 */
  workspaceId: string
  /** 知识库 API 的 host 后缀。默认 `cn-beijing.maas.aliyuncs.com`；其他 region/私有化部署时替换。 */
  endpointHost: string
  /** 场景固定式部署绑定的检索服务 id。可选。 */
  defaultAgentId?: string
  /** 调用的服务版本：beta（草稿调试）或已发布版本号。可选，缺省最新发布版。不暴露给模型。 */
  agentVersion?: string
  /** kb_chat 超时毫秒数。chat 为分钟级 loop，部署必须可调。默认 300000（5 分钟）。 */
  chatTimeoutMs: number
}
```

- schemastery 校验；缺失/非法配置在**加载期 fail loud**；
- API Key 走 `ctx.credentials` 引用（`DASHSCOPE_API_KEY`，env/.env provider），不进 Config、不进会话日志、不被 `--dump-config` 打印；
- URL 拼接是 `(endpointHost, workspaceId, path) → endpoint` 的纯函数（`https://${workspaceId}.${endpointHost}${path}`，与 kscli 的 `ragEndpoint` 同构），与请求构造、错误翻译一起收在插件内部的共享 client 中（协议路径为代码常量，不进配置）。

## 7. 执行语义

- **`kb_chat` 缓冲式**（与 bash 前台/subagent 同构的仓库惯例：dsh 中没有工具向模型或 UI 中途推流）：`execute` 内部消费完 SSE，一次性返回完整答案。UI 呈现为 `presentCall` pending 卡片 → `presentResult` 完成卡片（`generic` 卡，纯函数、replay-safe）；
- **期望管理**：description 与 pending 卡片标题注明 may take a few minutes；
- **超时**：`chatTimeoutMs` 显式可配（dsh tool-timeout guard 可另行部署级配置）；
- **超长输出**：声明依赖 dsh spill 子系统兜底，插件不自造截断。

## 8. 管理面 skill

- SKILL.md 随插件包打包；插件在 skills 服务可用时通过 `ctx.inject(['skills'], …)` 以 `ctx.skills.register()` 运行时注册（`source: 'bundled'`，`resourceBase` 指向包内 skill 目录），无 skills 服务的组合不受影响；工具与 skill 同版本发布，互相引用不漂移；
- 内容：kscli 安装引导（`npm install -g knowledge-studio-cli`）、API Key 与 workspace 解析（flag > `BAILIAN_WORKSPACE_ID` > 配置文件）、典型工作流（建库 → 上传 → 等解析 → 部署服务 → 检索验证）、"常用 `agent_id` 写入项目指令/记忆"最佳实践、检索面与管理面的分工说明（search/chat 用原生工具，不走 kscli）；
- kscli 未安装时管理操作 fail loud 并给出安装命令；检索面不受影响。

## 9. 错误处理

- HTTP 错误翻译为模型可操作的文本：无效 `agent_id` → 附当前服务清单；鉴权失败 → 指向 API Key 获取与配置方式；超时 → 说明 chat 可能耗时并建议重试或改用 search；
- 凭证缺失在首次可解析点大声失败，不静默降级；
- 服务端非 2xx 的响应体原样摘要进错误信息（截断至安全长度），便于模型与用户诊断。

## 10. 测试策略

| 层 | 内容 |
|---|---|
| 单元测试 | endpoint 拼接、请求体构造（scene 合并、分页内化、`defaultAgentId` 解析）、错误翻译 |
| snapshot | mock HTTP fixture 的可重放 keyless snapshot，macOS/Linux 均可回放；覆盖三工具的调用与渲染卡片 |
| e2e | 真实 DashScope API，无 `DASHSCOPE_API_KEY` 时自跳过 |

## 附录 A：预留扩展（已设计方向，未排期）

- **chat 进展流式（模式 4）**：`execute` 消费 SSE 时 append 工具自有会话事件（如 `bailian/chat-progress`，`ignorable: true`），Web 客户端注册 `ConversationNodeDefinition` 渲染器实时显示；模型面不变（logged ≠ model-visible）。触发条件：真实用户对 chat 等待体验的负反馈；
- **后台模式**：`kb_chat` 增加 `run_in_background`，挂 `ctx.jobs`，`job_output` 收取；
- **skills 生态分发（B-3）**：以 bundle 仓库的 SKILL.md 为唯一源，发布到 `npx skills add` 生态覆盖其他宿主；
- **能力缝升级**：出现第二种传输（如私有化内网网关）时，将共享 client 提为 `ctx.<key>` 服务，按 Service Definition / Provider / Consumer 三角色拆分。

## 附录 B：关键决策记录

| 决策 | 结论 | 理由摘要 |
|---|---|---|
| 接入通道 | API（检索面）+ CLI（管理面），不做 MCP | 频率×能力深度×控制权分层；API/CLI 均为己方资产 |
| CLI 选型 | kscli 而非 bl | 同源实现零能力损失；命令面窄、鉴权单一、onboarding 短 |
| `retrieve` | 不做 | 已弃用，避免近义工具 |
| `kb_chat` 门控 | 不门控，常驻注册 | 服务端 RAG 管线在知识问答场景更专业，description 写明场景让模型路由 |
| `agent_id` 归属 | 模型参数 + 发现工具 + 可选 `defaultAgentId` | 检索服务是用户运行时资产，插件与部署配置不应假设 |
| chat 流式 | 一期缓冲式 | 仓库惯例（bash/subagent 同构）；进展流式留待反馈 |
| 分页 | 内部消化（page_size=100 + 溢出提示） | 模型导航原语是 name 过滤，非页码 |
