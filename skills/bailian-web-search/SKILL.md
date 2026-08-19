---
name: bailian-web-search
metadata:
  version: "1.17.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼联网搜索（web search）入口：为联网搜索 / 网页搜索 / 查最新资讯做路径分发。
  先识别当前连接身份：Token Plan（profile `token-plan` 或 base_url host 为
  `token-plan.<region>.maas.aliyuncs.com`）→ 模型自带搜索
  （`bl text chat --api responses --tool '{"type":"web_search"}'`）；其他 / 默认 →
  Bailian MCP（`bl search web`）；仅在 MCP 鉴权失败、未开通或传输失败时兜底一次到模型自带搜索。
  Token Plan 联网搜索失败、两条路径鉴权混淆的排查也走本技能。
  反触发：宿主可完成的 普通问答 / 编程 / 写作 → 不触发；知识库 RAG → bailian-cli
  （`bl knowledge`）；生图/生视频/语音 → bailian-gen；精调/训练 → bailian-finetune；
  agents.yaml → bailian-managed-agent。
  共享协议（consent / 版本预检 / 鉴权 / 错误上报）在 bailian-protocol；官方安装 `bl skill init`。
---

# Bailian web search routing (`bailian-web-search`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Provider selection and consent, Version & updates (pre-flight checklist), Setup & auth, and CLI errors: report an issue. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

> **Scope:** model-aware routing for web search inside Agent-driven `bl` workflows — this skill owns the routing decision only.
> Command flags / usage / examples: Read skill `bailian-cli` reference if installed; else `bl search web --help` / `bl text chat --help` — do not guess flags.
>
> **Install (supported):** `bl skill init`

Token Plan keys do not authorize Bailian MCP search — never route them to `bl search web`.

## Routing workflow

### Step 1 — Identify the active model identity

Run (no auth needed):

```bash
bl config show --output json
```

Treat the connection as **Token Plan** when **either** condition holds — this mirrors the CLI's own endpoint detection (`usesTokenPlanEndpoint`), so routing stays consistent with command behavior:

- `config` (active profile name) is `token-plan`, **or**
- the hostname of `base_url` matches `token-plan.<region>.maas.aliyuncs.com` (e.g. `https://token-plan.cn-beijing.maas.aliyuncs.com`).

Do not rely on the profile name alone: users can create additional Token Plan profiles under custom names, and only the Base URL host check catches those. Anything else → **default** identity.

### Step 2 — Route by identity

| Condition                 | Route                           | Notes                                               |
| ------------------------- | ------------------------------- | --------------------------------------------------- |
| Token Plan model identity | Model-native path               | Preferred — the only path Token Plan keys authorize |
| Any other model / default | MCP path                        | Default for regular DashScope API keys              |
| MCP path (eligible fail)  | Model-native path, exactly once | Fallback — only for the failure classes below       |

**User override:** if the user names a specific path or command, follow it **except** under Token Plan identity: do not call `bl search web` even if the user asks for MCP — explain that Token Plan keys cannot authorize Bailian MCP search, then use the model-native path (or ask once whether to switch profile / key).

### Model-native path (Token Plan preferred / fallback target)

```bash
bl text chat --api responses --tool '{"type":"web_search"}' --message "搜索近期的阿里云新闻"
```

- The Responses API enables native web search via the tool definition `{"type":"web_search"}`.
- Requires a model with native web search support (Qwen3.7+). **Do not hardcode `--model`:** omit it so the CLI uses `default_text_model` / built-in default; only pass `--model` when the user named one.
- Write `--message` in the user's language; the reply language follows the prompt (see `bailian-protocol` → Respond in the user's language).
- Flags / usage: Read skill `bailian-cli` if installed, else `bl text chat --help`.

### MCP path (default)

```bash
bl search web --query "阿里云百炼最新功能"
```

- Requires the WebSearch MCP to be activated for the current key; on the not-activated error the CLI appends an activation hint with the marketplace URL — relay it to the user.
- Flags / usage: Read skill `bailian-cli` if installed, else `bl search web --help`.

### Fallback (MCP → model-native, exactly once)

**Do not** fall back on every non-zero exit. Fall back **only** when `bl search web` fails for one of these classes (match stderr / message):

- **auth / permission** — key not valid for the MCP service (e.g. Token Plan key misrouted by identity detection),
- **MCP not activated** — `MCP request failed: 404` with `未开通` / `MCP不存在` / `MCP_IS_INVALID` (CLI may append an activation hint),
- **MCP transport** — 405 / Streamable-HTTP unsupported, or clear network / timeout / DNS failures reaching the MCP endpoint.

**Do not fall back** for: missing `--query` / USAGE errors, rate limits, content-policy / business errors from a successful MCP session, or empty-but-successful result sets. Report those verbatim and stop (or ask the user); do not burn a Responses call.

Fallback discipline:

1. Re-issue the same query via the model-native path (omit `--model` unless the user named one).
2. If the fallback succeeds, tell the user the MCP path failed and — when the not-activated hint appeared — that activating the WebSearch MCP restores the default path.
3. If the fallback also fails, stop and report both errors verbatim; follow the issue-reporting flow in `bailian-protocol` (ask once). Never loop retries.

## Quick examples

```bash
# Step 1: identify the active model identity
bl config show --output json

# Token Plan identity → model-native web search (no --model unless user named one)
bl text chat --api responses --tool '{"type":"web_search"}' --message "搜索近期的阿里云新闻"

# Default identity → Bailian MCP search
bl search web --query "阿里云百炼最新功能"

# Eligible MCP failure → fall back once (same rule: no hardcoded --model)
bl text chat --api responses --tool '{"type":"web_search"}' --message "阿里云百炼最新功能"
```

## Routing reminders

- Generic web research the host can do, ordinary Q&A, coding, writing → host-first; do not invoke `bl` (class 1 in `bailian-protocol`). Route only when the user names Bailian / DashScope / `bl` or continues an existing `bl` workflow (class 4).
- Knowledge-base / RAG over Bailian corpora → hub skill `bailian-cli` (`bl knowledge`), not this skill.
- Summarize search results in the user's language; on the model-native path the CLI injects no default language — if a fixed language is required, pass `--system` in that language (do not hardcode 简体中文).
- Other Bailian workflows (apps / usage / config) → hub skill `bailian-cli`; media generation → `bailian-gen`; fine-tuning → `bailian-finetune`; agents.yaml → `bailian-managed-agent`. Soft hand-off by skill name: Read if installed, else `bl … --help` or prompt `bl skill init`.

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `bl skill init`)
- skill `bailian-cli` — hub command reference for `bl search web` / `bl text chat` (soft hand-off; fallback: `--help`)
