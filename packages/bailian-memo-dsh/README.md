# bailian-memo-dsh

English | [中文](./README.zh.md)

Bailian personal memory plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh` ≥ 0.2.1-alpha.1).

It adds automatic recall on top-level turns, silent auxiliary curation with recoverable async writes, explicit remember/forget tools, and a Plugins settings page. Identity and consent live in `~/.bailian/personal-memory/config.json` (shared with the `bailian-memory` skill). API keys use dsh credentials (`DASHSCOPE_API_KEY`).

> **Release gate:** stable publish requires Memory GA, verified profile-value delete (`need_detail` + `PATCH profile_values`), and a live dsh 0.2.1 install check. Until then, treat this package as internal / channel-only.

## Install

```sh
dsh plugin --profile <profile> add bailian-memo-dsh
# or from a local checkout:
dsh plugin --profile <profile> add /path/to/cli/packages/bailian-memo-dsh
```

Open **Sidebar → Plugins → Bailian Personal Memory**, automatically retrieve/update the credentials (or ensure `DASHSCOPE_API_KEY` and the Workspace ID already match), then click **Enable personal memory**. This is a dedicated personal-memory page, not the legacy Knowledge Base Settings section. Browser authorization is a one-time credential retrieval flow, not a persistent login session.

The installed bundle row also exposes **Configure** for `bailian-memo-dsh#tool-bailian-memo`; it opens the same configuration page and shared draft state.

## What it does

| Capability       | Behavior                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic recall | On each top-level turn’s first step, searches observations + profile and injects a sourced context message (`startsRequestSeries`). Fail-open. Subagents skipped. |
| Silent curation  | On `turn-stopping`, an auxiliary LLM decides commit/skip; commits go through `add-async` with background polling.                                                 |
| Tools            | `bailian_memo_search`, `status`, `remember`, `forget`, `pause`, `resume`                                                                                          |
| Forget           | Candidate search → dsh approval → node delete; optional profile value delete when API supports it                                                                 |
| Pause / resume   | Local status only; cloud data is kept                                                                                                                             |

## Configuration

- **Personal identity:** `~/.bailian/personal-memory/config.json` (`status`: `unconfigured` / `initializing` / `active` / `paused`)
- **Plugin settings (Volatile):** real toggles for `enabled`, `autoRecall`, and `autoCurate`, plus the visible `recallTopK` result limit and `minScore` threshold (default 0). The threshold applies to automatic recall and to manual search when `min_score` is omitted. Curator and endpoint tuning remain available to deployment configuration but are intentionally hidden from this page.
- **Secrets:** never stored in the personal config file; the UI shows only whether the effective credential is configured and its source category, never its value
- **Safe controls:** pause/resume keeps cloud data; the page does not expose a full wipe
- **Diagnostics:** async writes distinguish submitted, succeeded with changes, succeeded without changes, and failed. Empty searches include a sanitized scope (hashes and lengths only); `bailian_memo_search` accepts optional `min_score`.

The automatic flow accepts the API key and Workspace as one pair, applies both, and makes a read-only Memory request before reporting **Credentials updated**. If `DASHSCOPE_API_KEY` comes from the environment that launched dsh, it takes priority and cannot be replaced in the page: unset it in that shell or service, restart dsh, then retry.

If setup reports the raw server error `Endpoint.AccessDenied: Workspace endpoint access denied.`, verify that the effective API key and Workspace belong to the same Alibaba Cloud account, then automatically update the credential pair from this page. If they already match, confirm that Bailian Memory is enabled or allowlisted for that account.

## Privacy

- Ordinary personal facts may be remembered after enablement consent
- Sensitive content only when the user explicitly asks
- Passwords / API keys / private keys are never stored
- You can pause anytime

## Uninstall

```sh
dsh plugin --profile <profile> remove bailian-memo-dsh
```

Uninstall does **not** delete cloud memories or `~/.bailian/personal-memory/config.json`.

## License

Apache-2.0
