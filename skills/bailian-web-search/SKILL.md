---
name: bailian-web-search
metadata:
  version: "2.8.5"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼联网搜索（web search）入口：为联网搜索 / 网页搜索 / 查最新资讯做路径分发。
  `bl search web` 默认走 model 模式（Chat Completions enable_search），任何连接身份
  （含 Token Plan）均可用；仅当用户明确要 WebSearch MCP 服务或 pages 列表时用
  `--mode mcp`（仅普通 DashScope API Key）；MCP 鉴权失败、未开通或传输失败时
  兜底一次到 model 模式。联网搜索失败、两条路径鉴权混淆的排查也走本技能。
  反触发：宿主可完成的 普通问答 / 编程 / 写作 → 不触发；知识库 RAG → bailian-cli
  （`bl knowledge`）；生图/生视频/语音 → bailian-gen；精调/训练 → bailian-finetune；
  agents.yaml → bailian-managed-agent。
  共享协议（consent / 版本预检 / 鉴权 / 错误上报）在 bailian-protocol；官方安装 `bl skill init`。
---

# Bailian web search routing (`bailian-web-search`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Provider selection and consent, Version & updates (pre-flight checklist), Call attribution (every Agent `bl` command), Setup & auth, and CLI errors: report an issue. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

**Call attribution:** Examples below and in `reference/` stay bare `bl …`. When running a command, wrap it with [`bailian-protocol` → Call attribution](../bailian-protocol/SKILL.md#call-attribution-mandatory-for-every-agent-bl-command) (bash or PowerShell). One sample for this skill (`BAILIAN_SKILL_NAME=bailian-web-search`; replace `codex` with this host). `bl config` / `bl text chat` are owned by `bailian-cli`. **When copying commands into a reusable script / template / task definition, switch to the protocol `script` template (never keep `agent`); the sample below is for this-turn inline execution only. Strip attribution when handing a command to the user to paste.**

```bash
BAILIAN_CALLER_TYPE=agent BAILIAN_CALLER_NAME=codex BAILIAN_SKILL_NAME=bailian-web-search BAILIAN_SKILL_VERSION=<metadata.version> bl search web --query "阿里云百炼最新功能"
```

> **Scope:** model-aware routing for web search inside Agent-driven `bl` workflows — this skill owns the routing decision only.
> Command flags / usage / examples: Read skill `bailian-cli` reference if installed; else `bl search web --help` / `bl text chat --help` — do not guess flags.
>
> **Install (supported):** `bl skill init`

Token Plan keys do not authorize Bailian MCP search — never route them to `bl search web --mode mcp` (the default model mode works for Token Plan).

## Routing workflow

### Step 1 — Identify the active model identity

Wrap with Call attribution (`BAILIAN_SKILL_NAME=bailian-cli`). No auth needed:

```bash
bl config show --output json
```

Treat the connection as **Token Plan** when **either** condition holds — this mirrors the CLI's own endpoint detection (`usesTokenPlanEndpoint`), so routing stays consistent with command behavior:

- `config` (active profile name) is `token-plan`, **or**
- the hostname of `base_url` matches `token-plan.<region>.maas.aliyuncs.com` (e.g. `https://token-plan.cn-beijing.maas.aliyuncs.com`).

Do not rely on the profile name alone: users can create additional Token Plan profiles under custom names, and only the Base URL host check catches those. Anything else → **default** identity.

### Step 2 — Route by mode and identity

| Condition                                     | Route                                 | Notes                                               |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Any identity (default)                        | Model mode: `bl search web --query …` | CLI default; the model answers with `enable_search` |
| Regular key + user explicitly wants MCP/pages | `bl search web --mode mcp --query …`  | Requires the WebSearch MCP activated for that key   |
| Token Plan + user asks for MCP                | Explain, stay on model mode           | Token Plan keys cannot authorize Bailian MCP search |
| `--mode mcp` run (eligible fail)              | Model mode, exactly once              | Fallback — only for the failure classes below       |

**User override:** if the user names a specific path or command, follow it **except** under Token Plan identity: do not call `bl search web --mode mcp` even if the user asks for MCP — explain that Token Plan keys cannot authorize Bailian MCP search, then use the default model mode (or ask once whether to switch profile / key).

### Model path (default for every identity)

```bash
bl search web --query "阿里云百炼最新功能"
```

- Without `--mode` the CLI runs model mode: one non-streaming Chat Completions request with `enable_search: true`; the reply is the model answer (no pages list).
- Works for Token Plan and regular identities alike: the CLI selects the credential per mode (model mode authenticates in the `text.chat` capability domain).
- **Do not hardcode `--model`:** omit it so the CLI uses `default_text_model` / built-in default; only pass `--model` when the user named one.
- Flags / usage: Read skill `bailian-cli` if installed, else `bl search web --help`.

### Responses API alternative (only when the user names it)

```bash
bl text chat --api responses --tool '{"type":"web_search"}' --message "搜索近期的阿里云新闻"
```

- The Responses API enables native web search via the tool definition `{"type":"web_search"}`; prefer it only when the user explicitly asks for the Responses API or tool-style results.
- Requires a model with native web search support (Qwen3.7+); the same "do not hardcode `--model`" rule applies.
- Write `--message` in the user's language; the reply language follows the prompt (see `bailian-protocol` → Respond in the user's language).
- Flags / usage: Read skill `bailian-cli` if installed, else `bl text chat --help`.

### MCP path (explicit `--mode mcp`, regular keys only)

```bash
bl search web --mode mcp --query "阿里云百炼最新功能"
```

- Route here only when the user explicitly wants the WebSearch MCP service or the pages list; regular DashScope API keys only — Token Plan keys cannot authorize it.
- Requires the WebSearch MCP to be activated for the current key; on the not-activated error the CLI appends an activation hint with the marketplace URL — relay it to the user.
- Flags / usage: Read skill `bailian-cli` if installed, else `bl search web --help`.

### Fallback (MCP → model, exactly once)

**Do not** fall back on every non-zero exit. Fall back **only** when a `bl search web --mode mcp` run fails for one of these classes (match stderr / message):

- **auth / permission** — key not valid for the MCP service (e.g. Token Plan key misrouted to `--mode mcp`),
- **MCP not activated** — `MCP request failed: 404` with `未开通` / `MCP不存在` / `MCP_IS_INVALID` (CLI may append an activation hint),
- **MCP transport** — 405 / Streamable-HTTP unsupported, or clear network / timeout / DNS failures reaching the MCP endpoint.

**Do not fall back** for: missing `--query` / USAGE errors, rate limits, content-policy / business errors from a successful MCP session, or empty-but-successful result sets. Report those verbatim and stop (or ask the user); do not burn a model call. Default model-mode failures are **not** MCP failures — report them verbatim; never reinterpret them as MCP errors or retry them as MCP.

Fallback discipline:

1. Re-issue the same query via the default model mode (omit `--model` unless the user named one).
2. If the fallback succeeds, tell the user the MCP path failed and — when the not-activated hint appeared — that activating the WebSearch MCP restores the MCP path.
3. If the fallback also fails, stop and report both errors verbatim; follow the issue-reporting flow in `bailian-protocol` (ask once). Never loop retries.

## Quick examples

```bash
# Step 1: identify the active model identity
bl config show --output json

# Default (any identity, including Token Plan): model mode
bl search web --query "阿里云百炼最新功能"

# Regular key + user explicitly wants the MCP service / pages list
bl search web --mode mcp --query "阿里云百炼最新功能"

# Responses API alternative (only when the user names it)
bl text chat --api responses --tool '{"type":"web_search"}' --message "搜索近期的阿里云新闻"
```

## Routing reminders

- Generic web research the host can do, ordinary Q&A, coding, writing → host-first; do not invoke `bl` (class 1 in `bailian-protocol`). Route only when the user names Bailian / DashScope / `bl` or continues an existing `bl` workflow (class 4).
- Knowledge-base / RAG over Bailian corpora → hub skill `bailian-cli` (`bl knowledge`), not this skill.
- Summarize search results in the user's language; write `--query` / `--message` in the user's language — the model path injects no default language (do not hardcode 简体中文); if a fixed reply language is required, use the Responses API alternative with `--system` in that language.
- Other Bailian workflows (apps / usage / config) → hub skill `bailian-cli`; media generation → `bailian-gen`; fine-tuning → `bailian-finetune`; agents.yaml → `bailian-managed-agent`. Soft hand-off by skill name: Read if installed, else `bl … --help` or prompt `bl skill init`.

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `bl skill init`)
- skill `bailian-cli` — hub command reference for `bl search web` / `bl text chat` (soft hand-off; fallback: `--help`)
