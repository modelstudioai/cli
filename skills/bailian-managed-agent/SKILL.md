---
name: bailian-managed-agent
metadata:
  version: "2.7.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼托管 Agent 声明式基础设施与 API 命令入口：用户要创建agent、初始化 agents.yaml、校验或预览配置变更、
  创建/更新/销毁托管 Agent 或 Deployment、在 Workbench 编辑和调试目录项目、管理本地快照版本，或查询
  Agent/Environment/Skill/Vault/Deployment/Memory Store、管理 Session/Event/File/Webhook/记忆正文及版本、运行/暂停 Deployment 时使用
  `bl managed-agent`。Agent/Environment/Skill/Vault/Deployment/Memory Store 仍以 agents.yaml 为唯一事实源做 IaC；Webhook 使用无需项目文件的工作空间 API；公开 API 能力按资源透出
  list/get/search/versions/download、数据面和运行时动作命令。apply / destroy 与破坏性 API 命令受统一高风险确认闸门保护；
  务必先展示预览再让用户确认，禁止自动添加 `--yes`。
  反触发：调用已上线的百炼应用/智能体走 bailian-app-call 或 `bl app`；宿主 agent 自身的记忆、技能、
  子代理不走本 skill；生图生视频走 bailian-gen。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian managed agent IaC (`bl managed-agent`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): High-risk operation confirmation, Version & updates (pre-flight checklist), Call attribution (every Agent `bl` command), and CLI errors: report an issue. Command details are authoritative in [`reference/managed-agent.md`](reference/managed-agent.md) and `bl managed-agent --help` — do not guess flags. Examples in `reference/` stay bare; wrap with Call attribution when running. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

**Call attribution:** Examples below and in `reference/` stay bare `bl …`. When running a command, wrap it with [`bailian-protocol` → Call attribution](../bailian-protocol/SKILL.md#call-attribution-mandatory-for-every-agent-bl-command) (bash or PowerShell). One sample for this skill (`BAILIAN_SKILL_NAME=bailian-managed-agent`; replace `codex` with this host):

```bash
BAILIAN_CALLER_TYPE=agent BAILIAN_CALLER_NAME=codex BAILIAN_SKILL_NAME=bailian-managed-agent BAILIAN_SKILL_VERSION=2.5.0 bl managed-agent plan
```

## Safety guardrail (the most important rule)

`apply` / `destroy` and single-resource `create --yes` **mutate persistent remote resources**:

1. For `agents.yaml` resource changes, always run `bl managed-agent plan` first and show the diff to the user.
2. A single-resource create command previews its scoped plan when `--yes` is absent; show that preview before retrying it with `--yes`.
3. Only after explicit user confirmation, retry `apply` / `destroy` / single-resource create with `--yes`.
4. Never add `--yes` on your own initiative before the user has confirmed.

API-oriented commands do not replace IaC. Agent / Environment / Skill / Vault / Deployment / Memory Store 的 create 命令仍通过
`agents.yaml → scoped plan → scoped apply` 管理；查询命令和 Session、Event、File、Deployment 运行时动作直接调用 API。
`session archive|delete`、`file delete`、`deployment run|pause|unpause`、`memory-store memories create|update|delete` 和 `memory-store versions redact` 也需要先 `--dry-run`，确认后才传 `--yes`。
Webhook 是工作空间级 API 资源，不写入 `agents.yaml` 或 State。`webhook create|update|delete|enable|disable|test|reset-secret` 都是高风险操作：先展示 `--dry-run` 的目标和请求，用户确认后才加 `--yes`；`test` 会向接收端投递事件。

`state rm`, `session archive|delete`, `file delete`, `deployment run|pause|unpause`, and future
`risk: high` commands follow the shared protocol: show the risk message and exact scope, then wait
for explicit confirmation before re-running with `--yes`.

## IaC lifecycle

```
1. Init      bl managed-agent init          # scaffold agents.yaml
2. Validate  bl managed-agent validate      # offline, no network calls
3. Preview   bl managed-agent plan          # show the pending change diff
4. Confirm   show the plan and ask the user # no automatic --yes
5. Apply     bl managed-agent apply --yes   # only after explicit confirmation
6. Destroy   bl managed-agent destroy --yes # separate explicit confirmation
```

## Directory projects, Workbench, and local versions

| Intent                                  | Command                                                |
| --------------------------------------- | ------------------------------------------------------ |
| Create or convert a directory project   | `bl managed-agent project init`                        |
| Validate and Build directory source     | `bl managed-agent project validate` / `build`          |
| Publish the current immutable Build     | `bl managed-agent project publish --yes`               |
| Launch project resource editing         | `bl managed-agent project workbench`                   |
| Launch one Agent Session Preview        | `bl managed-agent playground --agent <id>`             |
| Enable/disable project versions         | `bl managed-agent project version enable` / `disable`  |
| Inspect local version state and history | `bl managed-agent project version status` / `list`     |
| Preview or restore project source       | `bl managed-agent project version preview` / `restore` |

- Bailian CLI and Workbench use the same `.openagentpack/versions/project` store and enable switch. Git is not required.
- Directory projects always use Bailian. `project.json` does not declare a Provider; Build supplies the Bailian Provider configuration automatically.
- Fresh `project init` includes complete Skill/File/Vault/Environment examples with bilingual README files under `agents/assistant/<resource-type>/_examples/`. They are not linked in `agent.json` and are excluded from Build discovery, Workbench declarations, and remote Publish. Copy a resource outside `_examples/` and configure its Agent reference to use it. Examples remain local versioned source; never put real secrets into them. / 新项目的四类资源示例默认不启用、不发布；请按 README 复制到 `_examples/` 外再配置引用，不要向示例写入真实密钥。
- `project init`, `validate`, `build`, and version commands are local-only. Publish and Workbench resolve credentials from Bailian CLI flags, shell environment, or the active Profile; project initialization does not write credentials into the project directory.
- Build is local-only. Publish never runs Build implicitly and consumes only a current `.openagentpack/build/agents.yaml` plus manifest.
- Build moves literal Vault `secret_value` / `access_token` values from Agent-local or shared `vault.json` into project-root `.env`, replacing them with generated environment references. Existing references and `.env` entries are preserved; conflicts receive suffixed variable names. Preview/dry-run never write or print secrets. Publish and Workbench read the selected project's root `.env` as a fallback to inherited environment variables, even when invoked elsewhere. `.env` is private plaintext storage, excluded from local versions but not automatically ignored by Git; keep it backed up securely.
- Build 会将 Agent 本地或共享 `vault.json` 中的明文密钥移入项目根目录 `.env`，再写回环境变量引用；保留已有引用和变量，重名时生成后缀。预览不写文件或输出密钥。`.env` 不进入版本快照，也不加密；请自行备份并加入 Git 忽略规则。
- Agent-local File and Skill content supports Build-time association. A File may be copied directly into `agents/<agent>/files/`, or placed in `agents/<agent>/files/<id>/` when that directory contains exactly one content file; Build generates `file.json` and a `/mnt/<filename>` entry in `agent.json.files`. A directory under `agents/<agent>/skills/<id>/` containing `SKILL.md` generates `skill.json` and its `agent.json.skills` entry. Explicit JSON always wins; shared root resources remain explicit. Resources referenced by multiple Agents are promoted to the corresponding root shared directory during Build.
- A successful Publish versions the canonical YAML and the complete project source tree, including Skill scripts/assets and binary files. Remote State is never versioned or restored.
- `project version restore` restores source files to the working directory, invalidates Build, and does not move version history or remote State.
- `managed-agent playground` remains the standalone `agents.yaml` Session Preview path; directory Workbench is only under `managed-agent project workbench`.

## Scoped single-resource create

以下命令都先构造 `agents.yaml` 声明，再通过 SDK 的定向 Plan/Apply 创建远端资源，不绕过 State：

| Resource              | Command                                    |
| --------------------- | ------------------------------------------ |
| Agent                 | `bl managed-agent agent create`            |
| Environment           | `bl managed-agent environment create`      |
| Custom Skill          | `bl managed-agent skill create`            |
| Empty Vault           | `bl managed-agent vault create`            |
| Credential in a Vault | `bl managed-agent vault credential create` |
| Deployment            | `bl managed-agent deployment create`       |
| Memory Store          | `bl managed-agent memory-store create`     |

- 用户只提供资源 `name`；CLI 自动生成稳定的 YAML 逻辑 key，同名资源用递增后缀并存。Credential 追加到指定 Vault，不单独生成 key。
- `agent create --skill <id>` 直接绑定已存在的远端 Skill，不要求顶层 `skills` 声明；默认写为 `type: custom`，平台 Skill 显式增加 `--type official`。同一次命令中的全部 `--skill` 共用该类型。
- `agent create --skill-dir <path>` 接收可重复的本地 Skill 目录或 ZIP：CLI 从其中的 `SKILL.md` 读取 name，自动生成顶层 `skills.<key>` 声明，并把该 key 写入 Agent 的 `skills` 列表；定向 Apply 会先上传 custom Skill，再创建 Agent。`--type` 只作用于 `--skill <id>`，不改变本地 Skill 的 custom 类型。
- `agent create --environment <key>` / `--vault <key>` 把已声明的顶层 Environment / Vault key 写入 Agent 声明，作为默认运行时绑定；百炼 Agent API 不接收这两个字段，`session create|run` 与 `deployment create` 未显式传入时才使用它们，显式传入则覆盖。引用的资源必须先用对应的 `create` 命令创建，未声明的 key 直接报用法错误。
- `agent create --mcp <server-code>` 接收可重复的 MCP 市场服务 code（来自 `bl mcp list`），写入 `mcp_servers`（`type: official`）与对应的 `tools.mcp`，默认启用全部工具；如需按工具开关，修改 YAML 中的 `tools.mcp[].configs` 后执行全量 `apply`。
- 默认只预览自动 key 和定向计划；`--dry-run` 完全离线，只有显式 `--yes` 才写 YAML 并创建远端资源。
- 定向流程只刷新目标资源及其传递依赖；无关资源不检测 Drift、不产生 action，也不阻塞。
- 目标资源必须是 `create`，相关依赖必须已经处于 `no-op`；项目级 Drift 和删除仍由全量 `plan/apply` 处理。
- 远端创建失败时保留 YAML 声明；修复相关依赖或 Provider 错误后，重复相同命令会复用待创建 key。
- `skill create` 接受本地目录、ZIP 或单个 `SKILL.md`；远程 URL 仍需手工声明到 YAML，再执行全量 Apply。

### Credential secret input

`vault credential create --secret-env <ENV_NAME>` 中的参数是变量名，不是 Secret 明文。Secret 可来自 Shell export、CI Secret 注入或可选的 `.env`；CLI 会从当前目录向上自动加载最近的 `.env`，用户不必创建该文件。

```bash
export PROD_API_TOKEN="..."
bl managed-agent vault credential create \
  --vault production \
  --name api-token \
  --secret-name API_TOKEN \
  --secret-env PROD_API_TOKEN
```

- YAML 只保存 `secret_value: ${PROD_API_TOKEN}`，输出、诊断和 State 都不保存明文。
- 不要提交 `.env`；若使用 `.env`，先确认项目 `.gitignore` 已忽略它。
- 预览后再带 `--yes` 重试。后续执行全量 Apply 时也必须提供同名环境变量。

具体 flags、usage 和 examples 以 `reference/` 或对应命令的 `--help` 为准。

## Deployment as IaC

Deployment 与 Agent 一样声明在 `agents.yaml` 中，并复用同一条 `validate → plan → apply → destroy` IaC 链路；
`deployment create` 可追加一条声明并走定向 Apply；CLI 不提供绕过 state 的 Deployment create/update/delete。最小配置：

```yaml
deployments:
  daily-report:
    agent: assistant
    initial_events:
      - type: user.message
        content: "Generate today's report."
```

- `apply` 会在百炼创建原生 Deployment；`destroy` 会归档已跟踪的远端 Deployment。
- `schedule` 会在 `apply` 后由百炼服务端执行。若旧流程已有外部 cron / CI，先检查 `plan`，避免重复触发。
- `initial_events` 至少包含一个 `user.message` 或 `system.message`；`user.define_outcome` 在百炼会被丢弃并产生诊断。
- 本地文件资源在 `apply` 时上传，`mount_path` 必须位于 `/mnt`，且归一化后不能重复。
- 旧版模拟 Deployment 的 state 可能记录空 `remote_id`；升级后 `plan` 会显示 materialize 更新，确认后再 `apply`。

## Session interaction (chat with a deployed managed agent)

| Intent                                | Command                                            |
| ------------------------------------- | -------------------------------------------------- |
| Create + send + stream in one step    | `bl managed-agent session run`                     |
| Send a message to an existing session | `bl managed-agent session send`                    |
| Create / inspect / list sessions      | `bl managed-agent session create` / `get` / `list` |
| List session event history            | `bl managed-agent session events`                  |
| Delete a session                      | `bl managed-agent session delete`                  |

规范路径是 `session event list|send|stream`；`session events` 保留为 `session event list` 的兼容别名。
Managed Agents 的子线程通过 Event 中的 `session_thread_id` 暴露；公开 API 当前没有独立 Thread 资源 CRUD，
不要构造 `session thread list|get|archive|events` 命令。

## API-oriented resource commands

| Intent                                 | Command family                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Discover agents and versions           | `agent list`, `agent get`, `agent search`, `agent versions`                                             |
| Discover environments                  | `environment list`, `environment get`, `environment search`                                             |
| Discover skills and download a version | `skill list`, `skill get`, `skill search`, `skill versions`, `skill download`                           |
| Declare and inspect Memory Stores      | `memory-store create`, `memory-store list`, `memory-store get`                                          |
| Manage persistent memory contents      | `memory-store memories create`, `list`, `get`, `update`, `delete`                                       |
| Inspect or redact memory versions      | `memory-store versions list`, `get`, `redact`                                                           |
| Inspect vault envelopes                | `vault list`, `vault get`, `vault search`                                                               |
| Inspect deployments and run history    | `deployment list`, `deployment get`, `deployment search`, `deployment runs list`, `deployment runs get` |
| Run or pause deployments               | `deployment run`, `deployment pause`, `deployment unpause`                                              |
| Manage session metadata/lifecycle      | `session list`, `session get`, `session search`, `session update`, `session archive`, `session delete`  |
| Work with raw events                   | `session event send`, `session event list`, `session event stream`                                      |
| Diagnose/export a session              | `session debug`, `session export`                                                                       |
| Work with files                        | `file upload`, `file list`, `file get`, `file search`, `file download`, `file delete`                   |
| Inspect workspace Webhooks and events  | `webhook list`, `webhook get`, `webhook events`                                                         |
| Manage Webhook delivery endpoints      | `webhook create`, `webhook update`, `webhook delete`, `webhook enable`, `webhook disable`               |
| Test delivery or rotate its secret     | `webhook test`, `webhook reset-secret`                                                                  |

- 所有 Cursor 都是不透明字符串：只回传 `next_page`，不得转换为数字页码。
- 客户端搜索默认最多扫描 10 页；需要扩大范围时显式传 `--page-limit`。Deployment 搜索直接映射服务端 `keyword`。
- 下载必须给出 `--output-file`；默认不覆盖已有文件，只有用户确认后才可加 `--force`。
- `session export` 只导出诊断元数据，不含 File 正文，并会脱敏凭证类字段。
- `session create|run --environment_variables KEY=VALUE` injects variables into this Session only. Repeat the flag for multiple variables; the last value for a key wins. Empty values and values containing `=` are allowed. Dry-run and diagnostic exports redact values. / 环境变量仅用于本次 Session，不写入 YAML 或 State；可重复传入，允许空值和包含 `=` 的值，预览和诊断导出会脱敏变量值。
- `deployment create --environment_variables KEY=VALUE` declares runtime variables under `deployments.<key>.environment_variables` as a string map. With `--yes`, the scoped create writes YAML and creates the Deployment. YAML + `apply` also manages this field; changing values updates the Deployment, and removing the field or setting `{}` clears it. Create and plan previews omit values; YAML stores them. / Deployment 环境变量以字符串键值对象声明；创建命令使用 `--yes` 后写入 YAML 并定向创建，也可直接用 YAML + `apply` 管理。修改值会更新部署，删除字段或设置 `{}` 会清空变量。预览输出不展示变量值，YAML 会保存这些值。
- 公开 Managed Agents API 没有模型 Catalog，也没有 MCP OAuth Login；CLI 不注册对应命令。

### Memory Stores and Session mounts

- Store lifecycle stays in `agents.yaml`: create with `memory-store create`, and preview changes with `plan` before `apply`. There are no direct Store update, archive, or delete commands. / 记忆库生命周期统一走 IaC，变更先预览再确认。
- Memory Store names are display labels and need not be unique. State records the remote ID; create a new store when no ID exists, and import a known ID explicitly to adopt an existing store. / 按 ID 识别记忆库，不按同名匹配。
- `entries` initialize new stores only. Existing, imported, or adopted stores keep their runtime content. Set `entries_mode: sync` explicitly when declared paths must continue to follow YAML; removing a declared entry does not delete its remote file. / 默认只初始化新库，持续同步必须显式启用。
- Store reads, memory content, and version APIs use the workspace API Key directly through the SDK. Their `--store-id` is a remote ID; they do not require YAML or State. `--content` and `--content-file` are exclusive and allow empty content. Updates can use `--expected-content-sha256` to detect concurrent edits. / 正文 API 使用远端 ID，空正文有效。
- `session create|run --memory-stores` retains the comma-separated YAML key shorthand. Repeatable `--resource <json|@path>` supports `{ "type": "memory_store", "memory_store": "notes", "access": "read_only", "instructions": "..." }`. Explicit resources override the same shorthand mount while retaining other mounts. Duplicate explicit references are rejected; at most eight Memory Stores may be mounted. / resource 使用逻辑 key，可指定权限和说明。
- Deployment currently supports File Resources only. An effective Memory mount, including one inherited from the Agent, is rejected. / Deployment 本期仅支持 File，不能继承或直接挂载记忆库。
- Preview memory writes with `--dry-run`, then obtain confirmation before adding `--yes`. Version redaction permanently removes that version's content. / 版本擦除不可撤销，必须先预览并确认。

```bash
bl managed-agent memory-store create --name Notes --dry-run
bl managed-agent memory-store memories list --workspace-id ws-example --store-id memstore-example --view full
bl managed-agent session create --agent assistant \
  --resource '{"type":"memory_store","memory_store":"notes","access":"read_only"}' \
  --dry-run
```

Command fields and pagination are authoritative in `reference/managed-agent.md` and command help; return `next_page` unchanged. / 参数以生成手册和 help 为准，分页游标原样传回。

### Workspace Webhooks

- Webhook commands use the CLI API Key, Base URL, and workspace settings directly through the SDK. They do not need `agents.yaml`, a project Build, or local State. / Webhook 命令直接使用 CLI 鉴权与工作空间配置，无需创建项目文件。
- Select the workspace with `--workspace-id` or the configured environment/Profile. Explicit flags take precedence over environment variables, then the selected Profile. Check `webhook <command> --help` for the available request fields.
- `webhook events` uses `--limit` (1–100) and the opaque `--page` cursor; pass `next_page` back unchanged. / 事件分页游标保持原样传回，不转换成数字页码。
- Successful `create` and `reset-secret` responses can contain `signing_secret`. Store that response securely for signature verification; do not paste it into logs, issue reports, or source files. Verbose diagnostics and errors must not expose secrets. / 创建或重置密钥的成功响应可能包含签名密钥；请安全保存，不写入日志或代码。

```bash
bl managed-agent webhook list --workspace-id ws-example --output json
bl managed-agent webhook create \
  --workspace-id ws-example \
  --url https://example.com/agent-events \
  --event session.updated \
  --dry-run
```

Review the preview and obtain confirmation before removing `--dry-run` and adding `--yes`. Event names are passed to the service as supplied; use the event types supported by your endpoint. / 预览并确认后再执行写操作；事件名以服务端支持的事件类型为准。

## Local state management

| Intent                                     | Command                                |
| ------------------------------------------ | -------------------------------------- |
| Inspect tracked resources                  | `bl managed-agent state list` / `show` |
| Adopt an existing remote resource to state | `bl managed-agent state import`        |
| Untrack only (do not destroy remotely)     | `bl managed-agent state rm`            |

- Always make the difference clear to the user: `state rm` only edits the local state file, while `destroy` deletes the remote resource.

Flags, usage, and examples: see [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags.

## Common hand-offs

软 hand-off（按 skill **名**；已安装则 Read，否则 `--help` / 提示 `bl skill init`）：

- Call an already published Bailian app/assistant → `bailian-app-call`, or skill `bailian-cli` (`bl app list` / `call`; fallback: `bl app --help`).
- Choosing the model referenced in agents.yaml → `bailian-model-recommend`.
- Deployment quota / billing questions → skill `bailian-cli` (fallback: `bl quota` / `bl usage --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `bl skill init`)
- [reference/](reference/index.md) — command details
