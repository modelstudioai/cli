# Knowledge Directory Sync Implementation Plan

> 验收索引：[最终验收记录](2026-09-29-knowledge-verification.md)。任务已实现并验证；下方早期进度段落保留为历史记录，最终证据和验证边界以验收记录为准。测试文件组织按实际代码调整，同一行为的路由断言收在 introspect 测试中。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将本地目录增量同步到指定知识库，在重复执行、局部失败和显式删除场景中保持可解释、可恢复。

**Architecture:** 扫描与远端快照 → 纯函数生成计划 → runtime 风险确认 → 加锁复核 → 顺序执行与 checkpoint。本地 state 为路径真相，远端标记为归属/恢复线索，所有索引删除使用实测关联的 docId。

**Tech Stack:** TypeScript、Node fs/crypto、已有上传/导入/poll API、A 的 prepare 契约、B 的 state-store 和 operations。

---

## CLI 与首版限制

### 开发进度（2026-09-29）

C1 真实契约探测、同步实现和 J7 真实旅程均已完成。原仓库 `.env` 的既有凭证可用；此前缺配置的结论来自隔离目录，现已修正。C1 约 69 秒通过，8 条资源/未决记录全部清理或解析，脱敏证据在 `packages/commands/tests/knowledge/fixtures/sync-remote-contract.json`。

J7 最新版本在 15:07 约 91 秒通过：添加、无变化重复、确认替换、内容回退、checkpoint 丢失后显式 syncId 恢复、本地删除默认保留、预览及确认删除；全程保留未托管哨兵，6 个测试资源已清理。真实测试同时发现并修复详情分页大小（10）及索引总数字段（total_count）的模拟契约偏差。

完整运行时离线测试覆盖预览零写入、code 7、旧索引在新版本就绪后删除、源文件保留和导入未知结果不重放。独立审查发现的历史源文件误认与托管文件变为空目录问题均已补先失败的回归测试并修复；复审 58 项测试通过。恢复只接受本次操作标记或已记录的 fileId；目录存在不能当作文件消失。全仓回归正在运行，尚未宣称全部验证完成。

```sh
kscli doc sync --dir ./docs --index-id idx-example --dry-run
kscli doc sync --dir ./docs --index-id idx-example
kscli doc sync --dir ./docs --index-id idx-example --delete --dry-run
# 仅在明确确认上面的替换/删除范围后执行：
kscli doc sync --dir ./docs --index-id idx-example --delete --yes
```

flags：dir/indexId 必填；stateFile 默认 `<dir>/.bailian/sync-state.json`；syncId 可选（恢复/CI 场景）；delete 为 switch；pollInterval 默认 5 秒；categoryId 可选，首次解析出真实类目 ID 后固化；WORKSPACE_FLAG 复用。不增加 concurrent、rename、强制接管、自动删除源文件或配置文件管理能力。

首次仅支持常规文档格式，复用 upload-support 的格式/大小校验，音视频本期不纳入目录同步。显式报告跳过项，不能将已托管但如今不支持的文件当成本地缺失。嵌入/解析相关模型调用仍可能产生费用，help/计划 notices 说明；sync 不新建知识库。

## Task C1：先锁定远端 ID / tag 关联契约

验收证据加固（2026-09-29）：probe 已补 `listFile` 标签断言与脱敏记录、三页唯一 ID 完整性、初始哨兵真实 docId 捕获，以及删除后精确校验“哨兵 + 新版本”集合。不再仅凭剩余两行推断未托管文档存活。每次上传/建库前记录未决操作，获取实际 ID 后标记已解析，响应丢失仍可在 resources.json 找到核对线索。新增 `exactIndexInventory` 的 9 项测试覆盖重复行、错误哨兵、分页缺口、总数不符和缺字段；静态检查通过。真实 probe 因门禁跳过，仍无 verified 远端契约证据，不解锁删除/替换实现。

**Files — create:** `packages/commands/tests/knowledge/fixtures/sync-remote-contract.json`、`packages/commands/tests/knowledge/knowledge-sync-remote.test.ts`、`packages/commands/tests/e2e/knowledge/knowledge-sync-contract.e2e.test.ts`。

**Files — inspect:** `packages/core/src/types/knowledge-admin.ts`、`doc-list.ts`、`file-list.ts`、`doc-tag.ts`、`doc-delete.ts`、`shared.ts`、`doc-upload.ts`。

- [x] 整理已有 fixtures 与原需求实测结论，明确 tag 每条 ≤32、无明文路径、无可靠远端 md5。不得根据 optional TS 字段推断远端支持。
- [x] 用 gated 契约测试创建两个同名但不同内容的测试文件，上传时带不同同步标签；读取 listFile、describeFile、indexFileDetails、import job status，保存脱敏响应。
- [x] 确认能将 fileId 与 docId 通过实际响应字段或唯一、完整的标签关联。相同 basename 不可作为关联依据，不推导 workspace 后缀。多个匹配属于冲突，不能选第一个。
- [x] 验证导入后标签是否透传到索引明细、分页字段和就绪条件、删除最终一致性；若索引不返回标签，则仅使用有实测证据的其它关联字段。仍无法关联时此开发包不进入删除/替换实现，不伪造映射。
- [x] 验证新版本可在旧版本存在时导入。同名限制若阻止此流程，记录服务端原错并调整上传内部名称为包含操作 ID 的唯一名称，再验证；不可回退先删旧版。
- [x] probe 所有测试资源写入 reporter，finally 清理；这是开发契约验证，不在生成本计划时执行。并发实例不能共享 probe state。
- [x] `knowledge-sync-remote.test.ts` 用固定脱敏 fixture 测重复/缺字段/不完整分页全部阻止删除，默认测试不访问真实 API。

## Task C2：状态、标签与本地扫描

**Files — create:** `packages/commands/src/commands/knowledge/sync/types.ts`、`sync/tags.ts`、`sync/scan.ts`、`sync/state.ts`。

**Tests — create:** `packages/commands/tests/knowledge/knowledge-sync-scan.test.ts`、`knowledge-sync-tags.test.ts`、`knowledge-sync-state.test.ts`。

- [x] 状态定义放在 types.ts，state 持久化复用 B 的 state-store：

```ts
export interface SyncEntry {
  relativePath: string;
  contentSha256: string | null; // null only for recovered identity awaiting verified reupload
  contentMd5: string;
  size: number;
  mtimeMs: number;
  fileId: string;
  docId: string;
}
export interface SyncPending {
  operationId: string;
  relativePath: string;
  action: "add" | "replace" | "delete";
  phase: "intent" | "registered" | "submitted" | "ready" | "deleting";
  contentSha256?: string;
  fileId?: string;
  ingestionId?: string;
  newDocId?: string;
  oldDocId?: string;
}
export interface SyncState {
  schemaVersion: 1;
  syncId: string;
  target: { endpointOrigin: string; workspaceId: string; indexId: string; categoryId: string };
  entries: Record<string, SyncEntry>;
  pending: SyncPending[];
}
```

- [x] syncId 为随机 UUID 或显式指定的合法 UUID，第一次写入 state 后持久使用；dry-run 临时 ID 不作恢复承诺。state 存在时显式 syncId 必须相同。state 无密钥、绝对目录、签名上传 URL。
- [x] 基础标签三枚：`s` + SHA-256(scope + syncId) 前 31 hex、`p` + SHA-256(相对路径 UTF-8) 前 31 hex、完整 32 位小写 MD5（仅 0-9a-f，不占 s/p 前缀）。scope 用有序 JSON 编码 endpointOrigin/workspaceId/indexId，避免字符串拼接歧义。
- 2026-09-29 实现修正：新上传额外写入 `v` + SHA-256(operationId) 前 31 hex。源文件按设计保留，内容改回旧版或状态丢失后重新上传时，三枚基础标签会重复；操作标记用于区分这些上传版本。远端按基础标签加可选操作标记唯一关联，已有三标签数据继续兼容；不删除历史源文件来规避歧义。
- [x] 完整 SHA-256 留在 state 作为最终本地内容判据；远端 MD5 是恢复线索，不视为可信内容证明。检测同 scope 内路径 hash 重复时停止，不能覆盖映射。首次注册一次写入标签，不覆盖用户已有标签。
- [x] 路径统一 `/` 分隔，保留大小写，不执行可能合并两份文件的 Unicode 归一化；拒绝越界路径。排除 `.git`、`node_modules`、`.bailian` 和 state/lock/temp 文件；所有排除项计入说明。
- [x] 首版每次对候选常规文件流式计算 SHA-256/MD5，mtime+size 仅用于显示和变化检测，不凭二者跳过 hash。文件扫描前后属性变化使扫描失败；同大小同 mtime 内容变化也要识别。
- [x] 不跟随文件/目录符号链接；发现读取错误、权限错误、目标目录消失则整次规划失败。已托管路径变成符号链接或不支持类型时为 conflict，不作为 delete。
- [x] 写临时目录测试：同名不同目录、中文和空格路径、同大小改动、mtime 单独变动、symlink 越界、空目录、读取失败、state 在扫描根内不上传。
- [x] 运行 `vp test packages/commands/tests/knowledge/knowledge-sync-scan.test.ts packages/commands/tests/knowledge/knowledge-sync-tags.test.ts packages/commands/tests/knowledge/knowledge-sync-state.test.ts`，预期通过。

## Task C3：只读远端快照与同步计划

状态丢失恢复接入（2026-09-29）：显式原 syncId 且本地路径标签唯一对应就绪文档时恢复身份；`contentSha256: null` 明确表示远端内容未验证，强制 replace 而非用远端 MD5 冒充 SHA-256。恢复条目的 size/mtime 仅保留当前本地扫描元数据；旧源文件 MD5 用于核对远端身份。多索引版本或只有未入库源文件时给出 conflict，无法还原路径的文档保留为 orphan。4 项恢复测试、状态与 planner 共 49 项通过，真实扩展 J7 于 2026-09-29 15:07 通过（约 91 秒），覆盖丢失状态预览零写、未确认 code 7、确认重传与随后无变复跑；6 个测试资源全部清理。

最新实现（2026-09-29）：`remote.ts` 基于真实 fixture 按完整 s/p/md5 标签唯一关联，不通过同名或 ID 后缀推断；完整读取源文件与文档分页，歧义/缺字段/半份清单整体失败，未入库源文件保留供恢复核对。13 项远端测试通过。`reconcile.ts` 对已解析且绑定目标的 state 核对 fileId/docId/pathTag/md5，任何不符向 planner 传递全局阻断 conflict；未记录的已标记文档作为 orphan 保留，pending 路径交恢复流程，不擅自删除。新增 9 项核对测试，连同 planner 共 30 项通过；静态检查通过。此时尚未完成缺失 state 的恢复、目标/类目解析、完整 prepare 接线或执行器。

文件清单基础（2026-09-29）：`operations/list.ts` 新增 `listKnowledgeFiles`，复用现有 file-list 的 listFile/categoryId/maxResult/nextToken 请求合同，读取全部游标页并拒绝缺失 fileList、无效或重复 fileId、重复游标、空页仍有后续游标与非法游标类型；后续页服务端错误原样抛出，不返回半份清单。新增 14 项测试，连同数值分页及 init 预检共 40 项通过，静态检查通过。该函数只返回数据中心 fileId，不推导 docId，不构成远端关联契约已验证的证据；尚待真实 category 解析和 remote 快照集成。

状态版本基础（2026-09-29）：共享 state-store 新增单次读取的 `readStateSnapshot`（原始字节 SHA-256，缺失为 null）及锁内执行前使用的 `assertStateRevision`；原 `readStateFile` 复用读取逻辑。`readSyncCheckpoint` 将该 revision 与通过 endpoint/workspace/index/category/syncId 校验的 state 一起返回。新增 6 项测试覆盖无副作用读取、格式/Unicode 字节、创建/删除导致旧计划失效、损坏与 I/O 错误、中英文提示及错目标拒绝。连同同步 state、共享 state-store 与初始化运行时 E2E 共 40 项通过。执行器尚未接线，不能将这些基础函数通过当作计划过期保护已完成端到端验证。

进度（2026-09-29）：纯 `sync/plan.ts` 已实现，输入为调用方已验证的清单，不推断远端 doc/file 关联。覆盖 add/skip/replace/retain/delete/recover/conflict、全局 blocked、按路径排序、恢复后必须重新规划、替换/删除及其恢复的双语风险、跳过目录子树保护、重复关联检测和路径越界。状态指纹只携带相对路径及 hash/size/mtime，不泄漏扫描绝对路径。新增 21 个 planner 测试，连同 scan/state/tags 共 65 个测试通过；格式、lint、类型检查通过。远端适配与完整计划的 scope/stateRevision 封装尚未实现，C1 未取得真实成功证据，因此没有推进破坏性执行器。

**Files — create:** `packages/commands/src/commands/knowledge/sync/remote.ts`、`sync/plan.ts`、`packages/commands/tests/knowledge/knowledge-sync-plan.test.ts`。

- [x] remote.ts 完整翻页读取目标 index 与已解析 category，累计 doc/file 证据。检测重复游标、总数缺口、响应缺失、重复映射；任一问题失败，不将半份清单传给 planner。
- [x] state 存在时核对 fileId/docId、标签归属与目标。托管项标签被修改或指向不符时为 conflict。未托管对象只计入 unmanaged，不纳入删除。
- [x] state 丢失时只有显式 syncId 才尝试恢复：当前本地路径可算 hash，远端只在唯一匹配时关联，并通过重新上传恢复内容确定性。远端无法还原路径的条目标记 orphan，不自动删除；需要原 state 恢复完整删除语义。
- [x] planner 输入均为不可变值，输出按 relativePath 排序。固定动作与规则：

| 条件                                           | 动作                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| 本地存在、无已托管远端                         | add                                                                           |
| 路径相同、SHA-256 相同、远端就绪且归属核对通过 | skip                                                                          |
| 路径相同、内容不同                             | replace（需要确认）                                                           |
| 本地缺失、有托管项、未开 delete                | retain                                                                        |
| 本地缺失、有托管项、开 delete                  | delete（需要确认）                                                            |
| pending 未完成                                 | 只读核对并生成 recover 动作；有删除的恢复也先确认，执行后重跑生成剩余同步计划 |
| 扫描/归属/关联不完整                           | conflict，禁止全部执行                                                        |

- [x] 计划包含 scope、syncId、stateRevision（state 字节 SHA-256）、文件完整指纹、动作理由、旧 docId、counts、notices。包含 replace/delete 时 risk=high/destructive，否则 null。
- [x] rename 不匹配指纹合并：新路径 add，旧路径 retain 或 delete。相同内容的两个路径允许两个文档，不能全局去重后吞文件。
- [x] fake fixtures 写出以下表驱动断言：

```ts
test.each([
  [false, "retain"],
  [true, "delete"],
] as const)("missing managed path with delete=%s", (deleteEnabled, action) => {
  const result = planSync({
    local: [],
    managed: [{ relativePath: "a.md", contentSha256: "old", docId: "doc-a", fileId: "file-a" }],
    unmanaged: [{ docId: "doc-manual" }],
    deleteEnabled,
  });
  expect(result.actions).toEqual([expect.objectContaining({ relativePath: "a.md", action })]);
  expect(JSON.stringify(result.actions)).not.toContain("doc-manual");
});
```

`planSync` 在 plan.ts 导出，纯决策输入只需以上最小字段；目标信息/证据完整性由 remote 调用方验证后封装为完整执行计划，不让测试必须伪造 API envelope。

- [x] 扩展到 unchanged/replaced/duplicate-content/partial-pagination/conflict；执行 `vp test packages/commands/tests/knowledge/knowledge-sync-plan.test.ts packages/commands/tests/knowledge/knowledge-sync-remote.test.ts`。

## Task C4：执行、checkpoint 与恢复

普通执行编排（2026-09-29）：新增 `execute.ts`，确认后获取真实 state 锁、校验原始字节 revision、调用执行前复核，再依次保存 intent/registered/submitted/ready/deleting。替换仅在新版就绪 checkpoint 成功后进入旧版删除；源文件保留。异常原样抛出并保留最后成功写入的 pending；未变计划不触发上传/导入/删除。9 项测试使用临时 state 文件和模拟云端端口，覆盖顺序、上传/导入/等待/写盘/删除失败、过期 revision 和重复无变执行，静态检查通过。真实云端 ports、恢复执行 runner、完整 prepare 与命令接入尚未实现；不能将编排测试当作完整同步验收。

恢复决策进度（2026-09-29）：新增 `recover.ts` 的纯只读 `inspectSyncRecovery`，区分 blocked/observe/record-file/commit-new/delete-old/commit-delete。验证旧版归属、新版唯一关联、本地 SHA-256 与 pending 一致；新版就绪前绝不产生删除决定，旧版消失后仅在新版仍就绪时提交替换。结果未知的 upload/import 不自动重放，发现已上传源文件仅补录 ID。10 项测试与静态检查通过；这只是决策函数，尚未接入锁内复核、轮询、checkpoint 写入或执行器，不能据此宣称恢复链路完成。

**Files — create:** `packages/commands/src/commands/knowledge/sync/execute.ts`、`sync/recover.ts`、`packages/commands/tests/knowledge/knowledge-sync-execute.test.ts`、`knowledge-sync-recover.test.ts`。

- [x] executor 确认后才获取 lock；核对 stateRevision、所有待写文件 SHA-256、待删除 doc 的归属。计划过期整体停止，要求重新 dry-run/确认，不悄悄扩大范围。
- [x] add：持久化 intent → 上传带标记新文件 → registered checkpoint → import → submitted checkpoint → 逐项就绪且关联 docId → 写 entries、清 pending。
- [x] replace：完成新版本 add 到 ready checkpoint 后，复核旧 doc 归属，再删除旧索引文档；确认旧 doc 消失才切换 entries、清 pending。
- [x] delete：写 deleting checkpoint → 调用 indexDeleteFile → 轮询确认消失 → 移除 entries。服务端 deleted 不包含目标时核对实际状态，不能直接标记成功。
- [x] 一次处理一个文件/导入任务，避免批次中的部分成功难以关联；任何未解决错误停止后续动作。不得删除数据中心源文件，不为失败自动删除旧库或整个同步集。
- [x] checkpoint 写盘失败立即停止；远端未知结果保留 intent，并利用标签/ingestionId 唯一核对。无法确定时返回 GENERAL 和已有资源 ID，不重复提交不确定的写请求。
- [x] 上传前后校验源文件变化，复用 upload 流的检查；新版本内容不确定或入库失败时不得删除旧版本。必要的内容快照临时文件只在确认后建立并清理。
- [x] 恢复 ready/deleting 时先确认新版本仍就绪和旧版当前状态；存在任何实际删除时仍走新的计划确认。没有 `--yes` 的恢复不得趁机清理旧版。
- [x] 锁只能防同一 stateFile 的本地并发。首版声明一个同步集只允许一个 writer；CI 配置 concurrency group，state 作为持久 artifact 传递。远端没有 CAS 时不宣称多机并发安全。
- [x] 测试事件顺序 `new-ready` 在 `delete-old` 前；注入上传/导入/删除/写盘超时，断言旧版保留或 pending 可恢复。第二次执行已完成计划应零远端写请求。
- [x] 运行 `vp test packages/commands/tests/knowledge/knowledge-sync-execute.test.ts packages/commands/tests/knowledge/knowledge-sync-recover.test.ts`。

## Task C5：命令、注册与旅程验收

**Files — create:** `packages/commands/src/commands/knowledge/doc-sync.ts`、`packages/commands/tests/e2e/knowledge/knowledge-doc-sync.e2e.test.ts`、`packages/commands/tests/e2e/knowledge/journeys/j7-doc-sync.e2e.test.ts`。

**Files — modify:** commands/index、bl/kscli commands maps、E2E topic-routes、journeys/README（路径见主计划/B4）。

- [x] doc-sync 声明最大 high/destructive risk，prepare 负责 scan/state/remote/plan，run 只消费准备好的计划调用 executor。dry-run 可读远端但不 mkdir、写 state/lock、租约、上传或导入。
- [x] JSON 输出固定 summary/actions/skipped/unmanaged/notices/stateFile；部分失败输出完成项、pending 与原始错误，不给成功 exit code。quiet 仅保留机器所需摘要，不能隐藏风险或局部成功信息。
- [x] 离线 E2E 覆盖 help、缺 dir/indexId、默认无 delete、风险 metadata、code 7 和无 yes 的零写入；有凭证只读 dry-run 用 fake client 测，不以 live 测试替代。
- [x] J7 创建专用库与未托管哨兵文档：首次添加 → 二次无变 → 修改并确认替换 → 删本地但不开 delete 保留 → delete 预览 → 确认删除。每一步检查哨兵仍在；finally 只清理本测试资源。
- [x] 发布前 C1 远端关联和 J7 真实流程必须有成功证据；若 live 不可用，报告为未验收，不扩大可用性声明。
