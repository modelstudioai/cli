# `kscli` 命令完整用法指南

> Knowledge Studio CLI（`kscli`）命令总览，覆盖全部 37 个命令：34 个知识库命令 + 3 个配置/维护命令。完整参数与示例请参阅各子域手册。

---

## 目录

1. [概述](#概述)
2. [核心概念与实体关系](#核心概念与实体关系)
3. [通用约定](#通用约定)
4. [典型工作流](#典型工作流)
5. [命令手册](#命令手册)
   - [知识库管理](#知识库管理) → [完整手册](kb.md)
   - [文档管理](#文档管理) → [完整手册](doc.md)
   - [检索服务管理](#检索服务管理) → [完整手册](service.md)
   - [Chunk 管理](#chunk-管理) → [完整手册](chunk.md)
   - [数据中心文件管理](#数据中心文件管理) → [完整手册](file.md)
   - [数据中心集合与分类](#数据中心集合与分类) → [完整手册](collection-category.md)
   - [检索与对话](#检索与对话) → [完整手册](search-chat.md)
   - [配置与维护](#配置与维护)
6. [常见错误与排查](#常见错误与排查)
7. [附录：命令速查表](#附录命令速查表)

---

## 概述

`kscli`（`knowledge-studio-cli`）是面向 RAG 开发者的知识库专用 CLI，把知识库能力铺平成一级命令组，覆盖 RAG（检索增强生成）全链路：

- **知识库全生命周期管理**：创建、查看、更新、删除、监控
- **文档管理**：上传本地文件或目录、从 OSS 批量导入、查看解析状态、删除、打标签
- **Chunk 级运维**：直接增删改查知识库中的内容切片
- **检索服务管理**：创建/部署/复制/删除 Q&A 和检索服务（agent），管理 draft 与发布版本
- **数据中心管理**：文件、集合（connector）、分类的增删查
- **检索与对话**：语义检索（search）、多轮对话（chat）、兼容旧检索（retrieve）
- **配置与维护**：查看/修改本地配置、自更新 CLI

共 37 个命令：34 个知识库命令（按功能域分为 7 组）+ `config show` / `config set` / `update`。所有知识库命令均使用 DashScope API Key 鉴权。

> **与 `bl` 的关系**：`kscli` 与 `bl knowledge` 复用同一套命令实现，flag 名、行为逻辑、校验规则完全一致，只有命令路径不同 —— `kscli` 把知识库能力铺平（`kscli kb list`、`kscli file list`），`bl` 则把它们收在 `bl knowledge` 之下。用 `bl` 的读者请参阅 [`bl knowledge` 指南](../knowledge/knowledge-cli-guide.md)。

安装与运行：

```bash
# 免安装执行（推荐，版本可控）
npx knowledge-studio-cli@latest --help

# 全局安装后使用 kscli
npm install -g knowledge-studio-cli
kscli --help
```

> 后文示例统一写作 `kscli <command>`；若未全局安装，把 `kscli` 换成 `npx knowledge-studio-cli@latest` 即可。

---

## 核心概念与实体关系

```
┌─────────────────────────────────────────────────────────────┐
│                     数据中心 (Data Center)                    │
│                                                             │
│  集合 (Collection) ──┬── 分类 (Category) ── 文件 (File)      │
│                      │   "connector"        可多级嵌套       │
│                      └── 默认分类                            │
│                                                             │
│  文件来源：doc upload(本地上传) / doc import-oss(OSS导入)     │
└──────────────────────────┬──────────────────────────────────┘
                           │ 导入 (import job)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    知识库 (Knowledge Base)                    │
│                                                             │
│  知识库 (KB / pipeline / index)                              │
│    ├── 文档 (Doc) ── 解析状态: PENDING/RUNNING/COMPLETED     │
│    │     └── Chunk ── 内容切片，可增删改查、排除/恢复检索     │
│    └── 索引设置 (immutable): 向量模型、切片大小等             │
│                                                             │
│  知识库管理命令: kb create / list / info / update / delete / stats │
└──────────────────────────┬──────────────────────────────────┘
                           │ 绑定 (agent_config.kb_search_configs)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  检索服务 (Service / Agent)                   │
│                                                             │
│  Service (agent)                                            │
│    ├── scene: chat (Q&A) 或 search (检索)                    │
│    ├── 版本: beta (草稿) → 1, 2, 3... (已发布)               │
│    ├── 状态: draft → deployed → edited → deleted            │
│    └── 配置: 模型、温度、策略、rerank 等                      │
│                                                             │
│  消费方式: search (语义检索) / chat (多轮对话)               │
│  管理命令: create / update / deploy / copy / delete / list / get │
└─────────────────────────────────────────────────────────────┘
```

**关键关系**：

- **数据中心文件 → 知识库**：通过 `kscli kb create --doc-id` 或 `kscli doc upload --index-id` 导入，文件解析后自动生成 chunk
- **知识库 → 检索服务**：一个服务可绑定多个知识库，服务配置中 `kb_search_configs` 指定关联的知识库 ID
- **检索服务 → 检索/对话**：`kscli search` 和 `kscli chat` 通过 `--agent-id` 指定服务来执行检索或对话

---

## 通用约定

### 鉴权

所有知识库命令均使用 **DashScope API Key**（Bearer token）鉴权。获取方式：百炼控制台 API Key 页面。

优先级（高 → 低）：

1. `--api-key <key>` 命令行参数
2. `DASHSCOPE_API_KEY` 环境变量
3. 配置文件中的 `api_key`（`kscli config set --key api_key --value <key>`）

### Workspace ID

知识库 API 使用 workspace 级域名（`{workspaceId}.cn-beijing.maas.aliyuncs.com`），因此 **几乎所有知识库命令都需要 workspace ID**。

优先级（高 → 低）：

1. `--workspace-id <id>` 命令行参数
2. `BAILIAN_WORKSPACE_ID` 环境变量
3. 配置文件中的 `workspace_id`（`kscli config set --key workspace_id --value <id>`）

缺失时报错：`Workspace ID is required.`

### 全局通用参数

以下参数在所有知识库命令中通用，后续命令手册中不再逐条列出：

| 参数                  | 类型   | 说明                                                        |
| --------------------- | ------ | ----------------------------------------------------------- |
| `--output <format>`   | string | 输出格式：`text`（默认，人类友好）或 `json`（API 原始响应） |
| `--api-key <key>`     | string | DashScope API Key                                           |
| `--base-url <url>`    | string | API 基地址（一般不需要指定）                                |
| `--timeout <seconds>` | number | 请求超时秒数                                                |
| `--quiet`             | switch | 静默模式，只输出关键结果（如 ID 列表）                      |
| `--verbose`           | switch | 详细模式，打印 HTTP 请求/响应详情到 stderr                  |
| `--dry-run`           | switch | 干跑模式，预览将发送的请求结构，不实际调用 API              |
| `--config <name>`     | string | 使用指定配置 profile 执行命令                               |

> **注意**：命令手册中每个命令的参数表只列出该命令**特有**的参数。上述全局参数对所有命令有效。

### 输出格式约定

- **text 模式**（默认）：人类友好的表格/结构化文本，适合终端查看。不同命令的输出格式见各命令的「输出」部分。
- **json 模式**（`--output json`）：返回 API 原始 JSON 响应，适合程序化处理和 agent 解析。
- **quiet 模式**（`--quiet`）：只输出最精简的结果（通常只有 ID），适合管道串联。

### 危险操作确认

涉及删除的命令（`kb delete`、`doc delete`、`chunk delete`、`file delete`、`category delete`、`service delete`）以及 `service deploy` 在执行前会弹出二次确认提示。使用 `--yes` 可跳过确认，适用于自动化脚本。

### Dry-run 模式

`--dry-run` 模式下，命令会输出将发送的 endpoint 和 request body，但**不实际发起网络请求**。部分命令在 dry-run 下仍会执行本地校验（如文件扩展名检查、参数约束检查）。

---

## 典型工作流

### 场景 A：从零搭建知识库并检索

```bash
# 1. 上传本地文件到数据中心
kscli doc upload --file ./docs/intro.md --workspace-id ws-xxx
# → 返回 file-id

# 2. 用文件创建知识库
kscli kb create --name my-kb --description '产品文档' --doc-id file-xxx --workspace-id ws-xxx --wait
# → 返回 index-id (pipelineId) 和导入任务状态

# 3. 创建检索服务（search 场景）
kscli service create --name my-search --scene search --index-id idx-xxx --workspace-id ws-xxx
# → 返回 agent-id

# 4. 部署服务
kscli service deploy --agent-id aid-xxx --workspace-id ws-xxx --yes

# 5. 执行检索
kscli search --query "什么是RAG" --agent-id aid-xxx --workspace-id ws-xxx
```

### 场景 B：上传目录并导入到已有知识库

```bash
# 1. 上传整个目录到数据中心并直接导入到知识库（一步到位）
kscli doc upload --file ./docs/ --index-id idx-xxx --workspace-id ws-xxx --wait
# → 文件逐个上传到 OSS → 注册到数据中心 → 创建合并导入任务 → 轮询到完成

# 2. 检查文档状态
kscli doc list --index-id idx-xxx --workspace-id ws-xxx
# → 查看 doc_id 和解析状态

# 3. 如果有文档解析失败，查看导入任务详情
kscli doc status --index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx
```

### 场景 C：创建并部署 Q&A 服务

```bash
# 1. 创建 chat 场景的检索服务
kscli service create --name my-qa --scene chat --index-id idx-xxx --workspace-id ws-xxx
# → 初始状态: draft, 版本: beta

# 2. 调整配置（如修改模型、温度）
kscli service update --agent-id aid-xxx --model qwen-max --temperature 0.7 --workspace-id ws-xxx

# 3. 用 beta 版本测试
kscli chat --message "什么是RAG?" --agent-id aid-xxx --agent-version beta --workspace-id ws-xxx

# 4. 测试通过后发布
kscli service deploy --agent-id aid-xxx --version-desc "首版" --workspace-id ws-xxx --yes
```

### 场景 D：知识库内容运维

```bash
# 1. 查看 chunk 列表
kscli chunk list --index-id idx-xxx --workspace-id ws-xxx
# → 返回 metadata._id (chunk id) 和 metadata.doc_id (document id)

# 2. 修改 chunk 内容
kscli chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id doc-xxx --content "修正后的内容" --workspace-id ws-xxx

# 3. 排除某个 chunk 不参与检索（不删除内容）
kscli chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id doc-xxx --exclude --workspace-id ws-xxx

# 4. 手动添加新 chunk
kscli chunk add --index-id idx-xxx --content "新增的知识片段" --title "补充说明" --workspace-id ws-xxx

# 5. 删除 chunk（批量，自动分批每 10 个一组）
kscli chunk delete --index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --yes --workspace-id ws-xxx
```

### 场景 E：服务迁移/复用

```bash
# 1. 复制现有服务为新草稿
kscli service copy --agent-id aid-source --workspace-id ws-xxx
# → 返回新的 agent-id，名称加 copy_ 前缀

# 2. 修改新服务配置
kscli service update --agent-id aid-new --name "改进版" --temperature 0.5 --workspace-id ws-xxx

# 3. 测试并发布
kscli chat --message "测试" --agent-id aid-new --agent-version beta --workspace-id ws-xxx
kscli service deploy --agent-id aid-new --workspace-id ws-xxx --yes
```

### 场景 F：从 OSS 批量导入文件

```bash
# 1. 从已授权的 OSS bucket 批量导入文件到数据中心
kscli doc import-oss \
  --bucket my-bucket --region cn-beijing \
  --oss-key docs/a.pdf --oss-key docs/b.docx \
  --workspace-id ws-xxx
# → 返回各文件的 fileId

# 2. 创建知识库并导入这些文件
kscli kb create --name oss-kb --description 'OSS 导入文档' --doc-id file-a --doc-id file-b --workspace-id ws-xxx --wait

# 3. 检索
kscli search --query "相关内容" --agent-id aid-xxx --workspace-id ws-xxx
```

---

## 命令手册

以下按功能域分组，覆盖全部 37 个命令。每个条目包含功能说明、用法签名和详细手册链接。

> 完整参数表、参数约束、输出说明、注意事项与示例请参阅各子域手册。

---

### 知识库管理

> 📖 [完整手册](kb.md) — 6 个命令

#### `kscli kb list`

列出工作区中的知识库。

```bash
kscli kb list [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-list)

---

#### `kscli kb info`

查看知识库配置详情。

```bash
kscli kb info --index-id <id> [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-info)

---

#### `kscli kb create`

创建知识库并导入数据中心文件或分类。

```bash
kscli kb create --name <text> --description <text> (--doc-id <id> | --category-id <id>) [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-create)

---

#### `kscli kb update`

更新知识库名称、描述或 rerank 阈值。

```bash
kscli kb update --index-id <id> [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-update)

---

#### `kscli kb delete`

删除知识库及其所有文档和 chunk。

```bash
kscli kb delete --index-id <id> [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-delete)

---

#### `kscli kb stats`

查看知识库存储和 QPS 监控数据。

```bash
kscli kb stats --index-id <id> [flags]
```

→ [完整参数与示例](kb.md#kscli-kb-stats)

---

### 文档管理

> 📖 [完整手册](doc.md) — 6 个命令

#### `kscli doc list`

列出知识库中的文档及其解析/索引状态。

```bash
kscli doc list --index-id <id> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-list)

---

#### `kscli doc status`

查看知识库导入任务状态。

```bash
kscli doc status --index-id <id> --job-id <id> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-status)

---

#### `kscli doc upload`

上传本地文件或目录到数据中心，可选导入到知识库。

```bash
kscli doc upload --file <path> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-upload)

---

#### `kscli doc delete`

从知识库中删除文档及其 chunk。

```bash
kscli doc delete --index-id <id> --doc-id <id> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-delete)

---

#### `kscli doc tag`

批量更新数据中心文件的标签。

```bash
kscli doc tag --doc-id <id> --tag <text> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-tag)

---

#### `kscli doc import-oss`

从已授权的 OSS bucket 批量导入文件到数据中心。

```bash
kscli doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]
```

→ [完整参数与示例](doc.md#kscli-doc-import-oss)

---

### 检索服务管理

> 📖 [完整手册](service.md) — 7 个命令

#### `kscli service list`

列出工作区中的检索/Q&A 服务。

```bash
kscli service list --scene <chat|search> [flags]
```

→ [完整参数与示例](service.md#kscli-service-list)

---

#### `kscli service get`

查看服务详情，含各版本配置。

```bash
kscli service get --agent-id <id> [flags]
```

→ [完整参数与示例](service.md#kscli-service-get)

---

#### `kscli service create`

创建检索/Q&A 服务，初始状态为 draft，版本为 beta。

```bash
kscli service create --name <text> --scene <chat|search> [flags]
```

→ [完整参数与示例](service.md#kscli-service-create)

---

#### `kscli service update`

更新服务名称、描述或草稿配置。

```bash
kscli service update --agent-id <id> [flags]
```

→ [完整参数与示例](service.md#kscli-service-update)

---

#### `kscli service deploy`

发布 beta 草稿为新版本。

```bash
kscli service deploy --agent-id <id> [flags]
```

→ [完整参数与示例](service.md#kscli-service-deploy)

---

#### `kscli service delete`

删除检索/Q&A 服务（软删除，幂等）。

```bash
kscli service delete --agent-id <id> [flags]
```

→ [完整参数与示例](service.md#kscli-service-delete)

---

#### `kscli service copy`

复制服务为新草稿（名称自动加 `copy_` 前缀）。

```bash
kscli service copy --agent-id <id> [flags]
```

→ [完整参数与示例](service.md#kscli-service-copy)

---

### Chunk 管理

> 📖 [完整手册](chunk.md) — 4 个命令

#### `kscli chunk add`

直接向知识库添加 chunk。

```bash
kscli chunk add --index-id <id> (--content <text> | --field <k=v>) [flags]
```

→ [完整参数与示例](chunk.md#kscli-chunk-add)

---

#### `kscli chunk list`

列出知识库中的 chunk，含内容和状态。

```bash
kscli chunk list --index-id <id> [flags]
```

→ [完整参数与示例](chunk.md#kscli-chunk-list)

---

#### `kscli chunk update`

更新 chunk 内容或切换其检索可见性。

```bash
kscli chunk update --index-id <id> --chunk-id <id> --doc-id <id> [flags]
```

→ [完整参数与示例](chunk.md#kscli-chunk-update)

---

#### `kscli chunk delete`

从知识库中删除 chunk（不可逆）。

```bash
kscli chunk delete --index-id <id> --chunk-id <id> [flags]
```

→ [完整参数与示例](chunk.md#kscli-chunk-delete)

---

### 数据中心文件管理

> 📖 [完整手册](file.md) — 3 个命令

#### `kscli file list`

列出数据中心分类下的文件。

```bash
kscli file list --category-id <id> [flags]
```

→ [完整参数与示例](file.md#kscli-file-list)

---

#### `kscli file get`

查看数据中心文件详情。

```bash
kscli file get --file-id <id> [flags]
```

→ [完整参数与示例](file.md#kscli-file-get)

---

#### `kscli file delete`

从数据中心永久删除文件。

```bash
kscli file delete --file-id <id> [flags]
```

→ [完整参数与示例](file.md#kscli-file-delete)

---

### 数据中心集合与分类

> 📖 [完整手册](collection-category.md) — 5 个命令

#### `kscli collection create`

创建 FILE 数据集合。

```bash
kscli collection create --name <text> --description <text> [flags]
```

→ [完整参数与示例](collection-category.md#kscli-collection-create)

---

#### `kscli collection get`

查看数据集合详情。

```bash
kscli collection get (--collection-id <id> | --name <text>) [flags]
```

→ [完整参数与示例](collection-category.md#kscli-collection-get)

---

#### `kscli category list`

列出数据中心分类。

```bash
kscli category list [flags]
```

→ [完整参数与示例](collection-category.md#kscli-category-list)

---

#### `kscli category add`

创建数据中心分类。

```bash
kscli category add --name <text> [flags]
```

→ [完整参数与示例](collection-category.md#kscli-category-add)

---

#### `kscli category delete`

删除数据中心分类。

```bash
kscli category delete --category-id <id> [flags]
```

→ [完整参数与示例](collection-category.md#kscli-category-delete)

---

### 检索与对话

> 📖 [完整手册](search-chat.md) — 3 个命令

#### `kscli retrieve`

从知识库检索（已废弃，请用 `search` 替代）。

```bash
kscli retrieve --index-id <id> --query <text> [flags]
```

→ [完整参数与示例](search-chat.md#kscli-retrieve)

---

#### `kscli search`

对知识库执行语义检索（RAG 检索）。

```bash
kscli search --query <text> --agent-id <id> [flags]
```

→ [完整参数与示例](search-chat.md#kscli-search)

---

#### `kscli chat`

与知识库进行 RAG 对话（流式输出）。

```bash
kscli chat --message <text> --agent-id <id> [flags]
```

→ [完整参数与示例](search-chat.md#kscli-chat)

---

### 配置与维护

这 3 个命令不调用知识库 API，用于管理本地配置与 CLI 自身版本。配置文件默认位于 `~/.bailian/config.json`（可用 `BAILIAN_CONFIG_DIR` 改写目录）。

#### `kscli config show`

显示当前生效配置（含 base_url、output、timeout、profile 名和配置文件路径；密钥类字段自动脱敏）。

```bash
kscli config show [--output json]
```

示例：

```bash
# 查看当前配置
kscli config show

# JSON 输出，便于脚本解析
kscli config show --output json
```

---

#### `kscli config set`

写入一个配置项到配置文件。

```bash
kscli config set --key <key> --value <value>
```

| 参数              | 类型   | 必填 | 说明                                                                                                                                                                                        |
| ----------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--key <key>`     | string | 是   | 配置项名称：`language`、`base_url`、`output`、`output_dir`、`timeout`、`api_key`、`access_token`、`access_key_id`、`access_key_secret`、`security_token`、`default_*_model`、`workspace_id` |
| `--value <value>` | string | 是   | 要写入的值（按 key 类型校验并转换）                                                                                                                                                         |

示例：

```bash
# 持久化 API Key
kscli config set --key api_key --value sk-xxx

# 持久化 workspace，省去每次传 --workspace-id
kscli config set --key workspace_id --value ws-xxx

# 默认输出 JSON
kscli config set --key output --value json
```

**注意事项**

- `--dry-run` 只打印将写入的键值和配置文件路径，不落盘。
- 密钥类字段（`api_key`、`access_token` 等）在回显时被掩码。
- 配合 `--config <name>` 可写入指定 profile。

---

#### `kscli update`

将 CLI 自更新到最新版本，或用 `--to` 指定目标版本。

```bash
kscli update [--to <version>]
```

| 参数             | 类型   | 必填 | 说明                                                                      |
| ---------------- | ------ | ---- | ------------------------------------------------------------------------- |
| `--to <version>` | string | 否   | 目标版本（semver，如 `1.13.0` / `v1.13.0` / `0.0.0-beta-<sha>-<时间戳>`） |

示例：

```bash
# 更新到最新版
kscli update

# 回滚/固定到指定版本
kscli update --to 1.13.0
```

**注意事项**

- 更新方式按安装来源自动选择（npm 全局安装或二进制安装）。
- `--to` 传入非法 semver 会在本地被拦截并报错。

---

## 常见错误与排查

### Workspace ID 缺失

**报错**：`Workspace ID is required.`

**原因**：所有知识库管理命令都需要 workspace ID 来构造 API 端点（`{workspaceId}.cn-beijing.maas.aliyuncs.com`）。

**解决**：

```bash
# 方式1：命令行参数
kscli kb list --workspace-id ws-xxx

# 方式2：环境变量
export BAILIAN_WORKSPACE_ID=ws-xxx

# 方式3：配置文件
kscli config set --key workspace_id --value ws-xxx
```

### 知识库 ID 不存在

**报错**：`Knowledge base not found: idx-xxx`

**原因**：`--index-id` 指定的知识库在当前 workspace 中不存在。

**解决**：先 `kscli kb list` 确认知识库 ID。

### 导入任务 SystemError

**报错**：服务端返回 `SystemError`

**原因**：`doc status` 传入了不存在的 job ID，或知识库空闲无任务。

**解决**：检查 `doc list` 输出中的 `ingestionId`，或从 `doc upload` / `kb create` 的返回值获取。

### doc_id 与 fileId 混淆

**问题**：`doc delete` 时用了 `doc upload` 返回的 `fileId` 而非 `doc list` 返回的 `doc_id`。

**原因**：通过 `kb create --doc-id` 导入的文档，`doc_id` 等于 `fileId`；但通过 `doc upload --index-id` 导入的，`doc_id` 可能含 workspace 后缀。

**解决**：始终用 `kscli doc list --quiet` 获取 `doc_id`。

### retrieve 已废弃

**问题**：`retrieve` 命令输出废弃警告。

**解决**：改用 `search` 命令。`search` 通过 `--agent-id` 驱动检索策略，支持多知识库、路由、rerank 等高级特性。`retrieve` 直接操作 `--index-id`，功能受限且不再迭代。

### OSS 导入权限错误

**报错**：服务端返回权限相关错误。

**原因**：OSS bucket 未授权给平台服务角色。

**解决**：检查 RAM 控制台中的 `AliyunServiceRoleForBailian` 角色是否已正确授权。

### Chat SSE error

**报错**：`Chat API error` + API error code。

**原因**：流式对话过程中服务端返回 error 事件。

**解决**：检查 `--agent-id` 是否存在、服务是否已部署、API Key 是否有效。错误消息和 code 原样透传，不二次包装。

### file list 返回空

**问题**：`file list --category-id default` 返回空列表。

**原因**：与上传 API 不同，`file list` 不解析字面量 `default`，需要真实分类 ID。

**解决**：通过 `file get` 的 category 字段或 `category list` 获取真实分类 ID。

### 集合无法删除

**问题**：没有 `collection delete` 命令。

**原因**：暂不支持通过 CLI 删除。

**解决**：创建集合需谨慎。如需隔离，创建新集合并迁移文件。

---

## 附录：命令速查表

| 命令                      | 功能         | 关键参数                                                    |
| ------------------------- | ------------ | ----------------------------------------------------------- |
| `kscli kb list`           | 列出知识库   | `--name`                                                    |
| `kscli kb info`           | 知识库详情   | `--index-id`                                                |
| `kscli kb create`         | 创建知识库   | `--name`, `--description`, `--doc-id`/`--category-id`       |
| `kscli kb update`         | 更新知识库   | `--index-id`, `--name`/`--description`/`--rerank-min-score` |
| `kscli kb delete`         | 删除知识库   | `--index-id`, `--yes`                                       |
| `kscli kb stats`          | 监控数据     | `--index-id`, `--start`/`--end`                             |
| `kscli doc list`          | 文档列表     | `--index-id`                                                |
| `kscli doc status`        | 导入任务状态 | `--index-id`, `--job-id`, `--wait`                          |
| `kscli doc upload`        | 上传文件     | `--file`, `--index-id`, `--wait`                            |
| `kscli doc delete`        | 删除文档     | `--index-id`, `--doc-id`                                    |
| `kscli doc tag`           | 文件打标签   | `--doc-id`, `--tag`, `--mode`                               |
| `kscli doc import-oss`    | OSS 导入     | `--bucket`, `--region`, `--oss-key`                         |
| `kscli service list`      | 服务列表     | `--scene`                                                   |
| `kscli service get`       | 服务详情     | `--agent-id`                                                |
| `kscli service create`    | 创建服务     | `--name`, `--scene`, `--index-id`                           |
| `kscli service update`    | 更新服务     | `--agent-id`, 配置参数                                      |
| `kscli service deploy`    | 发布服务     | `--agent-id`, `--yes`                                       |
| `kscli service delete`    | 删除服务     | `--agent-id`, `--yes`                                       |
| `kscli service copy`      | 复制服务     | `--agent-id`                                                |
| `kscli chunk add`         | 添加 chunk   | `--index-id`, `--content`/`--field`                         |
| `kscli chunk list`        | chunk 列表   | `--index-id`, `--doc-id`                                    |
| `kscli chunk update`      | 更新 chunk   | `--index-id`, `--chunk-id`, `--doc-id`                      |
| `kscli chunk delete`      | 删除 chunk   | `--index-id`, `--chunk-id`, `--yes`                         |
| `kscli file list`         | 文件列表     | `--category-id`                                             |
| `kscli file get`          | 文件详情     | `--file-id`                                                 |
| `kscli file delete`       | 删除文件     | `--file-id`, `--yes`                                        |
| `kscli collection create` | 创建集合     | `--name`, `--description`                                   |
| `kscli collection get`    | 集合详情     | `--collection-id`/`--name`                                  |
| `kscli category list`     | 分类列表     | `--collection-id`, `--parent-id`                            |
| `kscli category add`      | 创建分类     | `--name`, `--parent-id`                                     |
| `kscli category delete`   | 删除分类     | `--category-id`, `--yes`                                    |
| `kscli retrieve`          | 检索（废弃） | `--index-id`, `--query`                                     |
| `kscli search`            | 语义检索     | `--query`, `--agent-id`                                     |
| `kscli chat`              | RAG 对话     | `--message`, `--agent-id`                                   |
| `kscli config show`       | 查看配置     | `--output`                                                  |
| `kscli config set`        | 写入配置     | `--key`, `--value`                                          |
| `kscli update`            | 自更新 CLI   | `--to`                                                      |
