# 迭代一设计 · doc 组命令

> 命令：`doc upload` / `doc list` / `doc status` / `doc delete` / `doc tag` / `doc import-oss`
> 公共约定见 [README.md](README.md)。

## doc upload — 上传本地文件入库（编排命令）

**说明**：本迭代最复杂命令。把"本地文件 → 数据中心 →（可选）导入知识库"封装为一条命令，替代构建期最高频的控制台操作（S2.2 痛点:高）。对标竞品 add-file。

**编排四步**：

| 步                                 | API                                                | 输入                                                                          | 输出                                   |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| 1 申请租约                         | `POST /api/v1/connector/dash/applyFileUploadLease` | `category`(类目ID) + `fileName` + `sizeBytes`(字符串!) + `contentMd5`(Base64) | `leaseId` + `param.url/method/headers` |
| 2 OSS 上传                         | `PUT {param.url}`                                  | 文件二进制 + `param.headers`（含 `x-bailian-extra`、`Content-Type`）          | HTTP 200                               |
| 3 注册文件                         | `POST /api/v1/connector/dash/addFile`              | `leaseId` + `category` + `parser: "AUTO_SELECT"` + `tags?`                    | `fileId`                               |
| 4 导入（可选，传 `--index-id` 时） | `POST /api/v1/indices/rag/index/job/create`        | `indexId` + `dataSource: { sourceType: "DATA_CENTER_FILE", fileIds }`         | `ingestionId`                          |

坑位（实现注释必须标注）：

- `sizeBytes` 必须字符串；`contentMd5` = `crypto.createHash("md5").update(buf).digest("base64")`
- 租约/注册的类目参数名是 `category`，不是 `categoryId`
- 第 4 步 body 是嵌套 `dataSource: { sourceType, fileIds }`（实测；公开文档的平铺 `documentIds` 会报 `Index.InvalidParameter`）
- **第 4 步必须显式传 `sourceType`，不传会导入整个数据中心（API 文档明示的默认行为）**
- 步骤 2 走 OSS 域名不走 DashScope 网关，用原生 fetch 而非 ctx.client（无 Bearer 头）；失败归类 NETWORK

**Flags**：

| flag                                               | 类型   | 必填 | 说明                                                                                                                  |
| -------------------------------------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `--file <path>`                                    | array  | 是   | 本地文件路径，可重复；扩展名与大小按产品支持范围预校验（见下方格式白名单）                                            |
| `--index-id <id>`                                  | string | 否   | 注册后立即导入该知识库（触发第 4 步，多文件合并为一个 job）                                                           |
| `--category-id <id>`                               | string | 否   | 目标类目；缺省自动解析默认类目（listCategory 取 `isDefault: true`），解析失败报 GENERAL + hint 显式传 `--category-id` |
| `--tag <text>`                                     | array  | 否   | addFile tags，可重复                                                                                                  |
| `--wait` / `--poll-interval <s>` / `--timeout <s>` | —      | 否   | 与 `--index-id` 联用，轮询 job status 至终态                                                                          |

**validate**：`--wait` 无 `--index-id` → USAGE；文件不存在/不可读 → GENERAL + errno hint（沿用错误边界规范）。

**格式白名单与大小预校验**（依据 data/documents.md「支持的格式」，读文件前拦截，避免白传 OSS）：

| 类型   | 扩展名                     | 硬限（超限 USAGE）                                    |
| ------ | -------------------------- | ----------------------------------------------------- |
| 文档   | .doc .docx .ppt .pptx .pdf | 150 MB                                                |
| 表格   | .xls .xlsx                 | 10 MB（产品为“建议值”，超限降级为 stderr 警告不拦截） |
| 图片   | .png .jpg .jpeg .bmp .gif  | 20 MB（尺寸约束不做客户端校验，留服务端）             |
| 纯文本 | .md .txt .html             | 10 MB（同表格，警告不拦截）                           |

- 扩展名不在白名单 → USAGE，错误信息列出支持格式；白名单常量独立导出便于后续随产品更新
- 开放问题：create-kb.md 提及 .csv 但 documents.md 格式表未列——文档口径不一致，实现前向产品确认；确认前 .csv 暂入白名单（服务端拒绝会透传）

**输出**：

- text：每文件一行 `<fileName>  <fileId>  registered`；有导入时追加 `job: <ingestionId>`；--wait 结束追加终态
- json：`{ files: [{path, fileId}], index_id?, ingestion_id?, final_status? }`（编排命令无单一响应可透传，输出自定义稳定结构）
- quiet：仅 fileId 每行一个

**实现方案**：

- 文件 `doc-upload.ts`；多文件串行执行 1-3 步（首版不并发，避免 OSS 限流复杂化），全部注册成功后合并执行第 4 步
- 部分失败语义：任一文件步骤 1-3 失败即中止并报错，已成功的 fileId 列入错误 hint（幂等重传代价低）
- 默认类目解析结果进程内缓存（多文件只查一次）
- dry-run：不读文件内容（size/md5 以占位符表示），输出四步编排计划 `{ steps: [{step, endpoint, request}] }`

**测试方案**：

- help / 缺 `--file` exitCode 2 / `--wait` 无 `--index-id` exitCode 2
- 文件不存在 → 非零退出 + ENOENT hint；`.zip` 扩展名 → USAGE 列出支持格式
- dry-run：断言 steps 长度（带/不带 --index-id 为 4/3）、lease 请求 `sizeBytes` 为字符串类型、job 请求含 `sourceType: "DATA_CENTER_FILE"`
- live：上传 1KB 临时 md 文件 → 断言 fileId 前缀 `file_` → afterAll doc delete + 数据中心 deleteFile 清理

## doc list — 查询知识库文档列表

**说明**：列出库内文档及解析/索引状态，含 FAILED 发现（S2.3 / S5.2）。

**API**：`GET /api/v1/indices/rag/index/files`，query string：`index_id` + `page_num`（注意本接口是 page_num）+ `page_size`（默认 10，最大 100）。

**Flags**：`--index-id` 必填；`--page-number` / `--page-size`。

**输出**：

- text：每行 `doc_id  status  doc_name  doc_type  size`；status=FAILED 行红色高亮（TTY）；尾行 `total: N`
- json 透传；quiet 仅 doc_id

**实现/测试**：单 API 直映射（`doc-list.ts`）；dry-run 断言 query 参数名为 `page_num`；live 断言 rows 结构与 doc_id 前缀。

## doc status — 查询导入任务状态

**说明**：查导入任务进度，`--wait` 阻塞至终态供脚本串行（S2.3 痛点:高，L3 验收：FAILED 时非零 exit code）。

**API**：`GET /api/v1/indices/rag/index_job/status`，query string：`index_id` + `job_id`（**双必填，仅传其一服务端返回 SystemError，客户端前置双校验拦截**）+ 分页参数。

**Flags**：

| flag                                                                 | 必填 | 说明                                                                                    |
| -------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| `--index-id <id>`                                                    | 是   | 知识库 ID                                                                               |
| `--job-id <id>`                                                      | 是   | 导入任务 ID（kb create / doc upload 返回的 ingestionId；也见 doc list 的 ingestion_id） |
| `--page-number` / `--page-size`                                      | 否   | 任务含大量文档时分页                                                                    |
| `--wait` / `--poll-interval <s>`(默认 5) / `--timeout <s>`(默认 600) | 否   | 轮询至终态                                                                              |

**行为**：

- 终态 FINISH → exit 0；FAILED → `BailianError(GENERAL)` 透传服务端 message（含文档级失败明细摘要），exit 1
- `--wait` 超时 → TIMEOUT(5)
- 已知行为：库无进行中任务时接口可能返回 SystemError——hint 引导 "check ingestion_id via doc list"

**输出**：text 顶部任务总状态 + 文档级状态列表（FAILED 高亮）；json 透传。

**测试方案**：help / 缺任一必填（两条用例）/ dry-run 断言 query 含两个 id / live：配合 upload 用例拿真实 job 轮询到 FINISH；`--wait --timeout 1` 对慢任务断言 exitCode 5（若不稳定则仅静态覆盖超时路径，live 标记 skip 原因）。

## doc delete — 删除文档【危险操作】

**说明**：从知识库删除文档及其全部切片（S5.1 内容更新循环）。

**API**：`POST /api/v1/indices/rag/index/delete_file`，body `{ index_id, doc_ids }`（snake_case）。响应 `data.deleted[]` 为实际删除列表。

**Flags**：`--index-id` 必填；`--doc-id` array 必填（可重复）；`--yes`。

**实现方案**：`doc-delete.ts`；命令在 `risk` 对象中同时声明 `level: "high"` 和双语 `message`，由 runtime 在 `run()` 前统一确认；输出以 `data.deleted` 为准（与入参数量不一致时 text 模式警告差异）。

**测试方案**：help / 缺参×2 / dry-run 断言 `doc_ids` 数组 / 无 `--yes` 返回 exitCode 7 + `requires_confirmation` / live 配合 upload 清理链。

## doc tag — 批量更新文档标签

**说明**：批量打标，支撑标签过滤检索（S2.4）。

**API**：`POST /api/v1/connector/dash/batchUpdateFileTag`。`fileInfos`（1-20 项，每项 `fileId` + `tags`，单标签 ≤32 字符、单文件 ≤100 个、总长 ≤700）+ `updateMode`（OVERWRITE/APPEND）。

**Flags**：

| flag            | 必填 | 说明                                                                      |
| --------------- | ---- | ------------------------------------------------------------------------- |
| `--doc-id <id>` | 是   | 可重复，1-20 个（客户端预校验），映射 fileInfos[].fileId                  |
| `--tag <text>`  | 是   | 可重复，应用到所有 `--doc-id`（首版同一组标签批量打；异构标签用多次调用） |
| `--mode <m>`    | 否   | choices: `overwrite`/`append`，默认 `append`（追加比覆盖安全，作为缺省）  |

**实现/测试**：`doc-tag.ts` 单 API 直映射；客户端预校验标签长度约束（USAGE 前置拦截）；dry-run 断言 `updateMode: "APPEND"` 大写映射与 fileInfos 结构；live 打标后 listFile/describeFile 验证回读。

## doc import-oss — 从授权 OSS 批量导入

**说明**：从已 SLR 授权的 OSS Bucket 批量导入数据中心（大客户批量场景）。

**API**：`POST /api/v1/connector/dash/addFilesFromAuthorizedOss`。必填 `categoryId/categoryType/ossBucket/ossRegionId/fileDetails`（1-10 项，每项 `fileName+ossKey`）。返回 `data.fileIds`。

**Flags**：

| flag                 | 必填 | 说明                                         |
| -------------------- | ---- | -------------------------------------------- |
| `--bucket <name>`    | 是   | 映射 ossBucket                               |
| `--region <id>`      | 是   | 映射 ossRegionId（如 cn-beijing）            |
| `--oss-key <key>`    | 是   | 可重复，1-10 个；fileName 取 key 的 basename |
| `--category-id <id>` | 否   | 缺省走默认类目解析（复用 upload 的解析函数） |
| `--tag <text>`       | 否   | 可重复，≤10                                  |
| `--overwrite`        | 否   | switch，映射 overWriteFileByOssKey           |

固定值：`categoryType: "UNSTRUCTURED"`；`parser` 不暴露（默认 AUTO_SELECT，审慎原则——DASH_QWEN_VL_PARSER 等需配 parserConfig，使用方式未验证）。

**错误边界**：SLR 未授权的服务端权限错误原样透传，hint 附 RAM 控制台确认 `AliyunServiceRoleForBailian` 的指引（该指引来自 API 文档 Note，属可权威解释范围）。

**实现/测试**：`doc-import-oss.ts` 单 API 直映射；dry-run 断言 fileDetails 结构与 fileName 派生逻辑；live 依赖 OSS 授权环境，gating 追加 `BAILIAN_E2E_OSS_BUCKET` 环境变量，无则 skip。
