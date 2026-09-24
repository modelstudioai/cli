# RAG 改造：测试用例变更清单

开发执行入口：[开发计划](../superpowers/plans/2026-09-24-rag-multimedia-cli.md)。

日期：2026-09-24。配套：[命令变更清单](2026-09-24-rag-cli-command-changes.md)、[API 审计](2026-09-23-rag-api-audit.md)。本文对照当前测试文件提出修改计划，**尚未修改测试代码，也不代表以下用例已通过**。拟议参数随命令方案一起定稿。

## 1. 测试分层与现状

### 媒体测试的硬约束

- **不提交大媒体到 Git**：仓库仅存测试代码、小型脱敏 JSON/SSE fixture 和样本说明。媒体由运行者通过本地路径或专用测试存储提供；运行期临时文件不入 Git，也不使用 Git LFS 存放 2 GB 测试视频。
- **默认零媒体上传、零解析任务**：普通 CI、`vp test` 以及仅配置通用真实测试凭证的运行，都不自动开启媒体写入。大小、数量、分批、格式矩阵、失败与轮询优先离线验证。
- **真实接入一次只用一个小样本、最多一个解析任务，串行执行**：显式开启时只选一个短视频或音频；建议上限 10 秒、5 MB，入口本地校验，不符合就退出。各命令复用同一 fileId、知识库和解析结果，不因 parser、产品入口或输出模式不同重复导入。
- **上传与解析分别计数**：复用 fileId 导入另一个库仍可能重新解析。历史文件导入与本地上传闭环是可选路径，单次只选其一，不把所有旅程逐条建库重跑。49/50/51 个媒体只用虚构 ID 和 mock，禁止真实批量压测。
- **超时不重提任务**：保留 ingestionId 与资源记录，下次先查原任务；有限、低频轮询。重试和清理不得触发重新上传/导入。并行进程或 CI 作业通过共享互斥锁或单一串行作业限制媒体写入。
- **2 GB 真传不是本次必跑验收项**：边界与流式行为离线验证；只有排查真实传输问题时才另行安排单文件专项，不自动注册或触发解析，不接到常规 journey 后面。

按仓库 [E2E 维护约定](../agents/cli-e2e-tests.md)，共享命令用例放在 `packages/commands/tests/`；bl、kscli 入口只补路由、help 与产品身份验证，不复制整套业务用例。

| 层级                            | 验证目标                                                       | 是否需要真实凭证            |
| ------------------------------- | -------------------------------------------------------------- | --------------------------- |
| 单元 / mock 合同测试            | 字段映射、大小边界、SSE 聚合、输出模式、分页轮询、未知字段保留 | 否                          |
| 命令 E2E：help / 缺参 / dry-run | 从参数解析到请求计划，校验 endpoint、方法、query/body、退出码  | 否；使用现有隔离测试环境    |
| 真实单命令测试                  | 后端是否接受媒体配置、解析器与接口实际返回合同                 | 是，沿用相应 readiness gate |
| Journey                         | 上传/发现历史文件 → 导入 → 解析 → 检索 → 问答的闭环            | 是，使用独立测试资源        |
| 大文件专项                      | 仅排查传输问题时安排；不触发媒体解析                           | 另行安排，非本轮必跑项      |

目前 `tests/knowledge/` 有上传规则、共享显示、建库数据源测试；`tests/e2e/knowledge/` 有单命令用例和 J1–J5 旅程。已有测试应保留普通文档场景，新增媒体分支。dry-run 只能证明请求编排正确，不能替代上传、解析或检索成功的证据。以下文件路径均相对仓库根目录。

## 2. 按命令修改哪些测试

| 命令                             | 现有测试文件                                                                                                                                   | 修改或新增的核心断言                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge create` / `kb create` | `packages/commands/tests/knowledge/knowledge-kb-create.test.ts`；`packages/commands/tests/e2e/knowledge/knowledge-kb-create.e2e.test.ts`       | 保留 file/category 数据源映射；新增 document 默认请求不变、multimedia 类型/场景/两个模型字段映射、冲突组合在请求前失败；媒体默认模型经联调确定后锁定        |
| `list` / `info`                  | `packages/commands/tests/e2e/knowledge/knowledge-kb-list.e2e.test.ts`、`knowledge-kb-info.e2e.test.ts`                                         | mock 正常三字段与 null/缺省两类响应；验证文本显示和 JSON 合同，断言没有额外探测/回填请求；真实媒体库回读三字段验证后端修复                                  |
| `doc upload`                     | `packages/commands/tests/knowledge/knowledge-upload-support.test.ts`；`packages/commands/tests/e2e/knowledge/knowledge-doc-upload.e2e.test.ts` | 增加 17 种后缀、大小写、混合目录、2 GB 边界、parser/config 映射、流式上传及部分失败；保留 `.zip` 拒绝、普通文档软硬限制、3/4 步 dry-run 编排                |
| `doc import-oss`                 | `packages/commands/tests/e2e/knowledge/knowledge-chunk-category-file.e2e.test.ts`                                                              | 保留默认 fileDetails 请求；新增每个元素的 parser/parserConfig；保留 11 个对象拒绝测试，补 10 个合法边界；mock 部分成功/失败返回                             |
| **新 `doc import`**              | 拟新增 `packages/commands/tests/e2e/knowledge/knowledge-doc-import.e2e.test.ts` 及对应 mock 测试                                               | help、缺 index-id、无数据源、两种数据源互斥、重复参数数组、sourceType、ingestionId；wait/不 wait；断言不会调用 lease/PUT/addFile                            |
| `doc list --details`             | `packages/commands/tests/e2e/knowledge/knowledge-doc-list.e2e.test.ts`                                                                         | 保留默认 GET 和 `page_num` 断言；新增 details POST 和 `indexId/pageNumber/pageSize`，均覆盖第二页；JSON 完整响应、文本详情字段                              |
| `doc status`                     | `packages/commands/tests/e2e/knowledge/knowledge-doc-status.e2e.test.ts`；拟新增共享轮询 mock 测试                                             | 保留双 ID、分页参数、真实完成用例；新增解析中→完成、第二页失败、部分失败、超时、服务端错误；upload/import/status 共用相同终态规则                           |
| `file get`                       | `packages/commands/tests/e2e/knowledge/knowledge-chunk-category-file.e2e.test.ts`                                                              | 新增媒体 parser/fileType/status 回读和 JSON 未知字段保留；无需把已存在的显示能力当成新增功能                                                                |
| `chunk list/add`                 | 同上；拟新增媒体渲染单元测试                                                                                                                   | 空 content/text 时显示 clip_description；时间与媒体数组、转写跨片段；JSON 保留 metadata。add 双语 help 说明媒体限制，服务端拒绝原样透传，不增加前置探测请求 |
| `search`                         | `packages/commands/tests/e2e/knowledge/knowledge-search.e2e.test.ts`；拟新增媒体结果 mock 测试                                                 | 原纯文本断言保留；媒体 JSON 完整性、文本片段显示；通用批次修改“缺 query”用例为“文本与图片均缺失”，新增纯图片与过滤文件映射                                  |
| `chat`                           | `packages/commands/tests/e2e/knowledge/knowledge-chat.e2e.test.ts`；拟新增 SSE 聚合/输出 mock 测试                                             | 把仅 answer 非空升级为最终回答、过程、来源、usage 分离；各模式见第 4 节；保留旧 message/image 请求与错误处理回归                                            |
| `service create/get/update`      | `packages/commands/tests/e2e/knowledge/knowledge-service.e2e.test.ts`；拟新增配置 mock 测试                                                    | 保留简版 create；新增 config-file/快捷 index-id 互斥、完整配置透传；标量更新不丢媒体和未知字段；get 摘要与 JSON；沿用现有发布/复制/删除闭环                 |
| `category list` / `file list`    | `packages/commands/tests/e2e/knowledge/knowledge-chunk-category-file.e2e.test.ts`；J5                                                          | 保留 collection-id、parent-id、nextToken 覆盖；补从列表返回 fileId 再导入的连接步骤，不能直接偷用上传步骤缓存的 ID                                          |

新增纯逻辑测试按被测模块拆分，不继续把所有媒体场景堆进已有的大型 `knowledge-chunk-category-file.e2e.test.ts`。测试文件名可随实现模块确定；已有路径与拟新增路径须区分。

## 3. 上传、历史文件和导入的边界

### 3.1 2 GB 与流式处理

媒体上限按用户确认改为 **2 GB**。准确字节值已由用户确认为 2 × 1024³ = 2,147,483,648；用独立预期字节值验证规则，避免只读取实现常量再断言实现常量。

- 17 种后缀逐项参数化测试；大写 `.MP4`、音频、视频与普通文档混合目录均可发现；不支持格式仍跳过或按原合同报错。
- 覆盖超过旧 512 MB 且低于新上限的合法值，以及新上限减 1、等于上限、上限加 1 字节；普通文档/图片的既有上限不跟着放大。
- 大小校验使用受控 stat/mock 或稀疏文件，不在普通 CI 写入/上传 2 GB 实体内容。小块流验证 MD5 与发送字节一致、读取错误/PUT 失败能退出并关闭资源。
- mock 上传链路验证 lease → PUT → addFile → 可选 job 的顺序；PUT 失败不注册，注册失败不触发导入，后续文件失败时已成功的 fileId 仍可追踪。
- 使用分块源验证读取有界、请求消费流；以本地流消费者或本地 HTTP 接收端记录峰值 RSS 与耗时，防止校验改为 2 GB 后仍整文件进内存。内存阈值依据运行环境设定，不在默认 CI 断言脆弱的绝对 RSS。
- parser 配置文件覆盖合法 JSON、语法错误、文件不存在和确认后的类型校验；默认 AUTO_SELECT 请求保持兼容。MEDIA 与 AUTO_SELECT 的参数分支分别用 mock 验证；真实接入只选一个已约定 parser，不为遍历 parser 重复解析，另一分支如实记录未实测。

媒体一次入库 50 个与 OSS 一次注册 10 个是不同限制：**仅通过 mock/虚构 ID** 覆盖 49/50/51 和 9/10/11，不上传或解析对应数量的真实文件。若采用分批，验证批次内容、数量及每批 job；若采用报错，验证请求前失败。该策略需随命令设计定稿。不能拿 categoryId 个数判断媒体文件数，也不能因总文件数超过 50 就禁止后续增量入库。

### 3.2 历史 fileId 再利用

增加一条明确的行为链：已有测试 collection → `category list --collection-id` → 如有子目录则用 `--parent-id` → `file list --category-id`（跟随 nextToken）→ 从 `data.fileList[].fileId` 取得目标文件 → 新 `doc import --index-id --doc-id`。

mock 场景把目标文件放在第二页、嵌套类目中，验证调用参数和取到的 ID。选择历史文件真实路径时，使用专用测试集合中已有的小样本，再从列表重新发现它；导入步骤不得调用上传租约、OSS PUT 或 addFile。历史文件不要求一定来自 import-oss，控制台/本地上传产生的 fileId 也应复用。

另测 categoryIds 导入、空来源拒绝、双来源互斥、wait 完成/部分失败/超时。分页轮询必须看全任务结果：第一页完成、第二页失败时不得报告整体成功；等待测试用虚拟时钟，不实际等待长解析时长。

## 4. 问答按模式测试，不能只断言“有输出”

现有 `knowledge-chat.e2e.test.ts` 的 JSON/text 真实调用主要检查非空；部分标为 stream 的用例没有独立的模式差异，也未证明真实 TTY 行为。保留少量真实可用性测试，把确定性输出合同放进同一份 SSE fixture 的回放测试。

fixture 使用可辨别的工具摘要、规划和最终回答，例如最终回答分两帧为“最终”与“答案”；来源带 citation、视频/音频/图片数组、时间段；包含 usage、request_id 和未知扩展字段。不要把历史实测的 710/4,111 字符作为未来真实模型的固定预期。

| 模式组合            | stdout 断言                                                                                 | stderr / 过程断言                             |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| JSON，非 TTY / TTY  | 是单个可解析 JSON；answer 恰为“最终答案”；request_id 保留；来源、工具、规划、usage 单独保留 | 不把进度标签写入 JSON                         |
| text，非 TTY        | 默认仅最终回答，无工具摘要/规划混入                                                         | 诊断与 stdout 分离                            |
| text，TTY           | 阶段显示清楚，最终回答只在回答阶段输出；按设计显示来源摘要                                  | 不把可读过程显示判成数据丢失                  |
| quiet，非 TTY / TTY | 仅最终回答，不出现标签、工具、规划、来源附录                                                | 不输出普通进度；错误仍可报告                  |
| JSON + quiet        | 按现有 quiet 优先约定输出裸最终回答；help 明示                                              | 不错误断言它仍是 JSON                         |
| verbose + JSON/text | 主结果内容/结构与不加 verbose 时一致                                                        | 诊断写 stderr；真实子进程检查 stdout 不受污染 |

TTY 单元测试可注入 isTTY；另外用真实 PTY 代表性覆盖 text 和 text+quiet。普通子进程管道不是 TTY，不能把同一条测试改名后算第二种模式覆盖。

SSE 还需覆盖：

- 跨网络块拆开的帧、UTF-8 字符与多帧同块；只能验证完整解析后的内容，不能假定一次读取就是一个事件。
- 缺少 step_change、允许的事件顺序变化、空内容、数组 content、多次工具返回；明确阶段归属，不能把不明内容全部塞进 answer。
- 无最终回答、错误帧、连接中断：按明确的错误合同返回，不能把工具摘要当作成功回答；服务端错误文本原样保留。
- 原始事件与未知字段保留；JSON 新字段结构定稿后断言完整结构，旧 answer/request_id 入口继续存在。
- 用量按服务端事件语义处理；累计 usage 帧不能重复相加，分阶段值保留，最终汇总与原帧可核对。
- enable_citation=false 时 SSE 仍有 docs：结构化来源继续保留，不依赖正文是否带引用标记。

## 5. 媒体读取与后端修复合同

使用最小脱敏 fixture 覆盖以下组合，而非整份生产结果快照：

- `content=""`、`text=""`、clip_description 有值：文本仍可读；纯文本旧样本显示不变。
- image_url/video_url/audio_url 数组、空数组、字段缺失、page_number 数组和未知 metadata：JSON 不裁剪、不错误转为标量。
- 原始时间保持不变，文本按确认的毫秒单位格式化；audio_segments 跨 clip 边界时不得悄悄裁剪来源数据。
- list/info 后端三字段非空时正常展示；null 时容错并保持原值，不能从检索返回、模型名或后缀推断。

**后端修复验收与 CLI 容错分开**：离线 null 用例通过只代表不崩溃；真实媒体库仍缺三字段时，后端合同检查应明确失败并记录后端问题，不能用 null 容错或临时 skip 宣称修复完成。模型配置组合尚未定稿的联调用例同样记录为待验证。

## 6. 真实闭环怎么补

保留 J1–J5 的普通文档覆盖，增加默认关闭的媒体专用 journey，复用 `packages/commands/tests/e2e/knowledge/journeys/journey-helpers.ts` 的日志和清理能力。

| 旅程             | 步骤                                                                                                          | 成功标准                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 媒体接入闭环     | 短视频/音频上传 → 建媒体库/增量导入 → status → file get/doc details/chunk list → 创建测试服务 → search → chat | 源文件和入库文件可关联、解析达到成功终态；检索命中测试文件/片段，chat 来源可关联该文件，最终回答与过程分离 |
| 历史文件复用     | 已有小样本 → collection/category/file 列表重新发现 → 导入测试库一次 → 检索                                    | 确实使用列表取回的 fileId，无二次上传；文件可被目标库召回                                                  |
| 媒体配置生命周期 | service create 完整配置 → update 一个标量 → get → beta 检索 → deploy/copy/get                                 | 每库及混排 rerank、库绑定与未知字段未因更新丢失；沿用现有生命周期权限与确认约定                            |

表中是可选验收路径，不是单次必须全跑的三个任务。媒体接入复用一次解析结果完成后续只读断言；历史文件路径替代本地上传路径，最多触发一次入库。服务配置生命周期优先使用已解析的专用测试库，不重新上传或导入。只读回归可重复运行，上传/解析不作为每条测试的 beforeEach。

媒体 fixture 使用可控内容和明确的目标文件身份，可辅以画面/语音标记词。硬断言资源关联、成功终态和返回结构；不固定 LLM 全文、分数、排名、切片精确边界或签名 URL。检索未命中目标文件不得仅当软提示，否则没有验证闭环。不同 parser 的效果对比另作质量评估。

新建资源自建自清；预置专用测试库和源文件只读复用，不纳入清理。仅清理本次拥有的资源；`try/finally` 和 resources.json 记录失败及未回收 ID。已有用户库 `1uz4om722t`、`h4zeu45r6l` 及对应服务只作经授权的只读排查对象，不成为会上传、改配置或删除的默认 fixture。collection 无删除 API，复用明确的测试 collection，避免每次新建不可回收集合。

媒体 journey 单独显式启用，按现有 readiness 机制扩展；不要借用视频生成 gate 代替 RAG 媒体接入 gate。OSS 路径需要测试 bucket/对象，使用既有专用 gate。不安排必跑的大文件真实上传专项；缺少凭证或显式开关时报告 skip，不能记成通过。

## 7. 通用补齐批次与双入口

这些用例随命令清单 D 批交付，不应阻塞主线 A–C 的离线测试：

| 能力                         | 需要补的测试                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| search 在线过滤              | 配置文件合法/非法、请求只包含允许的在线字段、不覆盖离线策略；真实过滤包含/排除目标文件        |
| search 纯图片                | 无 query 有 image 成功映射空串；现有空 query+image 兼容；两者均无有效值在网络前失败           |
| chat messages-file/tool 历史 | 文件错误、与 message/image 的组合规则；tool role/关联字段按确认合同保留，不转写成 user 字符串 |
| chat session_files           | 重复 fileId 参数映射；upload lease 与 addFile 都传 SESSION_FILE；真实上传→引用闭环            |
| chat cache/request-id        | 缺省请求不变、显式字段位置正确；usage 不重复累计；不把真实缓存命中当作每次必然发生            |
| service config-file          | 完整对象创建/替换、标量更新合并、未知字段保留；配置源互斥与非法 JSON                          |

新 doc import 同步 commands 导出、`packages/cli/src/commands.ts`、kscli 命令 map、`packages/commands/tests/e2e/topic-routes.ts`。使用两产品 registry smoke 确认 `bl knowledge doc import` 与 `kscli doc import`；少量子进程验证产品命名与 help，不为每个路径重复启动进程。

新增 flag 和媒体限制文案同时测 en-US/zh-CN；更新生成 reference 后检查两个入口的参数可发现性。服务端错误保持原样，不写测试要求 CLI 翻译服务端错误。

## 8. 交付顺序与验收记录

1. **A：输入闭环**——上传规则/流式处理、创建映射、新 import 的离线与 dry-run；按需选一条短媒体真实接入路径；另一条先用 mock 覆盖，后续独立验收时再运行。
2. **B：读取检索**——details 双接口、分页轮询、媒体渲染/JSON、后端三字段合同；保留普通文档回归。
3. **C：问答**——确定 JSON 新结构后，以同一 SSE fixture 跑模式矩阵，再补 PTY 与少量真实来源验证。
4. **D：通用扩展**——随对应参数落地补测试；2 GB 边界和流式内存表现通过本地测试记录，不要求真实大文件上传或解析。

实现时先运行受影响的定向测试，再按仓库要求执行 `vp check`、`vp test`；真实 journey 单独运行并保存产物。记录分为“离线已通过 / 真实已通过 / 后端阻塞 / 未运行或 skip”，不混成一个通过率。

本节最初用于测试范围规划；现有实现、通过项与未运行项见实施验收报告。用户后续确认 2 GiB，管控台源码及只读资源核对确认媒体模型字段，相关回归已同步；不以新建大量资源来确认这些合同。

## 实施口径补充（2026-09-24）

用户已确认上限为 2 GiB（2,147,483,648 字节），开发分支据此校准边界。音视频建库默认 embeddingModelName=qwen3-vl-embedding、rerankModelName=qwen3-vl-rerank，模型字段与管控台及现有库的只读配置一致。已知本地媒体超过 50 个在上传前拒绝，不自动拆分任务；未知类型的历史来源交服务端校验。details 接口 pageSize 最大 10，默认列表最大 100。实施与验证状态以 [开发计划执行记录](../superpowers/plans/2026-09-24-rag-multimedia-cli.md#执行记录2026-09-24持续更新) 为准；本文前面的未实施说明是计划编写时状态。
