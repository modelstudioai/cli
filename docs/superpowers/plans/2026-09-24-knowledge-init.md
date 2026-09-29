# Knowledge Init Implementation Plan

> 验收索引：[最终验收记录](2026-09-29-knowledge-verification.md)。任务已实现并验证；下方早期进度段落保留为历史记录，最终证据和验证边界以验收记录为准。测试文件组织按实际代码调整，同一行为的路由断言收在 introspect 测试中。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 一条命令完成样例上传、建库、创建检索服务和首次成功检索，并对计费、资源归属和中途失败负责。

**Architecture:** 使用 A 中的 prepare/gate/run，先只读检查已有状态，再确认计费、执行可恢复步骤。抽取命令内部操作函数，不调用其他命令的 run、不启动 CLI 子进程。

**Tech Stack:** TypeScript、Node 文件系统、现有 RAG API/client/polling、vite-plus/test、J1 journey。

---

## CLI 与成功契约

### 开发进度（2026-09-29）

- 已抽取并让现有命令复用上传、建库、文件导入、服务创建/读取/更新和搜索操作；上传支持 lease/file checkpoint，保存失败会立即停止后续操作。
- 已实现独立状态文件的原子写入、独占锁、初始化记录校验、内置样例与召回标记判定、仅补缺失检索配置。相关新增测试均通过。
- 现有知识库单元测试已回归通过（173 项，另新增样例测试 4 项）；尚未执行真实云端初始化验收。
- 上传、建库、服务、搜索的离线 E2E：64 项通过，12 项真实网络用例按显式开关跳过（`BAILIAN_E2E=0`）。本轮变更的定向格式、lint、类型检查通过。
- 已实现完整分页读取与资源归属核对、init prepare/run 编排、双产品注册和按真实命令路径输出清理命令。云端资源创建前保存意图，返回 ID 后立即报告并保存；未知结果停止重试。
- 初始化执行测试覆盖首次成功、重复执行、旧导入任务过期、导入失败、服务失败、空召回、服务端错误透传、建库后写盘失败及 prepare/run 间状态变化；命令测试覆盖双产品清理路径、quiet 失败诊断与参数校验。
- 新 init 离线 E2E 与两个产品 registry smoke 共 425 项通过。仍需补 J6 真实旅程脚本及失败后的人工恢复说明；尚未进行真实云端验收，不能据离线测试宣称线上流程已验证。

```sh
kscli init --workspace-id ws-example --dry-run
# 仅在用户确认创建计费资源后执行：
kscli init --workspace-id ws-example --yes
bl knowledge init --workspace-id ws-example --dry-run
```

命令 auth=apiKey。自有 flags 为 name（默认 `cli-demo`）、stateFile（默认 `.bailian/knowledge/init.json`）、pollInterval（默认 5 秒）和现有 WORKSPACE_FLAG。使用全局 timeout/output/dry-run/config，不增加另一个凭证体系。无凭证直接给现有配置提示，不开启浏览器。

成功输出：`indexId`、`agentId`、`fileId`、`agentVersion: "beta"`、每项 `created|reused`、`sampleMatched: true`、`stateFile`、`notices`、`cleanup`。计时只用于实际结果的 TTFV，不写 introspect 或计划稳定标识。

cleanup 是 `{ path: string[], args: string[] }` 数组，不拼接未转义 shell 文本；产品路径由入口注入映射，或 runtime 从真实 registry 找到共享命令的路径。人读渲染进行 shell quoting，不含凭证、不默认 yes。只为本次新建资源展示清理建议；复用资源单独标记。

## Task B1：抽取 RAG 操作，保留原命令行为

**Files — create:** `packages/commands/src/commands/knowledge/operations/upload.ts`、`operations/index.ts`、`operations/service.ts`、`operations/search.ts`。

**Files — modify:** `doc-upload.ts`、`kb-create.ts`、`service-create.ts`、`service-update.ts`、`search.ts`（均在同一 knowledge 目录）。

**Tests:** 现有 `packages/commands/tests/knowledge/knowledge-upload-orchestration.test.ts`、`knowledge-kb-create.test.ts`、`knowledge-service-config.test.ts`；新增 `knowledge-operations.test.ts`。

- [x] 从现有函数抽取“执行 API 并返回结果”的逻辑，原 command 继续负责 flags/validate/dry-run/输出。操作层依赖显式 Client/Settings/workspaceId，不接触 configStore/authStore，不打印 stdout。
- [x] 固定接口职责：upload 注册单文件返回 fileId/categoryId；index 提供 create、import、wait、list、remove；service 提供 create/get/update；search 返回原始 nodes。输入和响应使用现有知识库类型，不为本期重写整个 RAG client。
- [x] 为 upload 增加可选 checkpoint 回调，每次得到 leaseId/fileId 后立刻通知调用者；普通 doc upload 可以不提供。checkpoint 抛错时停止下一次远端写入。
- [x] 先写 fake-client 断言：上传顺序 lease → PUT → addFile，sizeBytes 是 string，import sourceType 明确为 DATA_CENTER_FILE，文件变化时不注册。运行上述四个测试文件，记录新增测试的预期失败。
- [x] 完成抽取后重跑，确保原命令输出字段、默认值、dry-run 零网络和局部成功提示保持兼容。

## Task B2：初始化状态与检索配置

**Files — create:** `packages/commands/src/commands/knowledge/state-store.ts`、`init-state.ts`、`init-sample.ts`、`init-service-config.ts`；测试 `packages/commands/tests/knowledge/knowledge-state-store.test.ts`、`knowledge-init-state.test.ts`、`knowledge-init-service-config.test.ts`。

- [x] state-store 负责严格 JSON 读取、同目录临时文件写入后 rename、独占锁；不依赖 configStore。首次需要写时才 mkdir，临时文件和 state 限定权限 0600；锁持有至执行结束，finally 释放。
- [x] 读取存在但非法的 state 返回 GENERAL 和修复提示，不能当成第一次执行；ENOENT 才表示首次。读取未来 schemaVersion 返回明确不兼容错误。
- [x] 锁使用 exclusive create，写入 pid/hostname/nonce。发现已有锁直接失败并说明路径；不按年龄自动抢锁，也不盲删不属于当前 nonce 的锁。
- [x] 定义并序列化状态：

```ts
interface InitState {
  schemaVersion: 1;
  target: { endpointOrigin: string; workspaceId: string };
  name: string;
  operationId: string;
  phase: "prepared" | "uploaded" | "indexed" | "service-ready" | "verified";
  pending?: { action: "upload" | "create-index" | "create-service"; startedAt: string };
  fileId?: string;
  indexId?: string;
  ingestionId?: string;
  agentId?: string;
}
```

目标包含有效 API origin 与 workspace，不能仅靠 profile 名定位，也不能保存 API key。迁移凭证但目标相同不重建；不同目标禁止使用同一 stateFile。

- [x] 样例内容作为 TS 字符串导出，避免 binary 构建遗漏外部资源；固定文档包含独特标记 `BAILIAN_CLI_INIT_SAMPLE_V1`、一个定义和对应检索问题。修改样例版本不得静默更新旧库。
- [x] prepare 阶段仅在内存中使用样例；确认后的 run 才写临时上传文件，finally 清理。
- [x] 从 J1 helper 迁移 search 配置补全：读取 beta agent_config，对绑定当前 index 的 kb_search_configs 仅补缺失值，不覆盖用户已有值。

```ts
export const INIT_RETRIEVAL_DEFAULTS = {
  rerank_min_score: 0.01,
  dense_similarity_top_k: 100,
  sparse_similarity_top_k: 50,
  enable_reranking: true,
  rerank_top_n: 5,
} as const;
```

- [x] 仅更新当前 init 创建且拥有的服务；已有服务配置不符合要求时报告差异，不能为试用修改用户服务。未修改配置不发送 update。
- [x] 测试部分缺字段、零值/false 值保留、已有其他 index 配置保留、state 目标不匹配、损坏、锁竞争、原子写失败旧内容仍完整。
- [x] 运行 `vp test packages/commands/tests/knowledge/knowledge-state-store.test.ts packages/commands/tests/knowledge/knowledge-init-state.test.ts packages/commands/tests/knowledge/knowledge-init-service-config.test.ts`，预期通过。

## Task B3：prepare 与可恢复 init 执行

**Files — create:** `packages/commands/src/commands/knowledge/init.ts`、`init-workflow.ts`、`packages/commands/tests/knowledge/knowledge-init.test.ts`。

- [x] prepare 读取 state、按实际 API 分页查库和服务，确认 ID、名称、类型、服务绑定；没有 state 时只能通过 init 标记与样例/绑定证据恢复，不能仅凭同名采用资源。
- [x] 同名不属于 init 的资源返回冲突，建议显式 name/stateFile；缺少完整所有权证据不自动修改或删除。服务创建前使用稳定派生名称且不超过现有长度限制。
- [x] 计划包含 create/reuse/recover 的步骤与确定 ID；未来 ID 表示为 `{ fromStep: "create-index", field: "pipelineId" }` 等结构化引用，不伪造 ID。
- [x] 只要计划创建新知识库，risk=high/billing，附 A2 notice；复用库 risk=null。此前会发生上传时也必须先过整个计划确认，不能先上传再问创建许可。
- [x] run 获取锁并重新读取 state、比对 prepare 快照；不一致返回 GENERAL 要求重跑。执行前持久化 pending 意图，收到远端 ID 后立即写 checkpoint。
- [x] 执行上传 → create with docIds → poll 初始导入 → create search service → 补配置 → beta search。导入任务整体完成仍须检查逐文档失败。
- [x] 对最终一致性的“尚未召回”使用有上限轮询；服务端实际错误原样抛出，不统统吞掉重试。超时为 TIMEOUT，资源失败状态与 IDs 保留。
- [x] 以 nodes 中出现样例标记为完成条件。调用成功但 nodes 为空不算成功，不创建/部署第二个服务碰运气。
- [x] 当 POST 超时、响应丢失或 checkpoint 写盘失败，标记结果不确定；下一次先读远端核对，无法唯一关联则停止。没有服务端幂等键时，不承诺跨设备/所有网络故障下 exactly-once，也不得直接重复创建。
- [x] 错误附带 created/reused 资源表和清理动作。运行时错误 message 保持原样；如已建库，stderr 即使 quiet 也说明仍可能持续计费。
- [x] 编写 fake-client 流程测试：首次成功、二次零新增、导入失败、服务创建失败、空召回超时、未知写入结果、写盘失败、同名冲突、已存在库不再要求计费确认。
- [x] 运行 `vp test packages/commands/tests/knowledge/knowledge-init.test.ts`，分别断言 API 调用次数/顺序、资源归属和失败后的 state，而非仅测成功字符串。

## Task B4：注册、产品路径与 E2E

**Files — modify:** `packages/commands/src/index.ts`、`packages/cli/src/commands.ts`、`packages/kscli/src/commands.ts`、`packages/commands/tests/e2e/topic-routes.ts`、`packages/runtime/src/create-cli.ts`、`packages/core/src/types/command.ts`。

**Files — create:** `packages/commands/tests/e2e/knowledge/knowledge-init.e2e.test.ts`、`packages/commands/tests/e2e/knowledge/journeys/j6-init.e2e.test.ts`。

- [x] re-export knowledgeInit，双入口注册 init 路径；最小 E2E routes 同步。
- [x] cleanup 路径通过 runtime 新增只读 `ctx.commandPath(command)` 能力从当前产品 map 反查，返回唯一 path 或 undefined；无路径时只输出资源信息，不猜测别名。两个产品均测试 kb delete、service delete 路径。
- [x] help 包含计费、yes、stateFile、只读联网 dry-run；缺凭证 dry-run 测 AUTH，具备 fake client 的预检测试写入次数为 0。
- [x] J6 使用独立 stateFile/name：首次 init 回显实际资源；第二次资源 IDs 完全相同；finally 根据 reporter 删除本测试创建资源。资源不确定或清理失败必须落 resources.json。
- [x] 更新 `packages/commands/tests/e2e/knowledge/journeys/README.md` 映射，不将真实建库旅程放入默认无凭证测试。
- [x] 执行定向 E2E 与两个产品 registry smoke。真实 J6 只在显式启用 live 环境后运行；未运行写清楚，不标记完整真实链路已验收。

## 完成标准

真实验收脚本进度（2026-09-29）：新增 J6 专用开关 `BAILIAN_E2E_INIT_JOURNEY=1`，验证首次 init 样例命中、第二次 ID 一致和资源全部复用。finally 仅清理通过 stdout/stderr 明确记录为 created 的资源；无法确定的 pending 操作保留报告，删除知识库失败时不删除源文件。独立资源事件解析器的 3 项测试通过（失败无 stdout、重复诊断、过滤复用/畸形记录）；J6 默认门禁跳过，未创建真实计费资源。类型/lint 检查通过，旅程 README 已更新。真实 J6 成功证据仍缺失。

运行时集成验证（2026-09-29）：新增 subprocess fixture `tests/fixtures/knowledge-init-cli.ts` 与 `knowledge-init-runtime.e2e.test.ts`。使用真实 createCli、鉴权、prepare/确认、Client、上传流、工作流、checkpoint 和产品反查；fixture 拦截全部 fetch，未知请求直接拒绝，无云端资源。验证只读 dry-run、未确认 code 7 均只有清单读取且不创建 checkpoint；确认后完整检索成功；第二次无 yes 复用且零资源写入；创建后服务失败保留原始错误、计费诊断和清理路径，再次 yes 也不重建未知结果。上传实际读取样例流并检查没有 Authorization 头。新增 4 个运行时 E2E 与原有 4 个 init E2E 共 8 项通过，类型/lint 检查通过。该 fake API 证据不代替真实 J6 验收；J6 和 live 契约验证仍待完成。

- [x] 用户只需配置 API Key/Workspace，无需抄 index/agent ID；输出给出下一次 search 的产品正确参数。
- [x] 创建前可见计费提醒，未确认零写入；体验结束/中途失败可找到本次新建计费资源。
- [x] 重新执行不重复创建已确认归属资源；歧义状态安全失败，不通过重建掩盖。
