---
name: bailian-cli
metadata:
  version: "1.10.1"
  requires:
    bins: ["bl"]
  companions: ["bailian-base"]
description: >-
  阿里云百炼 / Aliyun Bailian / DashScope 资源管理与 `bl` CLI hub：
  应用调用（bl app）、应用记忆、知识库检索、模型目录/模型列表、用量/额度/配额、免费额度、
  工作空间、MCP 市场、pipeline、文件上传、console API、登录鉴权与配置。
  用户点名百炼 / DashScope / `bl`，或继续既有 `bl` 工作流时直接使用。
  共享协议（consent / 版本预检 / 鉴权 / 错误上报）在 bailian-base；安装本 skill 时必须同时安装 companion bailian-base。
  家族路由：生图/生视频/配音/语音合成/转写 → bailian-gen；精调/微调/训练/数据集 → bailian-finetune；
  agents.yaml 托管 Agent → bailian-managed-agent。
  Do NOT use for ordinary Q&A, coding, writing, translation, summarization, generic web search,
  or image understanding the host agent can do itself（普通问答、编程、写作、翻译、摘要、泛搜索不触发）.
  Unnamed usage/quota questions: ask which product first before `bl usage` / `bl quota`.
---

# Aliyun Model Studio CLI (`bl`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-base/SKILL.md`](../bailian-base/SKILL.md): Provider selection and consent, Version & updates (pre-flight checklist), Setup & auth, and CLI errors: report an issue.**

> **Family hub** — This skill owns Bailian resource commands and the hub `reference/` (apps, knowledge, usage, auth, config, …).
> Shared protocol (companion) → [`../bailian-base/SKILL.md`](../bailian-base/SKILL.md).
> Soft hand-offs by skill name (Read if installed; else `bl … --help` / install with `bailian-base`): `bailian-gen` (media) · `bailian-finetune` (training) · `bailian-managed-agent` (agents.yaml IaC).
> Do not invoke it for ordinary reasoning, coding, writing, translation, summarization, generic research, or image understanding the host agent can complete directly.
>
> **Companion:** always install with `bailian-base` (`npx skills add modelstudioai/cli --all -g`, or `-s bailian-base -s bailian-cli`).

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

Use this table only after the decision table in [`bailian-base`](../bailian-base/SKILL.md#provider-selection-and-consent) has routed the request to `bl` (class 3 after consent, or class 4).

| User intent                                            | Command                                                                                       | Default model / notes                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Explicit Bailian model chat / text execution           | `bl text chat`                                                                                | `qwen3.7-max`                                                                                                            |
| Bailian omni multimodal input + text/audio out         | `bl omni`                                                                                     | `qwen3.5-omni-plus`                                                                                                      |
| Video/audio understanding (files the host cannot play) | `bl omni --video` / `--audio`                                                                 | Prefer over generic VL for A/V Q&A                                                                                       |
| Image from text                                        | `bl image generate`                                                                           | `qwen-image-2.0`                                                                                                         |
| Image edit / multi-image merge                         | `bl image edit` (repeat `--image`)                                                            | `qwen-image-2.0`                                                                                                         |
| Video from text or image                               | `bl video generate`                                                                           | `happyhorse-1.1-t2v` / `-i2v` with `--image`                                                                             |
| Video edit / style transfer                            | `bl video edit`                                                                               | `happyhorse-1.0-video-edit`                                                                                              |
| Reference-to-video + voice                             | `bl video ref`                                                                                | `happyhorse-1.1-r2v`                                                                                                     |
| Image / video describe via Bailian model               | `bl vision describe`                                                                          | `qwen-vl-max`; host-first for plain image Q&A — use when user names Bailian or media exceeds host capability             |
| TTS                                                    | `bl speech synthesize`                                                                        | `cosyvoice-v3-flash`                                                                                                     |
| ASR                                                    | `bl speech recognize`                                                                         | `fun-asr`                                                                                                                |
| Search inside a Bailian-scoped workflow                | `bl search web`                                                                               | DashScope MCP search                                                                                                     |
| Bailian agent / workflow                               | `bl app call`                                                                                 | Needs `--app-id`                                                                                                         |
| Find app by name                                       | `bl app list` then `bl app call`                                                              | Console auth                                                                                                             |
| Bailian app memory CRUD (not host-agent memory)        | `bl memory *`                                                                                 | [`reference/memory.md`](reference/memory.md)                                                                             |
| Bailian knowledge base RAG                             | `bl knowledge search` / `chat`                                                                | API key + agent/workspace IDs                                                                                            |
| Upload a file as a step of a Bailian workflow          | `bl file upload`                                                                              | When you need `oss://` URL explicitly; not for generic hosting                                                           |
| Bailian model selection / recommendation               | `bl advisor recommend`                                                                        | Intent → candidate recall → LLM ranking                                                                                  |
| Bailian model catalog / pricing / params               | `bl model list`                                                                               | Console auth; `--model <family>` for detail, `--enrich` for input params (temperature/top_p…)                            |
| Validate / upload a training dataset                   | `bl dataset validate` / `upload`                                                              | API key; `.jsonl` or `.zip`; schemas: chatml/dpo/cpt/tts/image                                                           |
| Fine-tune a model (text/audio/image)                   | `bl finetune text\|audio\|image create`                                                       | API key; text = sft/sft-lora/dpo/dpo-lora/cpt; then `bl finetune watch`                                                  |
| Fine-tune job lifecycle                                | `bl finetune list`/`get`/`watch`/`logs`/`checkpoints`/`export`/`cancel`/`delete`/`capability` | API key                                                                                                                  |
| Deploy a (fine-tuned) model                            | `bl deploy text\|audio\|image create`                                                         | API key; audio defaults `--plan mu`, text/image `lora`                                                                   |
| Deployment lifecycle                                   | `bl deploy list`/`get`/`update`/`scale`/`delete`/`models`                                     | API key                                                                                                                  |
| Declarative agent infra (agents.yaml) IaC lifecycle    | `bl managed-agent …`                                                                          | Prefer skill `bailian-managed-agent`; fallback `bl managed-agent --help`. `apply`/`destroy` require `--yes` after `plan` |
| Chat with a managed agent (sessions)                   | `bl managed-agent session run`/`send`/`create`/`get`/`list`/`events`/`delete`                 | `run` = create + send + stream in one step; `send` targets an existing session; `events` lists history                   |
| Managed agent state inspection / adoption              | `bl managed-agent state list`/`show`/`import`/`rm`                                            | Local state ops; `import` adopts an existing remote resource; `rm` untracks without destroying remotely                  |
| Bailian MCP marketplace discovery / call               | `bl mcp list` / `tools` / `call`                                                              | —                                                                                                                        |
| Bailian pipeline workflow (a step in a bl workflow)    | `bl pipeline run` / `validate`                                                                | JSON/YAML workflow definitions                                                                                           |
| Bailian rate limits / quota                            | `bl quota list` / `check` / `request`                                                         | Console auth; class 2 — ask which product first if unnamed                                                               |
| Bailian free tier / usage stats                        | `bl usage free` / `stats` / `freetier`                                                        | Console auth; class 2 — ask which product first if unnamed                                                               |
| Console API (advanced)                                 | `bl console call`                                                                             | Console auth                                                                                                             |
| Bailian workspace listing                              | `bl workspace list`                                                                           | Console auth                                                                                                             |

Commands not listed here: see hub [`reference/index.md`](reference/index.md), or the domain skill reference trees for media / fine-tune / managed-agent.

---

## Quick examples

```bash
# Explicit Bailian text-model call
bl text chat --message "Write a poem about spring in Chinese"

# Image
bl image generate --prompt "A cat in space" --out-dir ./out/

# Video (wait for task, save file)
bl video generate --prompt "Sunset on the beach" --download sunset.mp4

# Omni (local files OK)
bl omni --message "Describe the video content" --video ./demo.mp4 --text-only

# App
bl app list --output json
bl app call --app-id <code> --prompt "Hello"
```

More examples per command: see `reference/<group>.md` (e.g. [`reference/text.md`](reference/text.md)).

---

## Video post-processing

`bl video *` makes short clips (~2–10s). For concatenation / audio mixing / long-form assembly, use skill `bailian-gen` (`assets/video-postprocessing.md` if installed) or ffmpeg directly.

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

- Image/video/audio generation or editing → skill `bailian-gen` (class 3 consent from companion `bailian-base`). Fine-tuning / datasets / deployments → `bailian-finetune`. agents.yaml IaC → `bailian-managed-agent`. Soft hand-off: Read sibling skill if installed; else `bl … --help` or prompt install with `bailian-base`. Image understanding the host agent can do → host-first; use `bl vision` / `bl omni` only when the user names a Bailian model or the media (video/audio files) exceeds host capability.
- Answer ordinary reasoning, coding, writing, translation, summarization, and generic research with the host agent's native capabilities; do not bounce them through `bl text chat` or `bl search web`.
- Usage / quota / credits questions that do not name a product → ask which product (Bailian or another AI service) first; run `bl usage` / `bl quota` only after the user picks Bailian or Bailian context is already established.
- "Remember this" and memory requests default to the host agent's own memory; `bl memory *` is only for Bailian app memory resources.
- `bl file upload` and `bl pipeline run` are steps inside a Bailian workflow; do not use them to capture generic "upload this file" or "run a pipeline" requests.
- `bl managed-agent apply` / `destroy` mutate remote resources and only execute with `--yes`; run `plan` first and show the diff before confirming a mutation.
- When a matched `bl` command accepts a file URL, pass local paths directly; never require the user to host the file first.
- Console login → always `--console-site domestic|international`; see companion [`../bailian-base/assets/setup.md`](../bailian-base/assets/setup.md#console-site-selection).
