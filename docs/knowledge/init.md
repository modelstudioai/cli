# 初始化知识库：init

`bl knowledge init` / `kscli init` 用于快速验证“上传样例 → 建库 → 建检索服务 → 实际召回”的完整链路。它上传 CLI 内置样例，不扫描或上传当前目录中的业务文件；接入自己的目录请使用 `doc sync`。

## 快速开始

准备具有目标 Workspace 访问权限的 API Key，通过已有 CLI 配置或 `--api-key` 提供。下面使用 npm 官方源的 `knowledge` 发行标签；标签对应版本可能更新，验收时记录实际版本。

先预览：

```bash
npx --yes --registry=https://registry.npmjs.org bailian-cli@knowledge knowledge init \
  --workspace-id <workspace-id> \
  --name cli-demo \
  --dry-run
```

确认计划和费用后执行：

```bash
npx --yes --registry=https://registry.npmjs.org bailian-cli@knowledge knowledge init \
  --workspace-id <workspace-id> \
  --name cli-demo \
  --yes
```

前面的 `npx --yes` 允许安装 npm 包，末尾的 `--yes` 确认初始化写入。使用 Knowledge Studio 时，入口为 `kscli init`；已安装完整 CLI 时使用 `bl knowledge init`。

## 实际执行哪些步骤

1. 读取恢复记录、查询已有资源，核对 Workspace、资源归属和服务绑定，生成计划。
2. 缺少样例文件时上传内置 Markdown 文件。
3. 缺少知识库时创建文档知识库并导入样例，等待索引就绪。
4. 创建或复用归属明确的检索服务，补全检索配置，使用 beta 草稿。
5. 实际执行样例查询，确认返回内容包含样例标记后报告成功。

不自动发布服务，也不创建问答服务。初始化成功表示样例检索链路可用，不代表用户自己的资料已经接入。

## 上传的样例文件

- 文件名：`bailian-cli-init-sample-v1.md`。
- 内容：中英文解释 RAG（检索增强生成），以及用于验证首次检索的说明。
- 固定标记：`BAILIAN_CLI_INIT_SAMPLE_V1`。
- 查询：`What is retrieval-augmented generation (RAG)? 什么是检索增强生成？`。
- 判断标准：返回节点的正文或 metadata.content 中包含固定标记。

样例内嵌在 CLI 中，执行时写入系统临时目录，上传阶段结束后清理本地临时文件；云端样例仍作为已创建资源保留。

## 参数

| 参数              | 用途与默认值                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `--workspace-id`  | 目标工作空间；可由已配置的工作空间提供，示例建议显式指定。                                                     |
| `--name`          | 知识库名称，1–20 个字符，默认 `cli-demo`。                                                                     |
| `--state-file`    | 显式指定恢复记录路径；默认用户主目录下的 `~/.bailian/knowledge/init/<key>.json`，按 Workspace 和名称自动隔离。 |
| `--poll-interval` | 轮询间隔，单位秒，默认 5，必须为正数。                                                                         |
| `--dry-run`       | 只读预检：需要凭证，会查询远端资源；不上传、不建库、不修改恢复记录，也不执行样例检索。                         |
| `--yes`           | 当计划需要新建知识库时必须提供；仅复用已核实资源的计划无需再次提供。                                           |
| `--output json`   | 返回结构化资源信息和实际检索结果。                                                                             |

完整公共参数以 `bl knowledge init --help` / `kscli init --help` 为准；`--introspect` 可读取结构化命令说明。

## 不同场景怎么处理

| 场景                         | 处理方式                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| 首次执行，只想看影响         | 使用 `--dry-run`，读取计划和计费提示。                                                  |
| 首次正式执行，未带 `--yes`   | 需要新建库时返回确认要求和退出码 7，不执行资源写入。                                    |
| 已完成初始化，再次执行       | 使用相同 Workspace、名称和恢复记录，核对并复用原资源，再验证样例检索。                  |
| 切换 Workspace 或名称        | 自动选择对应的恢复记录；在任意目录切回原目标时继续使用原记录，无需指定 `--state-file`。 |
| 上传、建库或建服务途中失败   | 保留恢复记录；重跑时核对已完成步骤与远端结果，能可靠确认才续接。                        |
| 请求超时，无法确认是否已创建 | 停止并提示核对，不盲目重复创建资源。                                                    |
| 同名资源归属不明、绑定冲突   | 拒绝擅自复用或覆盖；核对记录和资源，独立初始化可指定另一名称。                          |
| 想上传自己的资料             | 使用 `doc upload`、`doc import` 或 `doc sync`，init 不接受业务目录作为输入。            |

## 成功输出与清理

文本输出展示样例查询、命中文档名称（服务端提供时）和内容摘要。JSON 中包含 `indexId`、`agentId`、`fileId`、`agentVersion`、`sampleMatched`、`sampleSearch`、资源记录和状态文件路径；`sampleSearch.response` 是实际验证成功的检索响应。

知识库创建后持续按运行时长计费，退出终端或后续步骤失败不会停止计费。参考命令输出中的费用说明及清理动作，不需要的资源应明确删除。默认清理提示针对本次新建资源，复用资源不属于默认清理范围；删除操作另行确认。

请保留恢复记录以便核对。初始化默认使用 `~/.bailian/knowledge/init/<key>.json`，其中 key 为 `[workspaceId, name]` 的 JSON 表示的 SHA-256 摘要；目录同步默认使用 `<--dir>/.bailian/sync/<key>.json`，其中 key 仅由知识库 ID 生成。实际路径显示在预览和执行结果中；`--state-file` 可覆盖默认路径。

本地记录保存各步资源 ID、进度和结果未确认的请求。比如知识库已创建、但检索服务创建失败，重跑时会先核对已创建资源，再续接剩余步骤；请求结果不确定时也能避免盲目重复创建。它是恢复记录，不是额外的鉴权配置。当前测试阶段不读取或迁移旧的当前目录状态（`.bailian/knowledge/init.json` 或 `.bailian/knowledge/init/<key>.json`）。
