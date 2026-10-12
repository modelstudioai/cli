# bailian-memo-dsh

English | [中文](./README.zh.md)

Bailian personal memory plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh` ≥ 0.2.1-alpha.1).

It adds automatic recall on top-level turns, silent auxiliary curation with recoverable async writes, explicit remember/forget tools, and a Plugins settings page. Identity and consent live in `~/.bailian/personal-memory/config.json` (shared with the `bailian-memory` skill). API keys use dsh credentials (`BAILIAN_MEMO_API_KEY`).

> **Release gate:** stable publish requires Memory GA, verified profile-value delete (`need_detail` + `PATCH profile_values`), and a live dsh 0.2.1 install check. Until then, treat this package as internal / channel-only.

## Install

```sh
dsh plugin --profile <profile> add bailian-memo-dsh
# or from a local checkout:
dsh plugin --profile <profile> add /path/to/cli/packages/bailian-memo-dsh
```

Open **Sidebar → Plugins → Bailian Personal Memory**, automatically retrieve/update the credentials (or ensure `BAILIAN_MEMO_API_KEY` and the Workspace ID already match), then click **Enable personal memory**. This is a dedicated personal-memory page, not the legacy Knowledge Base Settings section. Browser authorization is a one-time credential retrieval flow, not a persistent login session.

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
- **Plugin settings (Volatile):** real toggles for `enabled`, `autoRecall`, and `autoCurate`, plus the visible `recallTopK` result limit and `minScore` threshold (default 0). The threshold applies to automatic recall and to manual search when `min_score` is omitted. `workspaceId` and curator options also live in dsh settings. The endpoint uses the fixed default Memory host.
- **Secrets:** never stored in the personal config file; the UI shows only whether the effective credential is configured and its source category, never its value
- **Plugin control:** use the switch in the installed plugins list to enable or disable the plugin. The settings page has no pause/resume buttons and does not expose a full wipe; cloud data is kept.
- **Diagnostics:** async writes distinguish submitted, succeeded with changes, succeeded without changes, and failed. Empty searches include a sanitized scope (hashes and lengths only); `bailian_memo_search` accepts optional `min_score`.

On first startup, an absent dsh `workspaceId` is seeded from the personal identity binding, then from the active `bl` profile. Explicit dsh values are preserved. `configInitialized` records this migration, so clearing a setting does not reimport it on restart. Missing API keys may be seeded into the plugin-specific dsh `BAILIAN_MEMO_API_KEY` credential; requests never fall back to `bl` or environment workspace values.

The personal file stores identity, consent, status, and its workspace binding; the request Workspace always comes from dsh. A different Workspace is rejected before requests or credential autofill; restore the original binding in dsh settings. Enabling and autofill write connection settings to dsh, never silently rebind an existing identity.

Enter a new API key in the password field and select **Verify and save** to update it together with the Workspace. Leave the key blank to retain the effective credential. The key and Workspace belong only to Memory; replacing them does not affect Bailian Knowledge Base. The page never displays the stored key; drafts remain only in memory and are cleared after a successful save or when the page closes. Connection edits are saved separately from automatic behavior.

Both manual save and automatic retrieval verify the candidate API key/Workspace pair with a read-only Memory request before writing either value. Verification failures leave the previous settings untouched. If `BAILIAN_MEMO_API_KEY` comes from the environment that launched dsh, it takes priority and cannot be replaced in the page: unset it in that shell or service, restart dsh, then retry. Workspace-only saves with a blank key can still use that environment credential.

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

The former shared `DASHSCOPE_API_KEY` is no longer read, modified, or deleted. If the plugin-specific key is absent and bl has no default to import, save a key on each plugin’s page.

## User profile extraction

**Extract user profile** is off by default and is saved with automatic behavior in dsh settings. When enabled, each new remember/curation submission queries existing profile rules in the default memory-library scope before passing the selected ID to add-async. The plugin never creates a schema or modifies cloud rules. The selected `profileSchemaId` is saved in this plugin’s dsh settings. With extraction disabled, add-async omits `profile_schema`.

When extraction is enabled, select a profile rule by name and schemaId in the automatic-behavior card. With no selection, the last item in the complete API list is selected by default (this is list order, not creation time). Save persists that ID together with the extraction switch. Existing selections are preserved; a missing/deleted selection requires reselection instead of silently changing the rule. Each submission uses only one rule. Search does not require a schema. Existing profile recall independently resolves the current rule before GetUserProfile, even when extraction is off; lookup failures do not block observation recall. Forget resolves the rule once and uses that same ID for inspection, deletion, and verification.

Personal identity format v3 drops the obsolete `profile_schema_id` / `profile_schema_version` fields on read and subsequent writes while retaining user identity, consent, binding and pause state. Existing cloud schemas and profile data are not deleted. Initialization only performs a read-only connection check and no longer depends on a profile schema.

When `remember` successfully submits in a turn, automatic curation skips that entire turn to avoid writing the same facts twice. Later turns are unaffected; failed submissions do not suppress curation.
