# RAG 改造：CLI 命令变更清单

开发执行入口：[开发计划](../superpowers/plans/2026-09-24-rag-multimedia-cli.md)。

日期：2026-09-24。依据：[RAG API 审计及实测](2026-09-23-rag-api-audit.md)。配套：[测试用例变更清单](2026-09-24-rag-cli-test-changes.md)。本文按命令归纳改造范围，供评审和拆分开发任务；标为“拟新增”的命令、参数及输出字段尚未实现。

## 1. 已确定的边界

`GET /api/v1/indices/rag/index/list` 返回的 `knowledgeType`、`knowledgeScene`、`multimodalEmbeddingModelName` 为空，**按后端 bug 处理，默认由后端修复**。CLI 的任务是补类型、展示和正常字段的测试，不从模型名称、文件后缀、检索结果反推这三个字段，不增加探测请求或修复写入。字段临时缺失时按普通可选值展示，不改变服务端原始 JSON。

此前实测仍作为历史证据保留，不代表后端已经修复。`multimediaVersion` 不在这次明确归属的三个字段内；创建 schema 未明确其写入合同，本轮不新增对应 flag、不猜测取值。

本次范围分为两组：

- **音视频主线**：创建知识库、文件接入、增量导入、查看文档/切片、检索和问答结果消费。
- **通用补齐**：在线过滤、会话文件、缓存、工具历史、完整服务配置。与主线涉及相同命令，但不必全部绑定音视频首批交付。

`bl` 与 `kscli` 共享 commands 实现。下文每项同时列两个入口，避免只改其中一个产品。本文只整理方案，不修改命令代码或远端资源。

## 2. 命令总表

| 命令：bl                          | 命令：kscli             | 变更性质       | 本次需要做什么                                                                                 | 分组                     |
| --------------------------------- | ----------------------- | -------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| `knowledge create`                | `kb create`             | 参数扩展       | 支持知识类型、场景、多模态 Embedding；可以显式创建 multimedia 库                               | 音视频主线               |
| `knowledge list`                  | `kb list`               | 类型/展示      | 正常消费后端修复后的类型字段；文本列表增加知识类型，JSON 保持透传                              | 音视频主线               |
| `knowledge info`                  | `kb info`               | 类型/展示      | 显示 knowledgeType、knowledgeScene、multimodalEmbeddingModelName；继续使用 index/list 精确筛选 | 音视频主线               |
| `knowledge doc upload`            | `doc upload`            | 参数/上传流程  | 放开音视频格式、媒体大小/数量限制、选择 parser、处理大文件上传                                 | 音视频主线               |
| `knowledge doc import-oss`        | `doc import-oss`        | 参数扩展       | 支持 parser/parserConfig；沿用数据中心导入职责                                                 | 音视频主线               |
| **拟新增 `knowledge doc import`** | **拟新增 `doc import`** | 新命令         | 把已有 fileId 或 categoryId 导入既有知识库；可等待任务完成                                     | 音视频主线，也补通用缺口 |
| `knowledge doc list`              | `doc list`              | 接入缺失接口   | 拟增加 `--details`，调用文件详情列表接口；默认保持原列表接口                                   | 音视频主线，也补通用缺口 |
| `knowledge doc status`            | `doc status`            | 验证/说明      | 保留状态查询与等待；覆盖媒体长解析、分页和部分失败，不增加媒体专用状态接口                     | 音视频主线               |
| `knowledge file get`              | `file get`              | 回归验证       | 已展示 parser、文件类型和解析状态，无需重复新增；验证媒体值和原始 JSON                         | 音视频主线               |
| `knowledge chunk list`            | `chunk list`            | 输出调整       | 展示片段时间、画面描述、转写及媒体引用；JSON 不裁剪 metadata                                   | 音视频主线               |
| `knowledge chunk add`             | `chunk add`             | 文案/边界      | 明确服务端不支持 multimedia 新增切片；不伪造媒体写入能力                                       | 音视频主线               |
| `knowledge search`                | `search`                | 输出＋参数     | 媒体结果展示与类型；通用项补在线过滤、改善纯图检索参数                                         | 主线＋通用补齐           |
| `knowledge chat`                  | `chat`                  | 输出合同＋参数 | 按 JSON/text/TTY/quiet 区分输出，保留媒体来源；通用项补工具历史、会话文件、缓存等              | 主线＋通用补齐           |
| `knowledge service create`        | `service create`        | 参数扩展       | 支持完整 agent_config 创建，多库/多模态检索配置可一次传入                                      | 通用补齐                 |
| `knowledge service get`           | `service get`           | 展示           | 补每库和混排 rerank 的关键配置展示，JSON 保持完整                                              | 音视频配置可观测性       |
| `knowledge service update`        | `service update`        | 验证/文案      | 沿用现有 config-file 透传；验证媒体配置保留，不重复新增全套嵌套 flag                           | 音视频配置兼容           |

推荐新增 **1 个命令 `doc import`**，并扩展现有 **`doc list --details`** 来接入缺失接口。文件详情接口本身是列表接口，优先复用现有分页命令；若另设 `doc details` 会增加近似列表入口，没有必要把它命名为单文档 `doc info`。

## 3. 每条命令的输入、输出和验收

### 3.1 `knowledge create` / `kb create`

新增 `--knowledge-type`、`--knowledge-scene` 映射 knowledgeType、knowledgeScene。音视频/视觉理解场景的 `--multimodal-embedding-model` 与 `--embedding-model` 是互斥别名，均映射 embeddingModelName；其他场景的显式多模态字段沿用 multimodalEmbeddingModelName。

为控制此次范围，首批明确支持原有 document 与新增 multimedia，不因增加类型 flag 就宣称 table/image 的完整创建流程已支持。音视频组合为 `unstructured + multimedia + basic_multimedia_qa`。建议指定 multimedia 且未指定场景时，由 CLI 补固定场景，并在 dry-run 显示实际请求；显式冲突的组合报参数错误。普通库未指定新参数时保持现有创建行为。

**模型字段处理（已按管控台及只读配置修正）**：音视频默认 embeddingModelName=qwen3-vl-embedding、rerankModelName=qwen3-vl-rerank、rerankMode=similar；不能误填图片分支的 multimodalEmbeddingModelName。普通文档默认 text-embedding-v4 保持不变，具体模型候选由后台配置及服务端校验负责。

验收：旧文档创建请求不变；媒体创建请求含正确类型/场景；dry-run 可审阅；独立媒体库完成导入与查询。媒体文件/类目超过单次导入上限时应明确分批或报错，不把最多 50 个媒体解释成知识库总容量。

### 3.2 `knowledge list/info` / `kb list/info`

请求路径不变。list 文本增加类型列；info 基础信息补类型与场景，索引信息补多模态 Embedding。JSON 沿用现有形态：list 返回完整响应，info 返回选中的 row。

后端三个字段修复是联调依赖，不增加 CLI 推断或回填逻辑。验收同时覆盖有值与可选值为空的显示；新增字段不得把 image/audio/video 元数据混入库配置。

### 3.3 `knowledge doc upload` / `doc upload`

扩展官方 17 种音视频后缀，单文件上限按本次确认从 512 MB 提升到 **2 GB**；目录扫描应纳入音视频。拟增加 `--parser` 和 `--parser-config-file`，注册请求分别映射 parser/parserConfig；保留 AUTO_SELECT，并允许显式 `DOCMIND_LLM_VERSION_MEDIA`。

上传租约、OSS PUT、注册文件、可选导入任务的顺序保持不变。按 2 GB 上限适配时采用流式读取、MD5 计算和上传，避免整文件读入内存，明确上传超时、失败后已注册 fileId 的输出；媒体单批导入数量限制在知识库导入阶段执行。解析参数文件应支持 dry-run 本地校验。

验收：后缀大小写、目录混合文件、超过旧 512 MB 的文件、2 GB 上限及超限边界、媒体导入数量、明确 parser 的请求映射、部分成功提示；确认 AUTO_SELECT 对媒体的实际行为。不能因为允许 .mp4 就声称已通过媒体上传闭环。

### 3.4 `knowledge doc import-oss` / `doc import-oss`

拟增加 `--parser`、`--parser-config-file`，应用到每个 `fileDetails[]` 元素。首批统一应用于本批文件，需要混合 parser 时拆批调用，避免立刻引入复杂逐文件配置格式。

仍只注册到数据中心，返回 fileId；导入既有知识库交给新 `doc import`。保留此接口每次最多 10 个对象的约束，不能把媒体导入最多 50 个直接套到 OSS API。

验收：默认请求不变、MEDIA parser 正确位于 fileDetails 元素内、成功/失败 fileId 可用于下一步。自定义 fileName、SESSION_FILE 等扩展放到通用补齐阶段。

### 3.5 拟新增 `knowledge doc import` / `doc import`

用途是把**数据中心已有文件加入已有知识库，并触发解析/索引任务**，不是上传文件，也不是创建知识库。例如文件已经通过控制台或 OSS 注册并获得 fileId，希望加入另一个已有知识库时，使用这个入口，无需再次传输文件内容。

| 命令                                    | 数据流向                                            |
| --------------------------------------- | --------------------------------------------------- |
| `doc upload`                            | 本地文件 → 数据中心；带 `--index-id` 时还会接着入库 |
| `doc import-oss`                        | 已授权 OSS 文件 → 数据中心，返回 fileId             |
| 拟新增 `doc import`                     | 数据中心已有 fileId/categoryId → 已有知识库         |
| `kb create`（bl 为 `knowledge create`） | 数据中心文件/类目 → 创建新知识库并入库              |

目标 API：`POST /api/v1/indices/rag/index/job/create`。拟用法：`--index-id <id> (--doc-id <id> ... | --category-id <id> ...) [--wait] [--poll-interval <seconds>]`。

两种数据源互斥并至少选择一种；明确传 sourceType 与 docIds/categoryIds，不允许省略 sourceType 导致整个数据中心被导入。复用已有任务轮询与失败输出，返回 ingestionId。以创建接口使用的 `--doc-id` 命名保持 CLI 一致，help 明确这里传的是数据中心 fileId。

普通文档导入配置可补 `--chunk-mode`、`--chunk-size`、`--overlap-size`、`--separator`、`--enable-headers`，对应公开 API。它们不等同于媒体时间切片参数，不能解释为按秒切分视频。对类目导入的媒体数量不能用 categoryId 个数代替文件数，应以实际文件或服务端校验为准。

验收：已有文件无需重新上传即可入库；文件与类目两条路径；等待/不等待；失败明细与部分成功；空数据源在网络请求前报错。

### 3.6 `knowledge doc list` / `doc list`

拟增加 `--details`。默认仍调用 GET `/index/files`；details 模式调用 POST `/list/index/file/details`，映射 indexId/pageNumber/pageSize。保持 CLI 的 `--page-number` / `--page-size` 词汇统一，不把后端命名差异暴露成两套分页 flag。

JSON 保留所选接口完整响应；text details 展示 chunkSize、overlapSize、separator、chunkMode、enableHeaders 等文件级配置。不要混淆数据中心 `file get` 与知识库内文件详情。

验收：两条 endpoint 与 GET query/POST body 分别正确；第二页生效；新增详情字段可见；旧命令输出默认不切接口。

### 3.7 `knowledge doc status`、`knowledge file get`

status 不新增媒体专用请求参数；重点覆盖 DOC_PARSING、FINISH、失败和长任务等待，保证只读查询可重复使用。分页下未显示的失败文件不能被当成不存在，需要验证现有轮询对 total_count 和终态的处理。

file get 已在文本详情显示 parser、fileType、status，本轮保持接口与输出，补媒体样本回归即可；JSON 不裁剪。用于确认源文件确实采用 MEDIA 解析器，与“索引已完成”分开判断。

### 3.8 `knowledge chunk list/add`

chunk list：JSON 继续透传；text 展示 title、clip_start_time/clip_end_time、clip_description、转写及媒体来源。空转写应显示画面描述，不能把 `content=""` 判成空切片。时间按经确认的单位格式化，保留原始 JSON；audio_segments 可能跨 clip 边界。

chunk add：补中英 help/reference，明确 multimedia 不受支持。无需为此引入额外知识库查询；服务端拒绝仍原样透传。chunk update/delete 本轮不扩展媒体字段，媒体写入边界单独验证。

### 3.9 `knowledge search` / `search`

**主线**：JSON 保持完整响应；text 增加片段时间、画面描述与可用媒体来源。补 metadata 数组类型及实测可选字段，保留未知字段。既有 query/image/agent-version 请求合同保持兼容，不自行增加 audio/video 查询输入。

**通用补齐**：拟增加 `--kb-search-configs-file`，只承载本次请求的库 ID 与 search_filters；策略仍归 service 配置。纯图片调用允许省略 query，由 CLI 发空串，校验文本/图片至少有一个有效输入；现有 `--query '' --image` 继续有效。

验收：视频片段与静音画面命中、媒体数组为空、JSON 未知字段保留、在线过滤请求不覆盖离线策略、纯文本回归。过滤字段允许范围以确认后的后端合同为准，不根据矛盾文档添加猜测式 whitelist。

### 3.10 `knowledge chat` / `chat`

**主线先明确输出合同**：

| 模式          | 改造目标                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON          | 保留 answer/request_id 兼容入口；answer 只含最终回答，规划、工具记录、来源、usage 分开。要承诺无损则须保留原始事件及未知字段，具体新增字段结构在实现设计中确定 |
| text + TTY    | 可以展示过程，但阶段清晰；支持来源与媒体片段摘要；不能把“显示规划”本身当成 bug                                                                                 |
| text + 非 TTY | 默认 stdout 为最终回答，适合管道；过程需要明确边界和显式约定                                                                                                   |
| quiet         | 仅最终回答；TTY 也遵守；延续 quiet 优先裸结果的语义并明确 json+quiet 行为                                                                                      |
| verbose       | 增加 stderr 诊断，不改变主结果格式                                                                                                                             |

复用同一 SSE 解析/聚合结果，再分别渲染，避免每个模式维护不同的消息理解逻辑。来源来自 tool_return 的 docs，包含媒体、时间和 citation index；answer 不混入工具摘要和 planning。测试覆盖事件顺序变化、缺 step_change、content 数组、服务端错误帧及未知字段。

**通用补齐，建议另批**：消息文件/完整 tool 历史、session_files、enable_cache_control、input.request_id。拟入口分别为 `--messages-file`、可重复 `--session-file-id`、`--enable-cache-control`、`--request-id`；这些是方案名，不是现有 flag。消息文件和现有 message/image 的组合规则需明确，工具 role 合同须先与后端对齐。

session_files 还依赖 doc upload 的 SESSION_FILE 支持：lease 与 addFile 同时传 categoryType，不能只加 chat flag 就认为整条链路完成。缓存和用量按阶段保留，不能把多个累计帧直接相加。没有必要为音视频升级新建一个 chat endpoint 或默认启用缓存。

### 3.11 `knowledge service create/get/update`

create：拟增加 `--config-file`，复用 update 的 agent_config 校验/透传。与快捷 `--index-id` 互斥，避免配置来源不明确；未传时保持现有行为。可一次创建多库、每库 rerank 和 hybrid_rerank 配置。

get：text 增加每库及混排模型、top-n、阈值等关键摘要；JSON 不裁剪原配置。无需新增“音视频服务类型”，场景仍是 search/chat。

update：已有 config-file 能力足够，保持未知字段透传、标量更新的读取-合并-写入。补测试验证更新其他设置后，媒体 rerank、绑定库和未知配置未丢失；文档明确 config-file 是整对象替换。具体标量 flag 按使用频率选择，不为本轮把所有嵌套字段展平成 flag。

deploy/copy/list/delete 的协议不因媒体升级改变。通过 beta 查询验证配置后再部署的现有流程继续沿用。

## 4. 本轮无需新增协议或参数的命令

| 命令（省略 `bl knowledge`；kscli 知识库组使用 `kb`） | 处理方式                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `update`、`delete`、`stats`                          | 保持现有更新/删除/监控合同；update 不承担转换知识类型或修复后端字段 |
| `doc delete`、`doc tag`                              | 沿用 docId 和标签接口；媒体文件复用同一流程，做回归即可             |
| `file list`、`file delete`                           | 既有文件类型/状态值透传；不增加另一套媒体文件命令                   |
| `chunk update`、`chunk delete`                       | 本轮不添加媒体编辑字段、不承诺未验证的写入能力                      |
| `service list/deploy/copy/delete`                    | 复用现有版本与生命周期管理，验证媒体配置不受影响                    |
| `category list/add/delete`、`collection create/get`  | 原有数据中心组织方式不变，不新增媒体专属类目协议                    |

标签数量、描述长度、旧注释和分页文档差异按原审计单独跟踪；不把未经确认的服务端限制变动混入这次媒体功能范围。

## 5. 建议拆分和完成标准

| 批次          | 命令范围                                                              | 可交付结果                                                          |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A：输入闭环   | create、doc upload、doc import-oss、新 doc import                     | 从本地/OSS/已有文件创建并补充媒体知识库，任务可查询                 |
| B：查看与检索 | list/info、doc list/status、file get、chunk list/add、search 媒体输出 | 库类型、解析方式、状态和媒体片段可观察；后端三字段修复正常接入      |
| C：问答输出   | chat 各输出模式                                                       | JSON 保留来源与用量，回答与过程分离，TTY/quiet 行为一致遵守各自合同 |
| D：通用补齐   | search 在线过滤、chat 扩展参数、service create/get/update             | 动态过滤、多轮工具历史、临时文件、缓存、完整服务配置分别交付        |

每批同步 core 类型、commands 实现与双语文案；新命令同步 commands 导出、bl/kscli 注册、E2E topic routes、生成 reference 和两套知识库使用文档。普通文档库默认行为、JSON 兼容入口及未知字段透传必须有回归覆盖。

媒体大小、批量数量、分批与失败边界用离线 mock 验证，不提交大视频到 Git，不真实上传几十个媒体。真实写入默认关闭，显式开启时串行使用一个短小样本、最多一个解析任务；各命令复用结果，历史文件再次入库也计入解析预算。2 GB 真传不作为本轮必跑验收项。必要的媒体接入闭环使用独立测试库；现有两个用户资源主要作为只读结果样本。所有错误继续按仓库约定处理，服务端错误原样透传。

本文的完成标准是命令变更范围可审阅、后端责任明确，不代表产品代码已实现或所有拟议参数已经定稿。

## 实施口径补充（2026-09-24）

用户已确认上限为 2 GiB（2,147,483,648 字节），开发分支据此校准边界。音视频建库默认 embeddingModelName=qwen3-vl-embedding、rerankModelName=qwen3-vl-rerank，模型字段与管控台及现有库的只读配置一致。已知本地媒体超过 50 个在上传前拒绝，不自动拆分任务；未知类型的历史来源交服务端校验。details 接口 pageSize 最大 10，默认列表最大 100。实施与验证状态以 [开发计划执行记录](../superpowers/plans/2026-09-24-rag-multimedia-cli.md#执行记录2026-09-24持续更新) 为准；本文前面的未实施说明是计划编写时状态。
