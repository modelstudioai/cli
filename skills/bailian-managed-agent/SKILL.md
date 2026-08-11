---
name: bailian-managed-agent
metadata:
  version: "1.14.2"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼托管 Agent 声明式基础设施入口：用户要创建agent、初始化 agents.yaml、校验或预览 agent 配置变更、
  创建/更新/销毁百炼托管 Agent、和托管 agent 对话、查会话事件历史、导入或取消跟踪远端资源时使用
  `bl managed-agent`。以 agents.yaml 为唯一事实源做 IaC：init 建脚手架、validate 离线校验、plan 预览 diff、
  apply / destroy 变更远端资源且必须带 `--yes`，务必先 plan 给用户看 diff 再让其确认。
  反触发：调用已上线的百炼应用/智能体走 bailian-app-call 或 `bl app`；宿主 agent 自身的记忆、技能、
  子代理不走本 skill；生图生视频走 bailian-gen。
  官方安装：`npx skills add modelstudioai/cli --all -g`（与共享协议 bailian-protocol 同装）。
---

# Bailian managed agent IaC (`bl managed-agent`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Version & updates (pre-flight checklist) and CLI errors: report an issue. Command details are authoritative in [`reference/managed-agent.md`](reference/managed-agent.md) and `bl managed-agent --help` — do not guess flags. If that protocol file is missing, stop and run `npx skills add modelstudioai/cli --all -g`; do not guess auth/consent.**

## Safety guardrail (the most important rule)

`apply` / `destroy` **mutate remote resources** and only execute when `--yes` is passed:

1. Always run `bl managed-agent plan` first and show the diff to the user.
2. Only after explicit user confirmation, retry `apply` / `destroy` with `--yes`.
3. Never add `--yes` on your own initiative before the user has confirmed.

## IaC lifecycle

```
1. Init      bl managed-agent init          # scaffold agents.yaml
2. Validate  bl managed-agent validate      # offline, no network calls
3. Preview   bl managed-agent plan          # show the pending change diff
4. Apply     bl managed-agent apply --yes   # only after user confirmation
5. Destroy   bl managed-agent destroy --yes # only after user confirmation
```

## Session interaction (chat with a deployed managed agent)

| Intent                                | Command                                            |
| ------------------------------------- | -------------------------------------------------- |
| Create + send + stream in one step    | `bl managed-agent session run`                     |
| Send a message to an existing session | `bl managed-agent session send`                    |
| Create / inspect / list sessions      | `bl managed-agent session create` / `get` / `list` |
| List session event history            | `bl managed-agent session events`                  |
| Delete a session                      | `bl managed-agent session delete`                  |

## Local state management

| Intent                                     | Command                                |
| ------------------------------------------ | -------------------------------------- |
| Inspect tracked resources                  | `bl managed-agent state list` / `show` |
| Adopt an existing remote resource to state | `bl managed-agent state import`        |
| Untrack only (do not destroy remotely)     | `bl managed-agent state rm`            |

- Always make the difference clear to the user: `state rm` only edits the local state file, while `destroy` deletes the remote resource.

Flags, usage, and examples: see [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags.

## Common hand-offs

软 hand-off（按 skill **名**；已安装则 Read，否则 `--help` / 提示 `npx skills add modelstudioai/cli --all -g`）：

- Call an already published Bailian app/assistant → `bailian-app-call`, or skill `bailian-cli` (`bl app list` / `call`; fallback: `bl app --help`).
- Choosing the model referenced in agents.yaml → `bailian-model-recommend`.
- Deployment quota / billing questions → skill `bailian-cli` (fallback: `bl quota` / `bl usage --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `--all -g`)
- [reference/](reference/index.md) — command details
