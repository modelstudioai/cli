# BailianAssetZeldaHttpService API 文档

通过 Zelda 网关调用 bailian-asset HTTP 接口文档。

## 基础信息

- **Base Path**: `/zelda/api/v1/bailian/asset`
- **Method**: POST
- **Content-Type**: `application/json`
- **Accept**: `application/json`

## 统一响应格式

所有接口返回 `Result<T>` 结构：

```json
{
  "requestId": "string",
  "success": true,
  "code": "string",
  "message": "string",
  "data": { ... }
}
```

| 字段      | 类型    | 说明                   |
| --------- | ------- | ---------------------- |
| requestId | String  | 请求唯一ID             |
| success   | Boolean | 是否成功               |
| code      | String  | 错误码（失败时返回）   |
| message   | String  | 错误信息（失败时返回） |
| data      | Object  | 业务数据（成功时返回） |

## 公共请求参数（基类字段）

所有接口请求体均继承自 `AssetHttpBaseRequest`，包含以下公共字段：

| 字段           | 类型   | 必填 | 说明                                           |
| -------------- | ------ | ---- | ---------------------------------------------- |
| requestId      | String | 否   | 请求唯一ID                                     |
| apiSource      | String | 否   | 调用入口渠道，如 OpenAPI、CloudSDK             |
| tenantId       | String | 是   | 内部租户ID                                     |
| workspace      | String | 是   | 业务空间ID                                     |
| aliYunUid      | String | 否   | 阿里云子账号ID                                 |
| mainAccountUid | String | 是   | 阿里云主账号ID                                 |
| callerType     | String | 否   | 账号类型：partner/customer/sub/AssumedRoleUser |
| callerParentId | Long   | 否   | 调用者所属主账号ID                             |
| accessKeyId    | String | 否   | STS认证：用户AccessKeyId                       |
| securityToken  | String | 否   | STS认证：扮演者的STS Token                     |

---

## 1. 开通/关闭资产中心服务

**POST** `/zelda/api/v1/bailian/asset/subscribeAssetService`

### 请求参数

| 字段   | 类型         | 必填 | 说明                                    |
| ------ | ------------ | ---- | --------------------------------------- |
| action | String(Enum) | 是   | 操作类型：`ENABLE`-开通，`DISABLE`-关闭 |

### 响应 data

| 字段   | 类型         | 说明         |
| ------ | ------------ | ------------ |
| status | String(Enum) | 当前服务状态 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "action": "ENABLE"
}
```

---

## 2. 检查 OSS SLR 授权状态

**POST** `/zelda/api/v1/bailian/asset/checkOssSLR`

### 请求参数

仅需公共参数（`mainAccountUid` 必填）。

### 响应 data

| 字段       | 类型    | 说明               |
| ---------- | ------- | ------------------ |
| authorized | Boolean | 是否已授权 OSS SLR |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

---

## 3. 创建 OSS SLR 授权

**POST** `/zelda/api/v1/bailian/asset/createOssSLR`

### 请求参数

仅需公共参数（`mainAccountUid` 必填）。

### 响应 data

| 字段    | 类型    | 说明         |
| ------- | ------- | ------------ |
| success | Boolean | 是否创建成功 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

---

## 4. 创建 OSS 资产转存策略

**POST** `/zelda/api/v1/bailian/asset/createAssetTransferPolicy`

### 请求参数

| 字段                | 类型         | 必填     | 说明                                                           |
| ------------------- | ------------ | -------- | -------------------------------------------------------------- |
| transferPolicy      | String(Enum) | 是       | 转存策略：`ALL`-全部转存，`BEFORE_DAYS`-转存指定天数之前的数据 |
| transferBeforeDays  | Integer      | 条件必填 | 转存天数阈值，transferPolicy 为 BEFORE_DAYS 时必填             |
| ossBucket           | String       | 是       | 用户 OSS 的 bucket 名称                                        |
| ossBucketRegion     | String       | 是       | 用户 OSS bucket 的地域                                         |
| ossPathPrefix       | String       | 是       | 用户 OSS 的存储路径前缀（不能为空，不能以 `/` 开头）           |
| deleteAfterTransfer | Boolean      | 否       | 转存完成后是否从平台删除：true-删除，false-保留                |

### 响应 data

| 字段     | 类型   | 说明               |
| -------- | ------ | ------------------ |
| policyId | String | 新创建的转存策略ID |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "transferPolicy": "BEFORE_DAYS",
  "transferBeforeDays": 30,
  "ossBucket": "my-bucket",
  "ossBucketRegion": "cn-hangzhou",
  "ossPathPrefix": "bailian-assets/",
  "deleteAfterTransfer": false
}
```

---

## 5. 更新 OSS 资产转存策略

**POST** `/zelda/api/v1/bailian/asset/updateAssetTransferPolicy`

### 请求参数

| 字段                | 类型         | 必填 | 说明                            |
| ------------------- | ------------ | ---- | ------------------------------- |
| policyId            | String       | 是   | 转存策略ID                      |
| transferPolicy      | String(Enum) | 否   | 转存策略：`ALL` / `BEFORE_DAYS` |
| transferBeforeDays  | Integer      | 否   | 转存天数阈值                    |
| ossBucket           | String       | 否   | 用户 OSS 的 bucket 名称         |
| ossBucketRegion     | String       | 否   | 用户 OSS bucket 的地域          |
| ossPathPrefix       | String       | 否   | 用户 OSS 的存储路径前缀         |
| deleteAfterTransfer | Boolean      | 否   | 转存完成后是否从平台删除        |

### 响应 data

| 字段    | 类型    | 说明         |
| ------- | ------- | ------------ |
| success | Boolean | 是否更新成功 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "policyId": "policy-abc123",
  "transferPolicy": "ALL",
  "deleteAfterTransfer": true
}
```

---

## 6. 删除 OSS 资产转存策略

**POST** `/zelda/api/v1/bailian/asset/deleteAssetTransferPolicy`

### 请求参数

| 字段     | 类型   | 必填 | 说明       |
| -------- | ------ | ---- | ---------- |
| policyId | String | 是   | 转存策略ID |

### 响应 data

| 字段    | 类型    | 说明         |
| ------- | ------- | ------------ |
| success | Boolean | 是否删除成功 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "policyId": "policy-abc123"
}
```

---

## 7. 查询 OSS 资产转存策略

**POST** `/zelda/api/v1/bailian/asset/getAssetTransferPolicy`

### 请求参数

| 字段     | 类型   | 必填 | 说明                                                          |
| -------- | ------ | ---- | ------------------------------------------------------------- |
| policyId | String | 否   | 转存策略ID。指定时按 policyId 查询，否则按工作空间+主账号查询 |

### 响应 data

| 字段                | 类型    | 说明                        |
| ------------------- | ------- | --------------------------- |
| policyId            | String  | 转存策略ID                  |
| transferPolicy      | String  | 转存策略：ALL / BEFORE_DAYS |
| transferBeforeDays  | Integer | 转存天数阈值                |
| ossBucket           | String  | 用户 OSS 的 bucket 名称     |
| ossBucketRegion     | String  | 用户 OSS bucket 的地域      |
| ossPathPrefix       | String  | 用户 OSS 的存储路径前缀     |
| deleteAfterTransfer | Boolean | 转存完成后是否从平台删除    |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "policyId": "policy-abc123"
}
```

---

## 8. 批量收藏资产

**POST** `/zelda/api/v1/bailian/asset/batchFavoriteAsset`

### 请求参数

| 字段        | 类型         | 必填 | 说明                               |
| ----------- | ------------ | ---- | ---------------------------------- |
| assetIdList | List<String> | 是   | 待收藏的资产ID列表，长度不超过 100 |

### 响应 data

| 字段          | 类型    | 说明                 |
| ------------- | ------- | -------------------- |
| success       | Boolean | 是否收藏成功         |
| affectedCount | Integer | 实际被收藏的资产数量 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetIdList": ["asset-001", "asset-002", "asset-003"]
}
```

---

## 9. 批量取消收藏资产

**POST** `/zelda/api/v1/bailian/asset/batchUnfavoriteAsset`

### 请求参数

| 字段        | 类型         | 必填 | 说明                                   |
| ----------- | ------------ | ---- | -------------------------------------- |
| assetIdList | List<String> | 是   | 待取消收藏的资产ID列表，长度不超过 100 |

### 响应 data

| 字段          | 类型    | 说明                     |
| ------------- | ------- | ------------------------ |
| success       | Boolean | 是否取消收藏成功         |
| affectedCount | Integer | 实际被取消收藏的资产数量 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetIdList": ["asset-001", "asset-002"]
}
```

---

## 10. 批量删除资产

**POST** `/zelda/api/v1/bailian/asset/batchDeleteAsset`

### 请求参数

| 字段        | 类型         | 必填 | 说明                                                        |
| ----------- | ------------ | ---- | ----------------------------------------------------------- |
| assetIdList | List<String> | 是   | 待删除的资产ID列表，长度不超过 100                          |
| deleteType  | String(Enum) | 是   | 删除类型：`SOFT_DELETE`-软删除，`PERMANENT_DELETE`-彻底删除 |

### 响应 data

| 字段          | 类型    | 说明                 |
| ------------- | ------- | -------------------- |
| success       | Boolean | 是否删除成功         |
| affectedCount | Integer | 实际被删除的资产数量 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetIdList": ["asset-001", "asset-002"],
  "deleteType": "SOFT_DELETE"
}
```

---

## 11. 批量恢复软删除资产

**POST** `/zelda/api/v1/bailian/asset/batchRestoreAsset`

### 请求参数

| 字段        | 类型         | 必填 | 说明                               |
| ----------- | ------------ | ---- | ---------------------------------- |
| assetIdList | List<String> | 是   | 待恢复的资产ID列表，长度不超过 100 |

### 响应 data

| 字段          | 类型    | 说明                 |
| ------------- | ------- | -------------------- |
| success       | Boolean | 是否恢复成功         |
| affectedCount | Integer | 实际被恢复的资产数量 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetIdList": ["asset-001", "asset-002"]
}
```

---

## 12. 分页查询模型生成资产

**POST** `/zelda/api/v1/bailian/asset/listModelGeneratedAsset`

采用 id 游标分页，默认 pageSize=10，最大 100。

### 请求参数

| 字段                | 类型         | 必填 | 说明                                                                               |
| ------------------- | ------------ | ---- | ---------------------------------------------------------------------------------- |
| preToken            | Long         | 否   | 向前翻页游标                                                                       |
| nextToken           | Long         | 否   | 向后翻页游标（查询下一页时传入上一次响应的 nextToken）                             |
| pageSize            | Integer      | 否   | 每页大小，默认 10，最大 100                                                        |
| includeDownloadUrl  | Boolean      | 否   | 是否返回文件下载链接，默认 false                                                   |
| includeThumbnail    | Boolean      | 否   | 是否返回资产缩放图 URL，默认 false                                                 |
| thumbnailWidth      | Integer      | 否   | 缩放图宽度（像素），includeThumbnail=true 时生效                                   |
| thumbnailHeight     | Integer      | 否   | 缩放图高度（像素），includeThumbnail=true 时生效                                   |
| softDeleteTimeOrder | String(Enum) | 否   | 软删除时间排序方式：`ASC`-正序，`DESC`-倒序；仅在 deleteStatus=SOFT_DELETED 时有效 |
| assetType           | String(Enum) | 否   | 资产类型：`IMAGE`-图片，`VIDEO`-视频，`AUDIO`-音频                                 |
| favorited           | Boolean      | 否   | 是否被收藏                                                                         |
| assetName           | String       | 否   | 资产名称（子串模糊匹配）                                                           |
| assetDescription    | String       | 否   | 资产描述（子串模糊匹配）                                                           |
| trusted             | Boolean      | 否   | 是否可信                                                                           |
| modelType           | String       | 否   | 生成资产的模型类型                                                                 |
| modelName           | String       | 否   | 生成资产的模型型号                                                                 |
| syncWhiteListStatus | String(Enum) | 否   | 同步白名单状态：`NOT_SYNCED` / `SYNC_SUCCESS` / `SYNC_FAILED`                      |
| syncOssDataStatus   | String(Enum) | 否   | 同步OSS数据状态：`NOT_SYNCED` / `IN_SYNCING` / `SYNC_SUCCESS` / `SYNC_FAILED`      |
| deleteStatus        | String(Enum) | 否   | 删除状态：`NORMAL` / `SOFT_DELETED` / `PERMANENTLY_DELETED`                        |
| beginTime           | String       | 否   | 资产生成时间起始（含），格式 ISO_LOCAL_DATE_TIME，如 `2023-10-25T14:30:00`         |
| endTime             | String       | 否   | 资产生成时间截止（含），格式 ISO_LOCAL_DATE_TIME，如 `2023-10-25T14:30:00`         |

### 响应 data

| 字段      | 类型                          | 说明         |
| --------- | ----------------------------- | ------------ |
| dataList  | List<ModelGeneratedAssetItem> | 资产列表     |
| preToken  | Long                          | 前一页游标   |
| nextToken | Long                          | 下一页游标   |
| hasNext   | Boolean                       | 是否有下一页 |
| hasPre    | Boolean                       | 是否有前一页 |

**ModelGeneratedAssetItem 结构：**

| 字段                | 类型    | 说明                                                                                                       |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| id                  | Long    | 主键 ID（分页游标 token）                                                                                  |
| gmtCreate           | Date    | 创建时间                                                                                                   |
| gmtModified         | Date    | 修改时间                                                                                                   |
| workspaceId         | String  | 工作空间ID                                                                                                 |
| tenantId            | String  | 租户ID                                                                                                     |
| aliyunUid           | String  | 阿里云子账号ID                                                                                             |
| aliyunMainId        | String  | 阿里云主账号ID                                                                                             |
| assetId             | String  | 资产 ID                                                                                                    |
| assetType           | String  | 资产类型：IMAGE/VIDEO/AUDIO                                                                                |
| assetSource         | String  | 资产来源：MODEL_GENERATED/OFFICIAL/USER_UPLOADED                                                           |
| favorited           | Boolean | 是否被收藏                                                                                                 |
| assetName           | String  | 资产名称                                                                                                   |
| assetDescription    | String  | 资产描述                                                                                                   |
| assetSize           | Long    | 资产大小（字节）                                                                                           |
| md5                 | String  | 资产 MD5                                                                                                   |
| ossBucket           | String  | 资产所在 OSS Bucket                                                                                        |
| ossKey              | String  | 资产在 OSS bucket 中的 key                                                                                 |
| region              | String  | 工作空间地域                                                                                               |
| ossRegion           | String  | 资产所在 OSS bucket 的地域                                                                                 |
| trusted             | Boolean | 是否可信                                                                                                   |
| modelType           | String  | 模型类型                                                                                                   |
| modelName           | String  | 模型型号                                                                                                   |
| syncWhiteListStatus | String  | 同步白名单状态                                                                                             |
| syncOssDataStatus   | String  | 同步 OSS 数据状态                                                                                          |
| deleteStatus        | String  | 删除状态：NORMAL/SOFT_DELETED/PERMANENTLY_DELETED                                                          |
| generateTime        | Long    | 资产生成时间戳（毫秒）                                                                                     |
| softDeleteDays      | Integer | 已被软删除的天数（仅当 deleteStatus=SOFT_DELETED 且请求 softDeleteTimeOrder 时返回）                       |
| originalOssUrl      | String  | 原始 OSS URL                                                                                               |
| downloadUrl         | String  | 文件下载链接（仅当请求 includeDownloadUrl=true 时返回）                                                    |
| thumbnailUrl        | String  | 资产缩放图 URL（仅当请求 includeThumbnail=true 时返回；视频返回首帧缩放图，图片返回缩放图，音频返回 null） |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "pageSize": 20,
  "includeDownloadUrl": true,
  "includeThumbnail": true,
  "thumbnailWidth": 200,
  "thumbnailHeight": 200,
  "assetType": "IMAGE",
  "favorited": true,
  "beginTime": "2024-01-01T00:00:00",
  "endTime": "2024-12-31T23:59:59"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "dataList": [
      {
        "id": 1001,
        "assetId": "asset-001",
        "assetType": "IMAGE",
        "assetName": "generated_image_01.png",
        "assetDescription": "A landscape painting",
        "favorited": true,
        "generateTime": 1700000000000
      }
    ],
    "nextToken": 1000,
    "hasNext": true,
    "hasPre": false
  }
}
```

---

## 13. 统计模型生成资产数量

**POST** `/zelda/api/v1/bailian/asset/countModelGeneratedAsset`

查询条件与 `listModelGeneratedAsset` 一致（不需要分页参数），按资产类型分组返回数量。

### 请求参数

| 字段                | 类型         | 必填 | 说明                                             |
| ------------------- | ------------ | ---- | ------------------------------------------------ |
| assetType           | String(Enum) | 否   | 资产类型：`IMAGE` / `VIDEO` / `AUDIO`            |
| favorited           | Boolean      | 否   | 是否被收藏                                       |
| assetName           | String       | 否   | 资产名称（子串模糊匹配）                         |
| assetDescription    | String       | 否   | 资产描述（子串模糊匹配）                         |
| trusted             | Boolean      | 否   | 是否可信                                         |
| modelType           | String       | 否   | 模型类型                                         |
| modelName           | String       | 否   | 模型型号                                         |
| syncWhiteListStatus | String(Enum) | 否   | 同步白名单状态                                   |
| syncOssDataStatus   | String(Enum) | 否   | 同步OSS数据状态                                  |
| deleteStatus        | String(Enum) | 否   | 删除状态                                         |
| beginTime           | String       | 否   | 资产生成时间起始（含），格式 ISO_LOCAL_DATE_TIME |
| endTime             | String       | 否   | 资产生成时间截止（含），格式 ISO_LOCAL_DATE_TIME |

### 响应 data

| 字段       | 类型 | 说明             |
| ---------- | ---- | ---------------- |
| imageCount | Long | 图片类型资产数量 |
| videoCount | Long | 视频类型资产数量 |
| audioCount | Long | 音频类型资产数量 |
| totalCount | Long | 总资产数量       |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "deleteStatus": "NORMAL"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "imageCount": 150,
    "videoCount": 30,
    "audioCount": 20,
    "totalCount": 200
  }
}
```

---

## 14. 批量获取资产下载链接

**POST** `/zelda/api/v1/bailian/asset/batchGetAssetDownloadUrl`

一次最多获取 100 个资产的下载链接。

### 请求参数

| 字段        | 类型         | 必填 | 说明                                       |
| ----------- | ------------ | ---- | ------------------------------------------ |
| assetIdList | List<String> | 是   | 待获取下载链接的资产ID列表，长度不超过 100 |

### 响应 data

| 字段  | 类型                       | 说明                             |
| ----- | -------------------------- | -------------------------------- |
| items | List<AssetDownloadUrlItem> | 资产下载链接列表，按请求顺序返回 |

**AssetDownloadUrlItem 结构：**

| 字段        | 类型   | 说明                                                       |
| ----------- | ------ | ---------------------------------------------------------- |
| assetId     | String | 资产 ID                                                    |
| downloadUrl | String | 资产下载链接（带签名）；资产不存在或缺少 OSS 信息时为 null |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetIdList": ["asset-001", "asset-002", "asset-003"]
}
```

---

## 15. 查询模型生成资产详情

**POST** `/zelda/api/v1/bailian/asset/getModelGeneratedAsset`

### 请求参数

| 字段               | 类型    | 必填 | 说明                                             |
| ------------------ | ------- | ---- | ------------------------------------------------ |
| assetId            | String  | 是   | 待查询的资产 ID                                  |
| includeDownloadUrl | Boolean | 否   | 是否返回文件下载链接，默认 false                 |
| includeThumbnail   | Boolean | 否   | 是否返回资产缩放图 URL，默认 false               |
| thumbnailWidth     | Integer | 否   | 缩放图宽度（像素），includeThumbnail=true 时生效 |
| thumbnailHeight    | Integer | 否   | 缩放图高度（像素），includeThumbnail=true 时生效 |

### 响应 data

| 字段 | 类型                    | 说明                     |
| ---- | ----------------------- | ------------------------ |
| item | ModelGeneratedAssetItem | 资产详情（结构同第12节） |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "assetId": "asset-001",
  "includeDownloadUrl": true,
  "includeThumbnail": true,
  "thumbnailWidth": 200,
  "thumbnailHeight": 200
}
```

---

## 16. 获取存储额度与用量

**POST** `/zelda/api/v1/bailian/asset/getStorageQuota`

### 请求参数

仅需公共参数（`workspace`、`tenantId` 必填）。

### 响应 data

| 字段              | 类型   | 说明                                          |
| ----------------- | ------ | --------------------------------------------- |
| freeStorageQuota  | Long   | 平台免费存储额度（单位：字节）                |
| usedStorageSize   | Long   | 当前用户已使用的存储量（单位：字节）          |
| extraStoragePrice | String | 超出免费额度的费用说明（如 "￥0.12元/GB/月"） |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

---

## 17. 查询用户 OSS Bucket 列表

**POST** `/zelda/api/v1/bailian/asset/listUserBuckets`

查询当前用户在指定地域下的 OSS bucket 列表，包含是否打标信息。

### 请求参数

| 字段         | 类型   | 必填 | 说明                              |
| ------------ | ------ | ---- | --------------------------------- |
| bucketRegion | String | 是   | bucket 所在地域，如 `cn-hangzhou` |

### 响应 data

| 字段    | 类型                 | 说明                     |
| ------- | -------------------- | ------------------------ |
| buckets | List<UserBucketInfo> | 指定地域下的 bucket 列表 |

**UserBucketInfo 结构：**

| 字段       | 类型    | 说明                                        |
| ---------- | ------- | ------------------------------------------- |
| bucketName | String  | bucket 名称                                 |
| tagged     | Boolean | 该 bucket 是否已按配置的 tag key/value 打标 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "bucketRegion": "cn-hangzhou"
}
```

---

## 18. 查询 Bucket 文件夹列表

**POST** `/zelda/api/v1/bailian/asset/listBucketFolders`

查询指定 bucket 下某个前缀下的文件夹列表（使用 delimiter="/" 实现文件夹层级发现）。

### 请求参数

| 字段         | 类型   | 必填 | 说明                                                    |
| ------------ | ------ | ---- | ------------------------------------------------------- |
| bucketName   | String | 是   | OSS bucket 名称                                         |
| prefix       | String | 否   | 文件夹前缀，如 `documents/`；为空时列出根目录下的文件夹 |
| bucketRegion | String | 是   | bucket 所在地域，如 `cn-hangzhou`                       |

### 响应 data

| 字段    | 类型         | 说明                                                             |
| ------- | ------------ | ---------------------------------------------------------------- |
| folders | List<String> | 文件夹列表（每项为完整的 common prefix，如 `documents/photos/`） |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "bucketName": "my-bucket",
  "prefix": "documents/",
  "bucketRegion": "cn-hangzhou"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "folders": ["documents/photos/", "documents/videos/", "documents/reports/"]
  }
}
```

---

## 19. 通用 MQ 消息发送

**POST** `/zelda/api/v1/bailian/asset/sendMqMessage`

向指定的 RocketMQ Producer 发送 JSON 格式的消息。producerType 对应 `EnumRocketMqProducerType` 枚举的 code 值，mainAccountUid 作为消息路由 key。

### 请求参数

| 字段         | 类型   | 必填 | 说明                                                                                                |
| ------------ | ------ | ---- | --------------------------------------------------------------------------------------------------- |
| producerType | String | 是   | 生产者类型：`WHITE_LIST_ASSET_PRODUCER` / `OSS_DATA_HANDEL_PRODUCER` / `ORIGIN_ASSET_INFO_PRODUCER` |
| messageBody  | String | 是   | JSON 格式的消息体字符串                                                                             |
| messageKey   | String | 否   | 消息 key（可选，为空时默认使用 mainAccountUid）                                                     |

### 响应 data

| 字段    | 类型    | 说明         |
| ------- | ------- | ------------ |
| success | Boolean | 是否发送成功 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890",
  "producerType": "ORIGIN_ASSET_INFO_PRODUCER",
  "messageBody": "{\"time\":1700000000000,\"modelId\":\"model-abc\",\"type\":\"IMAGE\",\"workspace\":\"ws-xxxxx\",\"ossUrl\":\"oss://my-bucket/path/to/asset.png\"}"
}
```

---

## 20. 查询 OSS 地域列表

**POST** `/zelda/api/v1/bailian/asset/listOssRegion`

返回系统支持的 OSS 地域列表，包含每个地域的 regionId 和 regionLabel（中文名称）。

### 请求参数

仅需公共参数。

### 响应 data

| 字段    | 类型                | 说明     |
| ------- | ------------------- | -------- |
| regions | List<OssRegionItem> | 地域列表 |

**OssRegionItem 结构：**

| 字段        | 类型   | 说明                               |
| ----------- | ------ | ---------------------------------- |
| regionId    | String | 地域ID（如 `cn-hangzhou`）         |
| regionLabel | String | 地域中文名称（如 `华东1（杭州）`） |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "regions": [
      { "regionId": "cn-hangzhou", "regionLabel": "华东1（杭州）" },
      { "regionId": "cn-shanghai", "regionLabel": "华东2（上海）" },
      { "regionId": "cn-beijing", "regionLabel": "华北2（北京）" }
    ]
  }
}
```

---

## 21. 查询模型列表

**POST** `/zelda/api/v1/bailian/asset/listModels`

返回当前服务管理的模型配置列表，按资产类型分组，包含每个模型的ID及是否可信标识。

### 请求参数

仅需公共参数。

### 响应 data

| 字段        | 类型             | 说明                         |
| ----------- | ---------------- | ---------------------------- |
| modelGroups | List<ModelGroup> | 按资产类型分组的模型配置列表 |

**ModelGroup 结构：**

| 字段      | 类型            | 说明                                  |
| --------- | --------------- | ------------------------------------- |
| assetType | String(Enum)    | 资产类型：`IMAGE` / `VIDEO` / `AUDIO` |
| models    | List<ModelItem> | 该类型下管理的模型列表                |

**ModelItem 结构：**

| 字段    | 类型    | 说明           |
| ------- | ------- | -------------- |
| modelId | String  | 模型ID         |
| trusted | Boolean | 该模型是否可信 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "modelGroups": [
      {
        "assetType": "IMAGE",
        "models": [
          { "modelId": "qwen-image-3.0", "trusted": true },
          { "modelId": "qwen-image-3.0-pro", "trusted": true }
        ]
      },
      {
        "assetType": "VIDEO",
        "models": [
          { "modelId": "wan2.7-t2v", "trusted": true },
          { "modelId": "wan2.7-i2v", "trusted": true }
        ]
      }
    ]
  }
}
```

---

## 22. 查询用户是否已开通资产中心服务

**POST** `/zelda/api/v1/bailian/asset/checkAssetServiceSubscription`

查询当前用户是否已开通资产中心服务。

### 请求参数

仅需公共参数（`mainAccountUid` 必填）。

### 响应 data

| 字段    | 类型    | 说明                                              |
| ------- | ------- | ------------------------------------------------- |
| enabled | Boolean | 是否已开通资产中心服务：true-已开通，false-未开通 |

### 请求示例

```json
{
  "workspace": "ws-xxxxx",
  "tenantId": "123456",
  "mainAccountUid": "1234567890"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```
