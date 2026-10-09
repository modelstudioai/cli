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

Configure the plugin from its dsh settings page. The API key belongs only to this plugin in dsh credentials (`BAILIAN_KB_API_KEY`, normally `~/.dsh/.credentials.yaml`; the host owns the actual path). All business settings belong exclusively to this plugin's dsh configuration:

| Field                    | Meaning                                   | Default          |
| ------------------------ | ----------------------------------------- | ---------------- |
| `workspaceId`            | Workspace for all knowledge calls         | Required         |
| `defaultRetrieveAgentId` | Default retrieval service                 | Unset            |
| `defaultChatAgentId`     | Default Q&A service                       | Unset            |
| `agentVersion`           | Draft `beta` or published service version | Latest published |
| `chatTimeoutMs`          | Chat timeout in milliseconds              | 300000           |

The endpoint is fixed to `cn-beijing.maas.aliyuncs.com`. There is no endpoint setting. Settings page edits apply to the next call.

At startup, a missing API key may be imported from the active profile in `~/.bailian/config.json`. On the first configuration migration, missing workspace/default-service fields are imported from legacy dsh credentials, with the bl profile as the workspace default. Explicit dsh settings win. The internal `configInitialized` marker prevents cleared settings from being imported again. A missing API key can still be seeded on subsequent startups.

After initialization, business fields are read only from dsh plugin settings, never from bl or legacy credential fields. Clearing Workspace makes calls fail until it is configured again. Console login saves the key in dsh credentials and Workspace in dsh settings. KB does not create a `personal-kb/config.json` file.

The connection panel also accepts a new API key in a password field. Leave it blank to retain the current key, then use **Verify and save** to validate the key/Workspace pair before saving. Failed validation changes neither value; a settings-write failure attempts to restore the previous pair. The key is never read back and the input is cleared after success. Each plugin keeps its own API key and Workspace; editing one plugin does not affect the other. A key supplied by the launch environment must be changed there.

Management uses `kb_manage` with arguments after `bl knowledge`, for example `{"args":["service","list","--scene","search"]}`. The host executes the installed `bl` executable with a temporary isolated config directory and the same current key/Workspace as the native tools. Connection override flags are rejected. Secrets are passed through the child environment, never tool arguments. Direct shell invocation of bl remains independent and is not the plugin management path.

## Tools

| Tool        | Parameters                                                                                                       | Returns                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `kb_search` | `query`, `agent_id` (required), `top_k?` (default 5, applied client-side), `images?` (image URLs for multimodal) | Scored chunks with source references, plus a total |
| `kb_chat`   | `message`, `agent_id` (required)                                                                                 | The complete answer plus a `request_id`            |
| `kb_manage` | `args`                                                                                                           | Knowledge management using dsh configuration       |

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

The former shared `DASHSCOPE_API_KEY` is no longer read, modified, or deleted. If the plugin-specific key is absent and bl has no default to import, save a key on each plugin’s page.
