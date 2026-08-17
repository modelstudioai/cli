# `kscli` 命令参考索引

> 由 `knowledge-studio-cli@knowledge`（0.0.0-beta-4086da5-202608141600）各命令 `--help` 输出整理。
> 命令详情在同目录 `<group>.md`；本索引只放速查表、全局 flag 与鉴权说明。
> 版本更新后以 `kscli <命令> --help` 为准。

## 速查表

| 命令 | 鉴权 | 说明 | 详情 |
| --- | --- | --- | --- |
| `kscli kb list` | API Key | 列出 workspace 内知识库 | [kb.md](kb.md) |
| `kscli kb info` | API Key | 查看知识库配置详情 | [kb.md](kb.md) |
| `kscli kb create` | API Key | 建库并导入数据中心文件或类目 | [kb.md](kb.md) |
| `kscli kb update` | API Key | 改名、描述或 rerank 阈值 | [kb.md](kb.md) |
| `kscli kb delete` | API Key | 删库（含全部文档与 chunk，不可逆） | [kb.md](kb.md) |
| `kscli kb stats` | API Key | 存储量与 QPS 监控数据 | [kb.md](kb.md) |
| `kscli doc list` | API Key | 列出库内文档及解析/索引状态 | [doc.md](doc.md) |
| `kscli doc status` | API Key | 查看导入任务状态 | [doc.md](doc.md) |
| `kscli doc upload` | API Key | 上传本地文件/目录，可选同时入库 | [doc.md](doc.md) |
| `kscli doc delete` | API Key | 从库中删除文档及其 chunk | [doc.md](doc.md) |
| `kscli doc tag` | API Key | 批量更新数据中心文件标签 | [doc.md](doc.md) |
| `kscli doc import-oss` | API Key | 从已授权 OSS bucket 批量导入 | [doc.md](doc.md) |
| `kscli service list` | API Key | 列出检索/问答服务 | [service.md](service.md) |
| `kscli service get` | API Key | 查看服务各版本配置 | [service.md](service.md) |
| `kscli service create` | API Key | 创建服务（初始为 draft/beta） | [service.md](service.md) |
| `kscli service update` | API Key | 更新名称、描述或草稿配置 | [service.md](service.md) |
| `kscli service deploy` | API Key | 把 beta 草稿发布为新版本 | [service.md](service.md) |
| `kscli service delete` | API Key | 删除服务（软删、幂等） | [service.md](service.md) |
| `kscli service copy` | API Key | 复制服务为新草稿（名称加 copy\_ 前缀） | [service.md](service.md) |
| `kscli chunk add` | API Key | 直接向库内添加 chunk | [chunk.md](chunk.md) |
| `kscli chunk list` | API Key | 列出 chunk 内容与状态 | [chunk.md](chunk.md) |
| `kscli chunk update` | API Key | 改 chunk 内容或切换检索可见性 | [chunk.md](chunk.md) |
| `kscli chunk delete` | API Key | 删除 chunk（不可逆） | [chunk.md](chunk.md) |
| `kscli category list` | API Key | 列出数据中心类目 | [datacenter.md](datacenter.md) |
| `kscli category add` | API Key | 创建数据中心类目 | [datacenter.md](datacenter.md) |
| `kscli category delete` | API Key | 删除数据中心类目 | [datacenter.md](datacenter.md) |
| `kscli file list` | API Key | 列出类目下的文件 | [datacenter.md](datacenter.md) |
| `kscli file get` | API Key | 查看文件详情（大小/MD5/标签/时间） | [datacenter.md](datacenter.md) |
| `kscli file delete` | API Key | 永久删除数据中心文件 | [datacenter.md](datacenter.md) |
| `kscli collection create` | API Key | 创建 FILE 数据集合（无删除 API） | [datacenter.md](datacenter.md) |
| `kscli collection get` | API Key | 查看数据集合详情 | [datacenter.md](datacenter.md) |
| `kscli config show` | 无需 | 显示当前配置 | [config.md](config.md) |
| `kscli config set` | 无需 | 设置配置项 | [config.md](config.md) |
| `kscli update` | 无需 | 升级 CLI | [config.md](config.md) |
| `kscli search` | API Key | RAG 语义检索（部署验证用；日常检索走原生工具 kb_search） | [query.md](query.md) |
| `kscli chat` | API Key | RAG 问答，SSE 流式（部署验证用；日常问答走原生工具 kb_chat） | [query.md](query.md) |
| `kscli retrieve` | API Key | 已废弃，改用 `search` | [query.md](query.md) |

## 全局 flag（所有命令可用）

| Flag | 说明 |
| --- | --- |
| `--output <format>` | 输出格式：text、json |
| `--timeout <seconds>` | 请求超时 |
| `--quiet` | 抑制非必要输出 |
| `--verbose` | 打印 HTTP 请求/响应详情 |
| `--dry-run` | 只预览请求不执行 |
| `--config <name>` | 本次命令使用指定配置 profile |
| `--help` / `--version` | 帮助 / 版本 |

## 鉴权 flag（API Key 类命令可用）

| Flag | 说明 |
| --- | --- |
| `--api-key <key>` | API key（优先于环境变量 `DASHSCOPE_API_KEY` 与 config） |
| `--base-url <url>` | API base URL |
| `--workspace-id <id>` | Workspace ID（或环境变量 `BAILIAN_WORKSPACE_ID`，或 config `workspace_id`） |

## 说明

- 所有管理命令使用 DashScope API Key（Bearer token）鉴权，无 console 登录态。
- 默认输出为 text；agent 解析结果时建议显式加 `--output json`。
- 分页有两种风格：kb/doc/service/chunk 用 `--page-number/--page-size`（page-size 上限 100）；category/file 用游标 `--next-token/--max-result`。
