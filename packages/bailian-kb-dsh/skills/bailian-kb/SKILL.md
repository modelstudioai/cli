---
name: bailian-kb
description: >-
  管理阿里云百炼知识库（建库、上传文档、部署检索服务、Chunk 运维、数据中心文件管理），命令行工具为 bl（bailian-cli）。
  当用户要创建/更新/删除知识库、上传或导入文档（本地/OSS）、创建/部署/调参检索或问答服务、
  增删改查 Chunk、管理数据中心类目/文件/集合时使用本 skill。
  检索与问答不走本 skill——用原生工具 kb_search（取证据）/ kb_chat（成品问答）；
  bl knowledge search / chat 仅用于部署后的验证调试（如 --agent-version beta 调试草稿版）。
  kb_search / kb_chat 的凭据与工作空间由插件自动解析（~/.dsh/settings.yaml 的 bailian-kb 段、
  ~/.dsh/.credentials.yaml 的 DASHSCOPE_API_KEY），不要自己去读或传。
  普通问答、编程、写作、翻译、泛搜索不触发本 skill。
---

# 百炼知识库管理（bl）

检索面与管理面的分工：**查知识用 `kb_search`（取证据）/ `kb_chat`（成品问答）原生工具；本 skill 只覆盖管理长尾**——知识库全生命周期、文档、检索服务、Chunk、数据中心。

本 skill **不负责**判断何时该检索。可用检索服务的清单（含 agent_id）由插件自动注入到会话上下文里，`kb_search` / `kb_chat` 直接取用；不需要为了检索先加载本 skill。

## 检索服务清单的行为语义

- 清单由插件从百炼 API 拉取后缓存，按会话周期性刷新（约 30 分钟），只含 **deployed** 状态的服务；
- **刚用 `bl` 新建或部署的服务不会立刻出现在清单里**。不用等刷新——命令输出里刚拿到的 `agent_id` 直接可用；
- 服务很多时清单只列最近修改的若干条并标明总数。要找特定服务用 `bl knowledge service list --scene search --name <关键词>`；
- 清单里确实没有能回答用户问题的服务时，如实告知用户，**不要挑一个最像的 agent_id 去试**。

## 前置检查

1. 安装校验：运行 `bl knowledge list --help`。若报 `Unknown command` 或 bl 未安装，执行
   `npm install -g bailian-cli`（需 Node.js ≥ 18.17）；已安装但命令缺失时先 `bl update` 升级。
   安装失败时把错误原样报告给用户，不要静默跳过。
2. 鉴权：需要 `DASHSCOPE_API_KEY`（环境变量，或 `bl auth login --api-key sk-xxx`，或 `bl config set --key api_key --value sk-xxx`）。
3. workspace 解析优先级：`--workspace-id` 参数 > 环境变量 `BAILIAN_WORKSPACE_ID` > `bl config set --key workspace_id --value ws-xxx`。

## 何时用哪个命令

| 用户意图                                 | 命令                                                | 备注                             |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------- |
| 查知识 / 问答（日常检索）                | 原生工具 `kb_search` / `kb_chat`                    | 不走 bl                          |
| 建库 / 查看 / 改名 / 删库 / 监控         | `bl knowledge create/list/info/update/delete/stats` | `bl knowledge create --help`     |
| 上传本地文档、看解析状态、删文档、打标签 | `bl knowledge doc upload/list/status/delete/tag`    | `bl knowledge doc upload --help` |
| 从 OSS 批量导入                          | `bl knowledge doc import-oss`                       | Bucket 需预先授权服务角色        |
| 创建 / 部署 / 调参检索（问答）服务       | `bl knowledge service create/update/deploy/…`       | `bl knowledge service --help`    |
| 修正错误切片、屏蔽某段内容               | `bl knowledge chunk add/list/update/delete`         | `bl knowledge chunk --help`      |
| 数据中心类目 / 文件 / 集合管理           | `bl knowledge category/file/collection …`           | `bl knowledge category --help`   |
| CLI 配置、升级                           | `bl config show/set`、`bl update`                   | `bl config --help`               |
| 部署后验证、调试草稿版服务               | `bl knowledge search/chat --agent-version beta`     | `bl knowledge search --help`     |

## 核心工作流：建库到可检索

```bash
bl knowledge doc upload --file ./docs/ --workspace-id ws-xxx                # 1. 上传本地文件/目录 → 得 fileId
bl knowledge create --name my-kb --description '产品文档' --doc-id <fileId> --wait                # 2. 建库并导入 → 得 index-id (pipelineId)
bl knowledge service create --name my-search --scene search --index-id <index-id>   # 3. 建检索服务 → 得 agent-id（draft）
bl knowledge service deploy --agent-id <agent-id> --yes                     # 4. 发布服务（此后可被默认版本调用）
bl knowledge service list --scene search --status deployed                  # 5. 确认服务可见
```

部署完成后用原生工具 `kb_search` 带该 `agent_id` 验证检索；若要在部署前调试草稿配置，用 `bl knowledge search --agent-id <id> --agent-version beta`。

已有文件再入库的简写：`bl knowledge doc upload --file ./a.md --index-id <index-id> --wait`（上传+导入一步完成）。

## ID 速查（极易混淆）

| ID                      | 来源                                                    | 用在哪                                                                              |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `index-id`              | `knowledge create` 返回的 pipelineId / `knowledge list` | 所有 knowledge/doc/chunk 命令的 `--index-id`                                        |
| `fileId`                | `doc upload` / `doc import-oss` 返回                    | 数据中心命令（`file get/delete`、`knowledge create --doc-id`、`doc tag`）           |
| `doc_id`（库内文档 ID） | `doc list` 输出                                         | `doc delete`、`chunk add/update` 的 `--doc-id`；**可能带 workspace 后缀，≠ fileId** |
| `job-id`                | 导入命令返回的 ingestionId                              | `doc status`（必须同时给 `--index-id` 和 `--job-id`）                               |
| chunk id                | `chunk list` 输出的 `metadata._id`                      | `chunk update/delete` 的 `--chunk-id`                                               |
| `agent-id`              | `service create/list`                                   | `service *`、`kb_search`/`kb_chat`、`bl knowledge search/chat`                      |

## 命令参考

执行不熟悉的命令前，跑 `bl <命令> --help` 查看完整 Usage / Flags / Notes / Examples。**不要猜 flag。**
全部命令支持 `--output json`（结构化输出）、`--dry-run`（预览请求）、`--quiet`、`--verbose`。

## 危险与不可逆操作

执行以下操作前须向用户确认，脚本化时才用 `--yes` 跳过交互确认：

- `knowledge delete`：不可逆，库和全部索引内容永久删除（数据中心源文件保留）。
- `file delete`：不可逆，且引用该文件的知识库文档索引会失效；只想从单个库移除用 `doc delete`。
- `chunk delete`：不可逆。
- `service deploy`：发布影响线上调用方；`service delete` 后 agent_id 不可再用（软删、幂等）。
- `collection create`：**没有删除 API**，创建集合要慎重。
- 索引配置（embedding 模型、chunk size 等）建库后不可改，只能重建。

## 最佳实践

- **建服务时必须把名字写清楚**：`service create --name` 的名称是模型判断"这个服务能查什么"的主要依据（服务描述暂未随列表接口返回）。`检索服务1` 这类无语义的名字会让后续检索无法路由；写成 `产品文档检索`、`HR制度问答` 这种能看出覆盖内容的名字。同时填 `--description`（≤1000 字符），列表接口返回该字段后即可自动生效。
- 服务有 draft/deployed 两种状态：只有 deployed 可被默认版本调用，也只有 deployed 会进入模型看到的服务清单；draft 调试用 `--agent-version beta`。改已发布版本的配置：先改 beta 草稿（`service update`），验证后 `service deploy` 发新版本。
- 导入类命令（`knowledge create`、`doc upload --index-id`、`doc status`）优先带 `--wait` 轮询到终态，避免手工轮询；文档解析失败（如 PARSE_FAILED）会以非零退出码透传错误。
- `chunk add` 有 10 QPS 限流，批量脚本注意节流；响应不带 chunk id，需要 `chunk list` 反查。
- `service list` 必须带 `--scene chat|search`，两个场景要分别查询。
