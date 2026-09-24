# RAG 音视频升级 CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 默认在当前任务逐项执行；只有用户要求并行委派时再使用 subagent-driven-development。

**Goal:** 在 bl 与 kscli 中打通音视频知识库接入、历史文件导入、媒体检索和问答来源输出，同时保持普通文档兼容并严格控制真实解析负载。

**Architecture:** 业务逻辑和渲染留在 commands，接口地址与共享 API 类型留在 core，产品入口只注册路径。上传采用两遍流式读取（先 MD5、再 PUT），导入统一复用分页轮询，chat 统一解析事件后按输出模式渲染。通用增强独立于媒体主线交付，不为本轮重构通用 runtime。

**Tech Stack:** TypeScript、Node.js streams/fetch、pnpm、Vite Plus test、现有 packages/e2e harness、百炼 RAG HTTPS/SSE。

---

## 范围、依据与执行方式

依据：[命令方案](../../knowledge/2026-09-24-rag-cli-command-changes.md)、[测试方案](../../knowledge/2026-09-24-rag-cli-test-changes.md)、[API 审计及历史证据](../../knowledge/2026-09-23-rag-api-audit.md)。本文件前半部分保留原始开发清单；实际交付与验证状态见末尾执行记录及验收报告，不能仅凭原始复选框判断完成状态。

本轮分 A/B/C 三个主线批次与 D 通用扩展批次。每个任务按小步执行：新增失败断言 → 定向运行确认失败原因 → 实现 → 定向复测 → 检查差异。完成独立任务后形成单独提交；只暂存明确改动文件，不使用 `git add .`，不提交现有无关 output 或文档。开发前读取根 AGENTS.md 与 `docs/agents/command-add-remove.md`、`command-flag-change.md`、`cli-e2e-tests.md`；修改错误文案时另读 `error-hint-change.md`。

源码核对说明：kscli 当前命令 map 是 `packages/kscli/src/commands.ts`，`main.ts` 仅注入产品身份。测试落在共享 commands 层，仓库个别指南中的旧测试路径不作为迁移目标。

### 已确认、不能偏离的约束

- `index/list` 缺少 knowledgeType、knowledgeScene、multimodalEmbeddingModelName 是后端 bug。CLI 只补类型/展示/正常与 null 回归；不推断、不额外探测、不写回。multimediaVersion 不新增 flag。
- 新增一个 `doc import`；详情接口用 `doc list --details`。历史 fileId 通过 collection → category → file list 查找，不再新增另一套发现命令。
- 媒体单文件上限提升至 2 GB；普通文档与图片的既有大小限制不放大。17 种媒体后缀见任务 2。
- 普通 CI 和默认测试不上传媒体、不触发解析。仓库不存大视频，2 GB 和 49/50/51 数量边界只离线验证。
- 显式真实验收串行只选一个短小样本、最多一次解析任务；历史 fileId 重新入库也消耗此预算。建议样本上限 10 秒、5 MB；样本来自外部本地路径/专用测试存储。各种模式、双入口、parser 分支不各自重新入库。
- 后端错误原样透传；新增本地提示双语；JSON 未知字段保留；quiet 优先输出裸结果，verbose 诊断进 stderr。

### 合同依赖与范围控制

这些是具体决策任务，不能通过猜测或反复真实建库解决。未确认项只阻塞对应功能的发布，不阻塞其他离线开发。

| 合同                     | 处理动作                                                                                                                     | 阻塞范围                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 2 GB 精确字节数          | 由后端确认 2,000,000,000 或 2 × 1024³，记录到命令/测试方案；边界测试使用确认后的字节值                                       | 新上传上限发布            |
| 媒体创建两个模型字段组合 | 用已获取 schema 与后端确认明确允许组合和缺省策略；显式配置路径先开发。普通 text-embedding-v4 不无条件套到媒体                | 媒体默认模型行为          |
| 媒体数量约束             | 首批不自动拆分任务。本地确知媒体数 >50 时在上传/建任务前拒绝；未知类型的历史 fileId 与类目交服务端校验，不按 ID 个数猜媒体数 | 与命令/测试方案同步后实施 |
| chat JSON 新结构         | 本计划采用下面的候选结构；任务 1 结合脱敏 SSE fixture 固化字段位置、阶段判定与 usage 语义                                    | chat 输出任务             |
| 通用扩展 API 字段        | search_filters 范围、tool 历史、session_files/cache/request_id 对齐对应公开 schema/后端合同；不以宽泛类型掩盖未知字段位置    | D 批对应子任务            |

## 文件与责任划分

| 文件（仓库相对路径）                                                                                | 动作与职责                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core/src/client/endpoints.ts`                                                             | 补 details endpoint；修正 indexJobCreate 的过时嵌套 dataSource 注释，当前上传已用 sourceType/docIds |
| `packages/core/src/types/knowledge-admin.ts`                                                        | 管理面库字段、文件详情和 parser 相关响应类型                                                        |
| `packages/core/src/types/api.ts`、`packages/core/src/types/index.ts`                                | 检索 metadata、chat SSE 可选/扩展字段及必要导出                                                     |
| `packages/commands/src/commands/knowledge/upload-support.ts`                                        | 文件扫描、后缀与大小规则                                                                            |
| 新 `packages/commands/src/commands/knowledge/upload-stream.ts`                                      | 流式 MD5 与 OSS PUT，流关闭/超时，不含业务注册                                                      |
| 新 `packages/commands/src/commands/knowledge/parser-config.ts`                                      | 两个接入命令共享的本地 parser 配置读取与校验                                                        |
| `packages/commands/src/commands/knowledge/doc-upload.ts`、`doc-import-oss.ts`                       | 编排、parser 请求映射、部分成功信息                                                                 |
| 新 `packages/commands/src/commands/knowledge/doc-import.ts`                                         | 已有文件/类目导入已有库                                                                             |
| `packages/commands/src/commands/knowledge/shared.ts`、`doc-status.ts`                               | 全分页状态聚合与统一等待，不另建一套轮询                                                            |
| `packages/commands/src/commands/knowledge/kb-create.ts`、`kb-list.ts`、`kb-info.ts`、`doc-list.ts`  | 建库参数、字段展示、详情列表                                                                        |
| 新 `packages/commands/src/commands/knowledge/media-output.ts`                                       | chunk/search/chat 共用的媒体摘要与时间格式化，原始 JSON 不改写                                      |
| 新 `packages/commands/src/commands/knowledge/chat-events.ts`                                        | SSE 业务阶段识别/聚合；不重新实现 core parseSSE 网络分帧                                            |
| `packages/commands/src/commands/knowledge/chunk-list.ts`、`chunk-add.ts`、`search.ts`、`chat.ts`    | 命令输入与输出模式接入                                                                              |
| `packages/commands/src/commands/knowledge/service-create.ts`、`service-get.ts`、`service-update.ts` | 完整配置创建、摘要、更新保留未知字段                                                                |
| `packages/commands/src/index.ts`、`packages/cli/src/commands.ts`、`packages/kscli/src/commands.ts`  | 新命令导出与双入口                                                                                  |
| `packages/commands/tests/knowledge/`、`packages/commands/tests/e2e/knowledge/`                      | 离线合同、命令 E2E；具体文件见各任务                                                                |
| `packages/e2e/src/gating.ts`                                                                        | 独立媒体写入 gate；通用真实测试开关不能开启它                                                       |

下文现有文件路径省略重复目录时，以上表为准；所有新增文件给出完整仓库相对路径。各任务依赖：1 → 2/4/6/7；2 → 3；4 → 5；1+7 → 8；3+4+5+6+7+8 → 10；9 为独立 D 批（D1 导入参数依赖 4，D3 依赖 3+8）；11 汇总交付。

## 任务 1：固化接口合同与脱敏 fixture

**修改：** `docs/knowledge/2026-09-24-rag-cli-command-changes.md`、`2026-09-24-rag-cli-test-changes.md`。  
**新增：** `packages/commands/tests/knowledge/fixtures/rag-media-search.json`、`rag-media-chat.sse`、`rag-media-index.json`。

- [ ] 从历史审计中提取最小结构，用虚构 ID、example.com URL 与短文本重建 fixture；不复制生产签名 URL、用户原文、凭证或整份线上响应。
- [ ] 在方案中记录准确字节上限、模型组合、批量首批拒绝策略。不能确认时标为“后端合同未确认，相关发布阻塞”，不写臆测默认值。
- [ ] 固化 chat JSON 合同，保持兼容入口，推荐采用以下形态：

```json
{
  "answer": "最终答案",
  "request_id": "request-fixture",
  "phases": [],
  "tools": [],
  "docs": [],
  "usage": null,
  "events": []
}
```

`phases` 保存阶段与内容片段，`tools` 保存完整工具记录，`docs` 保存来源原对象；`usage` 仅在可确认汇总语义时填对应最终汇总，否则 null，原始 usage 仍在 events。`events` 按接收顺序保存 `{event, data}`，data 保留原始 SSE 字符串，从而未知字段和未识别事件可还原；这不承诺保存网络分块或字节级 HTTP 流。不按生成后的字段反向重建原事件。

- [ ] 用 fixture 确认 tool_return、planning、generating 的实际判定字段。优先消息自身阶段/角色，其次沿用阶段事件；未知归属仅保存在 events，不混进 answer。无 step_change 但有明确消息阶段仍可输出；只有合同明确支持的 assistant 最终消息才作为降级来源。
- [ ] fixture 中固定最终文本为“最终”与“答案”两段；包含空文本视觉描述、跨 clip 的音频片段、空媒体数组、未知字段及 citation=false 仍返回 docs。提交方案与 fixture，不放媒体二进制。

**完成标准：** 下游测试有确定性数据，开放问题只以明确的发布依赖存在。

## A：文件接入与已有文件导入

### 任务 2：媒体规则与流式传输

**修改：** `upload-support.ts`。  
**新增：** `upload-stream.ts`（路径见文件表）、`packages/commands/tests/knowledge/knowledge-upload-stream.test.ts`。  
**修改测试：** `packages/commands/tests/knowledge/knowledge-upload-support.test.ts`。

- [ ] 扩展参数化规则测试。后缀集合固定为：

```ts
const mediaExtensions = [
  ".aac",
  ".amr",
  ".flac",
  ".flv",
  ".m4a",
  ".mp3",
  ".mpeg",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
  ".wma",
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
];
```

逐项验证允许与大小限制；`.MP4`、混合目录、忽略目录、`.zip` 拒绝、普通文档规则不变。确认后的边界以 `limit-1/limit/limit+1` 字节测试，stat/mock 不创建实体大视频。

- [ ] 运行 `pnpm exec vp test packages/commands/tests/knowledge/knowledge-upload-support.test.ts`，确认失败是媒体规则尚未实现。
- [ ] 增加媒体规则；仅媒体采用新上限。扫描与大小校验沿用现有接口，供 dry-run 使用；dry-run 不计算整文件 MD5。
- [ ] 新增流式 MD5 实现并测试小块拼接后与一次性已知字节摘要相同。核心读取方式如下：

```ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function computeFileMd5(filePath: string): Promise<string> {
  const digest = createHash("md5");
  const source = createReadStream(filePath);
  try {
    for await (const chunk of source) digest.update(chunk);
    return digest.digest("base64");
  } finally {
    source.destroy();
  }
}
```

- [ ] OSS PUT 重新打开文件流，按当前 Node fetch 类型使用流 body 与 `duplex: "half"`；保留租约 headers，不注入 Bearer。沿用超时/AbortSignal；成功、异常、取消均关闭流；不得自动重试已消费流。stat 变化时停止注册并提示文件变化。
- [ ] 用本地 HTTP 接收端测试实际发送字节、MD5、Content-Length/租约 headers、取消与读取失败；分块源验证有界读取，不以生产 OSS 验证流逻辑。
- [ ] 定向运行两个上传单元文件，确认通过后提交 `feat(knowledge): stream media uploads with bounded memory`。

### 任务 3：接入 parser 与建库媒体参数

**修改：** `doc-upload.ts`、`doc-import-oss.ts`、`kb-create.ts`、core 管理类型。  
**新增：** `parser-config.ts`、`packages/commands/tests/knowledge/knowledge-parser-config.test.ts`。  
**测试：** `knowledge-kb-create.test.ts`、`knowledge-doc-upload.e2e.test.ts`、`knowledge-kb-create.e2e.test.ts`、`knowledge-chunk-category-file.e2e.test.ts`（均为既有 tests 对应目录）。

- [ ] 先补请求断言：parser/config 位于 addFile 与每个 fileDetails 元素，默认 AUTO_SELECT 不变；非法 JSON、非对象、ENOENT 在网络前失败。建议配置文件接受 JSON 对象，保留未知键，不实现未经证实的字段 whitelist。
- [ ] 新增双语 `parser`、`parserConfigFile` flags；共享读取 helper，返回 `{parser, parserConfig?}`，不捕获并重写服务端错误。doc-upload 调用任务 2 的 MD5/PUT；保持 lease → PUT → addFile → optional job。
- [ ] mock 三处失败：PUT 失败不 addFile；addFile 失败不创建 job；后续失败可看到已注册 fileId。保留原 JSON 主结构与 quiet ID 输出。
- [ ] 建库增加 `knowledgeType`、`knowledgeScene`、`multimodalEmbeddingModel` flags；明确 document/multimedia 首批范围。媒体请求核心如下，模型字段按任务 1 决策加入：

```ts
const multimediaFields = {
  knowledgeType: "multimedia",
  knowledgeScene: "basic_multimedia_qa",
  structureType: "unstructured",
};
```

显式冲突场景在 validate 拒绝；普通文档未指定新 flag 的请求与旧版一致。两模型字段不相互覆盖，不增加 multimediaVersion。

- [ ] 已知本地媒体超过 50 时在上传开始前拒绝；OSS 保留最多 10 个对象。49/50/51 与 9/10/11 全用 mock/dry-run，禁止构造对应数量的真实任务。
- [ ] 运行上述新增/修改单元与 E2E 文件的离线组，预期全部通过；真实组保持 skip。提交 `feat(knowledge): accept multimedia creation and parser options`。

### 任务 4：修复全分页轮询，新增 doc import

**修改：** `shared.ts`、`doc-status.ts`，必要时调整 kb-create/doc-upload 的共享调用。  
**新增：** `doc-import.ts`、`packages/commands/tests/knowledge/knowledge-import-job.test.ts`、`packages/commands/tests/e2e/knowledge/knowledge-doc-import.e2e.test.ts`。

- [ ] 先为共享 pollImportJob 增加虚拟时钟/HTTP mock：第一页完成第二页失败、部分完成、RUNNING 但所有文档终态、超时与服务端错误；用重复 doc_id 检查分页汇总不误判已覆盖总数。
- [ ] 保留普通 `doc status` 单页查询合同；`--wait` 每轮从首分页遍历任务状态，校验 total_count 覆盖，统一检测失败后再成功退出；不能因顶层 COMPLETED 而忽略第二页失败。缺少完整覆盖证据时不凭当前页全终态认定成功。超时保留原 job ID，不创建新 job。
- [ ] 运行 `pnpm exec vp test packages/commands/tests/knowledge/knowledge-import-job.test.ts`，先验证能复现旧分页缺口，再修复并复测。
- [ ] 新命令定义 `indexId` 必填、`docId`/`categoryId` 数组互斥且至少一项、`wait`/`pollInterval` 复用现有语义。请求只有显式来源，例如：

```json
{ "indexId": "index-fixture", "sourceType": "DATA_CENTER_FILE", "docIds": ["file-fixture"] }
```

类目路径使用 DATA_CENTER_CATEGORY 与 categoryIds。禁止省略 sourceType；不调用 lease、PUT、addFile；不根据历史 ID 数量猜媒体数量。返回 ingestionId，quiet 打印 ID；wait 复用共享轮询，失败保留原文及任务/来源上下文。

- [ ] dry-run 输出 endpoint/request、不发网络；为缺目标、缺来源、双来源、数组映射、wait/非 wait、错误与部分成功分别增加断言。普通 chunk 参数放 D 批，不耦合首个可用 import。
- [ ] 修正 core endpoints 中 indexJobCreate 的过时注释，引用当前实测 flat sourceType/docIds，不改实际路径。
- [ ] 定向运行新增 import 单元/E2E 与既有 doc-status/doc-upload/kb-create 回归；预期新旧调用方一致。提交 `feat(knowledge): import existing files with complete job polling`。

### 任务 5：注册双入口与历史 fileId 使用文档

**修改：** `packages/commands/src/index.ts`、`packages/cli/src/commands.ts`、`packages/kscli/src/commands.ts`、`packages/commands/tests/e2e/topic-routes.ts`、`docs/knowledge/doc.md`、`docs/knowledge/collection-category.md`。

- [ ] 导出和 map 增加：

```ts
// packages/commands/src/index.ts
export { default as knowledgeDocImport } from "./commands/knowledge/doc-import.ts";
// bl map entry
"knowledge doc import": knowledgeDocImport,
// kscli map entry
"doc import": knowledgeDocImport,
// knowledge topic route entry (string export name)
"knowledge doc import": "knowledgeDocImport",
```

- [ ] 使用 registry smoke 验证两入口及父组 help；两种语言检查 parser/新 flags/使用示例，不复制全套 live 用例。
- [ ] 文档区分 upload、import-oss、import、create；提供 collection-id → category-id → file list → data.fileList[].fileId 的操作步骤，说明 nextToken 和子类目，以及再次入库可能重新解析。
- [ ] 运行两产品 `tests/e2e/registry.smoke.e2e.test.ts` 及新 import E2E；预期路径可用、帮助中的产品名正确。提交 `feat(knowledge): expose existing-file import in both products`。

## B：查看与检索

### 任务 6：类型展示与 doc list --details

**修改：** core endpoints/knowledge-admin、kb-list/kb-info/doc-list。  
**新增：** `packages/commands/tests/knowledge/knowledge-read-contracts.test.ts`。  
**修改测试：** `packages/commands/tests/e2e/knowledge/knowledge-doc-list.e2e.test.ts`、`knowledge-kb-list.e2e.test.ts`、`knowledge-kb-info.e2e.test.ts`。

- [ ] mock 库三字段正常/null/缺失：list JSON 完整响应、info JSON 选中 row 不变；text 新字段可见；整个操作无额外探测请求。
- [ ] 补可选 nullable 类型和双语显示；不添加回填或推断。后端非空合同另在只读联调检查，null 容错通过不能冒充后端修复通过。
- [ ] endpoint 常量增加如下值：

```ts
indexFileDetails: "/api/v1/indices/rag/list/index/file/details",
```

新增 details switch。缺省 GET index/files 继续使用 page_num/page_size；details POST 使用以下 body：

```json
{ "indexId": "index-fixture", "pageNumber": 2, "pageSize": 10 }
```

- [ ] 使用已取得 details schema 定义独立响应类型，不假定其 envelope 等于旧 GET；JSON 原样输出，text 显示文件级 chunkSize/overlapSize/separator/chunkMode/enableHeaders，quiet 仍列文档 ID。
- [ ] 两接口均测第二页、空页、缺字段、服务端错误；现有 page-size 校验保留。运行本任务四个测试文件，预期默认 endpoint 无变化。提交 `feat(knowledge): show multimedia metadata and document details`。

### 任务 7：媒体检索与切片显示

**修改：** api 类型及导出、chunk-list/search/chunk-add。  
**新增：** media-output.ts、`packages/commands/tests/knowledge/knowledge-media-output.test.ts`。  
**回归：** `knowledge-search.e2e.test.ts` 与 `knowledge-chunk-category-file.e2e.test.ts`。

- [ ] fixture 回归先断言空 content/text 仍显示 clip_description；空媒体数组不生成伪 URL；JSON 未知字段保持相等。
- [ ] metadata 对 image_url/page_number 保留历史标量兼容并支持数组；补可选 video_url/audio_url、clip 时间、description、audio_segments 与 unknown 扩展键。只在 text 渲染层归一化数组，不改服务端对象。
- [ ] media-output 中文本选择遵循非空优先，核心逻辑：

```ts
export function firstNonEmptyText(...values: unknown[]): string {
  return (
    values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ??
    ""
  );
}
```

时间以确认的毫秒合同格式化，0 合法；audio_segments 可能跨 clip，不裁剪原数据。保留普通文档的现有 text 显示。

- [ ] search/chunk list 共用该摘要；file get 仅增加媒体回归，无需重复开发已有 parser/status 展示。
- [ ] chunk add 双语 notes 明示不支持 multimedia；不加一次额外 info 请求，不翻译服务端拒绝。chunk update/delete 不扩展媒体写入承诺。
- [ ] 运行媒体单元及两个已有 E2E 的离线组，预期普通文档、数组媒体、未知字段均通过。提交 `feat(knowledge): render media search and chunk references`。

## C：问答输出合同

### 任务 8：统一 chat 事件聚合和模式渲染

**修改：** api.ts/index.ts、chat.ts。  
**新增：** chat-events.ts、`packages/commands/tests/knowledge/knowledge-chat-events.test.ts`、`knowledge-chat-output.test.ts`。  
**修改：** `packages/commands/tests/e2e/knowledge/knowledge-chat.e2e.test.ts`。

- [ ] 先回放任务 1 fixture，断言最终 answer 恰为“最终答案”，不是工具+规划+答案；docs/usage/原始 events 单独保留。写明 planning/tool 缺 step_change、content 数组、未知事件的预期。
- [ ] chat-events 提供单一事件消费与最终聚合入口；chat.ts 仅决定展示方式。使用 core parseSSE，错误帧立即按既有错误边界处理；禁止 catch 后把业务错误吞掉继续输出成功。
- [ ] 保留 request_id；工具/来源原对象不裁剪，usage 不将累计帧相加；解析不识别的数据留在 events。无最终回答的结束不拿工具内容充数，以本地协议错误非零退出；服务端有错误文本则原样透传。
- [ ] 输出分支顺序固定为 quiet → JSON → text TTY → text 非 TTY；TTY streaming 只在非 quiet 下开启。TTY 可按阶段显示工具/规划，但最终答案不重复打印；JSON/text 管道在成功完成后统一输出结果。
- [ ] 以下是模式测试的固定结果要求，全部用同一 SSE mock，不发真实请求：

```text
json, tty=false/true   => 单个 JSON；answer=最终答案；events/docs 保留
text, tty=false       => stdout 仅最终答案
text, tty=true        => 阶段清楚，生成阶段输出最终答案
quiet, tty=false/true => stdout 仅最终答案
json + quiet          => 裸最终答案
verbose               => 只增加 stderr 诊断，不改变结果合同
```

- [ ] 网络分块/UTF-8/多帧用 Response 流测试；若发现 core parseSSE 缺陷，定位后单独修复其现有测试，不在 chat-events 复制解析器。补错误帧、截断连接、无生成、重复累计 usage 的用例。
- [ ] 真 PTY 代表性验证 text 与 text+quiet，使用本地模拟 SSE 服务；普通管道子进程不算 TTY 测试。已有重复“stream 非空”测试替换为有实际差异的断言。
- [ ] 定向运行两个新测试与 chat E2E 离线组，预期全部通过。文档明确 answer 内容纠正属于用户可见行为变化；提交 `fix(knowledge): separate final answers from process events`。

## D：独立通用扩展

### 任务 9：按能力分三个独立提交，不阻塞 A–C

**修改：** search/chat/doc-upload/doc-import、service-create/get/update、api/knowledge-admin 类型。  
**新增：** `packages/commands/tests/knowledge/knowledge-request-options.test.ts`、`knowledge-service-config.test.ts`。  
**修改 E2E：** knowledge-search/chat/service/doc-import 与 doc-upload 对应文件。

- [ ] **D1 search + doc import**：先补纯图片无 query 的 dry-run；query 改为可选，但与 image 至少一个有效输入，发空 query 字符串；旧空 query+image 兼容。`--kb-search-configs-file` 仅映射合同允许的在线过滤，不覆盖离线策略；坏 JSON/不合法来源本地失败。doc import 普通 chunk flags 逐一映射公开字段，help 明示不是视频秒数切片。分别断言缺省 body 不变与显式 body，仅 mock 验证过滤/分块参数。
- [ ] **D2 service**：create 的 config-file 与快捷 index-id 互斥；复用 update 完整配置文件读取方式。update 保持 config-file 整对象替换、标量读合并写；mock 更新 temperature 后比较原 kb_search_configs、hybrid_rerank、未知字段仍在。get text 显示每库/混排摘要，JSON 保持全量。使用现有 service E2E 生命周期，无需新媒体解析。
- [ ] **D3 chat 请求参数**：messages-file 与 message/image 互斥，传完整消息数组；仅在后端合同明确后支持 tool role 及关联字段，禁止默默转成 user 文本。session-file-id 为重复数组，enable-cache-control 与 request-id 严格映射已确认的请求位置，缺省不发送。session_files 同时补 lease/addFile 的 SESSION_FILE 支持；先 mock 两处一致，不单为此新增视频上传测试。
- [ ] 三个子提交分别先补失败用例、运行对应单元/E2E，按 schema 实现后复测。如合同未确认，保留该子任务未完成并报告依赖，不发布只能解析参数却不能正确调用的 flag。

**完成标准：** 通用能力可独立交付；未经验证的音视频查询输入、table/image 全流程、媒体 chunk 编辑不在本轮承诺中。

## 任务 10：实现克制的真实验收入口

**修改：** `packages/e2e/src/gating.ts`。  
**新增：** `packages/commands/tests/e2e/knowledge/journeys/rag-media-budget.ts`、`rag-media.e2e.test.ts`。  
**修改：** 同目录 `README.md`；复用 `journey-helpers.ts`。

- [ ] 为 gate/budget 写离线测试：通用 BAILIAN_E2E=1 不足以开启；缺专用开关/外部样本/解析额度任一条件均禁止写入；第二次 job 创建被测试 harness 拒绝。该预算是测试约束，不加入面向普通用户的命令限制。
- [ ] 新 gate 建议采用 `BAILIAN_E2E_RAG_MEDIA_WRITE=1`，外部路径 `BAILIAN_E2E_RAG_MEDIA_FILE`；运行路径由测试参数选择 upload 或 existing-file，两者互斥。校验样本大小及可读时长元数据，无法验证时在上传前退出；缺少媒体探测工具时报告未运行，不偷偷下载大文件或跳过校验。
- [ ] 测试上下文共享 fileId/indexId/ingestionId，创建任务前先登记额度消耗；请求超时也视为已消耗，不重试创建。跨进程锁覆盖整个媒体写入运行；锁冲突退出，不并行排队。
- [ ] upload 路径只上传一个小样本并入库一次；existing-file 路径从 collection/category/file 列表重新发现测试 fileId，再入库一次。第二页、嵌套类目与多文件边界留在 mock，不为触发翻页新增几十个真实文件。
- [ ] 同一次解析完成后运行 doc status/details/file get/chunk/search/chat；最多少量代表性检索问答，模式矩阵完全离线。service 配置测试复用该库或已有专用只读库，不重新导入。
- [ ] 记录资源所有权，只有本次创建的资源清理；预置资源、用户库 1uz4om722t/h4zeu45r6l 和用户服务不可写。finally 失败写 resources.json；超时保存 ingestionId 供续查，不重跑接入。
- [ ] 默认运行 `pnpm exec vp test packages/commands/tests/e2e/knowledge/journeys/rag-media.e2e.test.ts` 应显示媒体写入 skip。只有显式安排真实验收时才启用专用 gate；记录一次成功终态、目标文件召回与可关联来源。未实测分支注明未运行，不宣称全链路通过。

**提交：** `test(knowledge): gate media journeys with a single parse budget`。

## 任务 11：文档、生成资产与最终检查

**修改：** `docs/knowledge/kb.md`、`doc.md`、`file.md`、`chunk.md`、`search-chat.md`、`service.md`、`collection-category.md`、`knowledge-cli-guide.md`；按示例影响更新根 README.md/README.zh.md 与 packages/kscli/README.md/README.zh.md。

- [ ] 对照命令矩阵逐项标记已交付/合同阻塞/后续批次，避免把计划中所有 flag 都描述成已上线。写明后端字段责任、2 GB 边界、quiet 优先、chat JSON 与 answer 语义变化。
- [ ] 运行 `pnpm run sync:skill-assets`；只提交本次命令 metadata 产生的预期 reference 变化，不手改生成文件。若 skill 路由文案需变更，先读 `docs/agents/skill-change.md`。
- [ ] 运行双入口帮助：

```sh
pnpm -F bailian-cli exec tsx src/main.ts knowledge doc import --help
pnpm -F knowledge-studio-cli exec tsx src/main.ts doc import --help
```

预期命令可发现、参数对应、产品名前缀正确。

- [ ] 确认媒体专用 gate 关闭，再运行完整检查：

```sh
pnpm exec vp check
pnpm exec vp test
```

预期静态检查与离线测试通过；记录真实测试 skip，不能计为通过。若环境有普通 live 凭证，也不得自动开启媒体写入。

- [ ] 核对暂存清单，不含视频、大文件、凭证、生产 SSE/signed URL 或无关工作；最终提交文档/生成资产。
- [ ] 交付报告分别列：实现批次、离线结果、真实验收结果、后端阻塞项、未运行项。2 GB 真传与几十个视频解析不作为完成条件。

## 完成标准

A/B/C 的命令、双入口、JSON/文本合同及离线测试完成；后端合同依赖明确可追踪；真实接入若执行则遵守一次解析预算。D 可单独发布或保持未完成并明确范围。本计划执行不包含发布 npm、自动部署用户服务或批量上传视频。

## 执行记录（2026-09-24，持续更新）

开发位于隔离分支 `codex/rag-multimedia-cli`；原工作目录的审计材料保持原样。实现与离线验收已收口；全仓基线失败、后端发布依赖与未执行的真实分支分开记录。

- A/B/C 与 D 的源码和离线用例已落地，新增 doc import 已注册 bl/kscli；文档与生成 reference 已同步。
- 媒体大小暂按十进制 **2,000,000,000 字节** 实现与测试，已在会话说明此假设；后端精确单位仍未确认，因此不能据此声称 2 GiB 合同已验证。
- 媒体建库未显式提供模型时，不发送普通文档默认模型；显式模型参数分别透传，具体服务端缺省/组合未做真实验收。
- 为复用分页等待，runtime polling 仅增加通用 load 回调；新 validate 双语提示需要 core validate 返回 LocalizedText、runtime 统一 localize，未引入业务逻辑。
- 分页轮询额外覆盖跨页总数变化：不一致时重新取完整快照。原错误已有 hint 时追加部分成功 IDs，保留 message/exitCode/API 上下文。
- 2026-09-24 定向回归：轮询与真实 PTY 共 8 项通过；静态检查 0 errors、3 条既有无关 warnings。
- 完整离线测试正在核对；真实媒体验收保持关闭，未上传视频、未触发解析。尚未执行的真实分支不记为通过。

后续验收已补齐上传部分成功/文件变化/读取失败、49/50/51 和 9/10/11 离线边界、嵌套历史文件发现，以及详情与媒体输出的命令级回归。真实旅程清理无论是否抛错均保存报告并释放本机锁。

最新知识库与双入口回归为 711 通过、47 跳过；新增 doc import 编排另有 4 项通过。全量测试为 3025 通过、275 跳过、14 失败：其中 Memory skill 元数据已通过生成器同步并定向验证，其余 13 项在同一 HEAD 的原工作目录复现。详细证据和发布依赖见 [实施验收报告](../../knowledge/2026-09-24-rag-cli-implementation-report.md)。

提交组织调整：为避免拆分相互依赖的类型、实现和测试，按运行时支持、RAG 实现与测试、文档/生成资产三个提交收口；未机械执行原清单每任务一个提交。未合并、发布 npm 或修改用户服务。
