# Knowledge Iteration 2 Implementation Plan

产品目标、用户旅程、交互示例和范围取舍见[产品设计稿](../specs/2026-09-25-knowledge-iteration-2-design.md)。本文件及子计划用于开发执行。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Only use subagents when separately authorized; the default is sequential execution in this task.

**Goal:** 交付知识库冷启动、目录增量同步、机读命令发现和个人知识库 Skill，并在创建计费资源前明确告知、确认，失败时提供资源清理指引。

**Architecture:** 业务编排留在 commands，复用其内部操作函数；runtime 提供通用只读计划、确认和 introspection；产品入口只注册路径。同步采用本地 state 加远端标签，状态恢复和删除权限以明确的同步集归属为边界。

**Tech Stack:** TypeScript、Node.js、pnpm、vite-plus/test、现有 RAG HTTP client、现有 Skill registry / reference 生成链路。

---

## 依据与范围

- 需求：[迭代二·命令设计文档](https://alidocs.dingtalk.com/i/nodes/m9bN7RYPWdyrPBREcjaar7XvVZd1wyK0)，只包含第 5–8 项；eval 四项已划掉。
- 追加需求：创建即按时间计费，必须防止体验用户不知情地产生持续费用。
- 计费依据：[知识库计费说明](https://help.aliyun.com/zh/model-studio/billing-for-knowledge-base)，2026-09-24 核对。标准版一次性 720 小时额度、多库共享、新用户开通后 30 天有效；额度不包含模型调用费用。免费额度或资源包抵扣结束后进入按量付费，删除知识库停止该库规格计费。
- 代码基线：`c1d9bd10`。本计划编写时仅新增文档；后续已按用户授权完成开发与专用资源真实验收，不发布、不自动提交。
- 执行前阅读 `AGENTS.md`、`docs/agents/command-add-remove.md`、`command-flag-change.md`、`cli-e2e-tests.md`、`skill-change.md`、`error-hint-change.md`、`url-change.md`。

## 开发包与依赖

| 顺序 | 开发包                       | 文档                                            | 可独立验收的结果                                               |
| ---- | ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| A    | 只读计划、计费确认、命令发现 | [runtime plan](2026-09-24-knowledge-runtime.md) | 旧命令行为不变，`kb create` 有计费确认，双入口 introspect 可用 |
| B    | `init` 冷启动                | [init plan](2026-09-24-knowledge-init.md)       | 无控制台抄资源 ID，首次检索成功，可重复运行和恢复              |
| C    | `doc sync`                   | [sync plan](2026-09-24-knowledge-sync.md)       | 增改删有计划、可恢复，不动未托管文档                           |
| D    | 个人知识库 Skill 与交付      | [skill plan](2026-09-24-knowledge-skill.md)     | 工作流可发现，参考文档由 schema 生成，分发资产完整             |

A → B1/B2 共享操作与状态存储 → B3/B4、C2–C5；C1 的契约核对可提前进行；A/B/C → D。B 与 C 可分别合并，但 C 依赖 B1/B2，不能将两者视为完全独立，也不因此自动启用并行 agent。

## 已定设计决策

1. 产品路径：`kscli init` / `bl knowledge init`；`kscli doc sync` / `bl knowledge doc sync`。
2. 同步输入使用 `--dir`，不为此扩展位置参数；`--introspect` 是全局 flag，兼容现有 command-path-first 约定。
3. `init`：上传样例 → 创建并等待知识库 → 创建/补齐 search 服务 → beta 检索。首次不创建 chat 服务、不 deploy。
4. 同步：本地 state 保存可读路径、完整内容指纹、数据中心 fileId 与索引 docId；远端标签辅助归属核对和恢复，不承诺 hash 还原路径。
5. 内容更新先上传并等新文档就绪，再删除旧索引文档；旧源文件保留在数据中心。
6. `--delete` 只清理由当前同步集托管、且本地已消失的索引文档。更新也涉及删除旧版本，因此同样需要风险确认。
7. 首版不优化 rename；不跟随符号链接；不将格式不支持、读取失败或扫描遗漏误判为删除。
8. 计费确认覆盖 `init` 新建和直接 `kb create`。无 `--yes` 返回现有 code 7 / `requires_confirmation`；不另造交互式确认系统。复用已有初始化资源不再次请求创建确认。
9. 不声称当前账户有剩余额度。首版只展示政策和账单入口，不新增余额 API、自动扣费预测或后台提醒服务。
10. 双语用户文案；服务端错误原样透传。运行结果 JSON stdout 保持单一文档；进度和人读提醒走 stderr。

## 必须调整的旧假设

| 旧文档假设                   | 当前证据                                                       | 实施要求                                              |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| 可以先空建库，再上传         | `kb-create.ts` 必须提供 doc/category                           | 先上传样例，再用 fileId 创建库                        |
| 有 index 就能搜索            | `search.ts` 必填 agentId                                       | 创建 search 服务并使用 beta                           |
| 最小服务配置足够             | J1 journey 的 `patchSearchServiceRetrievalConfig` 会补必需字段 | 将补全逻辑移入业务函数，保留服务端已有值              |
| 新增 dangerous 元数据        | core 已有 CommandRisk                                          | 扩展已有 risk，不增加平行字段                         |
| 上传 ID 等于删除 ID          | `doc-delete.ts` 明确两者可不同                                 | 从实际响应关联，不拼接 workspace 后缀                 |
| high-risk dry-run 一律零网络 | 旧测试和规范如此约定                                           | 仅 prepare 命令允许有凭证的只读预检；旧命令零网络保持 |
| 类型含 md5 就说明服务端返回  | `RagDataCenterFile.md5?` 是可选，原需求实测无回读              | 不依赖该字段                                          |

## 全局验收矩阵

### 当前验收证据（2026-09-29）

- A：prepare、计费确认和 introspect 已实现，单元测试及双入口 smoke 覆盖只读预检、动态风险、确定输出、无凭证发现和创建后的清理提示。
- B：init 的离线完整运行时测试与真实 J6 均通过。J6 在 15:09 完成首次样例检索及二次资源复用，3 个测试资源已全部清理。
- C：C1 真实契约探测通过，脱敏证据已保存；同步扫描、规划、标签关联、执行、恢复和命令均已实现。J7 在 15:07 通过添加、重复、替换、内容回退、checkpoint 丢失后显式恢复、默认保留、确认删除及哨兵保护；6 个测试资源已全部清理。离线完整运行时另验证了预览零写入、确认拒绝、源文件保留和失败后不重放。
- D：Skill、hub/protocol 路由、双入口 schema reference、分发清单、临时 registry 安装与更新、双语快速开始及同步用户手册已完成。行为审查为文本场景审查，不代表全部 Agent 宿主的实际运行验收。
- 凭证核实：原仓库 `.env` 的 API Key 和 Workspace 可用，此前阻塞源于隔离工作目录缺配置；已修正，未将凭证纳入版本控制。
- 最新离线单元结果：165 个文件、1916 项通过。`vp check` 为 0 错误、3 条既有警告。双入口定向 E2E、生成一致性、构建及实际打包检查均通过；全仓回归与失败复测详情见[最终验收记录](2026-09-29-knowledge-verification.md)。不声称全量真实 E2E 已通过。

- [x] A：无凭证 introspect 根/组/叶成功，零业务调用；输出确定、无凭证值；未知路径 exit 2。
- [x] A：新建库无确认零资源写入；dry-run 含计费提醒；直接 create 也不能绕过提示。
- [x] B：首次 init 命中样例标记，二次执行不新增库/服务/样例。
- [x] B：建库后失败输出实际 indexId、created/reused 归属及不带 `--yes` 的清理命令。
- [x] C：内容未变零写入；同大小内容变化可识别；mtime 改变但内容不变不重传。
- [x] C：旧版本在新导入失败时保留；删除超时保留 pending 状态，不虚报完成。
- [x] C：不完整分页、扫描失败、state 损坏、ID 关联歧义、跨目标 state 均阻止执行。
- [x] C：`--delete` 不触及非本同步集文档；即使本地目录为空也先展示实际删除计划并确认。
- [x] D：双入口 reference 来自同一 schema 契约，Skill 安装包含 protocol，生成物二次生成无差异。
- [x] 全量 `vp check` 和测试集已运行，发现的失败项修复后用新进程定向复测；live gated 的跳过与通过分开报告。

## 发布与验证边界

测试先使用 fake client 和临时目录。真实旅程仅在对应 E2E gating 显式开启后执行，使用专用测试资源，并在 finally 清理服务、知识库、测试源文件；未清理 ID 写入已有 journey reporter。没有真实 API 证据的能力不能标注已验证。

每个开发包先跑其定向测试，完成全部代码改动后再跑一次全量检查。实际执行与验收结果集中记录在最终验收记录中。

回顾现有维护场景后，本次不需要新增 AGENTS 场景；在 A 中扩展命令、E2E 文档的 prepare/dry-run 契约，在 D 中补 skill 生成源的检查项。
