# 资产中心 CLI 设计文档

> 本文档描述 `bl asset` 命令族的技术设计方案，供开发、评审与联调使用。
> 接口字段细节见同目录 [api-doc.md](./api-doc.md)；命令路径与 help 结构见 [COMMAND-TREE.md](./COMMAND-TREE.md)。

## 1. 背景与目标

### 1.1 背景

百炼资产中心（Asset Center）提供模型生成资产的存储、检索、收藏、删除、OSS 转存与容量管理能力。产品 PRD 要求 CLI 覆盖以下四大模块：

| 模块     | PRD 能力                                        |
| -------- | ----------------------------------------------- |
| 资产管理 | 列表、详情、收藏/取消收藏、删除、批量删除、下载 |
| 资产统计 | 总量、按类型统计、转存失败数                    |
| OSS 转存 | SLR 授权、绑定/查看/修改/解绑 OSS、转存日志     |
| 容量     | 已用容量、免费额度、超额单价                    |

后端接口通过 **Zelda HTTP 网关** 暴露，Base Path 为 `/zelda/api/v1/bailian/asset`，详见 [api-doc.md](./api-doc.md)。

### 1.2 目标

- 在 `packages/commands` 实现可复用命令库，由 `packages/cli/src/commands.ts` 注册为 `bl asset ...` 产品路径
- 遵循 monorepo 分层约定：`commands` 不写产品 bin 前缀；Console Gateway 命令统一 `auth: "console"`
- 服务端错误原样透传；CLI 仅对参数校验、缺凭证、网络失败等内部错误发出语义化 `BailianError`
- 支持 `--dry-run`、`--output json`、text 表格输出等现有 CLI 惯例

### 1.3 非目标

- 不在 `rag` 入口暴露（首期与 `deploy` / `finetune` 一致，仅 `bl`）
- 不暴露 `sendMqMessage` 等内部 MQ 接口
- 不实现交互式 OSS 绑定向导（Phase 3 可选增强）
- 不在 `core` / `runtime` 层硬编码 `bl` 命令名或控制台 URL

---

## 2. PRD → API → CLI 映射

### 2.1 资产管理

| PRD # | 能力          | CLI 命令                                    | API Action                                    | 备注                                       |
| ----- | ------------- | ------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| 1     | 查看资产列表  | `bl asset list`                             | `listModelGeneratedAsset`                     | 游标分页；支持类型/模型/关键词/收藏/回收站 |
| 2     | 查看资产详情  | `bl asset get <asset-id>`                   | `getModelGeneratedAsset`                      | positional 或 `--asset-id`                 |
| 3     | 收藏/取消收藏 | `bl asset favorite` / `bl asset unfavorite` | `batchFavoriteAsset` / `batchUnfavoriteAsset` | 单 ID 也走 batch（长度 1）                 |
| 4     | 删除资产      | `bl asset delete`                           | `batchDeleteAsset`                            | 默认 `SOFT_DELETE`（移入回收站）           |
| 5     | 批量删除      | `bl asset delete`                           | `batchDeleteAsset`                            | `--id` 可重复，最多 100                    |
| 6     | 下载资产      | `bl asset download`                         | `batchGetAssetDownloadUrl`                    | 默认输出 URL；单资产可选 `--out` 落盘      |

**建议补充（API 已有、PRD 未写）：**

| 能力         | CLI 命令           | API Action          |
| ------------ | ------------------ | ------------------- |
| 从回收站恢复 | `bl asset restore` | `batchRestoreAsset` |

### 2.2 资产统计

| PRD # | 能力         | CLI 命令         | API Action                 | 备注                                    |
| ----- | ------------ | ---------------- | -------------------------- | --------------------------------------- |
| 7     | 查看资产统计 | `bl asset stats` | `countModelGeneratedAsset` | 输出 total / image / video / audio 计数 |

**转存失败数（PRD 子项）：**

- API 支持 `syncOssDataStatus=SYNC_FAILED` 筛选，但无独立 `failureCount` 字段
- **Phase 1 方案**：`bl asset stats --sync-failed` 额外发起一次 count 查询，输出 `sync_failed_count`
- **Phase 3 备选**：等后端在 stats 响应中增加专用字段后收敛

### 2.3 OSS 转存

| PRD # | 能力          | CLI 命令                                                 | API Action                     | 备注                          |
| ----- | ------------- | -------------------------------------------------------- | ------------------------------ | ----------------------------- |
| 8     | SLR 授权      | `bl asset oss slr status` / `bl asset oss slr authorize` | `checkOssSLR` / `createOssSLR` | 授权前先查状态                |
| 9     | 绑定 OSS      | `bl asset oss bind`                                      | `createAssetTransferPolicy`    | 配置 bucket / path / 转存策略 |
| 10    | 查看 OSS 配置 | `bl asset oss show`                                      | `getAssetTransferPolicy`       |                               |
| 11    | 修改 OSS 配置 | `bl asset oss update`                                    | `updateAssetTransferPolicy`    | 需 `--policy-id`              |
| 12    | 解绑 OSS      | `bl asset oss unbind`                                    | `deleteAssetTransferPolicy`    |                               |
| 13    | 查看转存日志  | `bl asset transfer list`（待定）                         | **文档缺失**                   | 见 §6 风险项                  |

**辅助命令（绑定 UX，API 已有）：**

| CLI 命令                    | API Action          |
| --------------------------- | ------------------- |
| `bl asset oss regions list` | `listOssRegion`     |
| `bl asset oss buckets list` | `listUserBuckets`   |
| `bl asset oss folders list` | `listBucketFolders` |

### 2.4 容量

| PRD # | 能力         | CLI 命令           | API Action        |
| ----- | ------------ | ------------------ | ----------------- |
| 14    | 查看容量信息 | `bl asset storage` | `getStorageQuota` |

### 2.5 可选扩展（API 有、PRD 未列）

| CLI 命令                              | API Action                      | 优先级               |
| ------------------------------------- | ------------------------------- | -------------------- |
| `bl asset service status`             | `checkAssetServiceSubscription` | P1                   |
| `bl asset service enable` / `disable` | `subscribeAssetService`         | P2                   |
| `bl asset models list`                | `listModels`                    | P1（配合 list 筛选） |

---

## 3. 架构与分层

### 3.1 在 monorepo 中的位置

```
packages/commands/src/commands/asset-center/*.ts   ← 命令实现（本目录）
        ↓ export
packages/commands/src/index.ts
        ↓ import + map key
packages/cli/src/commands.ts                       ← "asset list": assetList, ...
        ↓
packages/runtime (createCli / authStage / registry)
```

约定：

- 实现文件按能力组织在本目录及 `oss/` 子目录
- `usageArgs` / `exampleArgs` 不含 `bl` 前缀
- 所有 asset 命令 `auth: "console"`；不重复声明 `CONSOLE_AUTH_FLAGS`（runtime 自动注入）

### 3.2 目录结构

```
asset-center/
├── api-doc.md              # 后端 API 文档（已有）
├── DESIGN.md               # 本文档
├── COMMAND-TREE.md         # 命令树与 help 结构
├── types.ts                # TypeScript 类型（ModelGeneratedAssetItem 等）
├── utils.ts                # 公共请求构建、API 调用、响应解析
├── list.ts
├── get.ts
├── favorite.ts
├── unfavorite.ts
├── delete.ts
├── restore.ts
├── download.ts
├── stats.ts
├── storage.ts
├── models-list.ts          # 可选 P1
├── service-status.ts       # 可选 P1
└── oss/
    ├── slr-status.ts
    ├── slr-authorize.ts
    ├── bind.ts
    ├── show.ts
    ├── update.ts
    ├── unbind.ts
    ├── regions-list.ts
    ├── buckets-list.ts
    └── folders-list.ts
```

### 3.3 共享层 `utils.ts`

参考 `token-plan/utils.ts`、`usage/stats.ts` 的 `requireWorkspaceId` 模式。

#### 3.3.1 API 名称约定

与 `quota/list.ts` 中 `zeldaHttp.dashscopeModel./zelda/api/v1/...` 类似，资产中心预期为：

```typescript
const ASSET_SERVICE = "bailianAsset"; // ⚠️ 编码前需 spike 确认
const ASSET_BASE = "/zelda/api/v1/bailian/asset";

function assetApi(action: string): string {
  return `zeldaHttp.${ASSET_SERVICE}.${ASSET_BASE}/${action}`;
}
```

编码第一步用 `bl console call --api <name> --data '{...}'` 验证实际注册名。

#### 3.3.2 公共请求体

所有接口继承 `AssetHttpBaseRequest`（见 api-doc §公共请求参数）：

| 字段             | CLI 来源                                                  | 状态       |
| ---------------- | --------------------------------------------------------- | ---------- |
| `workspace`      | `settings.workspaceId`（`--workspace-id` / env / config） | ✅ 已有    |
| `tenantId`       | 待定                                                      | ⚠️ 需确认  |
| `mainAccountUid` | 待定                                                      | ⚠️ 需确认  |
| `apiSource`      | 固定 `"CLI"`                                              | 实现时写入 |
| `aliYunUid` 等   | 网关 session 注入或省略                                   | 待确认     |

`requireWorkspaceId(settings, binName)` 在缺少 workspace 时抛出 `BailianError(GENERAL)`，hint 指向 `bl workspace list`。

#### 3.3.3 调用封装

```typescript
async function callAssetApi<T>(
  ctx: CommandRunContext,
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const payload = { ...buildBaseRequest(ctx), ...body };
  const raw = await ctx.client.console(assetApi(action), payload);
  return extractAssetResponse<T>(raw);
}
```

#### 3.3.4 响应解析

Console Gateway 响应可能存在多层嵌套（参考 `quota/list.ts` 的 `extractResponseData`）：

1. 剥 gateway 外层：`data` → `DataV2` → `data` → ...
2. 到达业务 `Result<T>`：`{ success, code, message, data }`
3. 若 `success === false`：抛 `BailianError(GENERAL, message)`，**不翻译、不替换** message
4. 成功时返回 `data` 字段

---

## 4. 命令实现规范

### 4.1 通用模式

每个命令文件遵循：

```typescript
export default defineCommand({
  description: "...",
  auth: "console",
  usageArgs: "...",
  flags: { ... },
  exampleArgs: ["...", "--output json"],
  validate(ctx) { /* 跨 flag 条件校验 */ },
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult({ api: assetApi("..."), data: { ... } }, format);
      return;
    }
    const data = await callAssetApi(ctx, "actionName", { ... });
    // text 表格 或 emitResult(json)
  },
});
```

参考实现：`app/list.ts`（console + dry-run）、`dataset/list.ts`（表格输出）、`video/download.ts`（落盘）。

### 4.2 分页模型（`asset list`）

**与 `app list` 不同**：资产列表使用 **id 游标分页**，不是 page/pageSize 页码模式。

| Flag           | API 字段    | 说明                       |
| -------------- | ----------- | -------------------------- |
| `--page-size`  | `pageSize`  | 默认 10，最大 100          |
| `--next-token` | `nextToken` | 下一页游标（来自上次响应） |
| `--pre-token`  | `preToken`  | 上一页游标                 |

JSON 输出保留 `nextToken` / `preToken` / `hasNext` / `hasPre`，便于脚本翻页。

### 4.3 批量 ID 传参

批量操作（favorite / unfavorite / delete / restore / download）统一：

```typescript
id: {
  type: "array",
  valueHint: "<asset-id>",
  description: "Asset ID(s) to operate on (repeatable, max 100)",
  required: true,
}
```

CLI 用法：`--id asset-001 --id asset-002` 或多次重复。实现时在 `validate` 中校验 `ids.length <= 100`。

### 4.4 输出格式

| 命令       | text 默认                                                      | json                                      |
| ---------- | -------------------------------------------------------------- | ----------------------------------------- |
| `list`     | 表格：assetId / type / name / model / favorited / generateTime | items + pagination                        |
| `get`      | 关键字段摘要                                                   | 完整 item                                 |
| `stats`    | 数字摘要                                                       | `{ total_count, image_count, ... }`       |
| `storage`  | 人类可读字节 + 单价                                            | 原始 quota 字段                           |
| 写操作     | 一行确认（affectedCount）                                      | `{ success, affected_count }`             |
| `download` | URL 列表或 saved 路径                                          | `{ items: [{ asset_id, download_url }] }` |

使用 `formatTable`（`dataset/list.ts`）、`formatBytes`（`video/download.ts`）、`emitResult` / `emitBare`。

### 4.5 条件校验（`validate`）

| 命令         | 规则                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| `oss bind`   | `policy=BEFORE_DAYS` 时 `--before-days` 必填；`ossPathPrefix` 不能为空且不能以 `/` 开头 |
| `oss update` | 至少提供一个可更新字段                                                                  |
| `delete`     | `--permanent` 映射 `PERMANENT_DELETE`；默认 `SOFT_DELETE`                               |
| 所有 batch   | `assetIdList.length <= 100`                                                             |

---

## 5. 关键命令 Flag 详设

### 5.1 `bl asset list`

| Flag                     | 类型             | API 映射                     | 说明                                                         |
| ------------------------ | ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `--type`                 | string (choices) | `assetType`                  | `IMAGE` / `VIDEO` / `AUDIO`                                  |
| `--model`                | string           | `modelName`                  | PRD「按模型筛选」                                            |
| `--keyword`              | string           | `assetName`                  | PRD「关键词」；是否同时搜 description 待产品确认             |
| `--favorited`            | switch           | `favorited: true`            | 仅看收藏                                                     |
| `--recycle-bin`          | switch           | `deleteStatus: SOFT_DELETED` | 仅看回收站                                                   |
| `--sync-status`          | string (choices) | `syncOssDataStatus`          | `NOT_SYNCED` / `IN_SYNCING` / `SYNC_SUCCESS` / `SYNC_FAILED` |
| `--begin-time`           | string           | `beginTime`                  | ISO_LOCAL_DATE_TIME                                          |
| `--end-time`             | string           | `endTime`                    | ISO_LOCAL_DATE_TIME                                          |
| `--include-download-url` | switch           | `includeDownloadUrl`         |                                                              |
| `--include-thumbnail`    | switch           | `includeThumbnail`           |                                                              |
| `--thumbnail-width`      | number           | `thumbnailWidth`             | 配合 thumbnail                                               |
| `--thumbnail-height`     | number           | `thumbnailHeight`            | 配合 thumbnail                                               |
| `--page-size`            | number           | `pageSize`                   |                                                              |
| `--next-token`           | number           | `nextToken`                  |                                                              |
| `--pre-token`            | number           | `preToken`                   |                                                              |

### 5.2 `bl asset get`

| 参数/Flag                                  | 说明                                    |
| ------------------------------------------ | --------------------------------------- |
| `<asset-id>`                               | positional，primary                     |
| `--asset-id`                               | 与 positional 二选一（positional 优先） |
| `--include-download-url`                   |                                         |
| `--include-thumbnail`                      |                                         |
| `--thumbnail-width` / `--thumbnail-height` |                                         |

### 5.3 `bl asset delete`

| Flag          | 说明                                                      |
| ------------- | --------------------------------------------------------- |
| `--id`        | array, required, max 100                                  |
| `--permanent` | switch → `deleteType: PERMANENT_DELETE`；默认 SOFT_DELETE |

### 5.4 `bl asset download`

| Flag    | 说明                                                  |
| ------- | ----------------------------------------------------- |
| `--id`  | array, required                                       |
| `--out` | 仅当 `--id` 恰好 1 个时有效；调用 `downloadFile` 落盘 |

### 5.5 `bl asset stats`

| Flag                                  | 说明                                           |
| ------------------------------------- | ---------------------------------------------- |
| （无 filter）                         | 默认 `deleteStatus: NORMAL`                    |
| `--recycle-bin`                       | `deleteStatus: SOFT_DELETED`                   |
| `--sync-failed`                       | 额外查询 `syncOssDataStatus: SYNC_FAILED` 计数 |
| `--type` / `--model` / `--keyword` 等 | 与 list 相同筛选维度（可选）                   |

### 5.6 `bl asset oss bind`

| Flag                      | API 字段              | 必填                      |
| ------------------------- | --------------------- | ------------------------- |
| `--bucket`                | `ossBucket`           | ✅                        |
| `--region`                | `ossBucketRegion`     | ✅                        |
| `--path-prefix`           | `ossPathPrefix`       | ✅                        |
| `--policy`                | `transferPolicy`      | ✅，`ALL` / `BEFORE_DAYS` |
| `--before-days`           | `transferBeforeDays`  | policy=BEFORE_DAYS 时 ✅  |
| `--delete-after-transfer` | `deleteAfterTransfer` | 否                        |

### 5.7 `bl asset oss update`

| Flag                                 | 说明     |
| ------------------------------------ | -------- |
| `--policy-id`                        | required |
| 其余与 bind 相同，均可选（部分更新） |

### 5.8 `bl asset oss slr authorize`

流程：

1. 调用 `checkOssSLR`
2. 若 `authorized === true`，text 输出 "Already authorized." 并 exit 0
3. 否则调用 `createOssSLR`

---

## 6. 风险与待确认项

### 6.1 P0 — 编码前必须对齐

| #   | 问题                                                                      | 影响           | 建议动作                                                        |
| --- | ------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| 1   | Console API 注册名（`zeldaHttp.{service}./zelda/api/v1/bailian/asset/*`） | 无法调用       | `bl console call` spike；与后端确认 service 名                  |
| 2   | `tenantId` / `mainAccountUid` 由谁填充                                    | 所有接口必填   | 确认网关是否从 session 自动注入；否则扩展 config 或新增解析 API |
| 3   | 转存日志 API 缺失（PRD #13）                                              | 无法交付该子项 | 向后端索要接口；临时用 `asset list --sync-status SYNC_FAILED`   |

### 6.2 P1 — 产品设计

| #   | 问题                 | 建议默认                                        |
| --- | -------------------- | ----------------------------------------------- |
| 4   | 关键词搜索范围       | 仅 `assetName`；后续可加 `--search-description` |
| 5   | PRD 只提 image/video | CLI 暴露 IMAGE/VIDEO/AUDIO（与 API 一致）       |
| 6   | 下载行为             | 默认输出 URL；单 ID + `--out` 落盘              |
| 7   | 永久删除             | 提供 `--permanent`，help 注明不可恢复           |
| 8   | 服务未开通           | 不预检查；失败时透传服务端 message              |
| 9   | 收藏命令形态         | 两个命令 `favorite` / `unfavorite`（语义清晰）  |

---

## 7. 错误处理

遵循 [AGENTS.md](../../../../../../AGENTS.md) 错误边界：

| 场景                              | 处理                                          |
| --------------------------------- | --------------------------------------------- |
| 缺 `--workspace-id`               | `BailianError(GENERAL)` + hint                |
| 缺 console token                  | authStage 抛 `BailianError(AUTH)`             |
| flag 校验失败                     | `UsageError` (exit 2)                         |
| HTTP 4xx/5xx / 业务 success=false | `BailianError(GENERAL)`，message **原样透传** |
| batch ID > 100                    | `UsageError`                                  |

Console 未登录参考 `mcp/list.ts`：检测 `BailianGateway.Login.NotLogined` 时 hint 指向 `bl auth login --console`。

---

## 8. 测试策略

新建 `packages/cli/tests/e2e/asset.e2e.test.ts`，遵循 [cli-e2e-tests.md](../../../../../../docs/agents/cli-e2e-tests.md)。

### 8.1 不 skip 层

- `bl asset` 分组 help
- 各子命令 `--help`
- 缺参 → exit 2

### 8.2 Console skip 层（`isConsoleE2EReady()`）

- 各命令 `--dry-run` 输出 api + data
- 真实 `asset list` / `asset storage` 集成（需已开通资产中心的工作空间）

环境：`BAILIAN_E2E=1` + console `access_token` + `BAILIAN_WORKSPACE_ID`。

---

## 9. 注册与文档变更清单

| 文件                                               | 变更                |
| -------------------------------------------------- | ------------------- |
| `packages/commands/src/commands/asset-center/*.ts` | 新建                |
| `packages/commands/src/index.ts`                   | export              |
| `packages/cli/src/commands.ts`                     | 注册 map            |
| `packages/cli/tests/e2e/asset.e2e.test.ts`         | 新建                |
| `skills/bailian-cli/reference/`                    | pre-commit 自动生成 |
| `README.md` / `README.zh.md`                       | 发版前补充命令一览  |

---

## 10. 分期实施

### Phase 1 — 核心资产（P0）

```
asset list | get | favorite | unfavorite | delete | restore | download | stats | storage
```

**前置：** §6.1 #1 #2 确认。

### Phase 2 — OSS 转存（P1）

```
asset oss slr status | authorize
asset oss bind | show | update | unbind
asset oss regions | buckets | folders list
asset models list | service status
```

### Phase 3 — 补齐（P2）

- 转存日志（等 API）
- `asset service enable/disable`
- OSS 交互式绑定向导
- README + 完整真实 E2E

---

## 11. 参考

- 命令注册：[docs/agents/command-add-remove.md](../../../../../../docs/agents/command-add-remove.md)
- E2E 规范：[docs/agents/cli-e2e-tests.md](../../../../../../docs/agents/cli-e2e-tests.md)
- Console 命令样例：`packages/commands/src/commands/app/list.ts`
- 游标/表格：`packages/commands/src/commands/quota/list.ts`
- workspace 必填：`packages/commands/src/commands/usage/stats.ts`
- 文件落盘：`packages/commands/src/commands/video/download.ts`
