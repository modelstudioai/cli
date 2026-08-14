---
name: bailian-cli
metadata:
  version: "1.15.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼 / Aliyun Bailian / DashScope 资源管理与 `bl` CLI hub：
  应用调用（bl app）、应用记忆、知识库检索、模型目录/模型列表、用量/额度/配额、免费额度、
  工作空间、MCP 市场、pipeline、文件上传、console API、登录鉴权与配置、
  Agent skill 安装/列表/更新/卸载（bl skill add|list|update|remove，百炼 skill registry）。
  用户点名百炼 / DashScope / `bl`，或继续既有 `bl` 工作流时直接使用。
  共享协议（consent / 版本预检 / 鉴权 / 错误上报）在 bailian-protocol；官方安装 `npx skills add modelstudioai/cli --all -g`。
  家族路由：生图/生视频/配音/语音合成/转写 → bailian-gen；精调/微调/训练/数据集 → bailian-finetune；
  agents.yaml 托管 Agent → bailian-managed-agent。
  不要用于普通问答、编程、写作、翻译、摘要、泛搜索，或图片理解等宿主自己能做的任务（普通问答、编程、写作、翻译、摘要、泛搜索不触发）。
  未命名用量/额度问题：先问用户使用哪个产品，再运行 `bl usage` / `bl quota` 查询。
---

# Aliyun Model Studio CLI (`bl`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Provider selection and consent, Version & updates (pre-flight checklist), Setup & auth, and CLI errors: report an issue. If that protocol file is missing, stop and run `npx skills add modelstudioai/cli --all -g`; do not guess auth/consent.**

> **Family hub** — This skill owns Bailian resource commands and the hub `reference/` (apps, knowledge, usage, auth, config, …).
> Shared protocol → [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md) (install the full family with `--all -g`).
> Soft hand-offs by skill name (Read if installed; else `bl … --help` / prompt `npx skills add modelstudioai/cli --all -g`): `bailian-gen` (media) · `bailian-finetune` (training) · `bailian-managed-agent` (agents.yaml IaC).
> Do not invoke it for ordinary reasoning, coding, writing, translation, summarization, generic research, or image understanding the host agent can complete directly.
>
> **Install (supported):** `npx skills add modelstudioai/cli --all -g`

## Command reference (authoritative)

**Hub-owned commands, flags, usage strings, and examples are documented in:**

- [`reference/index.md`](reference/index.md) — hub quick index, global flags, links by group
- [`reference/<group>.md`](reference/) — per hub top-level command (e.g. [`reference/app.md`](reference/app.md))

Domain skills own their own generated reference trees (soft hand-off — do not require them for hub work):

- `bailian-gen` → `image` / `video` / `speech` / `omni` / `vision` (fallback: `bl image\|video\|speech\|omni\|vision --help`)
- `bailian-finetune` → `dataset` / `finetune` / `deploy` (fallback: `bl dataset\|finetune\|deploy --help`)
- `bailian-managed-agent` → `managed-agent` (fallback: `bl managed-agent --help`)

Auto-generated from the CLI source at build time (`pnpm --filter bailian-cli run generate:reference`). Before running an unfamiliar command:

1. Open the owning skill's `reference/index.md` (if that skill is installed) → **Quick index** (or **By group**) to locate the command.
2. Open the matching `reference/<group>.md` for **Usage**, **Flags**, and **Examples**.
3. Run `bl <command> --help` for the same information in the terminal.

Do not guess flags — use the reference files or `--help`.

---

## When to use which command

Use this table only after the decision table in [`bailian-protocol`](../bailian-protocol/SKILL.md#provider-selection-and-consent) has routed the request to `bl` (class 4, or class 2 after the user picks Bailian). Hub-owned intents only — for media / fine-tune / agents.yaml, soft hand-off to the domain skill.

| User intent                                      | Command                                       | Notes                                                                            |
| ------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Explicit Bailian model chat / text execution     | `bl text chat`                                | Default `qwen3.8-max`                                                            |
| Search inside a Bailian-scoped workflow          | `bl search web`                               | DashScope MCP search; not for generic web research                               |
| Bailian agent / workflow                         | `bl app call`                                 | Needs `--app-id`                                                                 |
| Find app by name                                 | `bl app list` then `bl app call`              | Console auth                                                                     |
| Bailian app memory CRUD (not host-agent memory)  | `bl memory *`                                 | [`reference/memory.md`](reference/memory.md)                                     |
| Bailian knowledge base RAG                       | `bl knowledge search` / `chat`                | API key + agent/workspace IDs                                                    |
| Upload a file as a step of a Bailian workflow    | `bl file upload`                              | When you need `oss://` URL explicitly; not for generic hosting                   |
| Bailian model selection / recommendation         | `bl advisor recommend`                        | Intent → candidate recall → LLM ranking                                          |
| Bailian model catalog / pricing / params         | `bl model list`                               | Console auth; `--model <family>` for detail, `--enrich` for input params         |
| Install / list / update / remove registry skills | `bl skill add` / `list` / `update` / `remove` | Bailian skill registry; see [`reference/skill.md`](reference/skill.md)           |
| Bailian MCP marketplace discovery / call         | `bl mcp list` / `tools` / `call`              | —                                                                                |
| Bailian pipeline workflow (a step in a bl flow)  | `bl pipeline run` / `validate`                | JSON/YAML workflow definitions                                                   |
| Bailian rate limits / quota                      | `bl quota list` / `check` / `request`         | Console auth; class 2 — ask which product first if unnamed                       |
| Bailian free tier / usage stats                  | `bl usage free` / `stats` / `freetier`        | Console auth; class 2 — ask which product first if unnamed                       |
| Console API (advanced)                           | `bl console call`                             | Console auth                                                                     |
| Bailian workspace listing                        | `bl workspace list`                           | Console auth                                                                     |
| Image / video / speech / omni / vision           | → skill `bailian-gen`                         | Fallback: `bl image\|video\|speech\|omni\|vision --help`                         |
| Dataset / fine-tune / deploy                     | → skill `bailian-finetune`                    | Fallback: `bl dataset\|finetune\|deploy --help`                                  |
| agents.yaml IaC / managed-agent sessions         | → skill `bailian-managed-agent`               | Fallback: `bl managed-agent --help`; `apply`/`destroy` need `--yes` after `plan` |

Flags, usage, and examples: see hub [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags. Domain command details live in the owning skill's `reference/`.

---

## Quick examples

```bash
bl text chat --message "Write a poem about spring in Chinese"
bl app list --output json
bl app call --app-id <code> --prompt "Hello"
bl usage stats
bl model list --model qwen
```

More examples per command: see `reference/<group>.md` (e.g. [`reference/text.md`](reference/text.md), [`reference/app.md`](reference/app.md)).

---

## Agent workflows

### Find and call an app

1. `bl app list --name <keyword> --output json`
2. Pick `code` (app ID); handle `user_prompt_params` via `--biz-params '{"key":"value"}'`
3. `bl app call --app-id <code> --prompt "..."`

### Command metadata for agents

Use the owning skill's [`reference/index.md`](reference/index.md) (or sibling skill reference trees), the matching `reference/<group>.md`,
and `bl <command> --help` as the command schema surface. Do not call removed
schema-export commands.

---

## Routing reminders

- Image/video/audio generation or editing → skill `bailian-gen` (class 3 consent from `bailian-protocol`). Fine-tuning / datasets / deployments → `bailian-finetune`. agents.yaml IaC → `bailian-managed-agent`. Soft hand-off: Read sibling skill if installed; else `bl … --help` or prompt `npx skills add modelstudioai/cli --all -g`. Image understanding the host agent can do → host-first; use `bl vision` / `bl omni` only when the user names a Bailian model or the media (video/audio files) exceeds host capability.
- Answer ordinary reasoning, coding, writing, translation, summarization, and generic research with the host agent's native capabilities; do not bounce them through `bl text chat` or `bl search web`.
- Usage / quota / credits questions that do not name a product → ask which product (Bailian or another AI service) first; run `bl usage` / `bl quota` only after the user picks Bailian or Bailian context is already established.
- "Remember this" and memory requests default to the host agent's own memory; `bl memory *` is only for Bailian app memory resources.
- `bl file upload` and `bl pipeline run` are steps inside a Bailian workflow; do not use them to capture generic "upload this file" or "run a pipeline" requests.
- `bl managed-agent apply` / `destroy` mutate remote resources and only execute with `--yes`; run `plan` first and show the diff before confirming a mutation.
- When a matched `bl` command accepts a file URL, pass local paths directly; never require the user to host the file first.
- Console login → always `--console-site domestic|international`; see [`../bailian-protocol/assets/setup.md`](../bailian-protocol/assets/setup.md#console-site-selection).
