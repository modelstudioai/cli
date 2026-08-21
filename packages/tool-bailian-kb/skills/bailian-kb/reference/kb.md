# `bl knowledge` — 知识库生命周期

> 通用鉴权/全局 flag 见 [index.md](index.md)。以下 Flags 只列命令专属项。

## `bl knowledge list`

列出 workspace 内知识库。

```
Usage: bl knowledge list [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 按名称过滤（模糊匹配，1-20 字符） |
| `--page-number <n>` | 页码（默认 1） |
| `--page-size <n>` | 每页条数 |

Notes：

- 返回的 id 即后续 kb/doc/chunk 管理命令的 `--index-id`。

```bash
bl knowledge list --workspace-id ws-xxx
bl knowledge list --name demo --page-number 2 --page-size 50
```

## `bl knowledge info`

查看知识库配置详情。

```
Usage: bl knowledge info --index-id <id> [flags]
```

Notes：

- 索引配置不可变，改配置需重建知识库。

```bash
bl knowledge info --index-id idx-xxx --workspace-id ws-xxx
```

## `bl knowledge create`

建库并导入数据中心文件或类目。

```
Usage: bl knowledge create --name <text> (--doc-id <id> | --category-id <id>) [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 库名（1-20 字符，workspace 内唯一） |
| `--doc-id <id>` | 数据中心文件 id（可重复）；与 `--category-id` 互斥 |
| `--category-id <id>` | 导入该类目下所有文件（可重复）；与 `--doc-id` 互斥 |
| `--embedding-model <name>` | Embedding 模型（默认 text-embedding-v4） |
| `--chunk-size <n>` | Chunk 大小（默认 600，建议 300-800） |
| `--wait` | 轮询首次导入任务到终态 |
| `--poll-interval <seconds>` | 轮询间隔（默认 5） |

Notes：

- 结构/存储类型固定为默认文档知识库（非结构化，BUILT_IN 存储）。
- 返回知识库 id（pipelineId）与首次导入任务 id（ingestionId）；用 `doc status`（或 `--wait`）跟踪导入。

```bash
bl knowledge create --name demo --doc-id file-xxx --workspace-id ws-xxx
bl knowledge create --name demo --category-id cate-xxx --wait
```

## `bl knowledge update`

改名、描述或 rerank 阈值。

```
Usage: bl knowledge update --index-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 新库名（1-20 字符） |
| `--description <text>` | 新描述 |
| `--rerank-min-score <score>` | Rerank 最低分阈值，0-1（低于该分的 chunk 被过滤） |

Notes：

- 索引配置（embedding 模型、chunk size 等）不可变——要改只能重建。

```bash
bl knowledge update --index-id idx-xxx --description 'product docs v2' --workspace-id ws-xxx
bl knowledge update --index-id idx-xxx --rerank-min-score 0.3
```

## `bl knowledge delete`

删库（含全部文档与 chunk）。**不可逆，执行前须向用户确认。**

```
Usage: bl knowledge delete --index-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--yes` | 跳过交互确认 |

Notes：

- 不可逆——知识库与全部索引内容永久删除。
- 数据中心内的源文件不受影响，只删索引。

```bash
bl knowledge delete --index-id idx-xxx --workspace-id ws-xxx
bl knowledge delete --index-id idx-xxx --yes
```

## `bl knowledge stats`

存储量与 QPS 监控数据。

```
Usage: bl knowledge stats --index-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--start <time>` | 区间起点：Unix 秒或 ISO 日期，须为过去时间（默认 24 小时前） |
| `--end <time>` | 区间终点（默认现在） |

Notes：

- 监控 API 只返回历史数据：`--start` 拒绝未来时间，`--end` 的未来值被截断到当前。

```bash
bl knowledge stats --index-id idx-xxx --workspace-id ws-xxx
bl knowledge stats --index-id idx-xxx --start 2026-07-30 --end 2026-07-31
```
