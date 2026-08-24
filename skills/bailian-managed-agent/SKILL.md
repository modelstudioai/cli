---
name: bailian-managed-agent
metadata:
  version: "1.17.1"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼托管 Agent 声明式基础设施与 API 命令入口：用户要创建agent、初始化 agents.yaml、校验或预览配置变更、
  创建/更新/销毁托管 Agent 或 Deployment，或查询 Agent/Environment/Skill/Vault/Deployment、管理 Session/Event/File、
  运行/暂停 Deployment 时使用 `bl managed-agent`。持久资源仍以 agents.yaml 为唯一事实源做 IaC；公开 API 能力按资源透出
  list/get/search/versions/download、数据面和运行时动作命令。apply / destroy 与破坏性 API 命令必须遵守 `--yes` 门禁。
  反触发：调用已上线的百炼应用/智能体走 bailian-app-call 或 `bl app`；宿主 agent 自身的记忆、技能、
  子代理不走本 skill；生图生视频走 bailian-gen。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian managed agent IaC (`bl managed-agent`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Version & updates (pre-flight checklist) and CLI errors: report an issue. Command details are authoritative in [`reference/managed-agent.md`](reference/managed-agent.md) and `bl managed-agent --help` — do not guess flags. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

## Safety guardrail (the most important rule)

`apply` / `destroy` **mutate persistent remote resources** and only execute when `--yes` is passed:

1. For `agents.yaml` resource changes, always run `bl managed-agent plan` first and show the diff to the user.
2. Only after explicit user confirmation, retry `apply` / `destroy` with `--yes`.
3. Never add `--yes` on your own initiative before the user has confirmed.

API-oriented commands do not replace IaC. Agent / Environment / Skill / Vault 的持久配置仍通过
`agents.yaml → plan → apply` 管理；命令式写操作只覆盖 Session、Event、File 和 Deployment 运行时动作。
`session archive|delete`、`file delete`、`deployment run` 也需要先 `--dry-run`，确认后才传 `--yes`。

## IaC lifecycle

```
1. Init      bl managed-agent init          # scaffold agents.yaml
2. Validate  bl managed-agent validate      # offline, no network calls
3. Preview   bl managed-agent plan          # show the pending change diff
4. Apply     bl managed-agent apply --yes   # only after user confirmation
5. Destroy   bl managed-agent destroy --yes # only after user confirmation
```

## Deployment as IaC

Deployment 与 Agent 一样声明在 `agents.yaml` 中，并复用同一条 `validate → plan → apply → destroy` IaC 链路；
CLI 不提供绕过 state 的命令式 Deployment CRUD。最小配置：

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

| Intent                                 | Command family                  |
| -------------------------------------- | ------------------------------- | ------- | ------------------------------ | --------- | --------- | ------- |
| Check exact API support/auth/reason    | `bl managed-agent capabilities` |
| Discover agents and versions           | `agent list                     | get     | search                         | versions` |
| Discover environments                  | `environment list               | get     | search`                        |
| Discover skills and download a version | `skill list                     | get     | search                         | versions  | download` |
| Inspect vault envelopes                | `vault list                     | get     | search`                        |
| Inspect deployments and run history    | `deployment list                | get     | search`, `deployment runs list | get`      |
| Run or pause deployments               | `deployment run                 | pause   | unpause`                       |
| Manage session metadata/lifecycle      | `session list                   | get     | search                         | update    | archive   | delete` |
| Work with raw events                   | `session event send             | list    | stream`                        |
| Diagnose/export a session              | `session debug                  | export` |
| Work with files                        | `file upload                    | list    | get                            | search    | download  | delete` |

- 所有 Cursor 都是不透明字符串：只回传 `next_page`，不得转换为数字页码。
- 客户端搜索默认最多扫描 10 页；需要扩大范围时显式传 `--page-limit`。Deployment 搜索直接映射服务端 `keyword`。
- 下载必须给出 `--output-file`；默认不覆盖已有文件，只有用户确认后才可加 `--force`。
- `session export` 只导出诊断元数据，不含 File 正文，并会脱敏凭证类字段。
- 公开 Managed Agents API 没有模型 Catalog，也没有 MCP OAuth Login；以 `capabilities` 返回的 unsupported 原因为准。

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
