# RAG API 覆盖审计与音视频升级影响

核查日期：2026-09-23（Asia/Shanghai）。源码基线：`6406a415`，仓库 CLI 版本 `2.0.1`。

2026-09-24 范围确认：index/list 的 `knowledgeType`、`knowledgeScene`、`multimodalEmbeddingModelName` 缺失按**后端 bug**处理，默认由后端修复；CLI 不做字段推断或回填。后续 CLI 改造以[命令变更清单](2026-09-24-rag-cli-command-changes.md)为准，本文保留历史实测证据。

## 1. 结论

**接口路径覆盖较完整，但音视频创建、上传和结果消费尚未形成完整闭环。** 官方文档列出的 35 个 HTTP 操作，当前命令直接或间接调用了 34 个；缺少 `POST /api/v1/indices/rag/list/index/file/details`。这个数字只表示接口接入，**不表示参数、输出和业务场景完整支持**。

本次使用提供的真实资源确认：已有音视频知识库可以通过当前检索命令查询；问答 API 也能正常返回音视频来源。最需要修复的是：

1. **问答 JSON 模式的聚合与保真不足**：当前 `chat --output json` 不是原始响应透传，而是重建 `{answer, request_id}`，把工具摘要、规划文本、最终回答都拼进 `answer`，未保留结构化来源和用量。本次真实 SSE 回放中，生成阶段为 710 个字符，JSON 的 `answer` 为 4,111 个字符。文本/TTY/quiet 应按各自展示合同评估，省略结构化字段本身不一概判为错误，详见第 3.5 节。
2. **CLI 无法显式创建音视频类型知识库**：创建请求缺少 `knowledgeType` / `knowledgeScene`，也不能配置 `multimodalEmbeddingModelName`。
3. **本地音视频文件被上传白名单拒绝**：`.mp4` 等格式在发起请求前就失败；解析器又固定为 `AUTO_SELECT`，不能显式指定音视频解析器。
4. **音视频结果需要补齐结构化消费**：检索 JSON 已保留时间、媒体 URL 和画面描述；文本输出、类型声明以及问答引用输出仍不完整。

同时发现运行时检索过滤、临时会话文件、上下文缓存、完整工具调用历史等通用缺口。它们并非都由本次音视频升级引入，下面单独分类。

范围：只读查询、一次检索、一次问答，以及本地 dry-run / SSE 回放；未创建、上传、修改、部署或删除远端资源。没有修改产品代码。

## 2. 文档、证据与审计口径

入口：[API 概览](https://docs.rag.bailian.aliyun.com/api/overview)、[全站文档索引](https://docs.rag.bailian.aliyun.com/llms.txt)。从官方 Markdown 端点抓取 49 个不同页面，其中 API 目录 40 页，提取出 35 个 OpenAPI 操作；其余页面用于核对数据接入、限制、服务、多轮对话和更新记录。

- [来源清单与 SHA-256](../../output/rag-api-audit-2026-09-23/sources/manifest.json)：49 个页面的 URL、大小、摘要及抓取批次时间。
- [接口清单](../../output/rag-api-audit-2026-09-23/api-inventory.json)：按操作记录 HTTP method、path、请求字段。
- [脱敏实测证据](../../output/rag-api-audit-2026-09-23/evidence.json)：资源配置摘要、返回字段、request ID、SSE 统计和本地复现结果。
- 完整官方页面快照位于 `output/rag-api-audit-2026-09-23/sources/`，与清单逐项对应。原始响应中的媒体签名 URL、账号身份和服务提示词不写入报告或证据文件。

审计同时检查了 [产品命令注册](../../packages/cli/src/commands.ts)、[kscli 注册](../../packages/kscli/src/commands.ts)、[端点定义](../../packages/core/src/client/endpoints.ts)、[命令实现](../../packages/commands/src/commands/knowledge/)、[API 类型](../../packages/core/src/types/api.ts)、[管理面类型](../../packages/core/src/types/knowledge-admin.ts) 和现有知识库测试。

标记含义：**已接入**指存在调用路径；**部分**指已接入但有明确参数或输出缺口；**内部流程**指封装在复合命令中；**缺失**指没有找到对应端点与命令。下面对写接口的判断主要来自源码与文档，没有用生产资源做写入验证。

全局安装的 `bl` 为 `1.28.0`，不是本次源码基线。实测命令使用 `pnpm exec tsx packages/cli/src/main.ts`（已核验为 `2.0.1`）；未升级全局安装。命令中的 Workspace 由用户明确提供，不依赖本地默认配置。

## 3. 提供的三个资源：实测结果

Workspace：`ws-ffhp71sqprmwfkf5`。

| 对象     | ID                                     | 查询结果                                                                                                                                                                       |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 知识库   | `1uz4om722t`                           | 名称「音视频知识库【CLI测试】」；`structureType=unstructured`；`embeddingModelName=qwen3-vl-embedding`；`rerankModelName=qwen3-vl-rerank`；`chunkSize=2000`；`overlapSize=100` |
| 检索服务 | `aid-cfc4e54b7e3d4333b6a2378c8fe9a6da` | `scene=search`、`status=deployed`；有 `beta` 和发布版本 `1`，均绑定上述知识库                                                                                                  |
| 问答服务 | `aid-19292c4c7bd643018195460d75854a4c` | `scene=chat`、`status=deployed`；有 `beta` 和发布版本 `1`，均绑定上述知识库；生成模型 `qwen3.6-plus`、策略 `turbo`                                                             |

### 3.1 文件和解析

查询时有 7 个 MP4 文件，6 个 `FINISH`、1 个 `DOC_PARSING`。这只是本次快照，不应据此判定解析中的文件永久卡住，也不能把整个库判断成已全部就绪。

抽查《第四讲洗手，你真的会了么？.mp4》：

- 文件 ID：`file_30af65ac16c94e17a197c334779f673e_18355070`。
- 数据中心状态：`PARSE_SUCCESS`。
- 实际解析器：`DOCMIND_LLM_VERSION_MEDIA`。
- 文件大小：15,762,360 bytes。
- 指定该文件查询切片，返回 8 个片段。

直接只读调用未接入的 `list/index/file/details` 也成功返回 7 个文件。相较普通 `index/files`，本次第一条记录多出 `chunkSize`、`overlapSize`、`separator`、`chunkMode`、`enableHeaders`，因此两个接口不是完全等价的替代关系。

### 3.2 配置和实际结果存在字段差异

`knowledge info` 的原始记录中，`knowledgeType`、`knowledgeScene`、`multimodalEmbeddingModelName`、`multimediaVersion` 都是 `null`；但检索返回：

```json
{
  "_knowledge_type": "multimedia",
  "_knowledge_scene": "basic_multimedia_qa"
}
```

2026-09-24 已确认：其中 `knowledgeType`、`knowledgeScene`、`multimodalEmbeddingModelName` 缺失按**后端 bug**处理，默认后端修复；上述 null 是修复前的历史实测，不是 CLI JSON 序列化删除字段。CLI 正常接收并展示修复后的值，不通过模型名称、文件类型或额外检索推断/回填。修复前的 info 输出不能当作完整创建请求。`multimediaVersion` 的可写性和取值未在本次公开创建 schema 中得到确认，不建议猜值补入请求。

检索服务的发布配置中，每库与混排均使用 `qwen3-vl-rerank`，最终 `rerank_top_n=5`，每库 dense/sparse top-k 均为 50，最低分数为 0.2。问答服务使用相同的检索模型配置。

问答服务发布配置中 `enable_citation=false`、`enable_rich_text=false`、`enable_thinking=true`。这解释了为什么不能期待正文自动带完整引用标记；但本次 SSE **仍返回了结构化来源**，CLI 丢失这些来源是另一个独立问题。

### 3.3 检索成功，返回新增媒体字段

对发布检索服务查询「洗手的步骤」，成功返回 5 个切片。除常规 `doc_id` / `doc_name` / `content` 外，还出现：

| 字段                                   | 实测形态                             | 对消费端的影响                                                                       |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `video_url`                            | `string[]`                           | 一条切片可能携带媒体地址列表，不能按单 URL 处理                                      |
| `audio_url`                            | `[]`                                 | 本次为视频样本；空数组不能当作解析失败                                               |
| `image_url`                            | `string[]`                           | 片段关联的多帧图片，本次首个命中有 9 个 URL                                          |
| `clip_start_time` / `clip_end_time`    | `9000` / `28000`                     | 与标题「9秒-28秒」对应，样本显示采用毫秒；正式公开 schema 尚未明确这些字段的单位约定 |
| `clip_description`                     | 画面描述字符串                       | 与语音转写互补，不能只展示 `content`                                                 |
| `audio_segments`                       | 对象数组                             | 元素含 `start_time`、`end_time`、`sentence_id`、`speaker.name`、`content`            |
| `_knowledge_type` / `_knowledge_scene` | `multimedia` / `basic_multimedia_qa` | 可辅助识别返回形态；不要把内部打分字段当稳定业务接口                                 |

一个实际命中片段的脱敏结构如下，示意中的 URL 不可调用，长文本已省略：

```json
{
  "score": 0.7310585786300049,
  "metadata": {
    "title": "9秒-28秒",
    "clip_start_time": 9000,
    "clip_end_time": 28000,
    "clip_description": "<画面描述>",
    "content": "<语音转写>",
    "video_url": ["<signed-video-url>"],
    "audio_url": [],
    "image_url": ["<frame-url-1>", "<其余帧省略>"],
    "audio_segments": [
      {
        "start_time": 10760,
        "end_time": 27718,
        "sentence_id": 0,
        "speaker": { "name": "旁白" },
        "content": "<语音转写>"
      }
    ],
    "_knowledge_type": "multimedia",
    "_knowledge_scene": "basic_multimedia_qa"
  }
}
```

另一个 44,000–66,000 ms 的片段，其 `audio_segments` 时间为 27,718–75,480 ms，**语音段可能跨视频切片边界**。界面或工具应以 `clip_*` 定位视频片段，单独保留语音段时间，不假设两者边界相同。

抽查第一个 0–9 秒视频切片时，`metadata.content` 和 `node.text` 都为空，但 `clip_description`、视频 URL 和图片帧均有值。当前 `chunk list --output text` 只选择 `metadata.content ?? node.text`，会把有画面内容的切片显示成空正文。这是音视频升级带来的实际消费缺口。

### 3.4 问答 API 成功，CLI JSON 聚合存在实证问题

提问：「请概括知识库中洗手视频讲了哪些步骤，并指出相关视频片段。」

API 返回 HTTP 200、`text/event-stream`，耗时约 36.75 秒，共 178 个 JSON 数据帧。生命周期实测为 `tool_calling → tool_return → planning → generating`；因此不应把文档中的一种事件排列写死为唯一顺序。

| 内容         | 原始 SSE 中的结果                                                                               | 当前 CLI JSON 回放输出                         |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 最终回答     | `step=generating`，710 字符                                                                     | 与其他阶段混合                                 |
| 规划文本     | `step=planning`，2,205 字符                                                                     | 拼入 `answer`                                  |
| 工具返回摘要 | `step=tool_calling`，1,196 字符                                                                 | 拼入 `answer`                                  |
| 媒体来源     | `additional_kwargs.extra_json.docs` 中有 5 条，含时间、视频、图片、画面描述和 `_citation_index` | 丢失                                           |
| 用量         | `input_tokens=20493`、`output_tokens=1900`、`total_tokens=22393`、`cached_tokens=0`             | 丢失                                           |
| 最终 JSON    | 应分别保留回答、来源和用量                                                                      | 仅 `{answer, request_id}`，`answer` 长度 4,111 |

验证方法：只请求一次真实问答，保存 SSE 后，用当前 `chat.ts` 的 `run()` 和返回这份 SSE 的只读 mock client 本地回放，避免用两次模型调用差异来比较。4,111 恰好等于三个阶段字符数之和。

建议 JSON 的 `answer` 只聚合 assistant 的生成阶段；规划、工具消息、来源、用量应分字段保留。处理无 `step_change` 的增量帧时读取 `step`，必要时维护已知阶段。这里的 710/4,111 对比用于证明 JSON 的 answer 字段混入其他阶段，不表示人类阅读模式只能展示 710 个字符。

### 3.5 按输出模式分别定义合同（复核补充）

**实际行为与建议合同分开记录。** 服务端始终返回 SSE；CLI 的“流式/缓冲”由输出格式及 stdout 是否为 TTY 决定。当前没有独立的 `stream-json` 或 raw SSE 输出模式；`--verbose` 是诊断选项，不是保真输出格式。`--dry-run` 输出请求预览，不能用于证明响应字段被保留。

复核使用同一份真实 SSE，对 stdout.isTTY 做本地模拟，捕获 stdout/stderr，覆盖 8 种组合；未增加线上调用。完整结果见 [模式回放证据](../../output/rag-api-audit-2026-09-23/chat-output-modes.json)。这是命令层分支验证，不是完整终端 UI 或 HTTP verbose 日志测试。

| 模式                                             | 当前实际行为                                                                                 | 建议输出合同                                                                                                                                     | 判断                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `--output json`（TTY/非 TTY）                    | 均等待流结束，再输出 `{answer, request_id}`；answer 为 4,111 字符，无来源、usage、原始事件   | stdout 为一个完整 JSON；answer 仅最终回答，规划、工具调用/返回、媒体来源、usage 分别保留。若承诺无损，应保留原始事件及未知字段，不能只挑固定字段 | JSON 当前确实有信息裁剪，格式为 JSON 并不等于原始数据透传          |
| `--output text` + TTY                            | 逐帧显示所有 content，并在 stdout 插入阶段提示；不展示结构化来源/usage                       | 面向人阅读，可展示过程，但规划、工具过程、最终回答须可区分；可摘要展示来源和片段时间，无需打印全部 JSON；进度/诊断优先 stderr                    | 不把展示规划本身判为错误；重点是阶段区分、媒体信息可读性与通道分工 |
| `--output text` + 非 TTY（管道/重定向）          | 等待结束，输出全部 content 拼接文本，无阶段边界                                              | 默认 stdout 只保留最终回答，便于管道使用；如需要完整过程，应显式选择并保留边界                                                                   | 建议避免把混合过程作为“答案文件”；纯文本省略结构化字段属于格式取舍 |
| `--quiet` + 非 TTY（含 `--output json --quiet`） | quiet 优先，输出裸文本，当前仍混入规划/工具摘要；json+quiet 不返回 JSON                      | 延续 runtime 的裸主结果语义：仅最终回答，不显示过程、提示、来源摘要；明确 quiet 对 output 的优先级                                               | quiet 是有意精简的模式，不要求保留完整响应；混入过程需修正         |
| `--output text --quiet` + TTY                    | 先进入 TTY 流式分支，未使用 quiet 抑制阶段提示或过程                                         | 与非 TTY quiet 相同的语义，可流式打印最终回答，但不显示阶段提示/规划/工具摘要                                                                    | 已复现 quiet 在 TTY 下未生效于这些输出                             |
| `--verbose`                                      | TTY text 分支额外把步骤标签写入 stderr；JSON 聚合结构不变；本次 mock client 未覆盖传输层日志 | 只增加 stderr 诊断，不改变 stdout 的 JSON/文本合同；不能作为恢复丢失结构化来源的替代通道                                                         | JSON+verbose 仍只有 answer/request_id                              |

推荐先明确“JSON 保真、文本可读、quiet 最小主结果、verbose 只增诊断”这四类合同，再实现各模式。若新增 JSONL/SSE 逐事件模式，应单独命名和测试，不能直接改变现有 `--output json` 的单对象格式。JSON 如需保留完整事件，字段命名、数据体积与兼容策略还需设计；本报告不把建议格式当作已经存在的 API。

`search --output json` 与 `chat --output json` 的实现不同：前者直接 `emitResult(response)`，本次媒体字段完整保留；后者自行消费 SSE 后构建一个新对象。不能把检索模式的保真结论套到问答模式。

现有 chat E2E 主要断言 `answer` 非空和 `request_id` 存在，没有断言阶段隔离、来源、usage 或 TTY/quiet 组合。因此这些用例即使通过，也不足以证明 JSON 无损。后续应分别测试每种输出合同，而不是要求所有模式都输出完全相同的信息。

## 4. 全部 API 操作与当前实现对应表

为压缩表格，路径前缀约定如下；链接均指向本次抓取的官方页面：

- **R** = `/api/v1/indices/rag`
- **C** = `/api/v1/connector/dash`
- 命令列省略公共前缀 `bl knowledge`；`kscli` 复用相同命令实现，知识库命令映射到 `kb ...`，其他组基本保持同名。

| #   | 文档 / HTTP 操作                                                                                                 | 当前命令                             | 覆盖判断                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | [创建知识库](https://docs.rag.bailian.aliyun.com/api/search/create-index-v2)：POST `R/index/create_v2`           | `create`                             | 部分：缺类型、场景、多模态模型；结构和存储固定                                           |
| 2   | [知识库列表](https://docs.rag.bailian.aliyun.com/api/kb/list-indices)：GET `R/index/list`                        | `list`、`info`                       | 已接入；JSON 保留新增字段，文本详情未补音视频字段                                        |
| 3   | [更新知识库](https://docs.rag.bailian.aliyun.com/api/kb/update-index)：POST `R/index/update`                     | `update`                             | 已接入 name、description、rerankMinScore；不是知识类型转换接口                           |
| 4   | [删除知识库](https://docs.rag.bailian.aliyun.com/api/kb/delete-index)：POST `R/index/delete`                     | `delete`                             | 已接入，本次未执行                                                                       |
| 5   | [监控](https://docs.rag.bailian.aliyun.com/api/kb/get-monitor)：POST `R/index/monitor`                           | `stats`                              | 已接入，本次未做监控语义验证                                                             |
| 6   | [文档列表](https://docs.rag.bailian.aliyun.com/api/docs/list-documents)：GET `R/index/files`                     | `doc list`                           | 已接入，MP4 状态实测可读；分页参数差异见第 7 节                                          |
| 7   | [文件详情列表](https://docs.rag.bailian.aliyun.com/api/docs/list-file-details)：POST `R/list/index/file/details` | 无                                   | **端点缺失**；直接调用实测成功，详情字段更多                                             |
| 8   | [删除文档](https://docs.rag.bailian.aliyun.com/api/docs/delete-document)：POST `R/index/delete_file`             | `doc delete`                         | 已接入，本次未执行                                                                       |
| 9   | [新增切片](https://docs.rag.bailian.aliyun.com/api/chunks/add-chunk)：POST `R/index/chunk/create`                | `chunk add`                          | 已接入；官方明确不支持 multimedia，不能作为媒体导入替代方案                              |
| 10  | [切片列表](https://docs.rag.bailian.aliyun.com/api/chunks/list-chunks)：POST `R/index/chunklist`                 | `chunk list`                         | 已接入，媒体字段 JSON 可读；文本展示缺画面描述                                           |
| 11  | [更新切片](https://docs.rag.bailian.aliyun.com/api/chunks/update-chunk)：POST `R/index/chunk/update`             | `chunk update`                       | 已接入普通文本/可见性字段；媒体专属编辑未证实                                            |
| 12  | [删除切片](https://docs.rag.bailian.aliyun.com/api/chunks/delete-chunk)：POST `R/index/chunk/delete`             | `chunk delete`                       | 已接入；本次未验证 multimedia 删除行为                                                   |
| 13  | [提交导入任务](https://docs.rag.bailian.aliyun.com/api/search/submit-job)：POST `R/index/job/create`             | `doc upload --index-id` 内部流程     | 部分：只能导入本次新上传文件；缺已有文件/类目单独导入及本次导入切片配置                  |
| 14  | [导入状态](https://docs.rag.bailian.aliyun.com/api/search/get-job-status)：GET `R/index_job/status`              | `doc status`、create/upload 等待流程 | 已接入；状态查询含分页参数                                                               |
| 15  | [类目列表](https://docs.rag.bailian.aliyun.com/api/connector/list-category)：POST `C/listCategory`               | `category list`                      | 已接入；固定 UNSTRUCTURED 与当前公开 schema 一致                                         |
| 16  | [创建类目](https://docs.rag.bailian.aliyun.com/api/connector/add-category)：POST `C/addCategory`                 | `category add`                       | 已接入                                                                                   |
| 17  | [删除类目](https://docs.rag.bailian.aliyun.com/api/connector/delete-category)：POST `C/deleteCategory`           | `category delete`                    | 已接入，本次未执行                                                                       |
| 18  | [数据中心文件列表](https://docs.rag.bailian.aliyun.com/api/connector/list-file)：POST `C/listFile`               | `file list`                          | 已接入，支持过滤与游标                                                                   |
| 19  | [数据中心文件详情](https://docs.rag.bailian.aliyun.com/api/connector/describe-file)：POST `C/describeFile`       | `file get`                           | 已接入，实测返回音视频解析器和 PARSE_SUCCESS                                             |
| 20  | [删除数据中心文件](https://docs.rag.bailian.aliyun.com/api/connector/delete-file)：POST `C/deleteFile`           | `file delete`                        | 已接入，本次未执行                                                                       |
| 21  | [标签更新](https://docs.rag.bailian.aliyun.com/api/connector/batch-update-tag)：POST `C/batchUpdateFileTag`      | `doc tag`                            | 已接入                                                                                   |
| 22  | [上传租约](https://docs.rag.bailian.aliyun.com/api/connector/upload-lease)：POST `C/applyFileUploadLease`        | `doc upload` 内部流程                | 部分：未暴露 SESSION_FILE、useInternalEndpoint                                           |
| 23  | [注册文件](https://docs.rag.bailian.aliyun.com/api/connector/add-file)：POST `C/addFile`                         | `doc upload` 内部流程                | 部分：parser 固定，缺 parserConfig、categoryType、originalFileUrl                        |
| 24  | [OSS 导入](https://docs.rag.bailian.aliyun.com/api/connector/oss-import)：POST `C/addFilesFromAuthorizedOss`     | `doc import-oss`                     | 部分：缺每文件 parser/parserConfig、自定义 fileName 与类别选择；不受本地扩展名白名单限制 |
| 25  | [创建数据集合](https://docs.rag.bailian.aliyun.com/api/connector/add-connector)：POST `C/addConnector`           | `collection create`                  | 已接入 FILE 与 PLATFORM/CUSTOM OSS；不是缺失其他 connectorType（公开 schema 仅 FILE）    |
| 26  | [查询数据集合](https://docs.rag.bailian.aliyun.com/api/connector/get-connector)：POST `C/getConnector`           | `collection get`                     | 已接入                                                                                   |
| 27  | [知识检索](https://docs.rag.bailian.aliyun.com/api/knowledge/search)：POST `/api/v1/indices/knowledge/search`    | `search`                             | 部分：文本/图片/版本已支持，缺调用级 kb_search_configs；JSON 原样保留媒体结果            |
| 28  | [知识问答](https://docs.rag.bailian.aliyun.com/api/knowledge/chat)：POST `/api/v2/apps/knowledge/chat`           | `chat`                               | 部分：请求扩展字段、SSE 聚合、来源和工具历史有缺口                                       |
| 29  | [创建服务](https://docs.rag.bailian.aliyun.com/api/agent/create)：POST `R/app/create`                            | `service create`                     | 部分：只支持单个 index-id 的最小绑定，不能在创建时传完整 agent_config                    |
| 30  | [更新服务](https://docs.rag.bailian.aliyun.com/api/agent/update)：POST `R/app/update`                            | `service update`                     | 已有完整 config-file 透传；没有专用 flag 不等于配置能力缺失                              |
| 31  | [发布服务](https://docs.rag.bailian.aliyun.com/api/agent/deploy)：POST `R/app/deploy`                            | `service deploy`                     | 已接入，本次未执行                                                                       |
| 32  | [删除服务](https://docs.rag.bailian.aliyun.com/api/agent/delete)：POST `R/app/delete`                            | `service delete`                     | 已接入，本次未执行                                                                       |
| 33  | [服务列表](https://docs.rag.bailian.aliyun.com/api/agent/list)：POST `R/app/list`                                | `service list`                       | 已接入                                                                                   |
| 34  | [服务详情](https://docs.rag.bailian.aliyun.com/api/agent/get)：POST `R/app/get`                                  | `service get`                        | 已接入；实测可读 beta 和发布版本完整配置                                                 |
| 35  | [复制服务](https://docs.rag.bailian.aliyun.com/api/agent/copy)：POST `R/app/copy`                                | `service copy`                       | 已接入，本次未执行                                                                       |

## 5. 音视频升级影响：按链路拆解

### 5.1 知识库创建和上传：需要实质适配

官方 [create_v2](https://docs.rag.bailian.aliyun.com/api/search/create-index-v2) 对音视频库的类型组合是：

```json
{
  "structureType": "unstructured",
  "knowledgeType": "multimedia",
  "knowledgeScene": "basic_multimedia_qa"
}
```

这是**类型选择片段，不是完整可执行请求**。`knowledgeType` 和 `knowledgeScene` 须成对提供。当前 [kb-create.ts](../../packages/commands/src/commands/knowledge/kb-create.ts) 只构造默认文档库请求，即使用户把 `--embedding-model` 改成多模态模型，也不能等价替代这两个类型字段。

`multimodalEmbeddingModelName` 也没有配置入口。公开文档明确要求它用于 `image_qa` / `visual_perception_qa`，但没有明确写出 multimedia 的完整模型组合规则；本次实际库把 `qwen3-vl-embedding` 放在 `embeddingModelName`，而多模态字段为 null。**建议补齐模型字段能力，但不要未经新库验证就强制 multimedia 必填某个字段或写死某个模型组合。**

本次抓取的[容量限制](https://docs.rag.bailian.aliyun.com/settings/limits) 历史快照写单文件不超过 512 MB。**2026-09-24 用户确认本次升级上限提升到 2 GB，CLI 改造及验收以 2 GB 为准**；保留原始快照作为历史证据，不表示已实测 2 GB 上传。单次导入音频与视频合计最多 50 个的约束不因大小上限调整而改变。支持格式：

- 音频：`.aac`、`.amr`、`.flac`、`.flv`、`.m4a`、`.mp3`、`.mpeg`、`.ogg`、`.opus`、`.wav`、`.webm`、`.wma`。
- 视频：`.mp4`、`.mkv`、`.avi`、`.mov`、`.wmv`。

[upload-support.ts](../../packages/commands/src/commands/knowledge/upload-support.ts) 不包含这些扩展名。单文件路径会报错；目录扫描会将这些文件归入 skipped。空 `.mp4` 的本地 dry-run 已复现 `Unsupported file type: .mp4`，退出码 2，未发生上传。

[doc-upload.ts](../../packages/commands/src/commands/knowledge/doc-upload.ts) 两处注册请求都固定 `parser=AUTO_SELECT`。官方 [addFile](https://docs.rag.bailian.aliyun.com/api/connector/add-file) / [OSS 导入](https://docs.rag.bailian.aliyun.com/api/connector/oss-import) 已列出 `DOCMIND_LLM_VERSION_MEDIA`，本次真实文件也使用这个解析器。当前 CLI 应补 parser 选择，但**没有进行 AUTO_SELECT 上传实验，不能据此声称服务端自动选择一定失败**。

另外，上传实现对每个文件 `readFileSync` 后计算 MD5 并 PUT；提升到 2 GB 后，整文件 Buffer 的内存压力更大。顺序上传降低并发峰值，却不能消除单文件内存压力。建议媒体适配时一起评估流式读取/摘要/上传，不只增加后缀。

### 5.2 导入和状态：既有接口可复用，操作入口有缺口

音视频仍沿用文件注册、导入任务、状态查询，不需要凭空新增一套媒体任务 URL。现有 `doc list`、`doc status` 和轮询逻辑可复用，但应覆盖长时间 `DOC_PARSING`、解析失败、部分成功等用例。

通用缺口是：当前 `index/job/create` 仅在 `doc upload --index-id` 中用于新上传文件。`doc import-oss` 只把文件放入数据中心；已有 fileId 或 categoryId 缺少直接导入**既有**知识库的独立入口。创建新库可以用 `create --doc-id/--category-id`，这不能代替对既有库做增量导入。

官方提交导入接口还支持 `chunkMode`、`chunkSize`、`overlapSize`、`separator`、`enableHeaders`，当前上传入口没有暴露。它们属于通用导入缺口，不能未经验证就把字符切片配置解释为音视频的时间分段参数。

### 5.3 切片管理：只读可用，不应承诺任意媒体编辑

官方 [新增切片](https://docs.rag.bailian.aliyun.com/api/chunks/add-chunk) 明确排除 multimedia。应在 help / reference 中说明，而不是建议用 `chunk add --content` 把视频内容补回库中。

`chunk list --output json` 本次已经完整返回媒体 metadata；文本模式需要展示时间区间，并在转写为空时显示 `clip_description`。更新、删除媒体切片是否支持、是否影响帧/转写一致性，本次没有做写入试验，须向服务端确认或在独立测试库验证。

### 5.4 检索：调用入口不变，结果不再只是文本

公开检索请求仍为 `query`、`images`、`agent_id`、`agent_version`、`kb_search_configs`。没有在官方 schema 中找到音频/视频作为**查询输入**的 `audio` / `video` 参数。音视频知识库支持检索，不等于检索接口支持上传视频作为 query；不建议自行添加未经确认的请求字段。

当前 [search.ts](../../packages/commands/src/commands/knowledge/search.ts) 在 JSON 模式原样输出响应，因此本次媒体字段没有被裁剪；但 text/quiet 只打印 score 和 text，没有单独显示媒体 URL、画面描述及结构化定位信息。标题恰好带时间只能部分补偿，不能代替正式字段。

[KnowledgeSearchResponse](../../packages/core/src/types/api.ts) 中 `image_url` 写成 `string`、`page_number` 写成 `number`，与官方 schema 的数组类型不一致；且缺 `audio_url`、`video_url`、`_knowledge_scene` 和实测 `clip_*` / `audio_segments`。类型断言本身不会删除 JSON 字段，但会误导调用者和后续实现。建议对实测字段标注来源/可选性，并保留 metadata 的扩展能力。

### 5.5 问答：协议入口不变，必须保留工具返回和引用

问答仍使用 `/api/v2/apps/knowledge/chat`、`stream=true`。本次没有发现必须切换到另一个媒体问答端点，也没有公开的 audio/video content part 输入合同。

[chat.ts](../../packages/commands/src/commands/knowledge/chat.ts) 有两条输出路径：TTY text 直接显示每帧 `msg.content`，可作为过程展示，但应按第 3.5 节评估阶段和 quiet 语义；缓冲路径累加每帧 content，JSON 最后只保留 answer/request_id。JSON 的字段裁剪和 answer 阶段混合已实证，不应把 TTY 展示过程与 JSON 丢失结构化数据混为同一个问题。

JSON/保真输出应保留 `tool_return` 中的 `additional_kwargs.extra_json.docs`：本次每条来源含媒体与时间字段，且 `_citation_index` 可与正文引用关联。注意检索接口是 `nodes[].metadata`，本次问答工具来源是 `docs[]` **直接承载 metadata 字段**，不应把两种响应结构当成同一个外壳。

本次所有帧 content 都是字符串；官方 schema 还允许数组内容。当前类型只声明 string，TTY 写数组可能抛错后被 catch 忽略，缓冲路径可能做隐式字符串转换。这个分支属于源码/schema 推导风险，未在本次真实流中触发。

### 5.6 服务管理：已有 JSON 通道，大部分不需要新增端点

[service-update.ts](../../packages/commands/src/commands/knowledge/service-update.ts) 的 `--config-file` 会透传完整 `agent_config`，未知顶层字段只警告，不会剔除；嵌套的 `kb_search_configs` / `rerank` / `hybrid_rerank` 可通过它设置。普通标量 flag 的更新则先读取 beta，再合并写入，能保留未显式修改的媒体检索配置。

因此多模态 rerank 的专用 flag 缺失不是“无法配置”。真正需要改善的是：创建服务时接受完整配置、配置类型与示例、beta/发布版本的验证，以及整对象替换时明确保留原配置。

本次只是读取服务配置，没有打开 citation、改模型或重新部署。现有已发布服务可以继续测试文本检索和问答，不需要为此次审计重建。

## 6. 通用遗漏与使用体验问题

| 项目           | 当前状态与影响                                                                                                          | 建议                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 调用级检索过滤 | `KnowledgeSearchRequest` 和 `search` 都不支持请求 `kb_search_configs[].search_filters`；无法按本次问题动态限定文档/标签 | 增加 JSON 文件/结构化参数入口；与服务静态策略配置区分                          |
| 临时会话文件   | `chat` 无 `session_files`；上传又不能把 lease 和 addFile 同时设为 SESSION_FILE                                          | 补上传链路及最多 10 个文件 ID 的问答入口；不应假设临时音视频格式一定受支持     |
| 上下文缓存     | 缺 `agent_options.enable_cache_control`；usage/cached_tokens 也被丢弃                                                   | 增加可选开关并保留用量；这是公开更新日志 2026-09-14 的功能，不归因于音视频     |
| 自定义请求 ID  | `input.request_id` 无入口                                                                                               | 作为通用问答参数补充，并区分平台 request_id                                    |
| 完整工具历史   | JSON message 只接受 user/assistant；tool 消息会退化为普通 user 字符串                                                   | 支持工具历史/消息文件并做结构校验；对照官方多轮 cookbook                       |
| 纯图片检索     | 未传 query 会报缺参；**显式 `--query '' --image URL` 的 dry-run 成功**                                                  | 不是完全不支持纯图搜；修正 help 的“不能为空”，放宽互斥/至少一个输入校验        |
| 创建服务全配置 | create 只能构造单库最小绑定；update 已有全配置通道                                                                      | 可先创建再更新 beta；改善创建入口时避免把已有 update 能力计为缺失              |
| 文件标签上限   | import-oss 限 10 个；upload 直接透传；doc tag 校验 100 个/总长 700/单项 32；各命令约束不同                              | addFile schema 为最多 100 个；按各接口核对文案与校验，不把差异一概判为能力缺失 |

工具历史问题已用 dry-run 确认：输入 `{"role":"tool","tool_call_id":"call_demo","content":"tool result"}` 被编码成 `role=user`，content 是整个 JSON 字符串。官方 [多轮对话实践](https://docs.rag.bailian.aliyun.com/cookbook/multi-turn-chat) 要求保留 tool/tool_call_id；而 [chat schema](https://docs.rag.bailian.aliyun.com/api/knowledge/chat) 的输入 role 枚举仍只有 user/assistant，需同步确认并修正文档合同。当前 user/assistant JSON 对象会原样保留额外字段，所以不能笼统说所有 tool_calls 字段都会被解析器删除。

## 7. 文档与实现/实测不一致：不要直接照抄覆盖

| 差异                                | 证据与处理建议                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 知识库类型为 null                   | 已归为后端 bug：knowledgeType、knowledgeScene、multimodalEmbeddingModelName 由后端补齐；CLI 正常消费，不推断或回填                                        |
| 音视频时间与画面字段未完整入 schema | 公开 search 已写 audio_url/video_url，但 clip_start_time/clip_end_time/clip_description/audio_segments 仅本次实测发现；需补类型、单位、可空性及边界语义   |
| 文档列表分页名                      | 官方写 `page_number`；实现用 `page_num`，本次 page=1 成功不能证明非首页行为；保留现有实现并补第二页合同验证，不盲改                                       |
| create 描述长度                     | 官方 `description.maxLength=200`；实现校验 500；未做 201–500 字写入试验，列为待确认合同差异                                                               |
| create 类目导入 schema              | 文档描述支持 categoryIds，但 required 仍包含 docIds；现有 create 允许二选一。需修正 schema 表达，不能仅因 required 列表就删除现有类目能力                 |
| 导入任务注释陈旧                    | `RAG_PATHS.indexJobCreate` 注释仍说必须 nested dataSource；实际 doc-upload 已发 sourceType/docIds，最新官方页也写平铺字段。应清理注释，不照旧注释改坏实现 |
| 服务路径注释陈旧                    | 源码注释仍称官方使用 `/agent/`；本次全部 7 个服务页面已是 `/app/`，与实际代码一致                                                                         |
| chat 输入角色冲突                   | cookbook 要求 tool 历史，输入 schema 未包含 tool；输出实测首帧还有 control 角色，解析器应容忍不同角色而不是当最终回答                                     |
| 过滤语法自相矛盾                    | search 文档示例含 doc_id 与自定义字段，但非结构化限制又称仅 tags/meta；补 CLI 透传时不凭示例自行发明严格 whitelist，需服务端确认和测试                    |
| 升级发布日期                        | 官方 changelog 没有完整列出此次音视频升级；本报告是现状审计，不能把所有缺口都称为本次新增或回归                                                           |

## 8. 建议的适配顺序与验收条件

以下是后续工作建议，**不是已经实现的新命令或参数**。

| 优先级 | 工作                                        | 涉及实现                                                          | 验收重点                                                                                                                                      |
| ------ | ------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | 正确聚合 chat SSE；保留来源、用量、阶段信息 | chat.ts、core API 类型                                            | 用本次脱敏 SSE fixture 验证 answer 仅来自生成阶段；5 条 docs、citation index、媒体字段及 usage 不丢失；TTY、JSON、quiet 分别符合第 3.5 节合同 |
| P1     | 音视频上传与显式创建                        | upload-support.ts、doc-upload.ts、kb-create.ts、doc-import-oss.ts | 17 种官方扩展名、2 GB 边界（含超过旧 512 MB 的样本）、50 个媒体导入上限；parser 透传；类型/场景组合；独立测试库上传→索引→查询                 |
| P1     | 音视频结果类型与展示                        | api.ts、knowledge-admin.ts、search.ts、chunk-list.ts、kb-info.ts  | 空转写仍可见画面描述；媒体数组/空数组；时间单位和跨边界语音段；JSON 保留未知字段                                                              |
| P2     | 补文件详情接口和既有文件增量导入入口        | endpoints.ts、commands、bl/kscli map                              | 不重传文件即可导入既有库；文件详情额外配置字段可见；sourceType 必须明确，避免误导入整个数据中心                                               |
| P2     | 在线 search_filters                         | search.ts、请求类型                                               | 绑定库 ID、重复 ID、大小限制、与离线过滤 AND 合并；tags/meta/doc_id 语义以确认合同为准                                                        |
| P2     | 工具历史、session_files、缓存与请求 ID      | chat.ts、上传流程、类型                                           | 多轮 tool_call_id 关联正确；session 类型两处一致；缓存开关 true/false；usage 可追踪                                                           |
| P2     | 完整创建服务配置                            | service-create.ts、service-update.ts                              | beta 中验证，发布版本与草稿隔离；不覆盖原有媒体 rerank；全配置替换行为明确                                                                    |
| P3     | help、限制、旧注释、schema 对齐             | 命令双语文案、reference、知识库文档、测试                         | 纯图搜示例可执行；chunk add 的媒体限制明确；不把服务端不支持写成 CLI bug                                                                      |

建议回归集至少包括：普通文档原流程、已有视频库只读路径、新建视频库全流程、独立音频样本、静音/纯画面片段、长语音跨片段、非首页分页、多轮工具历史、规划与生成分离、未知 metadata 保留。

本次真实资源仅含 MP4；**音频文件上传/检索、媒体新库创建、媒体切片修改删除、AUTO_SELECT 行为、图像输入检索、缓存命中均未实测**。这些是后续验证范围，不能用本报告的成功检索推导为已全部支持。

实现时遵循仓库分层：core 放类型与端点，commands 放逻辑，bl/kscli 各自登记路径；用户可见文案中英同步，刷新生成 reference。服务端错误继续原样透传。相关维护清单：[命令增删改](../agents/command-add-remove.md)、[选项变更](../agents/command-flag-change.md)、[CLI E2E](../agents/cli-e2e-tests.md)。本次属于现有命令与参数维护的前置审计，方法沉淀在本报告，不额外新增重复的 AGENTS 场景。

## 9. 可复核的只读命令与 request ID

以下命令使用仓库源码入口；从仓库根目录执行。除 search/chat 推理调用外，其余为读取已有资源。若后续安装版本与本次不同，以源码基线和本次证据为准。

```bash
pnpm exec tsx packages/cli/src/main.ts knowledge info \
  --index-id 1uz4om722t --workspace-id ws-ffhp71sqprmwfkf5 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge doc list \
  --index-id 1uz4om722t --workspace-id ws-ffhp71sqprmwfkf5 --page-size 100 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge service get \
  --agent-id aid-cfc4e54b7e3d4333b6a2378c8fe9a6da \
  --workspace-id ws-ffhp71sqprmwfkf5 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge service get \
  --agent-id aid-19292c4c7bd643018195460d75854a4c \
  --workspace-id ws-ffhp71sqprmwfkf5 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge search \
  --query '洗手的步骤' --agent-id aid-cfc4e54b7e3d4333b6a2378c8fe9a6da \
  --workspace-id ws-ffhp71sqprmwfkf5 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge chunk list \
  --index-id 1uz4om722t --doc-id file_30af65ac16c94e17a197c334779f673e_18355070 \
  --workspace-id ws-ffhp71sqprmwfkf5 --output json

pnpm exec tsx packages/cli/src/main.ts knowledge file get \
  --file-id file_30af65ac16c94e17a197c334779f673e_18355070 \
  --workspace-id ws-ffhp71sqprmwfkf5 --output json
```

问答实测直接调用官方 SSE 端点，随后本地回放当前 chat 实现；不是声称执行过两次线上问答。未接入的文件详情接口也通过原始 HTTP 只读调用。鉴权均复用本地 API Key，未将 Key 写入命令行或报告。

| 调用                 | request ID                                             |
| -------------------- | ------------------------------------------------------ |
| 文档列表             | `5d516e13-11c0-9603-a10f-e567c76ea85c`                 |
| 检索服务详情         | `fdb408ed-d443-96bb-b819-4ecb8072dd1b`                 |
| 问答服务详情         | `dccf4bc0-0776-9738-a874-a43bb7c9a128`                 |
| 检索                 | `2763567d-7045-986e-bcd4-788e2e83ddd6`                 |
| 切片列表             | `e60372e4-9191-9047-85eb-0a87d9967eb4`                 |
| 文件详情             | `23cfc98c8c3e4e80832c9fcb8225df52`（字段名 requestId） |
| 未接入的文件详情列表 | `65132fbe-3864-9e7d-a802-69d7be40897d`                 |
| 问答 SSE             | `a835a700-f652-9619-813a-bf2098b676e6`                 |

本次另尝试了 `workspace list`，由于没有 console token 未成功；随后使用用户提供的 Workspace 完成全部目标资源核查，未触发登录或改配置。

## 10. 本次验证记录

- 49 份来源快照的大小及 SHA-256 与 manifest 一致；35 个 OpenAPI 操作完成路径对照。
- 报告中的本地文件链接全部存在；证据文件通过 JSON 解析、资源数量及 SSE 字符数断言。
- 文档通过限定文件范围的 `pnpm exec vp check --fix docs/knowledge/2026-09-23-rag-api-audit.md` 格式检查。
- 实际核查与本地复现见第 3、6、9 节；没有声称跑过全仓 `vp test`，本次交付仅为文档和证据资产。

- 模式复核补充：同一真实 SSE 本地回放 8 种 output/TTY/quiet/verbose 组合，确认 JSON 聚合、quiet 优先级和 TTY 分支差异，见第 3.5 节及 chat-output-modes.json。
