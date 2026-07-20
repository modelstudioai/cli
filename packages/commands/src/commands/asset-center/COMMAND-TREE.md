# 资产中心 CLI 命令树设计

> 本文档定义 `bl asset` 命令族的路径结构、help 层级、flags 概览与示例。
> 技术实现细节见 [DESIGN.md](./DESIGN.md)；API 字段见 [api-doc.md](./api-doc.md)。

## 1. 命名原则

| 原则         | 说明                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| 产品路径前缀 | `asset`（不用 `asset-center`，与 `deploy` / `dataset` 等产品域一致）      |
| 层级深度     | 最多三级：`asset <group> <action>`                                        |
| 子组条件     | 仅当子组下 ≥ 2 个 action 时使用子组（见 AGENTS.md）                       |
| bin 前缀     | `usageArgs` / `exampleArgs` 不写 `bl`；help 由 runtime 按路径补全         |
| 鉴权         | 全部 `auth: "console"`；自动可见 `--console-region` 等 CONSOLE_AUTH_FLAGS |

---

## 2. 命令树总览

```
bl asset
│
├── list                          # 分页查询资产列表
├── get <asset-id>                # 查询单个资产详情
├── favorite                      # 收藏资产
├── unfavorite                    # 取消收藏
├── delete                        # 删除资产（默认软删到回收站）
├── restore                       # 从回收站恢复
├── download                      # 获取下载链接 / 可选落盘
├── stats                         # 资产数量统计
├── storage                       # 存储容量与配额
│
├── models                        # [P1] 模型列表（辅助筛选）
│   └── list
│
├── service                       # [P1/P2] 服务开通状态
│   ├── status
│   ├── enable                    # [P2]
│   └── disable                   # [P2]
│
├── transfer                      # [待定] 转存日志（等后端 API）
│   └── list
│
└── oss                           # OSS 转存子组
    ├── slr
    │   └── authorize             # 一键 SLR 授权
    ├── bind                      # 创建转存策略（绑定 OSS）
    ├── show                      # 查看当前转存策略
    ├── update                    # 更新转存策略
    ├── unbind                    # 删除转存策略（解绑）
    ├── regions
    │   └── list                  # 列出可用 OSS 地域
    ├── buckets
    │   └── list                  # 列出用户 bucket
    └── folders
        └── list                  # 列出 bucket 下文件夹
```

---

## 3. 产品入口注册 Map

`packages/cli/src/commands.ts` 中预期注册（camelCase export → kebab path）：

| Map Key                     | Export 名（建议）      | Phase |
| --------------------------- | ---------------------- | ----- |
| `"asset list"`              | `assetList`            | 1     |
| `"asset get"`               | `assetGet`             | 1     |
| `"asset favorite"`          | `assetFavorite`        | 1     |
| `"asset unfavorite"`        | `assetUnfavorite`      | 1     |
| `"asset delete"`            | `assetDelete`          | 1     |
| `"asset restore"`           | `assetRestore`         | 1     |
| `"asset download"`          | `assetDownload`        | 1     |
| `"asset stats"`             | `assetStats`           | 1     |
| `"asset storage"`           | `assetStorage`         | 1     |
| `"asset models list"`       | `assetModelsList`      | 2     |
| `"asset service status"`    | `assetServiceStatus`   | 2     |
| `"asset service enable"`    | `assetServiceEnable`   | 3     |
| `"asset service disable"`   | `assetServiceDisable`  | 3     |
| `"asset transfer list"`     | `assetTransferList`    | 3     |
| `"asset oss slr authorize"` | `assetOssSlrAuthorize` | 2     |
| `"asset oss bind"`          | `assetOssBind`         | 2     |
| `"asset oss show"`          | `assetOssShow`         | 2     |
| `"asset oss update"`        | `assetOssUpdate`       | 2     |
| `"asset oss unbind"`        | `assetOssUnbind`       | 2     |
| `"asset oss regions list"`  | `assetOssRegionsList`  | 2     |
| `"asset oss buckets list"`  | `assetOssBucketsList`  | 2     |
| `"asset oss folders list"`  | `assetOssFoldersList`  | 2     |

---

## 4. Help 层级预览

### 4.1 顶层分组

```
$ bl asset
Asset management commands for Bailian Asset Center.

Commands:
  list         List model-generated assets
  get          Get asset details by ID
  favorite     Mark assets as favorites
  unfavorite   Remove assets from favorites
  delete       Delete assets (soft delete by default)
  restore      Restore soft-deleted assets
  download     Get asset download URLs
  stats        Count assets by type
  storage      View storage quota and usage
  models       Model configuration helpers
  service      Asset center service subscription
  transfer     Asset transfer logs
  oss          OSS transfer policy management

Run `bl asset <command> --help` for details.
```

### 4.2 OSS 子分组

```
$ bl asset oss
OSS transfer policy commands.

Commands:
  slr          Service-linked role authorization
  bind         Create OSS transfer policy
  show         View current transfer policy
  update       Update transfer policy
  unbind       Delete transfer policy
  regions      List supported OSS regions
  buckets      List user OSS buckets
  folders      List folders in a bucket

Run `bl asset oss <command> --help` for details.
```

---

## 5. 各命令规格

以下 `usageArgs` 为命令 metadata 中的值（不含 global flags）。Global flags（`--output`、`--dry-run`、`--quiet` 等）与 console flags（`--workspace-id` 等）由 runtime 自动追加到 help。

---

### 5.1 Phase 1 命令

#### `bl asset list`

```
Description:  List model-generated assets with filters and cursor pagination

Usage:  bl asset list [flags]

Flags:
  --type <type>                 Asset type: IMAGE, VIDEO, AUDIO
  --model <name>                Filter by model name
  --keyword <text>              Filter by asset name (substring)
  --favorited                   Show only favorited assets
  --recycle-bin                 Show soft-deleted assets (recycle bin)
  --sync-status <status>        OSS sync status filter
  --begin-time <datetime>       Filter by generate time start (ISO_LOCAL_DATE_TIME)
  --end-time <datetime>         Filter by generate time end
  --include-download-url        Include signed download URLs
  --include-thumbnail           Include thumbnail URLs
  --thumbnail-width <px>        Thumbnail width
  --thumbnail-height <px>       Thumbnail height
  --page-size <n>               Page size (default: 10, max: 100)
  --next-token <token>          Cursor for next page
  --pre-token <token>           Cursor for previous page

Examples:
  bl asset list
  bl asset list --type IMAGE --model qwen-image-3.0
  bl asset list --favorited --page-size 20
  bl asset list --recycle-bin
  bl asset list --keyword landscape --output json
```

**PRD 映射：** #1 查看资产列表

---

#### `bl asset get <asset-id>`

```
Description:  Get full details of a model-generated asset

Usage:  bl asset get <asset-id> [flags]

Arguments:
  <asset-id>    Asset ID to query

Flags:
  --asset-id <id>               Asset ID (alternative to positional)
  --include-download-url        Include signed download URL
  --include-thumbnail           Include thumbnail URL
  --thumbnail-width <px>        Thumbnail width
  --thumbnail-height <px>       Thumbnail height

Examples:
  bl asset get asset-001
  bl asset get asset-001 --include-download-url --output json
```

**PRD 映射：** #2 查看资产详情

---

#### `bl asset favorite`

```
Description:  Add assets to favorites

Usage:  bl asset favorite --id <asset-id> [--id <asset-id>...]

Flags:
  --id <asset-id>               Asset ID (repeatable, max 100, required)

Examples:
  bl asset favorite --id asset-001
  bl asset favorite --id asset-001 --id asset-002
```

**PRD 映射：** #3 收藏

---

#### `bl asset unfavorite`

```
Description:  Remove assets from favorites

Usage:  bl asset unfavorite --id <asset-id> [--id <asset-id>...]

Flags:
  --id <asset-id>               Asset ID (repeatable, max 100, required)

Examples:
  bl asset unfavorite --id asset-001
  bl asset unfavorite --id asset-001 --id asset-002
```

**PRD 映射：** #3 取消收藏

---

#### `bl asset delete`

```
Description:  Delete assets (soft delete to recycle bin by default)

Usage:  bl asset delete --id <asset-id> [--id <asset-id>...] [flags]

Flags:
  --id <asset-id>               Asset ID (repeatable, max 100, required)
  --permanent                   Permanently delete (cannot be restored)

Examples:
  bl asset delete --id asset-001
  bl asset delete --id asset-001 --id asset-002
  bl asset delete --id asset-001 --permanent
```

**PRD 映射：** #4 删除资产、#5 批量删除

---

#### `bl asset restore`

```
Description:  Restore soft-deleted assets from recycle bin

Usage:  bl asset restore --id <asset-id> [--id <asset-id>...]

Flags:
  --id <asset-id>               Asset ID (repeatable, max 100, required)

Examples:
  bl asset restore --id asset-001
  bl asset restore --id asset-001 --id asset-002
```

**PRD 映射：** 补充能力（配合回收站）

---

#### `bl asset download`

```
Description:  Get signed download URLs for assets

Usage:  bl asset download --id <asset-id> [--id <asset-id>...] [--out <path>]

Flags:
  --id <asset-id>               Asset ID (repeatable, max 100, required)
  --out <path>                  Save file to path (only when exactly one --id)

Examples:
  bl asset download --id asset-001
  bl asset download --id asset-001 --out ./image.png
  bl asset download --id asset-001 --id asset-002 --output json
```

**PRD 映射：** #6 下载资产

---

#### `bl asset stats`

```
Description:  Count model-generated assets by type

Usage:  bl asset stats [flags]

Flags:
  --type <type>                 Filter by asset type
  --model <name>                Filter by model name
  --keyword <text>              Filter by asset name
  --favorited                   Count only favorited assets
  --recycle-bin                 Count soft-deleted assets
  --sync-failed                 Also count assets with failed OSS sync
  --begin-time <datetime>       Filter by generate time start
  --end-time <datetime>         Filter by generate time end

Examples:
  bl asset stats
  bl asset stats --sync-failed
  bl asset stats --type IMAGE --output json
```

**PRD 映射：** #7 查看资产统计

**text 输出示例：**

```
Total:     200
Image:     150
Video:      30
Audio:      20
Sync failed: 5        # 仅 --sync-failed 时出现
```

---

#### `bl asset storage`

```
Description:  View storage quota, usage, and overage pricing

Usage:  bl asset storage [flags]

Examples:
  bl asset storage
  bl asset storage --output json
```

**PRD 映射：** #14 查看容量信息

**text 输出示例：**

```
Used:       1.2 GB
Free quota: 5.0 GB
Overage:    ¥0.12/GB/month
```

---

### 5.2 Phase 2 命令 — OSS 子组

#### `bl asset oss slr authorize`

```
Description:  Authorize OSS service-linked role (one-click)

Usage:  bl asset oss slr authorize

Examples:
  bl asset oss slr authorize
  bl asset oss slr authorize --output json
```

**PRD 映射：** #8 SLR 一键授权

---

#### `bl asset oss bind`

```
Description:  Create OSS transfer policy (bind bucket for asset transfer)

Usage:  bl asset oss bind --bucket <name> --region <region> --path-prefix <prefix> --policy <policy> [flags]

Flags:
  --bucket <name>               OSS bucket name (required)
  --region <region>             OSS bucket region, e.g. cn-hangzhou (required)
  --path-prefix <prefix>        OSS path prefix, must not start with / (required)
  --policy <policy>             Transfer policy: ALL or BEFORE_DAYS (required)
  --before-days <n>             Transfer assets older than N days (required when policy=BEFORE_DAYS)
  --delete-after-transfer       Delete from platform after transfer completes

Examples:
  bl asset oss bind --bucket my-bucket --region cn-hangzhou --path-prefix bailian-assets/ --policy ALL
  bl asset oss bind --bucket my-bucket --region cn-hangzhou --path-prefix bailian/ --policy BEFORE_DAYS --before-days 30
```

**PRD 映射：** #9 绑定 OSS

---

#### `bl asset oss show`

```
Description:  View current OSS transfer policy

Usage:  bl asset oss show [--policy-id <id>]

Flags:
  --policy-id <id>              Policy ID (optional; omit to query by workspace)

Examples:
  bl asset oss show
  bl asset oss show --policy-id policy-abc123 --output json
```

**PRD 映射：** #10 查看 OSS 配置

---

#### `bl asset oss update`

```
Description:  Update an existing OSS transfer policy

Usage:  bl asset oss update --policy-id <id> [flags]

Flags:
  --policy-id <id>              Policy ID (required)
  --bucket <name>               OSS bucket name
  --region <region>             OSS bucket region
  --path-prefix <prefix>        OSS path prefix
  --policy <policy>             Transfer policy: ALL or BEFORE_DAYS
  --before-days <n>             Transfer days threshold
  --delete-after-transfer       Delete from platform after transfer

Examples:
  bl asset oss update --policy-id policy-abc123 --policy ALL
  bl asset oss update --policy-id policy-abc123 --delete-after-transfer
```

**PRD 映射：** #11 修改 OSS 配置

---

#### `bl asset oss unbind`

```
Description:  Delete OSS transfer policy (unbind)

Usage:  bl asset oss unbind --policy-id <id>

Flags:
  --policy-id <id>              Policy ID (required)

Examples:
  bl asset oss unbind --policy-id policy-abc123
```

**PRD 映射：** #12 解绑 OSS

---

#### `bl asset oss regions list`

```
Description:  List supported OSS regions

Usage:  bl asset oss regions list

Examples:
  bl asset oss regions list
  bl asset oss regions list --output json
```

---

#### `bl asset oss buckets list`

```
Description:  List user OSS buckets in a region

Usage:  bl asset oss buckets list --region <region>

Flags:
  --region <region>             Bucket region (required)

Examples:
  bl asset oss buckets list --region cn-hangzhou
```

---

#### `bl asset oss folders list`

```
Description:  List folders under a prefix in an OSS bucket

Usage:  bl asset oss folders list --bucket <name> --region <region> [--prefix <prefix>]

Flags:
  --bucket <name>               Bucket name (required)
  --region <region>             Bucket region (required)
  --prefix <prefix>             Folder prefix, e.g. documents/

Examples:
  bl asset oss folders list --bucket my-bucket --region cn-hangzhou
  bl asset oss folders list --bucket my-bucket --region cn-hangzhou --prefix documents/
```

---

### 5.3 Phase 2/3 可选命令

#### `bl asset models list`

```
Description:  List managed models grouped by asset type

Usage:  bl asset models list

Examples:
  bl asset models list --output json
```

用途：配合 `bl asset list --model` 时查阅可用 modelId。

---

#### `bl asset service status`

```
Description:  Check whether asset center service is enabled

Usage:  bl asset service status

Examples:
  bl asset service status
```

---

#### `bl asset transfer list`（待定）

```
Description:  List asset transfer logs with pagination

Status:  BLOCKED — API not in api-doc.md yet

Expected flags (draft):
  --page-size <n>
  --next-token <token>
  --status <status>             Transfer status filter
```

**PRD 映射：** #13 查看转存日志

**临时替代：**

```bash
bl asset list --sync-status SYNC_FAILED
bl asset stats --sync-failed
```

---

## 6. PRD 覆盖矩阵

| PRD # | 功能          | CLI 命令                        | Phase | 状态                               |
| ----- | ------------- | ------------------------------- | ----- | ---------------------------------- |
| 1     | 查看资产列表  | `asset list`                    | 1     | ✅ 可开发                          |
| 2     | 查看资产详情  | `asset get`                     | 1     | ✅ 可开发                          |
| 3     | 收藏/取消收藏 | `asset favorite` / `unfavorite` | 1     | ✅ 可开发                          |
| 4     | 删除资产      | `asset delete`                  | 1     | ✅ 可开发                          |
| 5     | 批量删除      | `asset delete`（多 `--id`）     | 1     | ✅ 可开发                          |
| 6     | 下载资产      | `asset download`                | 1     | ✅ 可开发                          |
| 7     | 查看资产统计  | `asset stats`                   | 1     | ✅ 可开发（转存失败用 workaround） |
| 8     | SLR 授权      | `asset oss slr authorize`       | 2     | ✅ 可开发                          |
| 9     | 绑定 OSS      | `asset oss bind`                | 2     | ✅ 可开发                          |
| 10    | 查看 OSS 配置 | `asset oss show`                | 2     | ✅ 可开发                          |
| 11    | 修改 OSS 配置 | `asset oss update`              | 2     | ✅ 可开发                          |
| 12    | 解绑 OSS      | `asset oss unbind`              | 2     | ✅ 可开发                          |
| 13    | 查看转存日志  | `asset transfer list`           | 3     | ⛔ API 缺失                        |
| 14    | 查看容量信息  | `asset storage`                 | 1     | ✅ 可开发                          |

---

## 7. 典型工作流

### 7.1 首次使用

```bash
bl auth login --console
bl config set workspace_id ws-xxxxx
bl asset service status          # 可选：确认已开通
bl asset storage                 # 查看容量
```

### 7.2 浏览与筛选

```bash
bl asset list
bl asset list --type IMAGE --model qwen-image-3.0 --keyword landscape
bl asset list --favorited
bl asset list --recycle-bin
bl asset get asset-001 --include-download-url
bl asset stats
bl asset stats --sync-failed
```

### 7.3 资产管理

```bash
bl asset favorite --id asset-001
bl asset unfavorite --id asset-001
bl asset delete --id asset-001
bl asset delete --id asset-001 --id asset-002
bl asset restore --id asset-001
bl asset download --id asset-001 --out ./image.png
```

### 7.4 OSS 转存配置

```bash
bl asset oss slr authorize
bl asset oss regions list
bl asset oss buckets list --region cn-hangzhou
bl asset oss folders list --bucket my-bucket --region cn-hangzhou --prefix bailian/
bl asset oss bind \
  --bucket my-bucket \
  --region cn-hangzhou \
  --path-prefix bailian-assets/ \
  --policy BEFORE_DAYS \
  --before-days 30
bl asset oss show
bl asset oss update --policy-id policy-abc123 --policy ALL
bl asset oss unbind --policy-id policy-abc123
```

### 7.5 脚本翻页（JSON）

```bash
# 第一页
bl asset list --page-size 50 --output json
# 后续页（使用响应中的 nextToken）
bl asset list --page-size 50 --next-token 1000 --output json
```

---

## 8. 与现有命令的风格对齐

| 参考命令                       | 对齐点                                             |
| ------------------------------ | -------------------------------------------------- |
| `bl app list`                  | console gateway 调用、dry-run 输出 `{ api, data }` |
| `bl dataset list`              | text 表格 + json items 结构                        |
| `bl deploy list/get/create`    | 产品域子命令命名、多级 path                        |
| `bl memory profile get/create` | 三级 path 子组（`asset oss slr status` 同级模式）  |
| `bl quota list`                | `zeldaHttp.*` API 名、响应 extract                 |
| `bl video download`            | `--out` 落盘                                       |
| `bl usage stats`               | `requireWorkspaceId`、console E2E 模式             |

---

## 9. 变更记录

| 日期       | 版本 | 说明                                  |
| ---------- | ---- | ------------------------------------- |
| 2026-07-09 | 0.1  | 初稿：命令树、PRD 映射、分 Phase 规格 |
