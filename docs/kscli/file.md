# 数据中心文件管理命令手册

数据中心是知识库文件的存储层。文件通过 `doc upload` 或 `doc import-oss` 进入数据中心，再导入到知识库。数据中心文件可被多个知识库引用。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./kscli-cli-guide.md#通用约定)。

---

#### `kscli file list`

列出数据中心分类下的文件。

**用法**

```bash
kscli file list --category-id <id> [flags]
```

**参数**

| 参数                   | 类型   | 必填 | 说明                                               |
| ---------------------- | ------ | ---- | -------------------------------------------------- |
| `--category-id <id>`   | string | 是   | 分类 ID（通过 `category list` 或 `file get` 获取） |
| `--name <text>`        | string | 否   | 按文件名过滤                                       |
| `--file-id <id>`       | array  | 否   | 按文件 ID 过滤（可重复）                           |
| `--next-token <token>` | string | 否   | 游标分页令牌（从上次输出获取）                     |
| `--max-result <n>`     | number | 否   | 每页条数                                           |

**输出**

text 模式：

```
file-xxx  SUCCESS  intro.md  1024
next: --next-token eyJ...
```

quiet 模式：每行一个 `fileId`。

json 模式：返回 API 原始响应。

**注意事项**

- `--category-id` 必须是真实的分类 ID。与上传 API 不同，字面量 `default` 在此不被解析，传入会返回空列表。通过 `file get` 的 category 字段或 `category list` 获取真实 ID。
- 分页是游标方式：使用输出的 `next: --next-token <token>` 继续翻页。

**示例**

```bash
# 列出分类下文件
kscli file list --category-id cate-xxx --workspace-id ws-xxx

# 按名称过滤
kscli file list --category-id cate-xxx --name report

# 翻页
kscli file list --category-id cate-xxx --next-token eyJ...
```

---

#### `kscli file get`

查看数据中心文件详情。

**用法**

```bash
kscli file get --file-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明            |
| ---------------- | ------ | ---- | --------------- |
| `--file-id <id>` | string | 是   | 数据中心文件 ID |

**输出**

text 模式：

```
id: file-xxx
name: intro.md
type: md
size: 1024
status: SUCCESS
parser: AUTO_SELECT
category: cate-xxx
uploaded: 2026-01-01T00:00:00Z
tags: project-a, draft
```

quiet 模式：输出 JSON 格式。

json 模式：返回 API 原始响应。

**注意事项**

- 无特殊注意事项。

**示例**

```bash
# 查看文件详情
kscli file get --file-id file-xxx --workspace-id ws-xxx
```

---

#### `kscli file delete`

从数据中心永久删除文件。

**用法**

```bash
kscli file delete --file-id <id> [flags]
```

**参数**

| 参数             | 类型   | 必填 | 说明            |
| ---------------- | ------ | ---- | --------------- |
| `--file-id <id>` | string | 是   | 数据中心文件 ID |
| `--yes`          | switch | 否   | 跳过确认提示    |

**输出**

text 模式：

```
deleted: file-xxx
```

quiet 模式：无输出。

json 模式：返回 API 原始响应。

**注意事项**

- **不可逆操作**：如果知识库引用了此文件，相关文档索引会失效。
- 与 `doc delete` 的区别：`doc delete` 只从单个知识库索引中移除文档，数据中心源文件保留；`file delete` 删除源文件本身，影响所有引用它的知识库。

**示例**

```bash
# 删除文件（交互确认）
kscli file delete --file-id file-xxx --workspace-id ws-xxx

# 跳过确认
kscli file delete --file-id file-xxx --yes
```

---

← [返回总览](./kscli-cli-guide.md)
