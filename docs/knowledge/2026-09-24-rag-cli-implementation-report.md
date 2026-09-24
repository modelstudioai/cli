# RAG 音视频升级实施与验收

日期：2026-09-24。开发分支：`codex/rag-multimedia-cli`。依据：[开发计划](../superpowers/plans/2026-09-24-rag-multimedia-cli.md)。本报告区分已验证的 CLI 行为、基线失败和未做的服务端验收。

## 按计划核对交付

| 任务             | 已实现内容                                                                                                          | 主要验证证据                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 合同与 fixture | 虚构 ID/example.com URL 的 JSON/SSE；最终 answer、phases/tools/docs/usage/events 分离；原始事件保留                 | knowledge-chat-events、knowledge-read-contracts；fixture 不含媒体二进制                                                                    |
| 2 上传规则与流   | 17 后缀、大小写扫描；媒体上限 2 GiB（用户已确认）；MD5 与 PUT 两遍流式读取、取消后关闭流                            | knowledge-upload-support、knowledge-upload-stream；稀疏临时文件和本机 HTTP 接收端，无真实大文件上传                                        |
| 3 parser/建库    | 本地与 OSS parser/config；document/multimedia 类型与场景；媒体默认 VL embedding/rerank；本地媒体 >50 上传前拒绝     | knowledge-parser-config、knowledge-request-options、knowledge-upload-orchestration、kb-create/doc-upload E2E；49/50/51 与 9/10/11 离线覆盖 |
| 4 导入与轮询     | doc import 不重复上传；完整分页聚合、去重、跨页总数变化不误报完成；失败保留原错误及 file/job IDs                    | knowledge-doc-import、knowledge-import-job；创建/等待/缺 ID/第二页失败/重复页/变化总数用例                                                 |
| 5 双入口/历史 ID | bl knowledge doc import、kscli doc import；collection/category/file 游标与子类目发现                                | 双入口 registry smoke 与实际 help；knowledge-media-budget 嵌套类目/文件第二页 mock                                                         |
| 6 查看与详情     | list/info 三字段展示、null 容错；doc list --details POST；默认 GET 不变，details 每页最多 10                        | knowledge-read-contracts 与 doc-list E2E；空第二页、原始错误、未知 JSON 字段                                                               |
| 7 媒体结果       | search/chunk 文本描述回退、毫秒起止、媒体 URL 与音频片段；JSON 保留未知字段；file get 兼容                          | knowledge-media-output、knowledge-read-contracts；0 毫秒及跨 clip 保留；chunk add 帮助说明不支持媒体                                       |
| 8 问答模式       | 单一 SSE 聚合器；quiet 优先；JSON 全量结构；TTY 阶段显示；管道仅最终回答；verbose 到 stderr                         | knowledge-chat-events/output/pty；UTF-8 单字节分帧、错误/截断/工具-only、真实 PTY 的 text 与 quiet                                         |
| 9 通用扩展       | 纯图片检索、在线过滤文件；导入普通分块参数；服务完整配置创建及保留未知字段更新；工具历史、会话文件/cache/request ID | knowledge-request-options、knowledge-service-config，以及 search/chat/service/import E2E；SESSION_FILE 两处一致映射                        |
| 10 真实验收入口  | 独立默认关闭 gate；一个短样本、一次解析额度；本机 workspace 锁、持久额度；共享后续读断言；所有权清理与报告          | knowledge-media-budget；真实 rag-media journey 默认 skip；CI 跨主机需配置 workspace concurrency group                                      |
| 11 文档/资产     | 子域手册、历史 ID 操作流程、双语 README、journey 说明、自动生成 reference                                           | sync:skill-assets；双入口 help；静态检查及下述回归                                                                                         |

运行时仅增加通用 polling load 回调及 validate 的 LocalizedText 支持。业务阶段、分页、媒体展示均在 commands；产品入口只登记路径。服务端错误保留原文，不按后端错误码重新分类。上传源文件在预检后大小变化、传输期间 stat 变化时停止后续注册。

## 验证结果

- `pnpm exec vp check`：0 errors；3 条既有 warnings，位于 binary-update.ts、binary-update-layout.test.ts、binary-options.mjs。
- 本轮最终知识库单元/E2E、双入口 registry、Memory reference：**711 passed、47 skipped**。随后新增 doc import 编排用例：**4 passed**；加入中文校验回归后，doc import E2E 单文件 **9 passed**（与前述范围有重叠，不相加）。
- `pnpm exec vp test` 全量运行：**3025 passed、275 skipped、14 failed**，原日志 `/tmp/rag-multimedia-full-tests.log`。
- 全量失败中，Memory skill 的版本元数据经生成器同步为当前 CLI 版本后，reference 定向测试通过。其余 13 个失败在同一基线提交 `6406a415eeeaa5a59e2f7373abc4f1c1f9d4c36b` 的原目录也复现，日志 `/tmp/rag-original-baseline.log`：skills-agents 9 项、advisor-sync 1 项受系统级 Codex/ZCode 安装检测影响；permission dry-run 3 项期望 JSON，当前返回文本。这些模块未在本次修改，不能报告全仓测试全绿。
- 双入口实际 `doc import --help` 均退出 0、参数和产品前缀正确。
- 真实音视频 journey **未运行**；没有上传 2 GB 文件或批量触发媒体解析。普通离线回归不计作服务端链路验收。

## 后端依赖与发布边界

1. 用户已确认上限为 **2 GiB = 2,147,483,648 字节**。常量、独立预期边界、帮助说明已统一修正，单位确认项关闭；仍不做真实大文件试探。
2. 管控台代码与现有资源的只读查询已确认音视频模型字段：`embeddingModelName=qwen3-vl-embedding`、`rerankModelName=qwen3-vl-rerank`。CLI 改为显式使用这组默认值；未进行新建/解析验收。候选全集来自后台配置，CLI 不硬编码永久白名单。
3. index/list 三字段缺失仍按后端 bug 处理。CLI 的 null 回归不代表后端已经修复，也不会增加探测/推断/回写。
4. 真实解析、召回、问答需另行显式开启单样本验收。测试入口只代表可以受控执行，不代表线上已通过。历史 fileId 重新入库也计一次解析。

没有新增 multimediaVersion 参数、媒体 chunk 编辑、table/image 完整创建流程或批量压测承诺。没有发布 npm、自动部署用户服务或删除用户资源。

## 用户补充后的模型核对（2026-09-24）

定位的控制台源码为 `efm/bailian-rag/apps/app-rag`，未修改该仓库：

- `src/pages/components/new-create/components/mode-selector/index.tsx`：音视频从 multimodalEmbedModel / multimodalRankModel 候选选择，当前值不在候选中时切到第一项；视觉理解使用多模态 embedding。
- `src/pages/components/new-create/components/create-fetch.tsx`：音视频发送 embeddingModelName + rerankModelName；`new-create/constants.ts` 明确音视频 rerankMode 默认为 similar，CLI 一并对齐；图片分支才使用 multimodalEmbeddingModelName。CLI 音视频/视觉理解场景的两个 embedding flags 作为互斥别名，映射到 embeddingModelName。
- `src/pages/components/knowledge-service-app-config-panel/utils/kb-item-utils.ts`：每库分别判断 image/multimedia 类型或 visual_perception_qa/basic_multimedia_qa 场景；混排只要包含任一多模态库就切到 multimodalRankModel。检索和问答复用此面板规则。
- `utils/fetch-rank-model-options.ts` 和 `packages/shared/src/request/data-center.ts`：候选来自 getKnowledgeCfg 的 rankModel/multimodalRankModel，而非前端永久单值白名单。控制台 API `zeldaHttp.rag./api/v1/indices/console/config` 本次因无 Console access token 未取到；此限制不影响 API Key 读取现有资源。

使用工作区 ws-ffhp71sqprmwfkf5，只读查询结果：

| 资源                                                     | 字段                                                             | 实际值               |
| -------------------------------------------------------- | ---------------------------------------------------------------- | -------------------- |
| 知识库 1uz4om722t                                        | embeddingModelName                                               | qwen3-vl-embedding   |
| 同上                                                     | rerankModelName                                                  | qwen3-vl-rerank      |
| 检索服务 aid-cfc4e54b7e3d4333b6a2378c8fe9a6da（beta、1） | kb_search_configs[].rerank.model_name / hybrid_rerank.model_name | 均为 qwen3-vl-rerank |
| 问答服务 aid-19292c4c7bd643018195460d75854a4c（beta、1） | kb_search_configs[].rerank.model_name / hybrid_rerank.model_name | 均为 qwen3-vl-rerank |

知识库 knowledgeType、knowledgeScene、multimodalEmbeddingModelName 仍返回 null；embeddingModelName 有正确 VL 模型值。本次没有写入上述资源，也没有上传或解析媒体。混合普通文档/媒体的服务更新回归保证每库模型和混排模型分别保留，不把所有库统一改写为 VL。

本次补充验证：知识库单元及建库/上传/服务命令回归 **178 passed、6 skipped**；`vp check` 为 0 errors、3 条既有 warnings。大小边界仅使用临时稀疏文件，不读写实体 2 GiB 媒体；未触发解析。
