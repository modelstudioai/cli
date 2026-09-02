# 文档管理命令手册

文档管理覆盖文件上传、OSS 导入、解析状态跟踪、文档删除和标签管理。文档导入知识库后自动解析为 chunk。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./kscli-cli-guide.md#通用约定)。

---

#### `kscli doc list`

列出知识库中的文档及其解析/索引状态。

**用法**

```bash
kscli doc list --index-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                           |
| ------------------- | ------ | ---- | ------------------------------ |
| `--index-id <id>`   | string | 是   | 知识库 ID                      |
| `--page-number <n>` | number | 否   | 页码（默认：1）                |
| `--page-size <n>`   | number | 否   | 每页条数（默认：10，最大 100） |

**参数约束**

- `--page-size` 范围 1-100

**输出**

text 模式：每行一个文档，`FAILED` 状态的文档红色高亮。

```
doc-xxx  COMPLETED  intro.md  md  1024
total: 1
```

quiet 模式：每行一个 `doc_id`。

json 模式：返回 API 原始响应。

**注意事项**

- `doc_id` 与 `file_id` 的关系：通过 `kb create --doc-id` 导入的文档，`doc_id` 等于 `fileId`；通过 `doc upload --index-id` 导入的，`doc_id` 可能包含 workspace 后缀。
- 页大小默认 10（服务端默认），最大 100。

**示例**

```bash
# 列出文档
kscli doc list --index-id idx-xxx --workspace-id ws-xxx

# 每页 100 条
kscli doc list --index-id idx-xxx --page-size 100
```

---

#### `kscli doc status`

查看知识库导入任务状态。

**用法**

```bash
kscli doc status --index-id <id> --job-id <id> [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                |
| --------------------------- | ------ | ---- | --------------------------------------------------- |
| `--index-id <id>`           | string | 是   | 知识库 ID                                           |
| `--job-id <id>`             | string | 是   | 导入任务 ID（`ingestionId`，由 create/upload 返回） |
| `--page-number <n>`         | number | 否   | 页码                                                |
| `--page-size <n>`           | number | 否   | 每页条数                                            |
| `--wait`                    | switch | 否   | 轮询直到任务到达终态                                |
| `--poll-interval <seconds>` | number | 否   | 轮询间隔秒数（默认：5）                             |

**输出**

text 模式：

```
status: COMPLETED
  doc-xxx  COMPLETED  intro.md
```

quiet 模式：输出任务状态（`PENDING`/`RUNNING`/`COMPLETED`）。

json 模式：返回 API 原始响应，`data.rows[]` 包含每个文档的状态。

**注意事项**

- `--index-id` 和 `--job-id` 服务端均要求必传，只传一个会返回 `SystemError`。
- 整体任务状态为 `PENDING` / `RUNNING` / `COMPLETED`（无 `FAILED` 值）。
- 单个文档可能解析失败（如 `PARSE_FAILED`），此时 CLI 以非零退出码报错，服务端消息原样透传。
- 如果服务端对空闲知识库返回 `SystemError`，说明该 job 可能不存在。

**示例**

```bash
# 查看任务状态
kscli doc status --index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx

# 轮询等待完成，10 秒间隔
kscli doc status --index-id idx-xxx --job-id job-xxx --wait --poll-interval 10
```

---

#### `kscli doc upload`

上传本地文件或目录到数据中心，可选导入到知识库。

**用法**

```bash
kscli doc upload --file <path> [flags]
```

**参数**

| 参数                        | 类型   | 必填 | 说明                                                             |
| --------------------------- | ------ | ---- | ---------------------------------------------------------------- |
| `--file <path>`             | array  | 是   | 本地文件或目录路径（可重复）。目录递归扫描，不支持的格式自动跳过 |
| `--index-id <id>`           | string | 否   | 上传后导入到此知识库（所有文件合并为一个导入任务）               |
| `--category-id <id>`        | string | 否   | 目标数据中心分类（默认：工作区默认分类）                         |
| `--tag <text>`              | array  | 否   | 文件标签（可重复），应用到每个上传的文件                         |
| `--wait`                    | switch | 否   | 轮询导入任务直到终态（需要 `--index-id`）                        |
| `--poll-interval <seconds>` | number | 否   | 轮询间隔秒数（默认：5）                                          |

**参数约束**

- `--wait` 要求同时指定 `--index-id`

**输出**

text 模式：

```
intro.md  file-xxx  registered
job: job-xxx
status: COMPLETED

Uploaded 1 file.
```

quiet 模式：每行一个 `fileId`。

json 模式：返回自定义结构，包含 `files`（路径和 fileId）、`skipped`、`index_id`、`ingestion_id`、`final_status`。

**注意事项**

- 上传管道：申请 lease → PUT 到 OSS → 注册文件 →（可选）创建导入任务。
- 目录递归扫描，`node_modules`、`.git` 等自动跳过。
- 多文件按顺序处理（无并发），避免 OSS 限流。
- 支持的文件格式：`.pdf .doc .docx .ppt .pptx .xls .xlsx .csv .md .txt .html .png .jpg .jpeg .bmp .gif`
- 部分文件上传失败时，已注册的 fileId 会在错误 hint 中列出。

**示例**

```bash
# 上传单个文件
kscli doc upload --file ./a.md --workspace-id ws-xxx

# 上传多个文件并导入到知识库，等待完成
kscli doc upload --file ./a.md --file ./b.pdf --index-id idx-xxx --wait

# 上传整个目录
kscli doc upload --file ./docs/ --workspace-id ws-xxx

# 干跑预览（查看将上传和跳过的文件）
kscli doc upload --file ./docs/ --dry-run --verbose
```

---

#### `kscli doc delete`

从知识库中删除文档及其 chunk。

**用法**

```bash
kscli doc delete --index-id <id> --doc-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明               |
| ----------------- | ------ | ---- | ------------------ |
| `--index-id <id>` | string | 是   | 知识库 ID          |
| `--doc-id <id>`   | array  | 是   | 文档 ID（可重复）  |
| `--yes`           | switch | 否   | 显式确认高风险操作 |

**输出**

text 模式：

```
deleted: 2 document(s)
  doc-a
  doc-b
```

quiet 模式：每行一个已删除的 `doc_id`。

json 模式：返回 API 原始响应，`data.deleted[]` 为实际删除的 ID 列表。

**注意事项**

- 只从知识库索引中移除文档，数据中心源文件不受影响（用 `file delete` 删除源文件）。
- `doc_id` 应从 `doc list --quiet` 获取，而非 `doc upload` 返回的 `fileId`。
- 删除是异步的：服务端立即返回 Success，但 `doc list` 中可能仍显示该文档（约 30 秒后传播完成）。
- 输出的是服务端实际删除的 ID 列表，可能与请求的数量不一致（会在 stderr 警告）。

**示例**

```bash
# 删除单个文档
kscli doc delete --index-id idx-xxx --doc-id doc-xxx --workspace-id ws-xxx

# 用户明确确认后批量删除
kscli doc delete --index-id idx-xxx --doc-id doc-a --doc-id doc-b --yes
```

---

#### `kscli doc tag`

批量更新数据中心文件的标签。

**用法**

```bash
kscli doc tag --doc-id <id> --tag <text> [flags]
```

**参数**

| 参数            | 类型   | 必填 | 说明                                                   |
| --------------- | ------ | ---- | ------------------------------------------------------ |
| `--doc-id <id>` | array  | 是   | 数据中心文件 ID（可重复，最多 20 个/次）               |
| `--tag <text>`  | array  | 是   | 标签（可重复），应用到每个 `--doc-id`                  |
| `--mode <mode>` | string | 否   | 更新模式：`append`（默认，追加）或 `overwrite`（覆盖） |

**参数约束**

- `--doc-id` 最多 20 个/次
- `--tag` 最多 100 个
- 每个标签最多 32 字符
- 标签总长度最多 700 字符
- `--mode` 只能是 `append` 或 `overwrite`

**输出**

text 模式：

```
tagged: 2 file(s) with [project-a, draft]
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 同一组标签应用到所有 `--doc-id`；不同标签集需多次执行。

**示例**

```bash
# 追加标签
kscli doc tag --doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx

# 覆盖标签
kscli doc tag --doc-id file-a --doc-id file-b --tag final --mode overwrite
```

---

#### `kscli doc import-oss`

从已授权的 OSS bucket 批量导入文件到数据中心。

**用法**

```bash
kscli doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]
```

**参数**

| 参数                 | 类型   | 必填 | 说明                                  |
| -------------------- | ------ | ---- | ------------------------------------- |
| `--bucket <name>`    | string | 是   | 已授权的 OSS bucket 名称              |
| `--region <id>`      | string | 是   | OSS region ID（如 `cn-beijing`）      |
| `--oss-key <key>`    | array  | 是   | OSS 对象 key（可重复，最多 10 个/次） |
| `--category-id <id>` | string | 否   | 目标数据中心分类（默认：默认分类）    |
| `--tag <text>`       | array  | 否   | 文件标签（可重复，最多 10 个）        |
| `--overwrite`        | switch | 否   | 覆盖之前从相同 OSS key 导入的文件     |

**参数约束**

- `--oss-key` 最多 10 个/次
- `--tag` 最多 10 个

**输出**

text 模式：

```
imported: 2 file(s)
  file-a  SUCCESS  docs/a.pdf
  file-b  SUCCESS  docs/b.docx
```

quiet 模式：每行一个 `fileId`。

json 模式：返回 API 原始响应，`data.addFileResultList[]` 包含每个文件的 fileId、status 和 ossKey。

**注意事项**

- bucket 必须事先授权给平台服务角色（RAM 中的 `AliyunServiceRoleForBailian`）。
- 文件名取自 OSS key 的 basename。
- `--overwrite` 会替换之前导入的文件并生成**新的 fileId**（旧 fileId 失效）。

**示例**

```bash
# 导入单个文件
kscli doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx

# 导入多个文件并覆盖
kscli doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite
```

---

← [返回总览](./kscli-cli-guide.md)
