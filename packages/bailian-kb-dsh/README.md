<div align="center">

# Bailian Knowledge Base for DeepSeek Harness

**Knowledge-base retrieval tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), backed by Aliyun Model Studio (Bailian).**

[![npm version](https://img.shields.io/npm/v/bailian-kb-dsh?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-kb-dsh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[Bailian Console](https://bailian.console.aliyun.com/) · [中文文档](README.zh.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [API Documentation](https://help.aliyun.com/zh/model-studio/)

</div>

## What is this?

`bailian-kb-dsh` is a plugin (and dsh bundle) that gives a DeepSeek Harness agent access to knowledge bases hosted on [Aliyun Model Studio](https://bailian.console.aliyun.com/) (Bailian). It registers two model-facing tools — `kb_search` for raw evidence and `kb_chat` for grounded answers — and ships a settings page plus a management skill for the [`bl` CLI](https://www.npmjs.com/package/bailian-cli).

Retrieval happens through **retrieval services** you deploy on Bailian: a service binds one or more knowledge bases to an embedding/rerank configuration and is addressed by its `agent_id`. The plugin keeps the list of deployed services in front of the model, so it can decide whether the question is answerable from your knowledge at all.

## Features

- **Two model-facing tools** — `kb_search` returns scored chunks with source references; `kb_chat` returns a complete grounded answer
- **Service awareness** — the workspace's deployed retrieval services are injected into the conversation, so the model knows what it can look up instead of guessing service ids
- **Low-friction setup** — sign in to the Bailian console from the settings page to fill in the API key and workspace id; an existing `bl` CLI login is adopted automatically
- **Settings page** — a "Bailian KB" section in the web UI for credentials, default services, and service-cache inspection
- **Management skill** — bundled `bailian-kb` skill teaching the agent the `bl` CLI workflow for creating knowledge bases, ingesting documents, and deploying services

## Requirements

- DeepSeek Harness with its plugin runtime (`@deepseek-ai/dsh-*`), Node.js >= 22.12
- An Aliyun Model Studio account: a **workspace id** and a **DashScope API key** ([get one](https://bailian.console.aliyun.com/?tab=app#/api-key))
- At least one **deployed** retrieval or Q&A service in that workspace — create one in the [console](https://bailian.console.aliyun.com/) or with `bl knowledge service create` / `bl knowledge service deploy`
- The [`bl` CLI](https://www.npmjs.com/package/bailian-cli) (`npm install -g bailian-cli`) for anything on the management side — creating knowledge bases, ingesting documents, deploying services. Retrieval itself calls the API directly and never shells out, so `kb_search` / `kb_chat` work without it

## Installation

```sh
dsh plugin --profile web add bailian-kb-dsh
```

The CLI adds the bundle to the profile's layer stack; no manual YAML editing required. To remove it:

```sh
dsh plugin --profile web remove bailian-kb-dsh
```

Verify the plugin is composed — `dsh --profile web --dump-config` should list a `tool-bailian-kb` row.

## Configuration

### Option 1 — Settings page (recommended)

After installation, **Settings → Bailian KB** appears in the web UI:

- **Fetch from console login** — opens the Bailian console in a browser on the host machine; when you finish signing in, the API key and workspace id of that account are stored on the host (the key never travels to the browser). Each login requests a freshly issued key, so switching accounts is one click.
- **API key** — write-only: the stored value is never echoed back, only reported as configured or not.
- **Workspace id / default retrieval service / default Q&A service** — editable with echo; the service ids can be picked from the cached service list. Clearing a value falls back to the layers below.
- **Retrieval service cache** — shows when the injected service list was last fetched, how many services it holds, and offers a manual refresh for a service you just created.

If you have already run `bl auth login`, the API key and workspace id are adopted once from `~/.bailian/config.json` at startup. A value you deliberately clear is never re-filled.

### Option 2 — Environment and credential files

```sh
# ~/.dsh/.env, or the credential store at ~/.dsh/.credentials.yaml
DASHSCOPE_API_KEY=sk-xxx                    # required
BAILIAN_WORKSPACE_ID=ws-xxx                 # required
BAILIAN_DEFAULT_RETRIEVE_AGENT_ID=aid-xxx   # optional
BAILIAN_DEFAULT_CHAT_AGENT_ID=aid-xxx       # optional
```

### Option 3 — Profile patch

The bundle inserts its own entry into the profile; you can override it by id in `~/.dsh/cordis.patch.yml` or the profile's patch file. An override **replaces the whole config object** (no deep merge):

```yaml
- id: tool-bailian-kb
  config:
    defaultRetrieveAgentId: aid-search-service
    defaultChatAgentId: aid-chat-service
    chatTimeoutMs: 600000
```

Disable the plugin with `- id: tool-bailian-kb` plus `disabled: true`.

### Config fields

The config doubles as the `bailian-kb` settings section, so edits in the settings page or settings document apply to the next call without a restart.

| Field                    | Type    | Default                        | Meaning                                                                                                          |
| ------------------------ | ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `workspaceId`            | string? | —                              | Bailian workspace id; the API host is the workspace subdomain `https://<workspaceId>.<endpointHost>`             |
| `endpointHost`           | string  | `cn-beijing.maas.aliyuncs.com` | Host suffix; replace for another region or a private deployment                                                  |
| `defaultRetrieveAgentId` | string? | —                              | Service `kb_search` falls back to when the caller omits `agent_id`                                               |
| `defaultChatAgentId`     | string? | —                              | Service `kb_chat` falls back to when the caller omits `agent_id`                                                 |
| `agentVersion`           | string? | —                              | `beta` (draft) or a published version number; defaults to the latest published version. Not exposed to the model |
| `chatTimeoutMs`          | number  | `300000`                       | `kb_chat` timeout — the server side is a minutes-scale agentic loop                                              |

### Resolution order

| Value                     | Settings layer (settings page) | Entry config (profile patch) | Credential store / env              |
| ------------------------- | ------------------------------ | ---------------------------- | ----------------------------------- |
| `DASHSCOPE_API_KEY`       | write-only control             | —                            | `DASHSCOPE_API_KEY`                 |
| workspace id              | ✅ `workspaceId`               | ✅ `workspaceId`             | `BAILIAN_WORKSPACE_ID`              |
| default retrieval service | ✅ `defaultRetrieveAgentId`    | ✅ `defaultRetrieveAgentId`  | `BAILIAN_DEFAULT_RETRIEVE_AGENT_ID` |
| default Q&A service       | ✅ `defaultChatAgentId`        | ✅ `defaultChatAgentId`      | `BAILIAN_DEFAULT_CHAT_AGENT_ID`     |

Every value is re-read per call, so a rotated key or a switched workspace takes effect immediately. The API key and workspace id are mandatory: without them the tools fail with a message pointing at these configuration paths. Default services are optional — when the workspace has exactly one deployed service for a scene, that one is used.

## Tools

| Tool        | Parameters                                                                                                       | Returns                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `kb_search` | `query`, `agent_id` (required), `top_k?` (default 5, applied client-side), `images?` (image URLs for multimodal) | Scored chunks with source references, plus a total |
| `kb_chat`   | `message`, `agent_id` (required)                                                                                 | The complete answer plus a `request_id`            |

`agent_id` is required in both schemas: the schema cannot tell the model whether this deployment pins a default, and discovering a missing default at call time wastes a round-trip. The configured default is still honoured for programmatic calls that omit it.

The list of deployed services — id, name, and scene — is injected into the conversation as a context message, refreshed periodically and whenever a `bl knowledge service` command changes the inventory. Long lists are truncated with the total stated, so the model never mistakes a partial list for the full inventory.

## Errors

- **HTTP 4xx** — most often an `agent_id` that no longer exists, so the service list is refreshed and appended to the error message for immediate recovery
- **HTTP 5xx** — passed through unchanged
- **Missing credentials** — the message names the configuration paths (`~/.dsh/.env`, `~/.dsh/.credentials.yaml`, the settings page) and links to the console key page
- **`kb_chat` timeout** — the message explains the server-side multi-turn retrieval and suggests retrying or switching to `kb_search`

## Known limitations

- `kb_chat` buffers the server stream, so there is no progress output while it runs.
- `top_k` is a client-side cut: the request body carries no such parameter, and how many chunks the server returns is decided by the service configuration.
- **Service names carry the routing signal.** The service list API does not return a description field yet, so the model judges what a service covers from its name alone. Name your services after their content (`Product docs retrieval`, not `Service 1`).
- At most two pages per scene are fetched; beyond that the injected list is marked as truncated.

## Development

```sh
pnpm --filter bailian-kb-dsh run build       # tsc → dist/ (node half) + tsdown → dist/web/client.js (browser half)
pnpm --filter bailian-kb-dsh run typecheck   # node and web tsconfigs
pnpm --filter bailian-kb-dsh run test
```

For local integration, add the working copy to a dev profile (the patch file is watched by HMR):

```sh
dsh plugin --profile dev add <this-repo>/packages/bailian-kb-dsh
```

Internal design notes — context injection strategy, service cache layout, refresh triggers — live in [docs/kb-dsh/runtime-behavior.md](https://github.com/modelstudioai/cli/blob/main/docs/kb-dsh/runtime-behavior.md); the maintenance checklist is [docs/agents/dsh-plugin.md](https://github.com/modelstudioai/cli/blob/main/docs/agents/dsh-plugin.md).

## Contributing

Bug reports, feature requests, and PRs are welcome. See [CONTRIBUTING.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.md) for developer setup and the contribution workflow.

## License

[Apache 2.0](LICENSE)
