# `kscli service` — 检索 / 问答服务（agent）

> 通用鉴权/全局 flag 见 [index.md](index.md)。以下 Flags 只列命令专属项。
> 服务状态机：create → draft（beta 草稿，用 `--agent-version beta` 调试）→ deploy → deployed（版本号自增，可被默认版本调用）。

## `kscli service list`

列出检索/问答服务。

```
Usage: kscli service list --scene <chat|search> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--scene <scene>` | 服务场景：chat（问答）或 search（检索）。**服务端必填** |
| `--status <status>` | 按状态过滤：draft、deployed（含 edited）或 deleted |
| `--name <text>` | 按名称过滤（模糊匹配） |
| `--agent-id <id>` | 按 agent ID 精确过滤 |
| `--index-id <id>` | 按关联知识库 ID 精确过滤 |
| `--page-number <n>` / `--page-size <n>` | 分页 |

Notes：

- 场景必填——要看全两类服务需分别执行两次。
- 返回的 agent_id 用于 search/chat 调用及 service 管理命令。

```bash
kscli service list --scene chat --workspace-id ws-xxx
kscli service list --scene search --status deployed
```

## `kscli service get`

查看服务各版本配置。

```
Usage: kscli service get --agent-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--agent-version <version>` | 只看指定版本（beta 或已发布版本号）；缺省返回全部版本 |

```bash
kscli service get --agent-id aid-xxx --workspace-id ws-xxx
kscli service get --agent-id aid-xxx --agent-version beta
```

## `kscli service create`

创建检索/问答服务（初始 status: draft，version: beta）。

```
Usage: kscli service create --name <text> --scene <chat|search> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 服务名（≤200 字符，同场景内唯一） |
| `--scene <scene>` | chat（问答）或 search（检索） |
| `--description <text>` | 描述（≤1000 字符） |
| `--index-id <id>` | 绑定知识库；其余配置用服务端默认值 |

Notes：

- 草稿（beta）版可在 deploy 前用 search/chat 的 `--agent-version beta` 测试。
- 需要 workspace 的知识库创建权限。

```bash
kscli service create --name my-qa --scene chat --workspace-id ws-xxx
kscli service create --name my-search --scene search --index-id idx-xxx
```

## `kscli service update`

更新名称、描述或草稿配置。

```
Usage: kscli service update --agent-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` / `--description <text>` | 新名称 / 描述 |
| `--agent-version <version>` | 目标版本（默认 beta 草稿）。已发布版本只接受 `--version-desc` |
| `--version-desc <text>` | 版本描述 |
| `--policy <policy>` | Agent 策略：turbo（快）或 agentic（多轮） |
| `--model <name>` | 生成模型 code（须在平台白名单内） |
| `--temperature <n>` | 采样温度，0-2 |
| `--max-llm-calls <n>` | 单请求最大 LLM 调用次数，1-30 |
| `--enable-session-file/-refusal/-anti-leak/-rich-text/-citation <bool>` | 功能开关（true/false） |
| `--config-file <path>` | JSON 文件整体替换 agent_config（含 kb_search_configs 等嵌套配置）；与标量配置 flag 互斥 |

Notes：

- 配置变更只作用于 beta 草稿；已发布版本只能改 `--version-desc`。
- 要改已发布版本的配置：先改 beta 草稿 → `--agent-version beta` 验证 → `service deploy` 发新版本。
- 标量 flag 合并进当前草稿配置（读-合-写）；`--config-file` 整体替换，二者互斥。
- 需要 workspace 的知识库修改权限。

```bash
kscli service update --agent-id aid-xxx --temperature 0.7 --workspace-id ws-xxx
kscli service update --agent-id aid-xxx --config-file ./agent-config.json
kscli service update --agent-id aid-xxx --agent-version 1 --version-desc 'first stable release'
```

## `kscli service deploy`

把 beta 草稿发布为新版本。**发布影响线上调用方，执行前须向用户确认。**

```
Usage: kscli service deploy --agent-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--version-desc <text>` | 新版本描述 |
| `--yes` | 跳过交互确认 |

Notes：

- 版本号自增；状态变为 deployed。需要 workspace 的知识库修改权限。

```bash
kscli service deploy --agent-id aid-xxx --version-desc 'tuned rerank params' --yes
```

## `kscli service delete`

删除服务（软删、幂等）。**删除后 agent_id 不可再用于 search/chat，执行前须向用户确认。**

```
Usage: kscli service delete --agent-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--yes` | 跳过交互确认 |

```bash
kscli service delete --agent-id aid-xxx --yes
```

## `kscli service copy`

复制服务为新草稿（名称加 copy\_ 前缀）。

```
Usage: kscli service copy --agent-id <id> [flags]
```

Notes：

- 副本以 beta 草稿开始；用 `--agent-version beta` 测试后 deploy 发布。需要知识库创建权限。

```bash
kscli service copy --agent-id aid-xxx --workspace-id ws-xxx
```
