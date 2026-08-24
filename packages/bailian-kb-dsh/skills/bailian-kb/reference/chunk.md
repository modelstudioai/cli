# `bl knowledge chunk` — Chunk 运维

> 通用鉴权/全局 flag 见 [index.md](index.md)。以下 Flags 只列命令专属项。
> chunk id = `chunk list` 输出的 `metadata._id`；文档 id = `metadata.doc_id`。

## `bl knowledge chunk add`

直接向库内添加 chunk。

```
Usage: bl knowledge chunk add --index-id <id> (--content <text> | --field <k=v>) [flags]
```

| Flag                    | 说明                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `--doc-id <id>`         | 归属文档 ID（取自 `doc list`）；**实践中所有库类型都必填**                        |
| `--content <text>`      | Chunk 正文，≤6000 字符（文档型库）；与 `--content-file` 二选一                    |
| `--content-file <path>` | 从 UTF-8 纯文本文件读正文（.md/.txt 等）                                          |
| `--title <text>`        | Chunk 标题，≤50 字符                                                              |
| `--image-url <url>`     | Chunk 图片 URL（可重复，≤10 个）                                                  |
| `--field <key=value>`   | 表格/图片型库的任意字段（可重复，key 为 Excel 列头）；与 content/title/image 互斥 |

Notes：

- 支持文档/表格/图片型知识库；音视频型不支持。
- `--doc-id` 用 `doc list` 的文档级 id；`chunk list` 输出里的行级 doc_id 不被接受。
- 图片型文档不支持文本 chunk，需指向文本型文档（docx/pdf/txt）。
- API 幂等但限流 10 QPS——批量脚本注意节流。
- 响应不带 chunk id；添加后用 `chunk list` 反查。

```bash
bl knowledge chunk add --index-id idx-xxx --content "chunk text" --title intro --doc-id file-xxx
bl knowledge chunk add --index-id idx-xxx --field 列A=v1 --field 列B=v2
```

## `bl knowledge chunk list`

列出 chunk 内容与状态。

```
Usage: bl knowledge chunk list --index-id <id> [flags]
```

| Flag                                    | 说明                            |
| --------------------------------------- | ------------------------------- |
| `--doc-id <id>`                         | 只看该文档的 chunk              |
| `--page-number <n>` / `--page-size <n>` | 分页（服务端默认 20，上限 100） |

Notes：

- 后续 update/delete 用输出中的 `metadata._id`（chunk id）与 `metadata.doc_id`（文档 id）。

```bash
bl knowledge chunk list --index-id idx-xxx --doc-id file-xxx --page-size 50
```

## `bl knowledge chunk update`

改 chunk 内容或切换检索可见性。

```
Usage: bl knowledge chunk update --index-id <id> --chunk-id <id> --doc-id <id> [flags]
```

| Flag                      | 说明                                             |
| ------------------------- | ------------------------------------------------ |
| `--chunk-id <id>`         | Chunk ID（`chunk list` 的 `metadata._id`）       |
| `--doc-id <id>`           | 归属文档 ID（`chunk list` 的 `metadata.doc_id`） |
| `--content <text>`        | 新内容，10-6000 字符；与 `--content-file` 二选一 |
| `--content-file <path>`   | 从 UTF-8 纯文本文件读新内容                      |
| `--title <text>`          | 标题，0-50 字符（空串清除；省略保持不变）        |
| `--exclude` / `--include` | 从检索中排除 / 恢复（默认 include）              |

Notes：

- 内容须在 10-6000 字符且不超过库的最大 chunk size。
- `--content-file` 只接受纯文本；.docx/.pdf 不在这里解析。
- 只切 `--exclude/--include` 不给新内容时，自动重提交现有内容。

```bash
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --content "corrected text"
bl knowledge chunk update --index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --exclude
```

## `bl knowledge chunk delete`

删除 chunk。**不可逆，执行前须向用户确认。**

```
Usage: bl knowledge chunk delete --index-id <id> --chunk-id <id> [flags]
```

| Flag              | 说明                                              |
| ----------------- | ------------------------------------------------- |
| `--chunk-id <id>` | 要删的 chunk ID（可重复；超过 10 个自动分批发送） |
| `--yes`           | 跳过交互确认                                      |

```bash
bl knowledge chunk delete --index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --yes
```
