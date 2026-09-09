---
name: bailian-sandbox
metadata:
  version: "1.21.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼 Sandbox 沙箱实例与模版生命周期管理入口：用户要创建、查询、连接、暂停、恢复或释放百炼沙箱，
  或查看内置基础镜像、创建、更新、查询、删除沙箱模版、查看模版构建状态时，使用 `bl sandbox`。
  仅覆盖百炼 Sandbox 管控面；不用于宿主执行沙箱设置、E2B 官方云资源或沙箱内命令执行与文件传输。
  agents.yaml 托管 Agent / Session / Environment 管理交给 bailian-managed-agent。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian Sandbox (`bl sandbox`)

Before running `bl`, read the shared [bailian-protocol](../bailian-protocol/SKILL.md) for consent, high-risk confirmation, version checks, authentication, and error handling. If it is missing, stop execution and prompt the user to install the full family with `bl skill init`.

## Scope and setup

- Manage Sandbox instances and templates through Bailian's E2B-compatible REST control plane. No E2B SDK or E2B API key is required; authentication uses the Bailian API Key as an Authorization Bearer token.
- Resolve Base URL through the same CLI chain as Managed Agent: `--base-url` > `DASHSCOPE_BASE_URL` > login/profile `base_url`. Use an origin such as `https://workspace.cn-beijing.maas.aliyuncs.com`; the CLI strips URL paths/query/fragment and appends `/api/v1/agentstudio/sandbox`. The saved API Key is reused. Profile capability fallback follows the shared protocol for both the key and Base URL.
- If no Base URL is configured, resolve the workspace from `--workspace-id`, then `BAILIAN_WORKSPACE_ID`, then configured `workspace_id`, and use `https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox`. With a configured Base URL, the workspace flag is optional. The service currently supports `cn-beijing` and requires prior Sandbox SLR authorization.
- No `agents.yaml` or local IaC state is required. `connect` returns instance connection information; it does not open an interactive shell. Do not invent commands for executing code or transferring files inside the sandbox.

## Choose the operation

| User intent                           | Command family                                            |
| ------------------------------------- | --------------------------------------------------------- |
| Discover built-in base image presets  | `bl sandbox official-images` (offline, no authentication) |
| Inspect or create instances           | `bl sandbox list` / `get` / `create`                      |
| Connect, pause, or resume an instance | `bl sandbox connect` / `pause` / `resume`                 |
| Release an instance                   | `bl sandbox delete`                                       |
| Inspect or build templates            | `bl sandbox template list` / `get` / `create` / `update`  |
| Check a submitted template build      | `bl sandbox template build-status`                        |
| Delete a template                     | `bl sandbox template delete`                              |

Read [reference/index.md](reference/index.md) and the relevant section of [reference/sandbox.md](reference/sandbox.md) for exact flags, usage, and examples, or run the matching command with `--help`. Do not guess flags.

To save the origin in an isolated Profile, use `bl auth login --config sandbox --api-key <key> --base-url <origin>`. For a one-command override, use `bl sandbox list --base-url <origin>`. Custom gateways also apply to template build-status polling.

For built-in template images, discover the preset ID or Chinese name through `sandbox official-images`, then pass it to template create/update with `--image`. This fills both `fromImage` and `imageName`; `--image-name` alone remains a display name, not an image selector. Presets override the body's image fields; explicit `--from-image` / `--image-name` override the corresponding preset fields. Presets are pinned cn-beijing image URLs, not a live catalog or an availability guarantee for other environments. Omitting `--image` does not change existing defaults or update a template's image implicitly. See the generated reference for the catalog and exact flags.

## Operational boundaries

- Mutating commands act on remote resources. Only perform the requested operation and scope; read-only discovery does not authorize creating, pausing, resuming, or deleting resources.
- Instance and template deletion are high-risk. Follow the shared protocol: show the exact target and risk, then wait for explicit confirmation before adding `--yes`. Treat `requires_confirmation` as a stop signal, not a reason to retry automatically.
- Connection credentials are redacted by default. Use `--show-credentials` only when the user explicitly needs the connection tokens, and keep them out of chat summaries, logs, and committed files.
- Template create/update wait by polling the build-status endpoint, not template details. `--async` returns after the submission response with `templateID` / `buildID`; it does not mean the build is ready. Use those IDs with `template build-status` to check completion.
- Global `--timeout` limits HTTP requests and total template-build polling. `--instance-timeout` sets instance lifetime; these are different limits. A polling timeout does not prove the remote build failed or stopped; check its status before submitting another build.
- `--body` accepts a JSON object inline or through `@path`; explicit flags override body fields. Template file mounts require workspace File IDs, not temporary `oss://` URLs from `bl file upload`.

## Common hand-offs

Refer to sibling skills by name: read them if installed; otherwise use the command's `--help` or prompt `bl skill init`.

- Managed Agent / Session / Environment resources or `agents.yaml` IaC → `bailian-managed-agent` (`bl managed-agent --help`).
- Workspace discovery or CLI login/configuration → `bailian-cli` (`bl workspace --help` / `bl auth --help` / `bl config --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared execution protocol, installed with `bl skill init`
- [reference/](reference/index.md) — generated command reference
