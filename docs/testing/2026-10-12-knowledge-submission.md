# Knowledge 功能变更与提测内容

范围：feat/knowledge，提交 c4ce767，按本地 origin/main 与 HEAD 的共同祖先 72bc8fc 到当前提交的差异核对。仅包含 Knowledge、Knowledge Skill 及直接支撑它们的公共运行时变化。Memory 来自其他分支且已单独提测，本轮完全排除，不列功能或回归要求。

以下“新增/修改/删除”均相对代码基线，测试均为待执行计划，不表示已通过。

配套 [逐功能测试方案](https://alidocs.dingtalk.com/i/nodes/gwva2dxOW4vRkd9DUYrYLEnnJbkz3BRL) 使用相同 F01—F20 编号。

## 功能增删改总览

| 编号 | 功能                             | 变更类型       |
| ---- | -------------------------------- | -------------- |
| F01  | 一键初始化知识库                 | 新增           |
| F02  | 本地目录扫描与增量新增           | 新增           |
| F03  | 目录同步的替换与删除             | 新增           |
| F04  | 同步中断恢复与远端关联校验       | 新增           |
| F05  | 知识库类型、模型默认值与建库确认 | 修改＋新增参数 |
| F06  | 本地音视频上传及解析器配置       | 修改＋新增参数 |
| F07  | OSS 导入指定解析器               | 修改＋新增参数 |
| F08  | 已有文件导入已有知识库           | 新增           |
| F09  | 文件级切片配置查询               | 修改＋新增模式 |
| F10  | 图片检索及在线过滤配置           | 修改＋新增参数 |
| F11  | 完整问答消息与工具历史           | 修改＋新增参数 |
| F12  | 临时会话附件                     | 新增           |
| F13  | 问答流聚合及来源输出             | 修改           |
| F14  | 检索服务完整配置与可见性         | 修改＋新增参数 |
| F15  | 知识库与切片信息展示、数据集术语 | 修改           |
| F16  | 移除旧 retrieve 入口             | 删除           |
| F17  | 结构化命令能力发现               | 新增           |
| F18  | 只读预检与按计划确认             | 新增公共机制   |
| F19  | 个人资料知识库 Skill             | 新增           |
| F20  | Knowledge Skill 分发与双入口参考 | 新增＋迁移     |

公开路径变化：新增 `knowledge init`、`knowledge doc sync`、`knowledge doc import`（kscli 对应 init/doc sync/doc import）；删除两个产品的 retrieve。其他条目是现有命令参数/行为修改或新增 Skill、运行时能力。

## F01 一键初始化知识库

功能说明：本次新增一键初始化能力，自动建立样例知识库和检索服务并验证召回，让用户快速跑通首次知识库体验。

变更类型：**新增**。入口：`bl knowledge init`；`kscli init`。

原来需要分别上传文件、建库、创建检索服务和查询验证；现在可用一条命令完成样例闭环。

### 具体变动点

1. 新增 --name、--state-file、--poll-interval；默认名称 cli-demo，恢复记录默认 .bailian/knowledge/init.json。
2. 在默认分类上传样例，创建知识库及 beta 检索服务，补齐检索配置后验证样例内容能被召回；不自动发布服务、不创建问答服务、不上传用户目录。
3. 保存已创建资源和执行阶段，重复执行核对并复用资源；有冲突或无法确定的写结果时停止，不能仅凭同名接管。
4. 成功输出 indexId、agentId、stateFile 和 sampleSearch；文本新增样例问题、命中文档名及最多 400 字符摘要，JSON 保留完整结果。
5. 输出按 bl/kscli 实际路由生成的后续查询、清理指引；失败途中也报告已创建资源。

### 对应测试

- P0：空状态执行 init --dry-run --output json；比较远端资源与本地状态前后。验收：返回创建计划及费用说明；允许只读请求，不创建资源或 checkpoint。
- P0：非交互首次执行不带 --yes，再带 --yes 执行。验收：未确认退出 7；确认后样例实际召回，资源 ID 和 beta 检索服务绑定正确。
- P0：同一状态文件重复执行，不带 --yes。验收：复用原 file/index/agent ID，不重复建库；仍核对样例检索。
- P0：分别在上传、建库、建服务后注入失败；恢复执行；再测试状态绑定到其他 Workspace。验收：可确认的步骤续接；未知结果先核对，错误目标阻止执行；失败资源可定位。
- P1：分别以 text/json、bl/kscli 执行；用长样例检查显示。验收：摘要截断不影响 JSON 原文；后续路径使用正确产品；样例成功不宣称用户资料已入库。
- P1：name 空白/20/21 字符，空 state-file，poll-interval 为 0/负值。验收：合法输入通过；非法输入为用法错误，不触发写入。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/init.ts)。

## F02 本地目录扫描与增量新增

功能说明：本次新增目录增量接入能力，识别本地新增和未变化的资料，只上传需要接入的文件，避免重复导入。

变更类型：**新增**。入口：`bl knowledge doc sync`；`kscli doc sync`。

原有 doc upload 是上传操作；新增 sync 用持久状态跟踪目录并区分新增、未变化与变更。

### 具体变动点

1. 必填 --dir、--index-id；可指定 --state-file、--category-id、--sync-id、--poll-interval。默认状态为本地目录下的 .bailian/sync-state.json。
2. 递归扫描并计算内容 SHA-256/MD5，不只依赖文件大小或 mtime；使用同步标记关联相对路径与远端 fileId/docId。
3. 排除 .git、node_modules、.bailian、当前状态/锁/临时文件；不跟随符号链接；当前跳过音视频和不支持的格式。
4. 预览提供 scope、syncId、stateRevision、summary、actions、skipped、unmanaged、orphans、conflicts、blocked；纯新增与无变化计划按实际风险处理。

### 对应测试

- P0：先 dry-run，再执行纯新增，再原样复跑。验收：首次两份文档入库可召回；复跑无重复上传/导入；预览无远端和状态写入。
- P0：修改文件内容，但保持字节长度和 mtime 不变。验收：按摘要识别为变化，不误判 skip。
- P1：扫描嵌套目录、中文/空格文件名、符号链接、状态文件、音视频。验收：支持文件路径正确；链接不跟随；排除项/媒体列入 skipped，不误上传。
- P0：扫描中修改文件，或令子目录不可读。验收：整体停止，不用部分本地清单推导同步或删除。
- P1：根路径是文件/符号链接；dir/index-id 空白；轮询间隔非正数。验收：用法错误或明确文件错误；不发生云端写入。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-sync.ts)。

## F03 目录同步的替换与删除

功能说明：本次新增目录同步中的文件更新和删除能力。再次执行 doc sync 时，会根据本地文件的变化处理知识库中的对应文档。

### 文件处理场景

以下同时涵盖 F02 的新增/跳过和 F04 的恢复行为，便于对照。

- **新增文件**：例如目录里新增了“产品介绍.md”，同步时会上传并导入知识库，记录本地路径与远端文档的对应关系。

- **文件未变化**：例如原样再次同步“产品介绍.md”，内容摘要一致时跳过，不重复上传或导入。

- **修改文件**：例如修改了“产品介绍.md”，确认替换后，先上传并导入新版，确认新版索引就绪后再删除旧索引文档；若新版上传或导入失败，保留旧版。

- **删除本地文件**：例如删除了“旧版说明.md”，默认保留知识库中的对应文档；只有显式带上 --delete 并完成确认，才删除该同步流程管理的对应索引文档。非交互执行需 --yes。

- **文件改名或移动**：例如把“产品介绍.md”改成“新版介绍.md”，按旧路径消失、新路径新增处理，不视为原地改名；默认上传新路径并保留旧文档，开启 --delete 并确认后才清理旧路径对应的索引文档。

- **其他方式上传的文档**：例如有人通过控制台上传了“内部制度.pdf”，即使本地没有该文件，同步也不会删除它。“托管”仅指本同步流程能够可靠确认归属并记录关联的文档。

- **文件变成目录、链接或无法正常扫描**：例如原来的“产品介绍.md”变成同名目录或符号链接，不按普通文件删除处理；发现相关冲突或扫描不完整时停止执行，避免误删。

- **同步中断或超时**：重新执行时先核对已保存的操作记录和远端结果，能可靠确认时继续恢复；结果不明确或归属冲突时停止，避免重复写入或误删。具体恢复规则见 F04。

- **删除范围**：以上替换和删除仅清理目标知识库中的索引文档，数据中心里的源文件仍然保留。

变更类型：**新增**。入口：`doc sync --yes`；`doc sync --delete --yes`。

新增托管文档的替换和显式删除能力；普通上传或本地文件消失不再被混同为全库清理。

### 具体变动点

1. 本地内容变化时先上传/导入新版，确认新索引就绪后才删除旧索引。
2. 本地文件被移除时默认保留远端；只有显式 --delete 且完成确认才删除对应托管索引文档。
3. 替换和删除按实际计划要求确认；未托管文档不被接管或删除，数据中心源文件保留。
4. 执行前重新核对本地输入、远端清单及状态版本，防止预览后变更导致旧计划继续执行。

### 对应测试

- P0：修改 A；预览后非交互不带 yes 执行，再带 yes。验收：未确认退出 7 且不写入；确认后新版可召回，旧版在新版就绪后删除。
- P0：注入新版导入失败。验收：旧文档仍可检索，不因替换失败先删旧版本。
- P0：删除本地 B，先不带 delete 执行，再按 dry-run/无 yes/yes 测 delete。验收：默认保留；预览和未确认不删；确认仅删 B 的托管索引。
- P0：每一步回读哨兵和所有源文件。验收：未托管文档始终保留；数据中心源文件仍存在。
- P0：预览后修改目录/远端资源/状态版本。验收：检测计划失效并阻止按旧计划写入。
- P0：把托管文件改成同名目录或链接后使用 --delete。验收：不当作普通缺失文件误删；冲突/跳过原因可见。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/sync/execute.ts)。

## F04 同步中断恢复与远端关联校验

功能说明：本次新增同步恢复能力，在上传、导入或删除中断后核对已执行结果并续接，避免重复写入、串库或误删。

变更类型：**新增**。入口：`doc sync --state-file …`；`--sync-id …`。

新增可恢复的同步状态，不将请求超时等同于请求未执行。

### 具体变动点

1. 状态绑定同步目标，记录 pending 操作及资源关联；采用状态版本核对、锁与安全写盘。
2. 未知上传/导入/删除结果先查远端与精确操作标记，不能盲目重试，也不能接管同路径同内容的历史文件。
3. 状态丢失时可携带原 sync-id 从可唯一关联的远端信息恢复；无法可靠恢复的内容标记 orphan。
4. 重复标签、缺字段、分页不完整或资源关联冲突阻止写入；恢复后有剩余变更时要求重新预览。跨机器仍需外部串行。

### 对应测试

- P0：上传已提交但响应丢失；用相同状态重跑。验收：先确认本次操作，不能重复上传或错误接管历史文件。
- P0：导入/删除响应丢失、写 checkpoint 失败。验收：保留恢复证据；不虚报完成；再次执行按可核对结果恢复。
- P0：删除本地状态副本后提供原 sync-id；再构造无法恢复路径。验收：唯一关联可恢复；无法恢复的成为 orphan，不猜测路径后删除。
- P0：返回重复 file/doc 关联、缺字段、缺页或错误 total。验收：阻塞计划，不能基于不完整清单执行删除。
- P0：同状态两写入者，或恢复时换 Workspace/index/category。验收：冲突/目标不匹配被拒绝；不能串库。
- P1：恢复完成但剩余变更需重规划。验收：明确 requiresReplan，重新预览后才继续后续动作。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/sync/recovery-run.ts)。

## F05 知识库类型、模型默认值与建库确认

功能说明：本次在建库功能中新增知识类型、场景和多模态模型配置，并增加创建前的计费提示与确认。

变更类型：**修改＋新增参数**。入口：`bl knowledge create`；`kscli kb create`。

原建库以默认文档参数为主；现在显式支持类型/场景、多模态模型，并将创建纳入风险确认。

### 具体变动点

1. 新增 --knowledge-type document/multimedia、--knowledge-scene、--multimodal-embedding-model。
2. multimedia 默认场景 basic_multimedia_qa，默认 qwen3-vl-embedding 与 qwen3-vl-rerank（similar）；visual_perception_qa 使用 VL 向量模型；普通文档默认 text-embedding-v4。
3. scene 依赖 type；音视频场景固定；音视频/视觉理解分支 embedding-model 与 multimodal-embedding-model 二选一；显式模型兼容性由服务端裁定。
4. 建库新增确认和持续计费提示；dry-run 输出 notices，创建成功即报告资源，后续等待失败也保留清理线索。

### 对应测试

- P0：document、multimedia、visual_perception_qa 分别 dry-run。验收：knowledgeType/Scene、embedding/rerank 请求字段和默认值符合各分支。
- P1：只传 scene；非法 type/scene；VL 分支同时传两个模型参数。验收：本地用法错误，写入前失败。
- P1：传显式模型；构造服务端模型不兼容响应。验收：显式值不被偷偷替换，服务错误原样返回，不由 CLI 猜测错误分类。
- P0：非交互建库无 yes、dry-run、yes 三种路径。验收：无 yes 退出 7；预览不建库；确认才创建，费用提示在 quiet/JSON 场景仍可查。
- P0：建库成功后导入等待失败。验收：已创建 index ID 可定位，不宣称整个操作无副作用；按资源清理。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/kb-create.ts)。

## F06 本地音视频上传及解析器配置

功能说明：本次将本地上传扩展到音视频，新增解析器及配置文件参数，并采用流式上传支持较大媒体文件。

变更类型：**修改＋新增参数**。入口：`knowledge doc upload`；`kscli doc upload`。

原上传能力扩展到音视频；新增解析器和配置文件入口，并调整上传实现为流式读取。

### 具体变动点

1. 支持 mp3/wav/mp4 等音视频扩展名，单媒体文件上限 2 GiB（2147483648 字节）。
2. 带 --index-id 入库时，一次最多 50 个本地媒体文件，按媒体数量计数，不自动拆批。
3. 新增 --parser、--parser-config-file；本地上传默认 AUTO_SELECT；配置必须是 JSON 对象，合法服务端配置字段透传。
4. 上传使用流式内容读取，保留上传租约→OSS PUT→文件登记→可选索引导入的流程；文档/图片原有限制继续适用。

### 对应测试

- P0：上传小媒体并带 index-id --wait；回读文件/文档/检索结果。验收：上传登记、解析入库完整成功，真实样本内容可检索。
- P1：媒体大小为 2 GiB−1、等于上限、＋1。验收：前两者通过本地大小预检；超限在上传前失败。
- P1：带 index-id 上传 49/50/51 个媒体；混入普通文本。验收：49/50 通过数量校验，51 在上传前失败；普通文件不计入媒体数量。
- P1：parser 省略/显式；config 对象、数组、null、损坏 JSON、缺文件。验收：默认与显式字段正确；对象透传；形状/语法和文件错误可诊断。
- P1：较大本地 fixture 走受控上传；中途断流或 PUT 失败。验收：流式路径可运行，错误不被吞掉，不继续登记一个未完成文件。
- P1：PDF/图片/文本目录上传回归。验收：原硬上限/软提示及目录跳过行为保持，不能因媒体支持改变已有文档合同。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-upload.ts)。

## F07 OSS 导入指定解析器

功能说明：本次为 OSS 导入新增解析器和配置文件参数，让已有 OSS 文件在接入时使用指定的解析方式。

变更类型：**修改＋新增参数**。入口：`knowledge doc import-oss`；`kscli doc import-oss`。

原 OSS 导入不暴露 parser；现在可为 OSS 文件登记传递解析器及其配置。

### 具体变动点

1. 新增 --parser、--parser-config-file，复用 JSON 对象校验。
2. parser/parserConfig 写入每个 fileDetails 项，保留 bucket、region、oss-key、category、tag、overwrite 的原有含义。
3. 不把本地媒体上传的 50 文件上限无依据地套用到 OSS 注册；服务端限制和错误原样返回。

### 对应测试

- P0：两个 oss-key，带 parser/config 执行 dry-run，再真实注册。验收：每个 fileDetails 都含正确解析配置，返回的文件可查询。
- P1：省略 parser/config，分别开启 tag/overwrite。验收：原有字段不丢失，不强行写入用户未指定的 OSS parser 字段。
- P1：非法配置对象、JSON、文件权限。验收：上传/注册前给出明确错误。
- P1：未授权 Bucket、不存在 key、服务拒绝。验收：服务错误原样透传；不把注册失败宣称为入库成功。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-import-oss.ts)。

## F08 已有文件导入已有知识库

功能说明：本次新增将数据中心已有文件或分类导入已有知识库的能力，无需重新上传文件或重新建库。

变更类型：**新增**。入口：`knowledge doc import`；`kscli doc import`。

新增独立导入入口，不必重新上传文件或创建新库。

### 具体变动点

1. 必填 --index-id；--doc-id 接收数据中心 fileId，可重复；与可重复 --category-id 必须二选一。
2. 支持 --chunk-mode、--chunk-size、--overlap-size、--separator、--enable-headers；这些是文档切片配置，不是视频时间切片。
3. 支持 --wait、--poll-interval；导入任务轮询读取完整分页，识别失败文档和部分成功。
4. dry-run 返回导入计划；实际导入可能触发解析/索引，但不重复申请上传租约。

### 对应测试

- P0：分别按 fileId 列表和 category-id 导入；等待后回读 doc/chunk/search。验收：两条来源路径均成功，不发生二次上传；实际内容可召回。
- P1：不传来源、两来源混用、空白 ID。验收：用法错误，不创建导入任务。
- P1：chunk-size 0/1/6000/6001，overlap −1/0/1024/1025；length 无 size、regex 无 separator。验收：合法整数边界通过；越界与缺依赖退出 2；enable-headers=false 被保留。
- P0：多页任务末页失败、部分成功、超时。验收：不只看第一页；失败及已完成部分可识别；超时不冒充完成。
- P1：对同一输入 dry-run，不带 wait，带 wait。验收：预览无写入；不等待返回任务回执；等待输出实际终态。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-import.ts)。

## F09 文件级切片配置查询

功能说明：本次在文档列表中新增详情模式，用于查询每份文件实际采用的切片大小、重叠、分隔符和标题提取配置。

变更类型：**修改＋新增模式**。入口：`knowledge doc list --details`；`kscli doc list --details`。

原 doc list 只走普通列表；新增详情模式读取每个文件的切片配置。

### 具体变动点

1. 新增 --details，切换到文件详情接口；普通模式仍保留原 GET 列表。
2. 详情文本输出 chunkSize、overlapSize、separator、chunkMode、enableHeaders；缺字段显示占位，不伪造默认值。
3. 普通 page-size 最大 100，details 最大 10，默认 10；page-number 与 page-size 增加正整数检查。

### 对应测试

- P0：同一 index 分别执行普通 list 和 --details。验收：文档归属一致；details 回读实际文件级配置，JSON 不丢字段。
- P1：details page-size=1/10/11；普通=100/101。验收：合法范围通过；对应超限退出 2。
- P1：page-number/page-size 为 0、负数、小数；翻第二页和空页。验收：非法分页本地拒绝；正常翻页与 total_count 匹配。
- P1：配置缺字段、enableHeaders=false、overlapSize=0。验收：不把 false/0 当缺失；缺失用占位，不引发输出崩溃。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-list.ts)。

## F10 图片检索及在线过滤配置

功能说明：本次在检索功能中新增纯图片查询和在线过滤配置，并补充媒体结果摘要，便于按指定资料范围检索图文内容。

变更类型：**修改＋新增参数**。入口：`knowledge search`；`kscli search`。

原 query 为必填；现在 query/image 至少一个，新增在线知识库过滤配置文件。

### 具体变动点

1. 支持不传 query 的纯图片检索；原图文组合继续可用。
2. 新增 --kb-search-configs-file，内容为含 id 和可选 search_filters 的数组；id 必须非空且不重复。
3. 外层只允许 id/search_filters，避免在线配置覆盖离线排序策略；合法过滤内部字段保留，由服务端解释。
4. 文本结果增加媒体摘要，正文可回退到 clip_description；JSON 保留原返回信息。

### 对应测试

- P0：分别仅 query、仅 image、query+image 检索。验收：请求正确；纯图不因缺 query 被拒绝；返回相关资料。
- P1：query/image 全缺或空白。验收：本地用法错误，不发送检索请求。
- P0：使用合法过滤限定资料；检查请求和实际召回。验收：仅传指定知识库/过滤配置，不夹带离线排序覆盖字段。
- P1：重复/空 id、额外外层字段、非数组 search_filters、坏 JSON。验收：本地拒绝；合法未知内部过滤字段不被擅自删除。
- P1：返回仅 clip_description 的媒体节点；分别 text/json。验收：文本有有效摘要及媒体信息，JSON 原数据完整。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/search.ts)。

## F11 完整问答消息与工具历史

功能说明：本次在问答功能中新增完整消息文件、工具历史、业务请求 ID 和缓存控制参数，以支持更完整的多轮对话输入。

变更类型：**修改＋新增参数**。入口：`knowledge chat --messages-file`；`kscli chat --messages-file`。

原主要通过重复 message/image 组装输入；新增完整消息文件及工具历史。

### 具体变动点

1. 新增 --messages-file，读取非空 messages JSON 数组；与 --message/--image 互斥。
2. 支持 user、assistant、tool 角色；文件内消息 content 为字符串或数组，tool 消息必须带非空 tool_call_id；保留工具历史字段。
3. 新增 --request-id 写入 input.request_id，--enable-cache-control true/false 写入 agent_options；false 不能被忽略。

### 对应测试

- P0：合法多轮/工具历史通过 messages-file 发起问答。验收：消息顺序及工具字段不丢失，服务接收并返回完整回答。
- P1：messages-file 同时配 message 或 image。验收：本地互斥错误，不发送请求。
- P1：空数组、对象、错误角色、缺 content、tool 缺 tool_call_id、损坏 JSON。验收：用法错误；缺文件走文件错误，不崩溃或退化成普通文本。
- P1：request-id 自定义；cache-control 分别 true、false、未指定。验收：映射位置正确，显式 false 保留，未指定不强加字段。
- P1：原有 message 文本/role:content/图片方式回归。验收：原快捷输入仍可用，与新文件入口互不污染。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/chat.ts)。

## F12 临时会话附件

功能说明：本次新增临时会话附件能力，上传文件后可直接供当前问答使用，无需先导入长期知识库。

变更类型：**新增**。入口：`doc upload --category-type SESSION_FILE`；`chat --session-file-id`。

新增临时会话文件上传和问答引用，不要求先建立长期知识库索引。

### 具体变动点

1. upload 新增 --category-type UNSTRUCTURED/SESSION_FILE；SESSION_FILE 在租约和登记两步使用一致类型。
2. SESSION_FILE 使用默认解析方式，与 index-id、parser、parser-config-file 互斥；不能顺带导入长期库。
3. chat 新增可重复 --session-file-id，最多 10 个非空 ID，传入 agent_options.session_files；依赖问答服务开启文件预解析。

### 对应测试

- P0：SESSION_FILE 上传→获取 fileId→chat 引用并询问文件独有内容。验收：两阶段类型一致；消息引用实际 fileId；附件内容可用，不新增长期库索引。
- P1：SESSION_FILE 分别混用 index-id、parser、parser-config-file。验收：上传前用法错误，无不符合类型的文件登记。
- P1：chat 附件 1/10/11 个，包含空白 ID。验收：1/10 通过参数校验，11/空 ID 拒绝。
- P1：使用未开启预解析的服务或错误 fileId。验收：保留实际服务错误，不声称附件处理成功；不自动另建库绕过。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/doc-upload.ts)。

## F13 问答流聚合及来源输出

功能说明：本次改造问答流的聚合与输出，分离规划、工具过程和最终回答，并保留资料来源与媒体引用供展示或程序读取。

变更类型：**修改**。入口：`knowledge chat`；`kscli chat` 的 text/json/quiet/verbose。

原问答输出偏重内容拼接；现在按阶段聚合最终回答，并保留工具与资料来源。

### 具体变动点

1. 区分 planning、tool_calling、generating；只有生成阶段的回答进入 answer，不把规划或工具文本混进最终答案。
2. JSON 保留 answer、phases、tools、docs、events、usage、request_id 等实际聚合信息；从工具 extra_json 提取来源，支持对象或 JSON 字符串形式。
3. TTY 文本显示阶段与媒体来源；非 TTY 文本只输出最终答案；quiet 优先于 JSON/TTY，仅输出裸答案；verbose 只增加 stderr 诊断。
4. 要求完整生成终态和非空答案；流提前结束或没有最终回答报错。SSE 服务错误保留原信息。

### 对应测试

- P0：规划→多轮工具→生成→终态；比较 JSON 和 TTY。验收：answer 只含最终回答且无重复，docs/tools 不丢；阶段和媒体引用可读。
- P0：同 fixture 跑 JSON、text/TTY、text/管道、quiet、quiet+JSON。验收：各模式符合输出合同；quiet+JSON 是裸答案，不能按 JSON 解析。
- P1：打开 verbose。验收：诊断只在 stderr，JSON stdout 仍可解析。
- P0：无 generation_end/stop、仅规划、答案为空、SSE error。验收：不虚报成功；错误退出，服务端错误信息保留。
- P1：extra_json 为对象/字符串/坏字符串；多 choices。验收：正常来源提取；原始数据可追溯；不拼接多个候选答案。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/chat-events.ts)。

## F14 检索服务完整配置与可见性

功能说明：本次在服务创建中新增完整配置文件入口，并扩充服务详情展示，方便配置和核对多知识库检索及排序策略。

变更类型：**修改＋新增参数**。入口：`service create --config-file`；`service get/update`。

原 service create 主要用 index-id 简单绑定；新增完整 agent_config 文件，并扩充详情显示。

### 具体变动点

1. create 新增 --config-file，与 --index-id 互斥，允许完整配置多库检索、排序等服务端配置。
2. service get 文本新增 hybrid_rerank 及各库 rerank、rerank_model、rerank_top_n、rerank_min_score、dense/sparse_similarity_top_k。
3. create/update 文档明确多模态排序模型语义；显式配置保留，兼容性由服务端校验，不声称 CLI 自动重写用户全部模型配置。
4. 服务读写抽出共享 operations；原 beta 更新和已发布版本约束仍需回归。

### 对应测试

- P0：config-file 创建→get→更新 beta→get。验收：多库绑定及显式配置完整保留，详情可见；未指定字段不被意外清空。
- P1：config-file 与 index-id 并传、坏 JSON、非对象。验收：本地拒绝；缺文件可诊断。
- P1：rerank=false、分数0、hybrid配置；text/json 分别查看。验收：false/0 不丢，新增展示与原响应一致。
- P0：修改 beta，回读正式版本；向正式版传非法配置更新。验收：不误改已发布版本，保持原版本约束；服务拒绝原样透传。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/service-create.ts)。

## F15 知识库与切片信息展示、数据集术语

功能说明：本次补充知识库类型、场景、模型和媒体切片信息展示，修正列表总数读取，并统一“数据集”术语。

变更类型：**修改**。入口：`knowledge list/info`、`chunk list/add`、`collection/category` 文案。

补充多模态信息展示并修正总数读取，统一中文术语；不新增 collection 管理接口。

### 具体变动点

1. knowledge list 增加 knowledgeType，total 改读服务响应 total_count；info 增加 knowledgeType、knowledgeScene、multimodalEmbeddingModelName。
2. chunk list 正文可回退到 clip_description，并显示媒体摘要；继续保留文档/切片 ID 和状态。
3. chunk add 补充服务端不支持音视频新增切片的说明，不伪造本地支持。
4. collection 中文统一为“数据集”，同步命令帮助、README、指南和相关 Skill；命令路径/参数名仍是 collection。

### 对应测试

- P1：list 返回 total_count=25、rows=10。验收：显示总数25而非10；缺总数字段才回退当页数量。
- P1：两种库执行 info；切片仅有 clip_description。验收：类型/场景/模型及摘要正确，缺字段不崩溃。
- P1：以 JSON 和 text 查看相同切片。验收：JSON 媒体字段保留；文本显示实际片段信息，不编造时间/链接。
- P1：检查 collection/category 中英文 help、指南和 chunk add 说明。验收：中文术语一致，原 collection 命令仍可用；音视频切片新增边界明确。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/commands/src/commands/knowledge/kb-list.ts)。

## F16 移除旧 retrieve 入口

功能说明：本次删除旧 retrieve 命令入口，知识库检索统一使用 search，旧调用需按检索服务参数迁移。

变更类型：**删除**。入口：`bl knowledge retrieve`；`kscli retrieve`。

删除旧 retrieve 实现、导出及两个产品路由；当前检索使用 search。

### 具体变动点

1. 移除 knowledgeRetrieve 导出和 retrieve.ts 实现，更新入口、参考和旧测试。
2. 不提供同名兼容别名；旧脚本需要迁移到 search，并按检索服务传 agent-id 和 query/image。
3. 迁移不是简单把旧知识库 ID 当 agent-id，也不是只改命令名即可保持请求合同。

### 对应测试

- P0：在 bl/kscli 调用旧 retrieve 路径。验收：不再路由到旧实现；明确未知命令/用法失败，不静默改走其他接口。
- P1：检查两产品 help、introspect、生成参考。验收：不再暴露旧入口；search 可发现。
- P0：将旧用例改为 search＋真实 agent-id 查询标记词。验收：完成等价业务目的；不混用 indexId 和 agentId。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/cli/src/commands.ts)。

## F17 结构化命令能力发现

功能说明：本次新增结构化能力发现入口，让 Agent 无需登录即可读取当前产品的命令、参数、风险和用法。

变更类型：**新增**。入口：`bl knowledge --introspect`；`kscli --introspect`，支持根/组/叶范围。

原依赖人读 help；新增面向 Agent 的稳定 JSON 元数据。

### 具体变动点

1. 输出 schema_version、产品 bin/version/scope、全局和鉴权 flags、退出码及范围内命令。
2. 逐命令输出 path、usage、双语描述、flags、examples、notes、risk、preparation；示例由产品实际路径生成。
3. 发现阶段无需鉴权，不读取业务配置、不执行 prepare/run、不发云请求或写文件。
4. 只导出声明式元数据，明确 crossFlagValidation=not-exported；不能代替执行期组合参数校验。

### 对应测试

- P0：无凭证执行根/knowledge组/init叶发现。验收：返回合法JSON，范围正确，不要求登录、不写配置、不执行命令。
- P1：同版本同范围重复输出并比较；比对实际 registry。验收：JSON稳定，命令/flags和真实入口一致，含新增3条且不含retrieve。
- P1：检查 bl/kscli 的 usage/examples/清理引用。验收：产品名和路径正确，不机械替换前缀造成 kb 路径错误。
- P1：检查双语、风险、prepare和参数互斥表述。验收：元数据齐全；不把未导出的跨参数约束误说成完整schema支持。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/runtime/src/introspect.ts)。

## F18 只读预检与按计划确认

功能说明：本次新增只读预检和按实际计划确认的执行机制，使初始化与同步先展示具体影响，再决定是否需要确认并执行写入。

变更类型：**新增公共机制**。入口：init/sync 使用 prepare；运行时确认与错误输出。

原静态风险确认之外，新增先读取实际资源、生成计划，再判定是否需要确认的执行阶段。

### 具体变动点

1. 命令可声明只读 prepare，返回准备数据、preview、实际 risk、notices；init/sync 接入。
2. dry-run 可以鉴权和只读查询，但在写资源/状态前返回；纯复用/新增与替换/删除按实际计划分别判断。
3. 未确认错误保持 requires_confirmation/退出码7，并附 plan/notices；文本和JSON都能看到具体影响。
4. validate 可返回本地化文案；新增 commandPath 解析当前产品路由。原无 prepare 的 Knowledge 命令仍保持原执行约定。

### 对应测试

- P0：init/sync dry-run，带/不带 yes，统计请求方法及文件变化。验收：只有必要只读预检；无上传/增删改/状态落盘。
- P0：高风险非交互无 yes；低风险复用/新增。验收：高风险退出7并附计划；低风险按实际计划执行，不无条件拦截。
- P0：prepare 鉴权失败或远端查询失败。验收：run 不执行；错误保留实际原因，不生成虚构计划。
- P1：JSON/text/quiet，zh-CN/en-US 校验；旧高风险 Knowledge 删除/发布命令。验收：确认信息可读且输出合同明确；旧静态确认无退化。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/packages/runtime/src/preparation.ts)。

## F19 个人资料知识库 Skill

功能说明：本次新增个人资料知识库 Skill，帮助 Agent 按授权接入、检索和维护用户资料，并依据真实资料完成任务。

变更类型：**新增**。入口：`skills/bailian-knowledge` 的绑定、接入、检索、维护与恢复。

新增面向“参考我的历史资料完成任务”的 Agent 工作流；不是后台同步服务。

### 具体变动点

1. 通过 ~/.bailian/personal-knowledge/config.json 保存资料用途、产品/Workspace/库/服务绑定和状态，支持 initializing、active、paused 及 blocked_reason。
2. 区分 relevant_tasks 与 on_request 读取授权；按客户/项目用途选绑定，不默认查询所有库。
3. 首次接入先复用资源、确认上传范围和费用；必须真实用户资料入库并可检索，不能拿 init 样例替代资料接入。
4. 回答使用真实来源；读取授权不等于上传/更新授权；检索时不静默同步。
5. 支持暂停、单次不用、恢复和清理；暂停不停止计费，恢复不自动补传；资料中的指令不构成操作授权。

### 对应测试

- P0：无绑定要求参考旧资料；拒绝/未回应接入。验收：不上传、不建库、不假称已检索；完成可做部分且不反复引导。
- P0：明确接入目录；中途失败后继续；随后提出资料相关任务。验收：复用身份/资源，真实资料召回后才完成绑定；交付任务结果及真实引用。
- P0：两客户绑定，分别 relevant_tasks/on_request；服务绑定多个库。验收：不跨客户/授权范围读取；只在允许的触发条件下查询。
- P0：本地新增文件后仅要求查询；随后明确要求更新。验收：查询不隐式上传；更新核对计划和风险后同步。
- P0：暂停某绑定、本次别用、明确恢复、停止收费。验收：单次与持久控制区分，缓存停止使用；恢复不补传；只有实际删库才对应停止该资源运行计费。
- P1：空召回、权限失败、损坏配置、未知状态、资料夹带工具指令。验收：不编造来源，不擅建库绕过，不把资料指令当授权；按已知状态停止/恢复。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/skills/bailian-knowledge/SKILL.md)。

## F20 Knowledge Skill 分发与双入口参考

功能说明：本次新增独立 Knowledge Skill 的安装、更新和双入口参考分发，使 Agent 获得与当前 bl、kscli 能力一致的使用指引。

变更类型：**新增＋迁移**。入口：`bl skill init/add/update`；Knowledge 参考生成及发布检查。

知识库路由和命令参考从 hub 拆至独立 bailian-knowledge，并增加 kscli 参考。

### 具体变动点

1. hub 路由到独立 Knowledge Skill，共享 protocol 增加交接约定；独立包包含 bindings/setup/maintenance 及命令参考。
2. 支持整包 skill init、子集 add（protocol,knowledge）和已安装 skill update；不新增 kscli skill 命令。
3. Knowledge 参考从真实产品命令表/schema 生成，同时覆盖 bl 和 kscli；同步版本元数据、pre-commit 与 release 检查。
4. README/指南统一新增入口及数据集术语；dsh 插件此次仅相关术语文案，不包含独立插件功能开发或发布。

### 对应测试

- P0：分别整包 init、仅 add protocol+knowledge、已有安装 update。验收：Skill及所有引用资源齐全，版本正确，更新不遗漏已安装内容。
- P1：比较生成 bl/kscli 参考和真实 introspect。验收：新参数/新增命令齐全、retrieve移除、路径正确，无旧hub重复明细。
- P1：用实际打包产物启动 help/introspect，再加载已安装 Skill。验收：不因源码可运行掩盖打包缺文件；引用可读，protocol hand-off可执行。
- P1：检查 README/指南入口和 collection 术语。验收：示例与真实路由一致；不把文案迁移当额外业务API。

代码依据：[实现](https://github.com/modelstudioai/cli/blob/c4ce7679a2635061a536104f9da22932d371f4e9/tools/generate-knowledge-reference.ts)。
