# 文档管理命令手册

文档管理覆盖文件上传、OSS 导入、解析状态跟踪、文档删除和标签管理。文档导入知识库后自动解析为 chunk。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](knowledge-cli-guide.md#通用约定)。

---

#### `bl knowledge doc list`

列出知识库中的文档及其解析/索引状态。

**用法**

```bash
bl knowledge doc list --index-id <id> [flags]
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

- `doc_id` 与 `file_id` 的关系：通过 `knowledge create --doc-id` 导入的文档，`doc_id` 等于 `fileId`；通过 `knowledge doc upload --index-id` 导入的，`doc_id` 可能包含 workspace 后缀。
- 页大小默认 10（服务端默认），最大 100。

**示例**

```bash
# 列出文档
bl knowledge doc list --index-id idx-xxx --workspace-id ws-xxx

# 每页 100 条
bl knowledge doc list --index-id idx-xxx --page-size 100
```

---

#### `bl knowledge doc status`

查看知识库导入任务状态。

**用法**

```bash
bl knowledge doc status --index-id <id> --job-id <id> [flags]
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
bl knowledge doc status --index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx

# 轮询等待完成，10 秒间隔
bl knowledge doc status --index-id idx-xxx --job-id job-xxx --wait --poll-interval 10
```

---

#### `bl knowledge doc upload`

上传本地文件或目录到数据中心，可选导入到知识库。

**用法**

```bash
bl knowledge doc upload --file <path> [flags]
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
bl knowledge doc upload --file ./a.md --workspace-id ws-xxx

# 上传多个文件并导入到知识库，等待完成
bl knowledge doc upload --file ./a.md --file ./b.pdf --index-id idx-xxx --wait

# 上传整个目录
bl knowledge doc upload --file ./docs/ --workspace-id ws-xxx

# 干跑预览（查看将上传和跳过的文件）
bl knowledge doc upload --file ./docs/ --dry-run --verbose
```

---

#### `bl knowledge doc delete`

从知识库中删除文档及其 chunk。

**用法**

```bash
bl knowledge doc delete --index-id <id> --doc-id <id> [flags]
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
- `doc_id` 应从 `knowledge doc list --quiet` 获取，而非 `doc upload` 返回的 `fileId`。
- 删除是异步的：服务端立即返回 Success，但 `doc list` 中可能仍显示该文档（约 30 秒后传播完成）。
- 输出的是服务端实际删除的 ID 列表，可能与请求的数量不一致（会在 stderr 警告）。

**示例**

```bash
# 删除单个文档
bl knowledge doc delete --index-id idx-xxx --doc-id doc-xxx --workspace-id ws-xxx

# 用户明确确认后批量删除
bl knowledge doc delete --index-id idx-xxx --doc-id doc-a --doc-id doc-b --yes
```

---

#### `bl knowledge doc tag`

批量更新数据中心文件的标签。

**用法**

```bash
bl knowledge doc tag --doc-id <id> --tag <text> [flags]
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
bl knowledge doc tag --doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx

# 覆盖标签
bl knowledge doc tag --doc-id file-a --doc-id file-b --tag final --mode overwrite
```

---

#### `bl knowledge doc import-oss`

从已授权的 OSS bucket 批量导入文件到数据中心。

**用法**

```bash
bl knowledge doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]
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
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx

# 导入多个文件并覆盖
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite
```

---

← [返回总览](knowledge-cli-guide.md)

## 已有文件导入与音视频接入

`doc upload` 从本地上传到数据中心，`doc import-oss` 从已授权 OSS 注册到数据中心；两者产生 fileId。新增 `doc import` 把这些已有文件加入已有知识库，不重复上传。kscli 使用相同参数，省略 `knowledge` 前缀。

```bash
bl knowledge doc import --index-id idx-xxx --doc-id file-xxx --wait
bl knowledge doc import --index-id idx-xxx --category-id cate-xxx --dry-run
bl knowledge doc list --index-id idx-xxx --details --page-number 2 --page-size 10
```

`--doc-id` 与 `--category-id` 可重复但互斥，必须选一种。`--wait` 与 `--poll-interval` 控制等待；返回 ingestionId。等待会汇总任务所有页的文件状态，失败文件不会因不在第一页而漏掉。超时后用原 ingestionId 继续查询，不必重新导入。

普通文档可传 `--chunk-mode h1|h2|h3|h4|h5|length|page|regex`、`--chunk-size`、`--overlap-size`、`--separator`、`--enable-headers true|false`。length 需要 chunk-size，regex 需要 separator；这些不是音视频的按秒切片参数。

`doc list --details` 调用文件详情列表接口，文本显示 chunkSize、overlapSize、separator、chunkMode、enableHeaders；JSON 保留原始响应。详情接口每页最多 **10** 条，默认普通列表仍为最多 100 条。

音视频格式：aac、amr、flac、flv、m4a、mp3、mpeg、ogg、opus、wav、webm、wma、mp4、mkv、avi、mov、wmv。后缀不区分大小写，目录扫描包含这些格式。单文件本地上限 **2 GB = 2,000,000,000 字节**；这是当前明确采用的十进制解释，后端若采用 2 GiB 则需相应调整。原有文档/图片的大小限制保持不变。

```bash
bl knowledge doc upload --file ./short.mp4 --parser DOCMIND_LLM_VERSION_MEDIA --index-id idx-xxx --wait
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key samples/short.mp4 --parser DOCMIND_LLM_VERSION_MEDIA
```

两个接入命令均支持 `--parser-config-file <JSON对象文件>`，保留未知配置键；OSS 参数应用到本批每个 fileDetails 元素。未指定 parser 时保持原有默认行为。上传使用流式 MD5 和流式 PUT，不把整个媒体加载进内存。

带 `--index-id` 时，一次最多接入 50 个已知本地媒体文件，超限在上传前拒绝，不自动拆批。历史 fileId 和类目的类型/数量由服务端验证；类目个数不等于文件数。OSS 注册仍最多 10 个对象，与知识库导入上限不同。

临时问答附件使用 `doc upload --category-type SESSION_FILE`，租约和注册都传同一类型；不能同时指定 index-id 或自定义 parser/config。会话附件不是长期知识库入库方式。
