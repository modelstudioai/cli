# Asset Center 命令测试报告

- **测试时间**: 2026-07-10 08:41:06 (UTC)
- **Workspace**: `llm-0xvms4kqhbqjlg8s`
- **样本 Asset ID**: `asset_df026105d2274ff9b8c824058fa23d60`
- **策略**: 只读命令真实调用；写操作/下载/OSS 变更一律 `--dry-run`
- **汇总**: 24 通过 / 0 失败 / 24 总计

## 测试结果

| #   | 分类 | 命令                                                 | 模式     | 状态    | Exit | 耗时    | 结果摘要                                                        |
| --- | ---- | ---------------------------------------------------- | -------- | ------- | ---- | ------- | --------------------------------------------------------------- |
| 1   | 查询 | `asset-center list`                                  | 真实调用 | ✅ PASS | 0    | 18962ms | 3 item(s), next=94                                              |
| 2   | 查询 | `asset-center list --type IMAGE`                     | 真实调用 | ✅ PASS | 0    | 16411ms | 2 item(s), next=90                                              |
| 3   | 查询 | `asset-center get`                                   | 真实调用 | ✅ PASS | 0    | 16541ms | {gmtModified, aliyunUid, generateTime, aliyunMainId}            |
| 4   | 统计 | `asset-center stats`                                 | 真实调用 | ✅ PASS | 0    | 14226ms | total=27                                                        |
| 5   | 统计 | `asset-center storage`                               | 真实调用 | ✅ PASS | 0    | 18622ms | {used_storage_size, free_storage_quota, extra_storage_price}    |
| 6   | 转存 | `asset-center transfer list`                         | 真实调用 | ✅ PASS | 0    | 19662ms | 0 item(s)                                                       |
| 7   | OSS  | `asset-center oss slr status`                        | 真实调用 | ✅ PASS | 0    | 19745ms | authorized=true                                                 |
| 8   | OSS  | `asset-center oss show`                              | 真实调用 | ✅ PASS | 0    | 21994ms | {success, failed, messageUnmodified}                            |
| 9   | 查询 | `asset-center list --dry-run`                        | dry-run  | ✅ PASS | 0    | 23855ms | dry-run → /zelda/api/v1/bailian/asset/listModelGeneratedAsset   |
| 10  | 查询 | `asset-center get --dry-run`                         | dry-run  | ✅ PASS | 0    | 17398ms | dry-run → /zelda/api/v1/bailian/asset/getModelGeneratedAsset    |
| 11  | 收藏 | `asset-center favorite`                              | dry-run  | ✅ PASS | 0    | 16471ms | dry-run → /zelda/api/v1/bailian/asset/batchFavoriteAsset        |
| 12  | 收藏 | `asset-center unfavorite`                            | dry-run  | ✅ PASS | 0    | 19724ms | dry-run → /zelda/api/v1/bailian/asset/batchUnfavoriteAsset      |
| 13  | 删除 | `asset-center delete`                                | dry-run  | ✅ PASS | 0    | 20612ms | dry-run → /zelda/api/v1/bailian/asset/batchDeleteAsset          |
| 14  | 下载 | `asset-center download`                              | dry-run  | ✅ PASS | 0    | 20348ms | dry-run → /zelda/api/v1/bailian/asset/batchGetAssetDownloadUrl  |
| 15  | 统计 | `asset-center stats --dry-run`                       | dry-run  | ✅ PASS | 0    | 14898ms | dry-run → /zelda/api/v1/bailian/asset/countModelGeneratedAsset  |
| 16  | 统计 | `asset-center storage --dry-run`                     | dry-run  | ✅ PASS | 0    | 14305ms | dry-run → /zelda/api/v1/bailian/asset/getStorageQuota           |
| 17  | OSS  | `asset-center oss slr authorize`                     | dry-run  | ✅ PASS | 0    | 14005ms | dry-run → /zelda/api/v1/bailian/asset/createOssSLR              |
| 18  | OSS  | `asset-center oss bind`                              | dry-run  | ✅ PASS | 0    | 16737ms | dry-run → /zelda/api/v1/bailian/asset/createAssetTransferPolicy |
| 19  | OSS  | `asset-center oss update`                            | dry-run  | ✅ PASS | 0    | 18024ms | dry-run → /zelda/api/v1/bailian/asset/updateAssetTransferPolicy |
| 20  | OSS  | `asset-center oss unbind`                            | dry-run  | ✅ PASS | 0    | 15174ms | dry-run → /zelda/api/v1/bailian/asset/deleteAssetTransferPolicy |
| 21  | 校验 | `asset-center get (缺 asset-id)`                     | 参数校验 | ✅ PASS | 2    | 15202ms | Error: Missing required flag: --asset-id                        |
| 22  | 校验 | `asset-center favorite (缺 --id)`                    | 参数校验 | ✅ PASS | 2    | 16697ms | Error: Missing required flag: --id                              |
| 23  | 校验 | `asset-center download (缺 --out)`                   | 参数校验 | ✅ PASS | 2    | 18803ms | Error: Missing required flag: --out                             |
| 24  | 校验 | `asset-center oss bind (BEFORE_DAYS 缺 before-days)` | 参数校验 | ✅ PASS | 2    | 14996ms | Error: --before-days is required when --policy is BEFORE_DAYS.  |

## 模式说明

| 模式     | 说明                                               |
| -------- | -------------------------------------------------- |
| 真实调用 | 只读 API，不修改数据                               |
| dry-run  | 输出 `{ api, data, gateway }` 请求体，不发起写操作 |
| 参数校验 | 预期 exit code 2（用法错误）                       |
