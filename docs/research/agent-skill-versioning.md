# Agent 扩展能力单元的版本感知与更新提示

- 调研日期：2026-10-30
- 调研问题：主流 AI coding agent 怎样给扩展能力单元（skill / plugin / extension / MCP server / rules）声明版本、感知版本和提示更新，以及 agent 能否在会话内知道自己正在用的能力包已经过期。
- 参照版本：Claude Code CHANGELOG 最新条目为 `2.1.314`；Agent Skills spec 已迁移至 `agentskills.io`；Agent Plugins 标准为 `1.0.0`；MCP 最新协议版本串为 `2026-07-28`。

## TL;DR

各家的做法基本一致：版本声明写在 plugin 或 package 清单里，skill 层没有；更新检查在 CLI 或 app 层做，结果只显示给人，不进模型上下文。Agent Skills 规范只定义 6 个 frontmatter 字段，其中没有 `version`。规范的示例把 `version` 放进自由字典 `metadata`，和本仓库 `tools/sync-skill-metadata.ts` 写 `metadata.version` 的做法相同。这种写法符合规范，但没有任何运行时会读它。

让模型自己感知版本也有可用的路径。Claude Code 官方文档为 SKILL.md 提供了 ``!`<command>`` `` 动态注入语法，可以把实时版本号送进模型上下文；这个语法是 Claude Code 专有的，并且可以用 `disableSkillShellExecution` 关掉。Claude Code 自己也改成通过 tool result 把 artifact 的版本变化告诉模型。反面的情况有两条：官方对 `<system-reminder>` 做了转义防护；伪造「critical update」通知已经是有记录的 skill 投毒手法。

## 横向对比表

| Agent / 生态                    | 扩展单元机制                                           | 有无 `version` 字段                                                                                                                                                 | 运行时是否读取                                                    | 更新提示方式                                                                                                                | 来源                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Skills spec（跨厂商规范） | `SKILL.md` frontmatter                                 | 无。只有 `name`/`description`（必填）和 `license`/`compatibility`/`metadata`/`allowed-tools`                                                                        | 否。`metadata` 是自由的字符串键值字典，规范不赋予语义             | 规范不涉及，分发和安装明确不在范围内                                                                                        | [agentskills.io/specification](https://agentskills.io/specification)                                                                                                                                                                    |
| Claude Code Skills              | `SKILL.md`                                             | 无 `version`；有 `metadata`（"Free-form YAML map"，"Claude Code doesn't act on its contents"）                                                                      | 否（`license`/`compatibility` 也是 "accepted but not acted on"）  | 没有 skill 级更新检查；`/skill-doctor` 只报告未使用的 skill 和 context 成本                                                 | [skills.md](https://docs.claude.com/en/docs/claude-code/skills.md)、[CHANGELOG:3392](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md)                                                                        |
| Claude Code Plugins             | `plugin.json` 和 `.claude-plugin/marketplace.json`     | 有，均为可选。marketplace 有 entry 级 `version`；`plugin.json` 优先                                                                                                 | 是，也是唯一驱动更新的版本                                        | 后台 auto-update（按 marketplace 开关），以及 `/plugin marketplace update`、`claude plugin update`                          | [marketplace-reference](https://code.claude.com/docs/en/plugins/marketplace-reference)、[host-marketplace](https://code.claude.com/docs/en/plugins/host-marketplace)                                                                    |
| Agent Plugins 1.0.0（开放标准） | `plugin.json`                                          | 有，非必填（`required` 只有 `$schema` 和 `name`），无格式约束（只是 `"type": "string"`）                                                                            | 标准不规定，分发和安装不在范围内                                  | 标准不涉及                                                                                                                  | [plugin.schema.json](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)                                                                                                                                                        |
| OpenAI Codex CLI                | `SKILL.md` frontmatter 和 sidecar `agents/openai.yaml` | 无。frontmatter 只反序列化 `name`/`description`/`metadata`，`metadata` 里只取 `short-description`；sidecar 有 `interface`/`dependencies`/`policy`，也没有 `version` | 否（`metadata` 里除 `short-description` 外的键被 serde 静默丢弃） | 没有扩展单元的更新检查（`config.md` 无相关配置项）                                                                          | [parser.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/parser.rs)、[metadata.rs](https://github.com/openai/codex/blob/main/codex-rs/skills/src/metadata.rs)                                                          |
| Cursor Rules                    | `.cursor/rules/*.mdc`                                  | 无（只有 `description`/`globs`/`alwaysApply`）                                                                                                                      | 否                                                                | 无，靠 git 版本控制和手工修改                                                                                               | [cursor.com/docs/context/rules](https://cursor.com/docs/context/rules)                                                                                                                                                                  |
| Cursor Plugins                  | `plugin.json` / `.cursor-plugin/plugin.json`           | 有 `version`（示例里有），但清单 "only require a `name`"                                                                                                            | 在清单层读取                                                      | 从 GitHub 导入的可开 "Enable Auto Refresh"（push 触发，最多每 10 分钟一次），也可手动 Refresh；Cloud Agent 运行期间锁定版本 | [cursor.com/docs/plugins](https://cursor.com/docs/plugins)                                                                                                                                                                              |
| OpenCode                        | Skills 和 plugins（`opencode.json`）                   | 无。skill frontmatter 没有 `version`；plugin 数组只收 npm 包名                                                                                                      | 只用来去重（同名同版本只加载一次）                                | 只针对 CLI 本身：`Updater` 服务有 `disable`/`notify`/`auto` 三种策略（默认 `notify`），另有 `opencode upgrade`              | [docs/skills](https://opencode.ai/docs/skills/)、[updater.ts](https://github.com/sst/opencode/blob/dev/packages/cli/src/services/updater.ts)                                                                                            |
| Cline                           | Agent Skills                                           | 无。frontmatter 白名单写死为 spec 的 6 个字段                                                                                                                       | 否                                                                | 用 SHA-256 内容哈希代替版本：`skills-lock.json` 的 `computedHash`                                                           | [agent-skill.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts)                                                                                                                 |
| Continue                        | Hub blocks 和 `config.yaml`                            | 有且必填：`config.yaml` 顶层 `version: z.string()`；block 引用支持 `owner/pkg@version`                                                                              | 是，由 `decodeFullSlug` 解析，未写版本时取 `latest`               | 没有 block 更新通知，靠锁定版本或 `latest` 控制分发                                                                         | [config-yaml/schemas/index.ts](https://github.com/continuedev/continue/blob/main/packages/config-yaml/src/schemas/index.ts)、[slugs.ts](https://github.com/continuedev/continue/blob/main/packages/config-yaml/src/interfaces/slugs.ts) |
| Aider                           | 没有插件体系                                           | 不适用                                                                                                                                                              | 不适用                                                            | 只针对 CLI 本身：每 24h 查一次 PyPI，经 `io.tool_output` 输出给人看                                                         | [versioncheck.py](https://github.com/Aider-AI/aider/blob/main/aider/versioncheck.py)                                                                                                                                                    |
| MCP                             | server 实现                                            | 有 `serverInfo.version`，另有独立的 `protocolVersion`                                                                                                               | 是，但只在 client 侧的 `initialize` 握手中使用                    | 协议级版本协商（不匹配时返回 `-32602` `Unsupported protocol version`）                                                      | [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)                                                                                                                                                   |

## 各 Agent 机制细节

### 1. Agent Skills 规范：没有 `version` 字段

置信度：文档明确。规范现托管于 `agentskills.io`（Anthropic 仓库的 `spec/agent-skills-spec.md` 已改为一行指向该地址），定义了 6 个 frontmatter 字段：

| 字段            | 必填 | 约束                                                |
| --------------- | ---- | --------------------------------------------------- |
| `name`          | 是   | ≤64 字符，小写字母/数字/连字符，须与父目录同名      |
| `description`   | 是   | ≤1024 字符，须写明做什么和何时用                    |
| `license`       | 否   | 许可名或随包文件指针                                |
| `compatibility` | 否   | ≤500 字符，环境需求                                 |
| `metadata`      | 否   | 自由映射，"a map from string keys to string values" |
| `allowed-tools` | 否   | 空格分隔，标注 "(Experimental)"                     |

`version` 不在其中。规范只在 `metadata` 的示例里用到 `version`（`version: "1.0"`），并说明这些键 "carries no spec-defined meaning"。`metadata` 的用途是 "Clients can use this to store additional properties not defined by the Agent Skills spec"。

所以我们写的 `metadata.version` 符合规范，也和规范示例一致，但它只是附注数据，没有宿主运行时会读取或比对它。

交叉验证（源码）：`anthropics/skills` 仓库的 20 个 `SKILL.md` 里没有一个含 `version:`（`gh search code 'repo:anthropics/skills filename:SKILL.md "version:"'` 返回 `total_count: 0`）。[template/SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/template/SKILL.md) 只有 `name` 和 `description`，官方 README 也说 frontmatter "requires only two fields"。

### 2. Claude Code：skill 层没有版本，plugin 层有

置信度：文档明确，并用源码交叉验证。

Skill 侧：[skills.md](https://docs.claude.com/en/docs/claude-code/skills.md) 的 frontmatter 参考表共 21 个字段（`name`/`description`/`when_to_use`/`allowed-tools`/`context`/`agent`/`model`/`hooks`/`paths` 等），没有 `version`。`metadata` 的描述是 "Free-form YAML map for your own key-value data"，文档说 "Claude Code doesn't act on its contents"，非 map 的值会被丢弃。`license` 和 `compatibility` 标为 spec 字段，"accepted but not acted on"。注入模型的 skill 列表也不带版本，description 在列表里按 1,536 字符截断（`/skills` 列表另有 250 字符上限，见 CHANGELOG:7141）。

Plugin 侧的版本有实际作用。[host-marketplace](https://code.claude.com/docs/en/plugins/host-marketplace) 的说明如下：

- 更新的触发条件是 "a user gets a new copy of a plugin only when its computed version changes"。
- 版本来源顺序是 "That version comes from `plugin.json` first, then from the marketplace entry"。两处都写时静默采用 `plugin.json`，并给出校验告警。
- 作者可以每次发版都 bump `version`，不 bump 的话 "users stay on their cached copy until the string changes"；也可以不写 `version`，这时 "users track your commits instead"。
- 例外：本地 marketplace 的 in-place 插件 "isn't controlled by `version`"，每次会话启动都读取当前文件。
- `command` 源的 copy 模式用内容哈希得出版本："derives the [version] from a hash of the copied files"，"A re-run that produces identical files counts as up to date"。

更新通道（[install](https://code.claude.com/docs/en/plugins/install)）：后台 auto-update 按 marketplace 开关，官方 marketplace 默认开，第三方默认关。`marketplace.json` 里没有字段能打开它，只能由用户在 `/plugin` 里选 "Enable auto-update"，或由管理员在 managed settings 的 `extraKnownMarketplaces` 里设 `"autoUpdate": true`。手动更新用 `/plugin marketplace update <name>` 和 `claude plugin update <plugin>@<marketplace>`，并且 "There's no command that updates every plugin at once"。会话中已加载的版本不会热替换，只会提示 `Plugin updated: <name> · Run /reload-plugins to apply`。

Anthropic 自己的做法（源码）：[anthropics/skills 的 marketplace.json](https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json) 把 `version: "1.0.0"` 放在顶层 `metadata` 里，两个 plugin entry（`document-skills`、`example-skills`）都没有 `version`，也就是不写版本、跟随 commit。

附注：marketplace.json 中 `$schema` 指向的 `https://anthropic.com/claude-code/marketplace.schema.json` 曾返回 404（[issue #9686](https://github.com/anthropics/claude-code/issues/9686)，2025-10-16 提交，已关闭）。

### 3. Agent Plugins 1.0.0：有 `version`，非必填，无格式约束

置信度：从 JSON Schema 源码读出。[plugin.schema.json](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) 的相关部分：

```json
"version": { "type": "string" },
...
"required": ["$schema", "name"],
"additionalProperties": false
```

`version` 是普通字符串，没有 semver pattern，也不在 `required` 里（必填的只有 `$schema` 和 `name`）。相比之下 `name` 有 `maxLength: 64` 和严格的 pattern，标准没有给 `version` 规定语义。标准把 "distribution, installation, permissions, user experience" 留给各客户端。Cursor 和 Claude Code 都采用这份 plugin 清单标准。

### 4. OpenAI Codex CLI：没有 `version`，有 `dependencies` 声明

置信度：源码读出。`developers.openai.com/codex/skills` 返回 403，仓库内的 `docs/skills.md` 只有一行外链。Codex 的解析逻辑在开源的 Rust 代码里，以下结论来自结构体定义。

[`codex-rs/skills/src/parser.rs`](https://github.com/openai/codex/blob/main/codex-rs/skills/src/parser.rs) 的 frontmatter 结构体：

```rust
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    metadata: SkillFrontmatterMetadata,
}
struct SkillFrontmatterMetadata {
    #[serde(default, rename = "short-description")]
    short_description: Option<String>,
}
```

校验后的 `ParsedSkillFrontmatter` 只有 `name`、`description`、`short_description` 三个成员。

Codex 的 SKILL.md frontmatter 没有 `version`。它会解析 `metadata`，但只取 `short-description`。结构体没有 `deny_unknown_fields`，所以我们写的 `metadata.version` 和 `metadata.requires` 会被 serde 静默丢弃，不报错也不警告。

Codex 还有一个 sidecar 元数据文件。[`codex-rs/skills/src/metadata.rs`](https://github.com/openai/codex/blob/main/codex-rs/skills/src/metadata.rs) 的 doc comment 说明它解析 `agents/openai.yaml`，顶层有三个键：

- `interface`：skill 的接口资产
- `dependencies`：其中 `dependencies.tools[]` 可以声明所需的工具或 MCP，字段为 `type`/`value`/`description`/`transport`/`command`/`url`/`oauth`
- `policy`：`allow_implicit_invocation` 和 `products`

`dependencies` 里也没有版本或版本区间字段，只有 `MAX_DEPENDENCY_*_LEN` 这类长度限制。

`dependencies.tools` 让 skill 用结构化字段声明自己需要的外部工具，用意和我们的 `metadata.requires.bins: ["bl"]` 相同。它只声明需要哪个工具，没有版本要求。要表达「需要 ≥2.7.1 的 `bl`」，已调研的宿主都没有原生字段，最接近的是 VS Code 的 `engines`（见下节）。

### 5. Cursor：rules 没有版本，靠 git 管理；plugins 有版本，靠 push 刷新

置信度：文档明确。[rules 文档](https://cursor.com/docs/context/rules) 的 `.mdc` frontmatter 只有 `description`、`globs`、`alwaysApply` 三个字段，全文没有 version、schema-version 或 revision 字段，也没有自动更新。文档给的办法是：project rules "version-controlled"（交给 git），发现 agent 出错后手工修改；"Rules aren't imported on their own"，跨仓库分发要打包成 plugin。

[plugins 文档](https://cursor.com/docs/plugins) 里的两种清单格式（Agent Plugins 开放标准的 `plugin.json` 和 Cursor 原生的 `.cursor-plugin/plugin.json`）示例都含 `"version": "1.0.0"`，但 Cursor 格式 "only require a `name`"。更新由仓库事件触发，不比对版本串：从 GitHub 导入的插件可以开 "Enable Auto Refresh"（需要 Cursor GitHub App，推送后更新，最多每 10 分钟一次），也可以手动点 Refresh。运行中的 Cloud Agent "keeps the plugin versions it started with"，要用新版本得新起一个 agent。

### 6. OpenCode / Cline / Continue / Aider

置信度：源码读出（部分文档站返回 403）。

- OpenCode：skill frontmatter 与 spec 的六个字段一致，没有 `version`，且 "Unknown frontmatter fields are ignored"。plugin 数组只接受 npm 包名（`["opencode-wakatime", "@my-org/custom-plugin"]`），不支持 `@version` 锁定，版本只用来去重（"Duplicate npm packages with the same name and version are loaded once"）。更新机制只管 CLI 本身：[updater.ts](https://github.com/sst/opencode/blob/dev/packages/cli/src/services/updater.ts) 实现了 `disable`/`notify`/`auto` 三种策略，默认 `notify`，日志记录 `{current, latest, action}`。
- Cline：[agent-skill.ts](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts) 把 frontmatter 白名单写死为 spec 的 6 个字段，`AgentSkillMetadata` 没有 `version` 成员。Cline 用内容哈希代替版本：`skills-lock.json` 记录 `computedHash`(SHA-256) 以及 `source`/`sourceType`/`skillPath`，其中的 `version: 1` 是 lockfile 的格式版本。这套机制检测漂移和完整性，不负责通知更新。
- Continue：四者中只有它有扩展单元的版本体系。`config.yaml` 顶层的 `version: z.string()` 必填；block 引用经 `FullSlug = {ownerSlug, packageSlug, versionSlug}` 解析，`encodeFullSlug` 生成 `owner/pkg@version`，`decodeFullSlug` 在未写版本时取 `VirtualTags.Latest`。版本由配置加载器（CLI 或扩展层）使用，不注入模型 prompt。
- Aider：没有插件体系，[versioncheck.py](https://github.com/Aider-AI/aider/blob/main/aider/versioncheck.py) 是一个完整的 CLI 层实现。它用 `~/.aider/caches/versioncheck` 的 mtime 记录状态（不存内容），每 24h 检查一次，延迟导入 `requests`（"To keep startup fast"），查 PyPI JSON 后用 `packaging.version.parse` 比较；`finally` 块无论成败都更新时间戳，避免失败后反复重试。输出走 `io.tool_output` / `io.tool_warning`，给人看，不进模型上下文。

## 其他生态的类似机制

### npm update-notifier

置信度：文档明确。[update-notifier readme](https://raw.githubusercontent.com/yeoman/update-notifier/main/readme.md) 的设计大多可以直接用在我们这里：

- 异步加缓存，不拖慢启动：超过间隔才在后台查 npm 并写盘，下次运行从缓存读出结果填进 `.update`，"so startup speed isn't affected"。检查跑在 unref'ed 子进程里，主进程 `process.exit` 后也能完成。
- 状态文件在 `~/.config/configstore/update-notifier-[module].json`，路径由 `notifier.config.path` 暴露。
- `updateCheckInterval` 默认 1 天；`distTag` 默认 `latest`。
- `notify()` 只在有更新且进程是 TTY 时打印，默认推迟到进程退出时显示（boxen 黄框）。
- 关闭方式有三种：配置里的 `optOut: true`、`NO_UPDATE_NOTIFIER` 环境变量、`--no-update-notifier` flag。CI 和 `NODE_ENV=test` 下直接跳过。
- 第一次运行不提示（间隔还没到），写 e2e 断言时要考虑这一点。

### VS Code extension：`version` 和 `engines`

置信度：文档明确。[extension-manifest](https://code.visualstudio.com/api/references/extension-manifest) 里 `version` 必填（"SemVer compatible version"）；`engines` 也必填，至少包含 `vscode` 键，"Cannot be `*`"，例如 `^0.10.5` 表示最低兼容版本。前者是扩展自己的版本，后者声明它兼容的宿主版本。我们的 skill 需要声明「需要多新的 `bl`」，和 `engines` 是同一类需求。Agent Skills 的 `compatibility` 是自由文本，而且 "not acted on"，起不到同样的作用。

### MCP：版本协商在 client 层完成，不经过模型

置信度：规范原文和 schema 源码。[lifecycle 规范](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) 区分两种版本：

- `protocolVersion`（如 `"2025-06-18"`）：client 发送自己支持的最新版本；server 支持则 MUST 回同一版本，否则 MUST 回一个自己支持的版本；client 无法处理时 SHOULD 断开。HTTP 下后续请求要带 `MCP-Protocol-Version` 头。版本不匹配的错误示例是 `-32602` 加 `"Unsupported protocol version"`，`data` 里列出 `supported` 和 `requested`。
- `serverInfo.version`（如 `"1.0.0"`）：实现本身的版本，与 `protocolVersion` 无关。`clientInfo` 和 `serverInfo` 结构相同，都是 `name`/`title`/`version`。

tools 规范的消息流程图（[tools.mdx](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/server/tools.mdx)，源码读出）列出了 `LLM` 参与者，但 Updates 阶段只有 `Server--)Client` 和随后的 `Client->>Server: tools/list`，LLM 不参与版本和变更的传递。规范里唯一面向模型的字段是 `InitializeResult.instructions`，[schema.ts](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts) 的描述是 "like a 'hint' to the model. For example, this information MAY be added to the system prompt"，是否加入由 client 决定。server 可以把版本号写进 `instructions`，规范既没有建议也没有禁止。

### Homebrew 与 gh CLI

置信度：源码读出。[cli/cli 的 cmd.go](https://raw.githubusercontent.com/cli/cli/trunk/internal/ghcmd/cmd.go) 用 `fmt.Fprintf(stderr, ...)` 加 ANSI 颜色把更新提示写到 stderr，给人看，不进入模型上下文。[update.go](https://raw.githubusercontent.com/cli/cli/trunk/internal/update/update.go) 只在有人坐在终端前时提示，条件是 `!ci.IsCI() && IsTerminal(os.Stdout) && IsTerminal(os.Stderr)`，另外可以用 `GH_NO_EXTENSION_UPDATE_NOTIFIER`、`CODESPACES` 关闭。Homebrew 用 `HOMEBREW_NO_AUTO_UPDATE` 控制自动更新，用 `brew outdated` 单独查询。

## 会话内版本感知的先例

### (a) 把版本注入模型上下文：Claude Code 有官方语法

置信度：文档明确。Claude Code [skills.md 第 705 行 "Inject dynamic context"](https://docs.claude.com/en/docs/claude-code/skills.md) 原文：

> The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder, so Claude receives actual data, not the command itself.

官方示例在 SKILL.md 正文里写 ``- PR diff: !`gh pr diff` ``。内联写法有位置要求："The inline form is only recognized when `!` appears at the start of a line or immediately after whitespace"；多行命令用 ` ```! ` 开头的围栏代码块。

文档没有给这个语法本身设版本下限。`v2.1.228+` 只针对另一条安全限制：从 claude.ai 账号同步来的 skill 不在本机执行这些命令，原文 "This restriction requires Claude Code v2.1.228 or later"。

settings 里的 `disableSkillShellExecution` 可以关掉这个功能，开启后每条命令被替换成 policy-disabled 占位符（bundled 和 managed skill 不受影响）。依赖这个语法的方案要处理占位符原样留在上下文里的情况。

在 SKILL.md 正文写 ``!`bl --version`` `` 可以把真实版本号送进模型上下文，可以放在 `bailian-protocol` 现有的「版本预检」环节。

### (b) Claude Code 通过 tool result 把版本变化告诉模型

置信度：官方 CHANGELOG 原文。CHANGELOG 第 2850 行：

> Changed artifact watching in local sessions: a new version published elsewhere no longer starts a turn; Claude learns of it from a later Artifact tool result

这次改动让版本变化的信号随 tool result 进入模型上下文，和我们想做的事属于同一类，只是对象是 artifact。信号附在后续的 tool result 里，不再单独发起一个 turn 打断用户。

### (c) skill 写入自身版本号、让模型自查是否过期：没有找到公开先例

置信度：基于代码检索，查询语句如下。`gh search code '"your version is outdated" filename:SKILL.md'` 只有 4 条结果，其中两条是提示注入攻击样本（`antgroup/Agent3Sigma-Canary/assets/skill_poison/trusted-agent-deception/critical-update/SKILL.md`），说明伪造「critical update」通知已被收录为一种 skill 投毒手法。

唯一的正面样本是 [ykdojo/claude-code-tips 的 skills/version-check/SKILL.md](https://raw.githubusercontent.com/ykdojo/claude-code-tips/main/skills/version-check/SKILL.md)（源码读出）。它让 agent 执行 `claude --version` 和 `npm view @anthropic-ai/claude-code dist-tags --json`，对照 changelog 后给出 update、pin 或 stay 的建议。它检查的是宿主 CLI 的版本，由用户主动触发，不检查 skill 自身的版本。

更宽的查询（`"check for updates"`、`"--version" "outdated"`）有数千条结果，基本是讲依赖管理的 skill，和 skill 自身的版本感知无关。

公开生态里没有可以照搬的做法，安全上的风险见 D2。

## 对我们的启示

先确认几条事实：

1. 我们的 `metadata.version` 符合规范，但没有宿主读取 `version`，各宿主忽略的方式不同。Claude Code 文档说 `metadata` "doesn't act on its contents"；Codex 的 `SkillFrontmatterMetadata` 会解析 `metadata`，但只取 `short-description`，`version` 和 `requires` 被 serde 静默丢弃，不报错也不警告；Cline 和 OpenCode 把 frontmatter 白名单写死。目前这个字段只有人和我们自己的工具会看。
2. 宿主装载 skill 都是复制文件或 clone，版本感知放在 plugin/marketplace 层。我们用 `bl skill init` 自己做安装，所以能在安装器里做宿主做不到的检查。
3. 本仓库已有两处可以复用：`bailian-protocol` 负责的「版本预检」，以及 `packages/runtime/src/middleware.ts` 里的 update middleware。
4. 按 `skill-change.md`，纳入 Git 的 `reference/` 不写包版本号（channel 发布会临时 bump 成带时间戳的 beta 版本，否则每次发布都会产生生成物 diff）。把版本写进生成物的方案都要避开这条。

下面 4 个方向可以组合使用。

### D1（推荐，风险低）：`bl` 在 CLI 层检查版本，提示走 agent 读得到的通道

做法：在 runtime 的 update middleware 旁加一个 skill 版本比对，比较已安装 skill 的 `metadata.version` 和当前 `bl` 的版本（两者都来自 `packages/cli/package.json`），不一致时输出一行提示，建议执行 `bl skill update`。

先例：这是最常见的做法。update-notifier（异步、缓存、TTY 判断、多种关闭方式），Aider `versioncheck.py`（mtime 记录状态、24h 间隔、`finally` 防止重试风暴），gh CLI（写 stderr、判断 CI 和 TTY），OpenCode `Updater`（三种策略，默认 `notify`）。

优点：不往 prompt 里加内容，没有投毒入口，有成熟实现可参考，结构和现有 update middleware 相同。

和先例的差别：上面的先例都只在 TTY 下给人看。我们的用户主要是 agent，agent 通常不在 TTY 下运行，照搬 TTY 判断的话，agent 场景下永远看不到提示。建议 TTY 下输出给人看的横幅，非 TTY 下输出一行格式固定、机器可读的前缀（比如写到 stderr 的单行 `notice:`），agent 能读到，stdout 的结构化输出也不受影响。

风险：stderr 多出一行可能影响现有 e2e 断言（可参考 update-notifier 首次运行不提示的处理）；需要提供 env var 关闭开关，并在 CI 下跳过。

### D2：在 SKILL.md 正文用 ``!`bl --version`` `` 做运行时版本预检

做法：在 `bailian-protocol` 的版本预检段落写 ``!`bl --version`` ``（或专用的 `bl skill doctor --format json`），让模型在执行前拿到实际的宿主版本，和 skill 正文或 `metadata` 里的期望版本比对。

先例：Claude Code 官方文档的 "Inject dynamic context"；Claude Code 通过 tool result 把 artifact 版本变化告诉模型（CHANGELOG:2850）。

优点：只有这个方向能让模型在会话中、执行命令前知道版本；版本信息来自我们自己的命令输出；和 `bailian-protocol` 现有的职责一致。

风险：

- 可移植性差。这是 Claude Code 专有语法。OpenCode 说明了 "Unknown frontmatter fields are ignored"，但不保证正文语法；Cursor 和 Codex 没有这个语法，``!`...`` `` 会作为普通文本进入上下文，模型可能把它当成要执行的指令。需要兜底的措辞。
- 可以被关掉。即使在 Claude Code 里，开启 `disableSkillShellExecution` 后命令也会变成 policy-disabled 占位符。版本预检不能是硬依赖，看到占位符时应跳过版本检查，不报错，也不猜测。
- 安全。伪造「critical update」是有记录的 skill 投毒手法。版本结论只能来自我们自己的命令输出，不能来自正文里的文字断言。提示语气要平和，免得用户对更新警告习以为常。
- 从 claude.ai 同步的 skill 不执行该语法（v2.1.228+ 起生效）。

### D3：提供 `.claude-plugin/marketplace.json` 分发通道，接入 plugin 层

做法：在 `bl skill init` 之外，再以 Claude Code plugin marketplace（或 Agent Plugins 1.0.0 `plugin.json`）的形式分发 `bailian-*` skills，使用宿主自带的版本和更新机制。

先例：这是 Claude Code 唯一根据版本触发更新的路径（"a user gets a new copy only when its computed version changes"）；Cursor 也支持 Agent Plugins `plugin.json`；Anthropic 的 `anthropics/skills` 就是这样分发的。

优点：直接用宿主的后台 auto-update 和 `claude plugin update`；这一层的 `version` 会被运行时读取；同一份 `plugin.json` 也能给 Cursor 用。

风险与注意事项：

- 第三方 marketplace 的 auto-update 默认关闭，`marketplace.json` 里也没有字段能打开，只能用户手动开，或管理员通过 managed settings 下发。发布之后不会自动到达用户机器。
- 官方自己不写 entry `version`，跟随 commit。如果我们写了 `version`，每次发版都必须 bump，否则用户会一直停在缓存副本上。这和我们七包锁步版本的习惯一致，但要加进发布清单。
- 只覆盖 Claude Code 和 Cursor 这类宿主，覆盖不了全部安装场景。
- 和现有的 `bl skill init/update` 并存会形成两条安装通道，需要定好优先级，否则会出现以哪边版本为准的冲突。

### D4：用内容哈希检测漂移，发现用户改过的本地 skill

做法：参考 Cline 的 `skills-lock.json`，在 `bl skill` 安装时写一份 lock（`computedHash`、source、path），`bl skill update` 和 `doctor` 用哈希判断本地文件是否与发布版一致、用户是否改过。

先例：Cline `skills-lock.json` 的 `computedHash`(SHA-256)（源码读出）；Claude Code 对 `command` 源插件 "derives the version from a hash of the copied files"，且 "identical files counts as up to date"。

优点：比版本串可靠，能发现用户本地改动、安装中途失败、漏装 `bailian-protocol` 这些我们遇到过的问题；可以和 `metadata.version` 配合使用；不依赖宿主功能。

风险：需要额外的状态文件，也要保证生成结果稳定。`reference/` 生成物在 channel 发布时会临时带上 beta 版本号，哈希计算必须排除含版本号的内容，否则每次发布所有文件都会被判为漂移。

### 建议

D1 和 D4 作为基础，它们不依赖宿主，也不往 prompt 里加内容。D2 作为 `bailian-protocol` 的增强，它是唯一能在会话内感知版本的方向。D3 等看过 Claude Code 的安装占比再决定。D1 要针对「用户是 agent、常在非 TTY 下运行」这一点设计，不能沿用业界只在 TTY 下提示的默认做法。

## 来源清单

### 一手来源（官方文档 / 官方仓库源码 / 协议规范 / 官方 CHANGELOG）

#### 规范

- [Agent Skills 规范](https://agentskills.io/specification)：6 个 frontmatter 字段，无 `version`
- [anthropics/skills spec/agent-skills-spec.md](https://raw.githubusercontent.com/anthropics/skills/main/spec/agent-skills-spec.md)：只指向上述地址
- [anthropics/skills template/SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/template/SKILL.md)
- [anthropics/skills .claude-plugin/marketplace.json](https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json)：顶层 `metadata.version`，entry 无 version
- [Agent Plugins 1.0.0 plugin.schema.json](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)：`required: ["$schema","name"]`
- [agent-plugins.org 总览](https://agent-plugins.org/)

#### Claude Code

- [Skills 文档（frontmatter 表和 "Inject dynamic context" L705）](https://docs.claude.com/en/docs/claude-code/skills.md)
- [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)
- [Create a marketplace](https://code.claude.com/docs/en/plugins/create-marketplace)
- [Host a marketplace: Keep users up to date](https://code.claude.com/docs/en/plugins/host-marketplace)
- [Install and manage plugins](https://code.claude.com/docs/en/plugins/install)
- [CHANGELOG（v2.1.314；L2850 artifact 版本变化、L1312 system-reminder 转义、L3392 /skill-doctor、L4207 后台通知）](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md)
- [issue #9686：marketplace schema 404](https://github.com/anthropics/claude-code/issues/9686)

#### MCP

- [Lifecycle 规范（protocolVersion 协商和 serverInfo.version）](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [schema.ts：`instructions` 的 "MAY be added to the system prompt"](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts)
- [tools.mdx：Updates 流程图不经过 LLM](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/server/tools.mdx)

#### 其他 agent

- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Cursor Plugins](https://cursor.com/docs/plugins)
- [OpenAI Codex codex-rs/skills/src/parser.rs（frontmatter 结构体，无 version）](https://github.com/openai/codex/blob/main/codex-rs/skills/src/parser.rs)
- [OpenAI Codex codex-rs/skills/src/metadata.rs（sidecar `agents/openai.yaml`：interface/dependencies/policy）](https://github.com/openai/codex/blob/main/codex-rs/skills/src/metadata.rs)
- [OpenAI Codex docs/config.md](https://raw.githubusercontent.com/openai/codex/main/docs/config.md)
- [OpenAI Codex docs/skills.md（只有一行外链，正文在返回 403 的开发者站）](https://raw.githubusercontent.com/openai/codex/main/docs/skills.md)
- [OpenCode Skills](https://opencode.ai/docs/skills/) / [Plugins](https://opencode.ai/docs/plugins/) / [updater.ts](https://github.com/sst/opencode/blob/dev/packages/cli/src/services/updater.ts) / [upgrade.ts](https://github.com/sst/opencode/blob/dev/packages/cli/src/commands/handlers/upgrade.ts) / [version.ts](https://github.com/sst/opencode/blob/dev/packages/cli/src/version.ts)
- [Cline agent-skill.ts（frontmatter 白名单）](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts) / [skills-lock.json](https://github.com/cline/cline/blob/main/apps/vscode/skills-lock.json)
- [Continue config-yaml schemas/index.ts](https://github.com/continuedev/continue/blob/main/packages/config-yaml/src/schemas/index.ts) / [slugs.ts](https://github.com/continuedev/continue/blob/main/packages/config-yaml/src/interfaces/slugs.ts) / [reference 文档](https://docs.continue.dev/reference)
- [Aider versioncheck.py](https://github.com/Aider-AI/aider/blob/main/aider/versioncheck.py)

#### 类似机制

- [update-notifier readme](https://raw.githubusercontent.com/yeoman/update-notifier/main/readme.md)
- [VS Code extension manifest（version 和 engines.vscode）](https://code.visualstudio.com/api/references/extension-manifest)
- [gh CLI internal/ghcmd/cmd.go](https://raw.githubusercontent.com/cli/cli/trunk/internal/ghcmd/cmd.go) / [internal/update/update.go](https://raw.githubusercontent.com/cli/cli/trunk/internal/update/update.go)

### 二手来源（只作模式举证，非权威）

- [ykdojo/claude-code-tips skills/version-check/SKILL.md](https://raw.githubusercontent.com/ykdojo/claude-code-tips/main/skills/version-check/SKILL.md)：社区个人仓库，是「skill 指导 agent 自查宿主版本」的唯一正面样本
- [antgroup/Agent3Sigma-Canary skill_poison/.../critical-update/SKILL.md](https://github.com/antgroup/Agent3Sigma-Canary)：第三方安全测试集，用来说明伪造更新通知是已知的投毒手法

### 未能获取或未找到的证据

- `developers.openai.com/codex/skills` 返回 403。Codex 的结论来自 `codex-rs/skills/src/{parser,metadata}.rs` 源码，不依赖该文档站（见第 4 节）。
- `docs.claude.com/en/docs/claude-code/{skills,plugin-marketplaces,cli-reference}` 的 HTML 页返回 403，改用内容相同的 `.md` 原文和 `code.claude.com`；`skills.md` 已于 2026-10-30 复核。
- `agentskills.io/schemas/**` 返回 404，没有机器可读的 skill JSON Schema。「规范有 6 个字段」只有文档文字支撑，没有 schema；Claude Code 文档、Cline 和 OpenCode 的字段白名单源码、`anthropics/skills` 检索 0 条结果，三者结论一致。
- Goose：`block.github.io/goose/docs/guides/recipes/` 返回 404，没有取得一手证据，所以 Goose 没有列入对比表。
