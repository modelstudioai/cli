# Personal Knowledge Skill Delivery Implementation Plan

> 验收索引：[最终验收记录](2026-09-29-knowledge-verification.md)。任务已实现并验证；下方早期进度段落保留为历史记录，最终证据和验证边界以验收记录为准。测试文件组织按实际代码调整，同一行为的路由断言收在 introspect 测试中。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 通过现有 Skill 分发体系交付个人知识库工作流，并让双入口参数参考与实际 introspect 契约保持一致。

**Architecture:** SKILL.md 维护意图、流程和安全边界，reference 由 A 的 schema 生成。保留原有非知识库 reference 生成路径；知识库归属迁至 bailian-knowledge，不引入新的安装服务。

**Tech Stack:** Markdown、TypeScript 生成工具、runtime schema serializer、现有 skill registry/installer 和 release asset checks。

---

## Task D1：从 introspect 契约生成知识库 reference

**Files — create:** `tools/generate-knowledge-reference.ts`、`tools/knowledge-reference-renderer.ts`、`tools/knowledge-reference-renderer.test.ts`。

**Files — modify:** `tools/generate-reference.ts`、`packages/cli/package.json`。

**Generated:** `skills/bailian-knowledge/reference/index.md`、`reference/knowledge.md`、`reference/kscli.md`。

- [x] tools/generate-reference.ts 的 GROUP_OWNER_SKILL 新增 knowledge → bailian-knowledge；该组委托新的 schema renderer，不保留另一份直接读 command metadata 的知识库渲染实现。
- [x] generate-knowledge-reference.ts 从两个产品的 `src/commands.ts` 和 package.json identity 构造 registry，调用 A 的 `buildCommandSchema`。bl scope=knowledge，kscli scope=root；kscli 文档保留真实提供的 config/update 命令，注明不是知识库业务路径。
- [x] 不启动产品 main.ts，避免初始化网络/telemetry；复用同一纯 schema producer，测试证明其 JSON 与实际 CLI introspect 一致。不维护手工路径替换表。
- [x] renderer 按 schema.auth 组合凭证 flags、全局 flags 和命令 flags；输出 description/usage/examples/choices/risk/preparation/notes，保留用户确认后才可用 yes 的提示。
- [x] 为双语描述按 locale 参数选文案；生成 reference 首版遵循仓库现有英文主文案惯例，源 schema 仍保留两种语言。不从描述猜 default，不把 validate 函数“推理”为 JSON Schema。
- [x] index.md 链接两种产品 reference。SKILL.md 不复制完整 flags 表，而链接生成物，消除第二份参数真相。
- [x] 已有 clearGeneratedMarkdown 会清理 reference 下 Markdown；确定调用顺序为通用生成清理完成 → 专用 generator 写三份文件，禁止后续通用步骤误删 kscli.md。
- [x] 写固定 schema fixture 测试：`bl knowledge init` / `kscli init` 不混淆；required/choices/yes/billing reason 不丢；普通注释示例不加 bin；含管道字符的表格值正确转义。
- [x] 执行 `vp test tools/knowledge-reference-renderer.test.ts`；运行 `pnpm run sync:skill-assets` 两次，比较三份生成物字节一致，不将时间戳加入 banner。

## Task D2：个人知识库 Skill 工作流

**Files — create:** `skills/bailian-knowledge/SKILL.md`。

**Files — modify:** `skills/bailian-cli/SKILL.md`、`skills/bailian-protocol/SKILL.md`，以及该 protocol 引用的相关规则资源（按文件真实路由更新，不复制协议全文）。

- [x] SKILL frontmatter 设置 name=bailian-knowledge、metadata.version 与 CLI 同步；description 覆盖个人知识库初始化、目录同步、检索与问答，不接管模型选型或微调。
- [x] 使用前读取 bailian-protocol。首次安装主推 `bl skill init`，子集为 `bl skill add --name bailian-protocol,bailian-knowledge`，升级为 `bl skill update`；不添加 companions。
- [x] 写入以下路由与行为：

| 用户目标     | 工作流                                                 | 必须保留的信息                                       |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| 首次体验     | introspect → init dry-run → 告知计费 → 用户确认 → init | index/agent IDs，created/reused，清理动作            |
| 维护本地资料 | doc sync dry-run → 解释增改删 → 按实际风险确认 → sync  | stateFile/syncId，替换也会删旧索引                   |
| 查资料       | search 或已有 chat 服务                                | 从实际列表/返回取 agentId，不把 indexId 当 agentId   |
| 处理失败     | 阅读原始错误与 pending → 同范围重试/恢复               | 不擅自重建资源，不绕过确认                           |
| 结束体验     | 展示本次新建资源 → 确认 → 删除                         | 删除知识库停止规格计费，复用资源不能当作临时资源清理 |

- [x] 在 Skill 中明确：标准版额度不等于本次免费，不知道剩余额度就说未知；不自动填 yes；code 7 是正常确认流程，不上报为 bug。
- [x] Hub 删除知识库子命令明细，仅保留领域 hand-off；protocol 加新领域路由，以及 planned 命令 dry-run 的只读联网约定。
- [x] 有多个 CLI 可用时沿用当前产品会话；切换产品前重新 introspect。能力不在 schema 中时不能猜 flag；不引导安装尚未包含该能力的旧版本。
- [x] 首版不新增 kscli skill 子命令；只有 kscli 的用户通过现有 bl skill 安装渠道获取包。把该限制写在 README，不伪装 kscli 已有安装能力。

## Task D3：安装、生成和发布资产闭环

**Files — modify:** `.vite-hooks/pre-commit`、`tools/release/check.mjs`、`packages/cli/package.json`、`tools/sync-skill-metadata.ts`（仅在现有目录扫描未覆盖新 skill 时改）。

**Files — inspect/test:** `packages/core/src/skills/installer.ts`、`packages/core/src/skills/validate.ts`、`packages/commands/tests/e2e/skill.e2e.test.ts`、现有 registry 打包/发布脚本。

- [x] package.json 的 reference 格式化路径加入 bailian-knowledge/reference；pre-commit 暂存清单和 release check 差异清单加入新 SKILL 和 reference。
- [x] 本地确认 version 同步脚本对新目录自动生效；不为已支持的动态目录发现增加硬编码。
- [x] `rg -n 'skill.tar.br|index.json|bailian-memory|bailian-sandbox' tools .github packages/core/src/skills` 定位真实 registry 打包入口，核对新目录进入 index/archive。只改确实存在的 allowlist，不猜脚本名称。
- [x] 安装测试使用临时配置根和本地 registry fixture：init 含 protocol 与 knowledge；update 只更新已安装；子集安装 archive 中包含三份 reference；不访问真实用户 skill 目录。
- [x] 运行 `vp test packages/commands/tests/e2e/skill.e2e.test.ts tools/knowledge-reference-renderer.test.ts`，并用现有 archive validator 校验本地构建包。不执行远端发布。

## Task D4：用户文档、维护规范与最终验证

**Files — modify:** `README.md`、`README.zh.md`、`packages/kscli/README.md`、`packages/kscli/README.zh.md`、`docs/knowledge/knowledge-cli-guide.md`、`docs/knowledge/kb.md`、`docs/knowledge/doc.md`、`docs/agents/skill-change.md`。

- [x] Quick Start 加入计费说明和先 dry-run 的 init 示例；紧邻示例说明 yes 只能在用户确认后添加。不可写“免费体验 720 小时”而省略共享/有效期/模型费用。
- [x] kb 文档写直接创建的 code 7 行为、失败后清理；doc 文档写同步集范围、state 的持久化、CI 单 writer、state 丢失限制、rename 首版语义、源文件保留。
- [x] CLI guide 写 introspect 根/组/叶用法与 schema_version additive-only 契约；不承诺导出运行时 validate 约束和 prose 默认值。
- [x] skill-change.md 增加知识库 reference 来自 schema 的规则与一致性检查，不另加一份重复维护指南。
- [x] 执行以下命令，按实际结果记录通过/失败/跳过：

```sh
pnpm run sync:skill-assets
vp check
vp test
pnpm -F bailian-cli exec tsx src/main.ts knowledge --introspect
pnpm -F knowledge-studio-cli exec tsx src/main.ts --introspect
```

- [x] 确认最后两条 stdout 是单份 JSON，无欢迎页、更新提示或凭证值；相同命令重复运行输出一致。若测试改变生成资产，修复后仅重跑受影响检查。
- [x] 在 live gating 显式开启的环境执行 J6/J7 与 sync contract probe；记录实际计费资源 IDs 及清理结果。没有 live 环境则明确未验证项，不能用 unit 通过替代真实链路验收。
- [x] 最终 diff 确认没有把 API key、签名 OSS URL、账户凭证、真实用户 state 或 probe 原始敏感响应提交。仅保留脱敏 fixture。

## 交付清单

用户文档进度（2026-09-29）：四份产品 README 的快速开始已补计费说明与 init 预览入口；kscli 双语流程覆盖 beta 检索、状态保留、失败后持续计费、清理及通过 bl 安装 Skill 的限制。总览补 introspect 根/组/叶使用、schema 契约、只读联网预检与初始化恢复；kb 手册补直接创建 code 7、stderr 资源诊断和停止计费方式。新增 `tools/knowledge-quickstart.test.ts`，先复现旧文档 `--kb-id` 已不存在的问题，再改为当前初始化流程；4 个 README 示例测试通过，校验真实命令路径、参数和值、必填项。文档格式与测试类型/lint 检查通过。同步使用手册仍须随 C 阶段真实能力完成，未提前宣称同步可用。

命令级验证进度（2026-09-29）：新增 `packages/cli/tests/e2e/knowledge-skill-registry.e2e.test.ts`，通过本地 HTTP registry 和真实产品入口验证 init、子集 add、无变化 update、内容变化 update；更新仅下载已安装的 protocol，不补装 knowledge 或无关 Skill，随后显式子集安装完整知识库资产并比对全部字节。所有 HOME/Agent/config 路径指向临时目录。另以两个真实产品的 introspect JSON 与 reference generator schema 做全量比较，并验证不创建配置文件。3 个 E2E 测试和类型/lint 检查通过。CLI 仅增加已有 tar-stream 依赖的类型包；锁文件限制为对应 3 行 importer 变更，冻结锁文件离线安装通过。D1 schema 一致性与 D3 本地命令安装验证已补齐，未进行远端发布。

补充进度（2026-09-29）：已新增 `bailian-knowledge/SKILL.md`，hub/protocol 路由和只读 dry-run 约定已同步，SKILL 已加入 pre-commit / release 清单。实际知识库与 protocol 目录经 tar+br 打包，在临时配置目录使用真实 installer 安装后逐文件字节比对通过；未访问用户安装目录。新增资产校验覆盖版本、相对链接和交付清单。生成/安装相关 28 个测试通过，现有 skill E2E 本地/help 12 个通过，5 个远端用例未执行。`sync:skill-assets` 成功且动态发现新 Skill。发布流程位于 `.github/workflows/publish-skills.yml`，外部 FC 根据仓库目录发布，本地没有需要新增的发布 allowlist；未触发发布。尚待本地 registry 的 init/update 命令级验证、Skill 行为评估和 D4 用户文档；不能用安装资产测试代表 Agent 行为验证。

进度记录（2026-09-29）：D1 的 schema renderer 与统一生成入口已实现。`knowledge` 归属已迁到 `bailian-knowledge/reference`，分别生成真实 bl / kscli 路径；统一入口可在临时目录测试且导入无生成副作用。9 个生成相关测试通过，检查无格式、lint、类型错误；实际格式化后的三份 reference 连续生成字节一致。reference 已纳入格式化、pre-commit 和 release 差异清单。新 SKILL 正文、hub/protocol hand-off、SKILL 清单项和本地 registry 安装验证仍待完成；本记录不代表 D 阶段交付完成。

- [x] 四项能力均有对应命令/Skill、双语 help、实际产品路径、文档和测试。
- [x] 计费提醒贯穿创建前、成功后和创建后失败；删除指引不自动携带 yes。
- [x] 原静态 high-risk 行为与已有命令参考生成保持兼容。
- [x] registry 打包资产可在本地安装验证；发布是后续动作，不属于本开发计划的默认执行范围。

## Skill 文本场景评审（2026-09-29）

独立只读评审覆盖六个场景：未选服务商、schema 缺少同步命令、已有同范围计费授权、创建超时且 pending、复用知识库的清理、状态丢失且远端同名文档有歧义。发现并修复共享协议报错流程要求为补日志重放未知写请求的冲突；改为保留原输出、核对 checkpoint 和远端状态、优先恢复已有任务，未知则停止，日志不足不阻止报告。补 class 5 区分云知识库服务商选择与持续计费授权，并统一 code 7 的已有授权复用规则。此为文本场景评审，不是实际宿主 Agent 行为实验，也不替代 C1/J6/J7 的真实服务验收。Skill 资产和真实目录打包安装测试 3 项通过。
