# `bl knowledge category` / `file` / `collection` — 数据中心

> 通用鉴权/全局 flag 见 [index.md](index.md)。以下 Flags 只列命令专属项。
> 数据中心是文件的原始存储层：collection（集合）> category（类目）> file（文件）。知识库只是索引层，删库不影响这里的文件。

## `bl knowledge category list`

列出数据中心类目。

```
Usage: bl knowledge category list [flags]
```

| Flag | 说明 |
| --- | --- |
| `--collection-id <id>` | 按集合 ID 精确过滤 |
| `--parent-id <id>` | 列出该父类目下的子类目 |
| `--name <text>` | 按名称过滤（**精确匹配**，与 knowledge list 的模糊匹配不同） |
| `--next-token <token>` | 游标分页（取自上一页输出） |
| `--max-result <n>` | 每页条数（默认 20） |

Notes：

- 标 `[default]` 的类目是未指定类目时文件的默认落点。

```bash
bl knowledge category list --workspace-id ws-xxx
bl knowledge category list --name my-category
```

## `bl knowledge category add`

创建数据中心类目。

```
Usage: bl knowledge category add --name <text> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 类目名（1-20 字符） |
| `--parent-id <id>` | 作为该类目的子类目创建 |
| `--collection-id <id>` | 建在该集合下（默认平台集合） |

```bash
bl knowledge category add --name product-docs --workspace-id ws-xxx
bl knowledge category add --name sub --parent-id cate-xxx
```

## `bl knowledge category delete`

删除数据中心类目。**执行前须向用户确认。**

```
Usage: bl knowledge category delete --category-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--yes` | 跳过交互确认 |

Notes：

- 含文件或子类目时的行为由服务端决定——服务端错误原样透传。

```bash
bl knowledge category delete --category-id cate-xxx --yes
```

## `bl knowledge file list`

列出类目下的文件。

```
Usage: bl knowledge file list --category-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--category-id <id>` | 必须是真实类目 id（通过 `category list` 查）；精确匹配 |
| `--name <text>` | 按**不含扩展名的完整文件名**精确过滤（a.md → 传 a）；部分关键词查不到 |
| `--file-id <id>` | 按文件 ID 精确过滤（可重复） |
| `--next-token <token>` / `--max-result <n>` | 游标分页 |

```bash
bl knowledge file list --category-id cate-xxx --workspace-id ws-xxx
bl knowledge file list --category-id cate-xxx --name report
```

## `bl knowledge file get`

查看文件详情（大小、MD5、标签、时间戳）。

```
Usage: bl knowledge file get --file-id <id> [flags]
```

```bash
bl knowledge file get --file-id file-xxx --workspace-id ws-xxx
```

## `bl knowledge file delete`

永久删除数据中心文件。**不可逆，执行前须向用户确认。**

```
Usage: bl knowledge file delete --file-id <id> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--yes` | 跳过交互确认 |

Notes：

- 不可逆。引用该文件的知识库文档索引会失效。
- 只想从单个知识库移除文档时用 `doc delete`。

```bash
bl knowledge file delete --file-id file-xxx --yes
```

## `bl knowledge collection create`

创建 FILE 数据集合。**没有删除 API——创建须慎重，执行前须向用户确认。**

```
Usage: bl knowledge collection create --name <text> --description <text> [flags]
```

| Flag | 说明 |
| --- | --- |
| `--name <text>` | 集合名 |
| `--description <text>` | 描述（服务端必填） |
| `--store-type <type>` | 存储：platform（托管，默认）或 custom（自有 OSS bucket） |
| `--oss-region <id>` / `--oss-bucket <name>` | `--store-type custom` 时必填 |

Notes：

- 自有 bucket 必须带标签 `bailian-connector-access=ReadAndWrite`（百炼基于标签的访问控制）；缺失时服务端会以有误导性的 “setBucketCORS failed” 报错拒绝创建。

```bash
bl knowledge collection create --name my-collection --description 'team docs' --workspace-id ws-xxx
bl knowledge collection create --name oss-coll --description 'own bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket
```

## `bl knowledge collection get`

查看数据集合详情。

```
Usage: bl knowledge collection get (--collection-id <id> | --name <text>) [flags]
```

```bash
bl knowledge collection get --collection-id conn-xxx --workspace-id ws-xxx
bl knowledge collection get --name my-collection
```
