# `bl knowledge doc` — 文档上传与导入

> 通用鉴权/全局 flag 见 [index.md](index.md)。以下 Flags 只列命令专属项。

## `bl knowledge doc upload`

上传本地文件/目录到数据中心，可选同时导入知识库。

```
Usage: bl knowledge doc upload --file <path> [flags]
```

| Flag                        | 说明                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `--file <path>`             | 本地文件或目录（可重复）。目录递归扫描，不支持的格式自动跳过 |
| `--index-id <id>`           | 注册后同时导入该知识库（所有文件合并为一个导入任务）         |
| `--category-id <id>`        | 目标数据中心类目；默认 workspace 默认类目                    |
| `--tag <text>`              | 文件标签（可重复），应用到每个上传文件                       |
| `--wait`                    | 轮询导入任务到终态（需配合 `--index-id`）                    |
| `--poll-interval <seconds>` | 轮询间隔（默认 5）                                           |

Notes：

- 流水线：申请上传租约 → PUT 到 OSS → 注册文件 →（带 `--index-id` 时）创建导入任务。
- 目录递归扫描时自动跳过 node_modules、.git 等。
- 多文件顺序处理；中途失败时，已注册的 fileId 会列在错误提示里。

```bash
bl knowledge doc upload --file ./a.md --workspace-id ws-xxx
bl knowledge doc upload --file ./a.md --file ./b.pdf --index-id idx-xxx --wait
bl knowledge doc upload --file ./docs/ --dry-run --verbose
```

## `bl knowledge doc list`

列出库内文档及解析/索引状态。

```
Usage: bl knowledge doc list --index-id <id> [flags]
```

| Flag                | 说明                                |
| ------------------- | ----------------------------------- |
| `--page-number <n>` | 页码（默认 1）                      |
| `--page-size <n>`   | 每页条数（服务端默认 10，上限 100） |

Notes：

- FAILED 状态的文档在 text 模式下高亮；用 `doc status` 查失败原因。
- 输出的 doc_id 才是 `doc delete` / `chunk add` 应使用的文档 ID。

```bash
bl knowledge doc list --index-id idx-xxx --workspace-id ws-xxx
bl knowledge doc list --index-id idx-xxx --page-size 100
```

## `bl knowledge doc status`

查看导入任务状态。

```
Usage: bl knowledge doc status --index-id <id> --job-id <id> [flags]
```

| Flag                        | 说明                                      |
| --------------------------- | ----------------------------------------- |
| `--job-id <id>`             | 导入任务 ID（导入命令返回的 ingestionId） |
| `--wait`                    | 轮询到终态                                |
| `--poll-interval <seconds>` | 轮询间隔（默认 5）                        |

Notes：

- `--index-id` 和 `--job-id` 缺一不可（只传一个返回 SystemError）。
- 任务整体状态：PENDING / RUNNING / COMPLETED；单文档失败（如 PARSE_FAILED）以非零退出码透传错误。

```bash
bl knowledge doc status --index-id idx-xxx --job-id job-xxx --wait --poll-interval 10
```

## `bl knowledge doc delete`

从库中删除文档及其 chunk。**执行前须向用户确认。**

```
Usage: bl knowledge doc delete --index-id <id> --doc-id <id> [flags]
```

| Flag            | 说明                      |
| --------------- | ------------------------- |
| `--doc-id <id>` | 要删除的文档 ID（可重复） |
| `--yes`         | 跳过交互确认              |

Notes：

- 只从知识库索引移除，数据中心源文件保留。
- **用 `doc list` 输出的 doc_id，不是 `doc upload` 返回的 fileId**：经 `knowledge create --doc-id` 入库的文档二者相等；经 `doc upload --index-id` 入库的 doc_id 可能带 workspace 后缀。
- 删除传播最多 ~30s，期间文档可能仍出现在 doc list 里。

```bash
bl knowledge doc delete --index-id idx-xxx --doc-id file-a --doc-id file-b --yes
```

## `bl knowledge doc tag`

批量更新数据中心文件标签。

```
Usage: bl knowledge doc tag --doc-id <id> --tag <text> [flags]
```

| Flag            | 说明                                                  |
| --------------- | ----------------------------------------------------- |
| `--doc-id <id>` | 数据中心文件 ID（可重复，每次 1-20 个）               |
| `--tag <text>`  | 应用到每个 `--doc-id` 的标签（可重复，单个 ≤32 字符） |
| `--mode <mode>` | 更新模式：append（默认）或 overwrite                  |

Notes：

- 同一批标签应用到所有 `--doc-id`；不同标签集要分多次执行。
- 服务端限制：每文件 ≤100 个标签，标签总长 ≤700 字符。

```bash
bl knowledge doc tag --doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx
bl knowledge doc tag --doc-id file-a --doc-id file-b --tag final --mode overwrite
```

## `bl knowledge doc import-oss`

从已授权 OSS bucket 批量导入到数据中心。

```
Usage: bl knowledge doc import-oss --bucket <name> --region <id> --oss-key <key> [flags]
```

| Flag              | 说明                                            |
| ----------------- | ----------------------------------------------- |
| `--bucket <name>` | 已授权的 OSS bucket                             |
| `--region <id>`   | OSS region（如 cn-beijing）                     |
| `--oss-key <key>` | 要导入的 OSS object key（可重复，每次 1-10 个） |
| `--overwrite`     | 覆盖之前导入的同名文件                          |

Notes：

- Bucket 须预先授权给平台服务角色；权限错误会透传，并提示检查 RAM 控制台的 AliyunServiceRoleForBailian。
- 文件名取 OSS key 的 basename。
- `--overwrite` 会替换旧文件并签发**新的 fileId**（旧 fileId 失效）。

```bash
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --workspace-id ws-xxx
bl knowledge doc import-oss --bucket my-bucket --region cn-beijing --oss-key docs/a.pdf --oss-key docs/b.docx --overwrite
```
