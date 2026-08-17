---
name: bailian-kb-management
description: >-
  管理阿里云百炼知识库（建库、上传文档、部署检索服务、Chunk 运维、数据中心文件管理），命令行工具为 kscli。
  当用户要创建/更新/删除知识库、上传或导入文档（本地/OSS）、创建/部署/调参检索或问答服务、
  增删改查 Chunk、管理数据中心类目/文件/集合时使用本 skill。
  检索与问答不走本 skill——用原生工具 kb_search（取证据）/ kb_chat（成品问答）；
  kscli search / chat 仅用于部署后的验证调试（如 --agent-version beta 调试草稿版）。
  普通问答、编程、写作、翻译、泛搜索不触发本 skill。
---

# 百炼知识库管理（kscli）

检索面与管理面的分工：**查知识用 `kb_search`（取证据）/ `kb_chat`（成品问答）原生工具；本 skill 只覆盖管理长尾**——知识库全生命周期、文档、检索服务、Chunk、数据中心。

## 前置检查

1. 安装校验：运行 `kscli kb list --help`。若报 `Unknown command` 或 kscli 未安装，执行
   `npm install -g knowledge-studio-cli@knowledge`（需 Node.js ≥ 18.17）。
   **管理命令（kb/doc/service/chunk/category/file/collection）只在 `knowledge` 发行通道；
   `latest` 通道只有 search/chat/config，装错通道会导致所有管理命令不可用。**
   安装失败时把错误原样报告给用户，不要静默跳过。
2. 鉴权：需要 `DASHSCOPE_API_KEY`（环境变量，或 `kscli config set --key api_key --value sk-xxx`）。
3. workspace 解析优先级：`--workspace-id` 参数 > 环境变量 `BAILIAN_WORKSPACE_ID` > `kscli config set --key workspace_id --value ws-xxx`。

## 何时用哪个命令

| 用户意图 | 命令 | 备注 |
| --- | --- | --- |
| 查知识 / 问答（日常检索） | 原生工具 `kb_search` / `kb_chat` | 不走 kscli |
| 建库 / 查看 / 改名 / 删库 / 监控 | `kscli kb create/list/info/update/delete/stats` | [reference/kb.md](reference/kb.md) |
| 上传本地文档、看解析状态、删文档、打标签 | `kscli doc upload/list/status/delete/tag` | [reference/doc.md](reference/doc.md) |
| 从 OSS 批量导入 | `kscli doc import-oss` | Bucket 需预先授权服务角色 |
| 创建 / 部署 / 调参检索（问答）服务 | `kscli service create/update/deploy/…` | [reference/service.md](reference/service.md) |
| 修正错误切片、屏蔽某段内容 | `kscli chunk add/list/update/delete` | [reference/chunk.md](reference/chunk.md) |
| 数据中心类目 / 文件 / 集合管理 | `kscli category/file/collection …` | [reference/datacenter.md](reference/datacenter.md) |
| CLI 配置、升级 | `kscli config show/set`、`kscli update` | [reference/config.md](reference/config.md) |
| 部署后验证、调试草稿版服务 | `kscli search/chat --agent-version beta` | [reference/query.md](reference/query.md) |

## 核心工作流：建库到可检索

```bash
kscli doc upload --file ./docs/ --workspace-id ws-xxx                # 1. 上传本地文件/目录 → 得 fileId
kscli kb create --name my-kb --doc-id <fileId> --wait                # 2. 建库并导入 → 得 index-id (pipelineId)
kscli service create --name my-search --scene search --index-id <index-id>   # 3. 建检索服务 → 得 agent-id（draft）
kscli service deploy --agent-id <agent-id> --yes                     # 4. 发布服务（此后可被默认版本调用）
kscli service list --scene search --status deployed                  # 5. 确认服务可见
```

部署完成后用原生工具 `kb_search` 带该 `agent_id` 验证检索；若要在部署前调试草稿配置，用 `kscli search --agent-id <id> --agent-version beta`。

已有文件再入库的简写：`kscli doc upload --file ./a.md --index-id <index-id> --wait`（上传+导入一步完成）。

## ID 速查（极易混淆）

| ID | 来源 | 用在哪 |
| --- | --- | --- |
| `index-id` | `kb create` 返回的 pipelineId / `kb list` | 所有 kb/doc/chunk 命令的 `--index-id` |
| `fileId` | `doc upload` / `doc import-oss` 返回 | 数据中心命令（`file get/delete`、`kb create --doc-id`、`doc tag`） |
| `doc_id`（库内文档 ID） | `doc list` 输出 | `doc delete`、`chunk add/update` 的 `--doc-id`；**可能带 workspace 后缀，≠ fileId** |
| `job-id` | 导入命令返回的 ingestionId | `doc status`（必须同时给 `--index-id` 和 `--job-id`） |
| chunk id | `chunk list` 输出的 `metadata._id` | `chunk update/delete` 的 `--chunk-id` |
| `agent-id` | `service create/list` | `service *`、`kb_search`/`kb_chat`、`kscli search/chat` |

## 命令参考（权威）

命令的完整 Usage / Flags / Notes / Examples 在 [`reference/`](reference/index.md)：

- [reference/index.md](reference/index.md) — 全命令速查表、全局 flag、鉴权说明
- reference/&lt;group&gt;.md — 按命令组分文件（kb / doc / service / chunk / datacenter / config / query）

执行不熟悉的命令前，先读对应 reference 或跑 `kscli <命令> --help`。**不要猜 flag。**
全部命令支持 `--output json`（结构化输出）、`--dry-run`（预览请求）、`--quiet`、`--verbose`。

## 危险与不可逆操作

执行以下操作前须向用户确认，脚本化时才用 `--yes` 跳过交互确认：

- `kb delete`：不可逆，库和全部索引内容永久删除（数据中心源文件保留）。
- `file delete`：不可逆，且引用该文件的知识库文档索引会失效；只想从单个库移除用 `doc delete`。
- `chunk delete`：不可逆。
- `service deploy`：发布影响线上调用方；`service delete` 后 agent_id 不可再用（软删、幂等）。
- `collection create`：**没有删除 API**，创建集合要慎重。
- 索引配置（embedding 模型、chunk size 等）建库后不可改，只能重建。

## 最佳实践

- 用户反复使用同一检索服务时，建议其把 agent_id 写入项目指令（如 AGENTS.md）或让 agent 记住，后续 kb_search / kb_chat 直接携带。
- 服务有 draft/deployed 两种状态：只有 deployed 可被默认版本调用；draft 调试用 `--agent-version beta`。改已发布版本的配置：先改 beta 草稿（`service update`），验证后 `service deploy` 发新版本。
- 导入类命令（`kb create`、`doc upload --index-id`、`doc status`）优先带 `--wait` 轮询到终态，避免手工轮询；文档解析失败（如 PARSE_FAILED）会以非零退出码透传错误。
- `chunk add` 有 10 QPS 限流，批量脚本注意节流；响应不带 chunk id，需要 `chunk list` 反查。
- `service list` 必须带 `--scene chat|search`，两个场景要分别查询。
