# Chunk 管理命令手册

Chunk 是知识库中最小的检索单元。文档导入后自动切分为 chunk，也可以手动添加。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](../knowledge-cli-guide.md#通用约定)。

---

#### `bl knowledge chunk add`

直接向知识库添加 chunk。

**用法**

```bash
bl knowledge chunk add --index-id <id> (--content <text> | --field <k=v>) [flags]
```

**参数**

| 参数                    | 类型   | 必填 | 说明                                                                                        |
| ----------------------- | ------ | ---- | ------------------------------------------------------------------------------------------- |
| `--index-id <id>`       | string | 是   | 知识库 ID                                                                                   |
| `--doc-id <id>`         | string | 否²  | 所属文档 ID；表格/图片知识库必填，文档型可选                                                |
| `--content <text>`      | string | 否¹  | Chunk 正文，最多 6000 字符（文档型）；与 `--content-file` 互斥                              |
| `--content-file <path>` | string | 否¹  | 从 UTF-8 文本文件读取正文（`.md`/`.txt` 等）；与 `--content` 互斥                           |
| `--title <text>`        | string | 否   | Chunk 标题，最多 50 字符（文档型）                                                          |
| `--image-url <url>`     | array  | 否   | Chunk 图片 URL（可重复，最多 10 个；文档型）                                                |
| `--field <key=value>`   | array  | 否¹  | 任意字段键值对（可重复），用于表格/图片知识库，键为 Excel 列名；与 content/title/image 互斥 |

> ¹ `--content`/`--content-file`/`--title`/`--image-url` 与 `--field` 互斥，必须提供其一。
> ² 表格/图片知识库必须提供 `--doc-id`，服务端无此字段会返回 HTTP 500（`dataId不能为空`）。文档型知识库可选。

**参数约束**

- `--field` 与 `--content`/`--content-file`/`--title`/`--image-url` 互斥
- `--content` 与 `--content-file` 互斥
- `--content` 最多 6000 字符
- `--title` 最多 50 字符
- `--image-url` 最多 10 个

**输出**

text 模式：

```
chunk created (pipeline: idx-xxx)
List chunks to find the new chunk id.
```

quiet 模式：无输出（成功退出码 0）。

json 模式：返回 API 原始响应（不含 chunk ID）。

**注意事项**

- 支持文档/表格/图片知识库；音视频知识库不支持。
- API 响应不含 chunk ID，需用 `chunk list` 查找新 chunk。
- API 幂等但限流 10 次/秒，批量脚本需自行节流。
- 表格/图片知识库用 `--field`，键为 Excel 列名，值为字符串。

**示例**

```bash
# 添加文本 chunk
bl knowledge chunk add --index-id idx-xxx --content "chunk text" --title intro --workspace-id ws-xxx

# 添加表格行（字段方式）
bl knowledge chunk add --index-id idx-xxx --field 列A=v1 --field 列B=v2

# 从文件读取内容
bl knowledge chunk add --index-id idx-xxx --content-file ./chunk.md --doc-id doc-xxx
```

---

#### `bl knowledge chunk list`

列出知识库中的 chunk，含内容和状态。

**用法**

```bash
bl knowledge chunk list --index-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                           |
| ------------------- | ------ | ---- | ------------------------------ |
| `--index-id <id>`   | string | 是   | 知识库 ID                      |
| `--doc-id <id>`     | string | 否   | 只显示属于此文档的 chunk       |
| `--page-number <n>` | number | 否   | 页码（默认：1）                |
| `--page-size <n>`   | number | 否   | 每页条数（默认：20，最大 100） |

**参数约束**

- `--page-size` 范围 1-100

**输出**

text 模式：

```
[chunk] chunk-xxx  (doc: intro.md, doc_id: file-xxx)  status: COMPLETED
  chunk content preview (truncated at 200 chars)…
total: 1
```

> 如果 chunk 被排除检索，行尾会显示 `[excluded from retrieval]`。

quiet 模式：每行一个 `metadata._id`（chunk ID），用于管道传给 update/delete。

json 模式：返回 API 原始响应，`data.nodes[]` 含完整 chunk 数据。

**注意事项**

- 用 `metadata._id` 作为 chunk ID，`metadata.doc_id` 作为文档 ID，在 chunk update/delete 中使用。
- 页大小默认 20，最大 100。

**示例**

```bash
# 列出所有 chunk
bl knowledge chunk list --index-id idx-xxx --workspace-id ws-xxx

# 只看某文档的 chunk
bl knowledge chunk list --index-id idx-xxx --doc-id file-xxx --page-size 50
```

---

#### `bl knowledge chunk update`

更新 chunk 内容或切换其检索可见性。

**用法**

```bash
bl knowledge chunk update --index-id <id> --chunk-id <id> --doc-id <id> [flags]
```

**参数**

| 参数                    | 类型   | 必填 | 说明                                                   |
| ----------------------- | ------ | ---- | ------------------------------------------------------ |
| `--index-id <id>`       | string | 是   | 知识库 ID                                              |
| `--chunk-id <id>`       | string | 是   | Chunk ID（`metadata._id`，来自 chunk list 输出）       |
| `--doc-id <id>`         | string | 是   | 所属文档 ID（`metadata.doc_id`，来自 chunk list 输出） |
| `--content <text>`      | string | 否¹  | 新内容，10-6000 字符；与 `--content-file` 互斥         |
| `--content-file <path>` | string | 否¹  | 从 UTF-8 文本文件读取新内容                            |
| `--title <text>`        | string | 否   | Chunk 标题，0-50 字符（空字符串清除标题；不传则不变）  |
| `--exclude`             | switch | 否²  | 将此 chunk 排除出检索                                  |
| `--include`             | switch | 否²  | 将此 chunk 恢复检索（默认行为）                        |

> ¹ `--content` 与 `--content-file` 互斥。
> ² `--exclude` 与 `--include` 互斥。

**参数约束**

- `--content` 与 `--content-file` 互斥
- `--exclude` 与 `--include` 互斥
- 至少提供一个更新项（`--content`/`--content-file`/`--title`/`--exclude`/`--include`）
- `--content` 长度 10-6000 字符
- `--title` 最多 50 字符

**输出**

text 模式：

```
updated: chunk-xxx
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 内容必须 10-6000 字符，且不超过知识库的 max chunk size。
- `--content-file` 期望 UTF-8 纯文本文件，不解析 `.docx`/`.pdf` 等文档格式。
- 仅切换 `--exclude`/`--include` 而不提供新内容时，CLI 自动读回当前内容并重新提交（API 要求 content 字段必填，CLI 隐藏了此限制）。

**示例**

```bash
# 修改内容
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --content "corrected text" --workspace-id ws-xxx

# 排除 chunk 不参与检索
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --exclude

# 恢复检索
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --include
```

---

#### `bl knowledge chunk delete`

从知识库中删除 chunk（不可逆）。

**用法**

```bash
bl knowledge chunk delete --index-id <id> --chunk-id <id> [flags]
```

**参数**

| 参数              | 类型   | 必填 | 说明                                             |
| ----------------- | ------ | ---- | ------------------------------------------------ |
| `--index-id <id>` | string | 是   | 知识库 ID                                        |
| `--chunk-id <id>` | array  | 是   | Chunk ID（可重复，每批最多 10 个，超出自动分批） |
| `--yes`           | switch | 否   | 跳过确认提示                                     |

**输出**

text 模式：

```
deleted: 2 chunk(s) in 1 batch(es)
```

quiet 模式：无输出。

json 模式：返回 `{ deleted_count, batches }`。

**注意事项**

- 服务端每次最多接受 10 个 chunk ID，CLI 自动分批。
- 如果某批失败，操作停止，已删除的批次会在错误 hint 中列出。
- Chunk 被永久移除，不可恢复。

**示例**

```bash
# 删除多个 chunk
bl knowledge chunk delete --index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --workspace-id ws-xxx

# 跳过确认
bl knowledge chunk delete --index-id idx-xxx --chunk-id chunk-a --yes
```

---

← [返回总览](../knowledge-cli-guide.md)
