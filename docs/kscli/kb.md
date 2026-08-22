# 知识库管理命令手册

知识库（Knowledge Base / pipeline / index）是 RAG 的核心载体，存储文档解析后的向量索引。本组命令覆盖知识库的创建、查看、更新、删除和监控。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./kscli-cli-guide.md#通用约定)。

---

#### `kscli kb list`

列出工作区中的知识库。

**用法**

```bash
kscli kb list [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                              |
| ------------------- | ------ | ---- | --------------------------------- |
| `--name <text>`     | string | 否   | 按知识库名称模糊过滤（1-20 字符） |
| `--page-number <n>` | number | 否   | 页码（默认：1）                   |
| `--page-size <n>`   | number | 否   | 每页条数（默认：20，最大 100）    |

**参数约束**

- `--name` 长度 1-20 字符
- `--page-size` 范围 1-100

**输出**

text 模式：每行一个知识库，字段以双空格分隔，末尾显示总数。

```
idx-xxx  my-kb  text-embedding-v4  600  product docs
total: 1
```

quiet 模式：每行一个知识库 ID。

json 模式：返回 API 原始响应，`data.rows[]` 包含完整知识库信息。

**注意事项**

- 返回的 `id` 字段作为后续命令的 `--index-id` 使用。

**示例**

```bash
# 列出所有知识库
kscli kb list --workspace-id ws-xxx

# 按名称过滤，第二页
kscli kb list --name demo --page-number 2 --page-size 50
```

---

#### `kscli kb info`

查看知识库配置详情。

**用法**

```bash
kscli kb info --index-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明      |
| ----------------- | ------ | ---- | --------- |
| `--index-id <id>` | string | 是   | 知识库 ID |

**输出**

text 模式：按诊断维度分组展示。

```
Basic:
  id: idx-xxx
  name: my-kb
  description: product docs
  dataType: ...
Indexing:   [immutable — recreate required to change]
  embeddingModelName: text-embedding-v4
  embeddingDimension: 1024
  chunkSize: 600
  overlapSize: ...
  chunkMode: ...
  separator: ...
Retrieval:
  rerankModelName: ...
  rerankMinScore: ...
  rerankTopN: ...
  rerankMode: ...
  enableRewrite: ...
  denseSimilarityTopK: ...
  sparseSimilarityTopK: ...
Data:
  sourceType: ...
  connectorId: ...
```

quiet 模式：输出知识库 ID。

json 模式：返回知识库完整配置 JSON。

**注意事项**

- 索引设置（向量模型、切片大小等）不可变，修改需重建知识库。

**示例**

```bash
# 查看知识库详情
kscli kb info --index-id idx-xxx --workspace-id ws-xxx
```

---

#### `kscli kb create`

创建知识库并导入数据中心文件或分类。

**用法**

```bash
kscli kb create --name <text> --description <text> (--doc-id <id> | --category-id <id>) [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                     |
| --------------------------- | ------ | ---- | -------------------------------------------------------- |
| `--name <text>`             | string | 是   | 知识库名称（1-20 字符，工作区内唯一）                    |
| `--description <text>`      | string | 是   | 知识库装了什么内容、给谁用（1-500 字符）                 |
| `--doc-id <id>`             | array  | 否¹  | 数据中心文件 ID（可重复）；与 `--category-id` 互斥       |
| `--category-id <id>`        | array  | 否¹  | 按分类导入该分类下所有文件（可重复）；与 `--doc-id` 互斥 |
| `--embedding-model <name>`  | string | 否   | 向量模型名称（默认：`text-embedding-v4`）                |
| `--chunk-size <n>`          | number | 否   | 切片大小，字符数（默认：600，建议 300-800）              |
| `--wait`                    | switch | 否   | 轮询初始导入任务直到终态                                 |
| `--poll-interval <seconds>` | number | 否   | 轮询间隔秒数（默认：5）                                  |

> ¹ `--doc-id` 和 `--category-id` 二选一，必须提供其一。

**参数约束**

- `--name` 长度 1-20 字符
- `--description` 长度 1-500 字符，缺失或超长会在本地被拦截
- `--doc-id` 和 `--category-id` 互斥，必须提供其一

**输出**

text 模式：

```
index_id: idx-xxx
ingestion_id: job-xxx
status: COMPLETED
Next: check the import job status, then search against this knowledge base.
```

quiet 模式：只输出知识库 ID。

json 模式：返回 API 原始响应，包含 `pipelineId`（知识库 ID）和 `ingestionId`（导入任务 ID）。`--wait` 时追加 `final_status` 字段。

**注意事项**

- 结构/存储类型固定为默认文档知识库（非结构化，BUILT_IN 存储）。
- 返回知识库 ID（`pipelineId`）和初始导入任务 ID（`ingestionId`）。
- 使用 `doc status` 或 `--wait` 跟踪导入进度。
- 如果 `--wait` 后部分文档解析失败，CLI 以非零退出码报错，知识库已创建成功的事实会在 hint 中提示。

**示例**

```bash
# 从指定文件创建知识库
kscli kb create --name demo --description '产品文档' --doc-id file-xxx --workspace-id ws-xxx

# 从分类导入并等待导入完成
kscli kb create --name demo --description '产品文档' --category-id cate-xxx --wait

# 指定向量模型和切片大小
kscli kb create --name my-kb --description '产品文档 v2' --doc-id file-a --doc-id file-b --embedding-model text-embedding-v4 --chunk-size 400 --workspace-id ws-xxx
```

---

#### `kscli kb update`

更新知识库名称、描述或 rerank 阈值。

**用法**

```bash
kscli kb update --index-id <id> [flags]
```

**参数**

| 参数                         | 类型   | 必填 | 说明                                                     |
| ---------------------------- | ------ | ---- | -------------------------------------------------------- |
| `--index-id <id>`            | string | 是   | 知识库 ID                                                |
| `--name <text>`              | string | 否   | 新名称（1-20 字符）                                      |
| `--description <text>`       | string | 否   | 新描述                                                   |
| `--rerank-min-score <score>` | number | 否   | rerank 最低分数阈值，范围 0-1（低于此分的 chunk 被过滤） |

**参数约束**

- 至少提供 `--name`、`--description`、`--rerank-min-score` 之一，否则报错 "Nothing to update"
- `--name` 长度 1-20 字符
- `--rerank-min-score` 范围 0-1

**输出**

text 模式：

```
updated: idx-xxx
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 索引设置（向量模型、切片大小等）不可变，修改需重建知识库。

**示例**

```bash
# 更新描述
kscli kb update --index-id idx-xxx --description "product docs v2" --workspace-id ws-xxx

# 调整 rerank 阈值
kscli kb update --index-id idx-xxx --rerank-min-score 0.3
```

---

#### `kscli kb delete`

删除知识库及其所有文档和 chunk。

**用法**

```bash
kscli kb delete --index-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明         |
| ----------------- | ------ | ---- | ------------ |
| `--index-id <id>` | string | 是   | 知识库 ID    |
| `--yes`           | switch | 否   | 跳过确认提示 |

**输出**

text 模式：

```
deleted: idx-xxx
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- **不可逆操作**：知识库及所有索引内容被永久删除。
- 数据中心中的源文件不受影响，仅删除知识库索引。
- 不带 `--yes` 时，CLI 会先查询知识库名称和文档数量作为确认摘要。

**示例**

```bash
# 删除（交互确认）
kscli kb delete --index-id idx-xxx --workspace-id ws-xxx

# 跳过确认
kscli kb delete --index-id idx-xxx --yes
```

---

#### `kscli kb stats`

查看知识库存储和 QPS 监控数据。

**用法**

```bash
kscli kb stats --index-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明                                            |
| ----------------- | ------ | ---- | ----------------------------------------------- |
| `--index-id <id>` | string | 是   | 知识库 ID                                       |
| `--start <time>`  | string | 否   | 范围起始：Unix 秒或 ISO 日期（默认：24 小时前） |
| `--end <time>`    | string | 否   | 范围结束：Unix 秒或 ISO 日期（默认：当前时间）  |

**输出**

text 模式：

```
plan: ...
storage: 100 / 1000
peak qps: 5
qps windows: 24 data point(s)
```

quiet 模式：输出 json 格式。

json 模式：返回 API 原始响应，包含 `storageMonitorData` 和 `qpsMonitorData`。

**注意事项**

- 默认查询最近 24 小时数据。
- 时间戳自动转换为 epoch 秒（API 要求秒级字符串）。13 位毫秒时间戳会自动降为秒。

**示例**

```bash
# 查看最近 24 小时监控
kscli kb stats --index-id idx-xxx --workspace-id ws-xxx

# 指定日期范围
kscli kb stats --index-id idx-xxx --start 2026-07-30 --end 2026-07-31
```

---

← [返回总览](./kscli-cli-guide.md)
