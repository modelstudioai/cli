# 数据中心集合与分类命令手册

集合（collection）是数据中心的顶层容器，对应服务端的 connector。分类（category）用于组织集合内的文件，支持多级嵌套。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./kscli-cli-guide.md#通用约定)。

---

#### `kscli collection create`

创建 FILE 数据集合。

**用法**

```bash
kscli collection create --name <text> --description <text> [flags]
```

**参数**

| 参数                   | 类型   | 必填 | 说明                                                             |
| ---------------------- | ------ | ---- | ---------------------------------------------------------------- |
| `--name <text>`        | string | 是   | 集合名称（1-20 字符）                                            |
| `--description <text>` | string | 是   | 集合描述                                                         |
| `--store-type <type>`  | string | 否   | 存储类型：`platform`（托管，默认）或 `custom`（自有 OSS bucket） |
| `--oss-region <id>`    | string | 否   | OSS region ID（`--store-type custom` 时必填）                    |
| `--oss-bucket <name>`  | string | 否   | OSS bucket 名称（`--store-type custom` 时必填）                  |

**参数约束**

- `--name` 长度 1-20 字符
- `--store-type` 只能是 `platform` 或 `custom`
- `--store-type custom` 时 `--oss-region` 和 `--oss-bucket` 必填

**输出**

text 模式：

```
created: conn-xxx  (my-collection, PLATFORM)
```

quiet 模式：输出集合 ID。

json 模式：返回 API 原始响应。

**注意事项**

- `platform` 使用平台托管存储；`custom` 使用已授权的 OSS bucket。
- 自定义 bucket 必须携带标签 `bailian-connector-access=ReadAndWrite`（百炼的标签访问控制），否则服务端报 `setBucketCORS failed` 误导性错误。
- **无集合删除 API**，创建需谨慎。

**示例**

```bash
# 创建平台托管的集合
kscli collection create --name my-collection --description "team docs" --workspace-id ws-xxx

# 创建使用自有 OSS bucket 的集合
kscli collection create --name oss-coll --description "own bucket" --store-type custom --oss-region cn-beijing --oss-bucket my-bucket
```

---

#### `kscli collection get`

查看数据集合详情。

**用法**

```bash
kscli collection get (--collection-id <id> | --name <text>) [flags]
```

**参数**

| 参数                   | 类型   | 必填 | 说明     |
| ---------------------- | ------ | ---- | -------- |
| `--collection-id <id>` | string | 否¹  | 集合 ID  |
| `--name <text>`        | string | 否¹  | 集合名称 |

> ¹ `--collection-id` 和 `--name` 二选一，必须提供其一。

**参数约束**

- `--collection-id` 和 `--name` 互斥，必须提供其一

**输出**

text 模式：

```
id: conn-xxx
name: my-collection
description: team docs
```

quiet 模式：输出集合 ID。

json 模式：返回 API 原始响应。

**注意事项**

- getConnector 不返回 `fileConnectorConfig`（`storeType`/`regionId`/`bucketName`），这些字段仅在创建时通过请求体传入，查询时不可读回。

**示例**

```bash
# 按 ID 查询
kscli collection get --collection-id conn-xxx --workspace-id ws-xxx

# 按名称查询
kscli collection get --name my-collection
```

---

#### `kscli category list`

列出数据中心分类。

**用法**

```bash
kscli category list [flags]
```

**参数**

| 参数                   | 类型   | 必填 | 说明                                                   |
| ---------------------- | ------ | ---- | ------------------------------------------------------ |
| `--collection-id <id>` | string | 否   | 按集合 ID 过滤                                         |
| `--parent-id <id>`     | string | 否   | 列出此分类的子分类                                     |
| `--name <text>`        | string | 否   | 按分类名称过滤（精确匹配，与知识库列表的模糊匹配不同） |
| `--next-token <token>` | string | 否   | 游标分页令牌                                           |
| `--max-result <n>`     | number | 否   | 每页条数（默认：20）                                   |

**输出**

text 模式：

```
cate-xxx  product-docs
cate-yyy  system-docs  [default]
next: --next-token eyJ...
```

> 标记 `[default]` 的是文件未指定分类时的默认归属。

quiet 模式：每行一个 `categoryId`。

json 模式：返回 API 原始响应。

**注意事项**

- 分页是游标方式：使用输出的 `next: --next-token <token>` 继续翻页。

**示例**

```bash
# 列出所有分类
kscli category list --workspace-id ws-xxx

# 按名称过滤
kscli category list --name my-category

# 翻页
kscli category list --next-token eyJ...
```

---

#### `kscli category add`

创建数据中心分类。

**用法**

```bash
kscli category add --name <text> [flags]
```

**参数**

| 参数                   | 类型   | 必填 | 说明                             |
| ---------------------- | ------ | ---- | -------------------------------- |
| `--name <text>`        | string | 是   | 分类名称（1-20 字符）            |
| `--parent-id <id>`     | string | 否   | 创建为指定分类的子分类           |
| `--collection-id <id>` | string | 否   | 创建在此集合下（默认：平台集合） |

**参数约束**

- `--name` 长度 1-20 字符

**输出**

text 模式：

```
created: cate-xxx  (product-docs)
```

quiet 模式：输出分类 ID。

json 模式：返回 API 原始响应。

**注意事项**

- 用分类按业务域组织数据中心文件。

**示例**

```bash
# 创建分类
kscli category add --name product-docs --workspace-id ws-xxx

# 创建子分类
kscli category add --name sub --parent-id cate-xxx
```

---

#### `kscli category delete`

删除数据中心分类。

**用法**

```bash
kscli category delete --category-id <id> [flags]
```

**参数**

| 参数                 | 类型   | 必填 | 说明         |
| -------------------- | ------ | ---- | ------------ |
| `--category-id <id>` | string | 是   | 分类 ID      |
| `--yes`              | switch | 否   | 跳过确认提示 |

**输出**

text 模式：

```
deleted: cate-xxx
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- 含文件或子分类的分类的删除行为由服务端定义——服务端错误原样透传。

**示例**

```bash
# 删除分类（交互确认）
kscli category delete --category-id cate-xxx --workspace-id ws-xxx

# 跳过确认
kscli category delete --category-id cate-xxx --yes
```

---

← [返回总览](./kscli-cli-guide.md)
