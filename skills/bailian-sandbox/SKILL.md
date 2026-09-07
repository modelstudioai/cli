---
name: bailian-sandbox
metadata:
  version: "1.20.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼 Sandbox 沙箱实例与模版生命周期管理入口：用户要创建、查询、连接、暂停、恢复或释放百炼沙箱，
  或创建、更新、查询、删除沙箱模版、查看模版构建状态时，使用 `bl sandbox`。
  仅覆盖百炼 Sandbox 管控面；不用于宿主执行沙箱设置、E2B 官方云资源或沙箱内命令执行与文件传输。
  agents.yaml 托管 Agent / Session / Environment 管理交给 bailian-managed-agent。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian Sandbox (`bl sandbox`)

Before running `bl`, read the shared [bailian-protocol](../bailian-protocol/SKILL.md) for consent, high-risk confirmation, version checks, authentication, and error handling. If it is missing, stop execution and prompt the user to install the full family with `bl skill init`.

## Scope and setup

- Manage Sandbox instances and templates through Bailian's E2B-compatible REST control plane. No E2B SDK or E2B API key is required; authentication uses the Bailian API Key as an Authorization Bearer token.
- Resolve the workspace from `--workspace-id`, then `BAILIAN_WORKSPACE_ID`, then configured `workspace_id`. The current CLI targets `cn-beijing` and requires prior Sandbox SLR authorization.
- The current endpoint is `https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox`. Login and command-level `--base-url` do not override the Sandbox endpoint; the saved API Key is reused.
- No `agents.yaml` or local IaC state is required. `connect` returns instance connection information; it does not open an interactive shell. Do not invent commands for executing code or transferring files inside the sandbox.

## Choose the operation

| User intent                           | Command family                                           |
| ------------------------------------- | -------------------------------------------------------- |
| Inspect or create instances           | `bl sandbox list` / `get` / `create`                     |
| Connect, pause, or resume an instance | `bl sandbox connect` / `pause` / `resume`                |
| Release an instance                   | `bl sandbox delete`                                      |
| Inspect or build templates            | `bl sandbox template list` / `get` / `create` / `update` |
| Check a submitted template build      | `bl sandbox template build-status`                       |
| Delete a template                     | `bl sandbox template delete`                             |

Read [reference/index.md](reference/index.md) and the relevant section of [reference/sandbox.md](reference/sandbox.md) for exact flags, usage, and examples, or run the matching command with `--help`. Do not guess flags.

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
