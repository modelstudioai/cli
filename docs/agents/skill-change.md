# Skill 文案 / 路由 / 安装约定

## 触发条件

- 改 `skills/*/SKILL.md` 的 description、路由表、consent、安全闸、hand-off、references 落款
- 调整 `bailian-protocol` 与业务 skill 的关系，或业务 skill 之间的软 hand-off 约定
- 新增 / 拆分 / 合并 `bailian-*` 业务 skill，或改 `tools/generate-reference.ts` 的 `GROUP_OWNER_SKILL` 归属（与命令增删改交叉时两边都看）
- 给业务 skill 补安装说明、README，或统一「勿猜 flag → `reference/`」类约定

纯改生成物 `skills/*/reference/*.md`（由命令 metadata 驱动）→ 走 [command-add-remove.md](command-add-remove.md) / [command-flag-change.md](command-flag-change.md)，**不要手改 reference**。

## 统一口径（安装）

1. **Supported install：** `bl skill init`（装齐 registry 中全部 `bailian-*`，含 `bailian-protocol`）
2. **`bailian-protocol` 是共享协议 skill**，业务 skill 执行前应 Read 它
3. **不要**在 frontmatter 写 `companions`，也不要对外说「companions = 安装器硬依赖」
4. 子集安装：`bl skill add --name bailian-protocol,<skill>`；漏装 protocol 会导致相对路径 Read 失败
5. **`bl skill add --all`：** 安装 registry 全量（含 `spark-video` 等非 bailian 技能）；一键安装 / `bl update` 用 `skill init`，不要用 `--all`

## 概念图

```text
bailian-protocol          ← 共享协议（consent / 鉴权 / 版本 / 错误上报）
        ▲                   靠 `bl skill init` 与业务 skill 同装；非安装器强制 companions
        │
┌───────┴────────┬────────────────┬──────────────────┬───────────────────┐
bailian-gen      bailian-finetune  bailian-managed-agent   bailian-web-search
（领域路由表）    （领域工作流）     （IaC 安全闸）          （搜索路由+兜底）
        │                │                  │                     │
        └────────────────┼──────────────────┴─────────────────────┘
                         ▼ 软 hand-off（按 skill 名）
                   bailian-cli（hub）
                   hub 路由表：本职命令 + 领域 hand-off 行
                   细节 → 各 skill reference/（生成）
```

## 必查清单

### A. 分层边界

- [ ] **整包装齐**：安装/升级文案主推 `bl skill init`；业务 skill **不**声明 `companions`
- [ ] **协议读取**：CRITICAL / references 可链 `../bailian-protocol/…`；若读不到 → 停止执行 `bl`，提示 `bl skill init`
- [ ] **高风险确认**：统一由 `bailian-protocol` 定义；reference / leaf help 以 `risk: high` 明示风险，业务 skill 不得引导 Agent 自动补 `--yes`。遇到 exit code 7 / `requires_confirmation` 时停止执行并请求确认；目标或范围变化后重新确认
- [ ] **正常控制流**：`requires_confirmation` 不是 CLI bug，`assets/issue-reporting.md` 必须将 exit code 7 保持在 EXCLUDE 范围
- [ ] **软 hand-off**：兄弟业务 skill **只写 skill 名**；已安装则 Read，未安装则 `bl … --help` 或提示整包安装；**不要**把 `../bailian-gen/…` 等写成执行前提
- [ ] **Hub vs 领域**：`bailian-cli` 的「When to use which command」只列 hub 拥有的意图；媒体 / 精调 / managed-agent 各留 hand-off 行，**不抄**领域默认模型与子命令明细
- [ ] **渐进披露**：SKILL 写意图路由与领域硬规则；flags / usage / examples 以 `reference/` 或 `bl <command> --help` 为准，表后保留「勿猜 flag」指向句

### B. 文案与落款一致性

- [ ] 领域 skill（gen / finetune / managed-agent）路由或命令表后有指向 `reference/` 的句；文末 `## references`（protocol + reference）与家族对齐
- [ ] description 含 WHAT + WHEN + 反触发；安装说明指向 `bl skill init`，不写 companions 必装
- [ ] Quick examples 只演示本 skill 职责（hub 不示范 `bl image` / `bl video` 等）
- [ ] 若改了安装方式：同步 `README.md` / `README.zh.md` / `INSTALL.md` / `skills/*/README*` / `skills/bailian-protocol/assets/setup.md` 中的 `bl skill init` / `bl skill add …` 示例（改 `INSTALL.md` 时按 [install-doc-change.md](install-doc-change.md) 同步静态页）

### C. 归属与生成

- [ ] 新一级命令组归属领域时：改 `tools/generate-reference.ts` 的 `GROUP_OWNER_SKILL`，并更新**拥有方** skill 的路由表；hub 最多加一行 hand-off
- [ ] 跑 `pnpm run sync:skill-assets`（或 commit 走 pre-commit），提交生成的 `reference/` 与 version 同步结果
- [ ] 高风险命令生成的 reference 必须包含 `Risk` / `Risk message` 和简短 Agent safety 提示；带 `--yes` 的示例必须标注只能在确认后执行，不要手改生成物
- [ ] 默认模型若写在领域路由表（如 `bailian-gen`）：与命令 default / [model-add-remove.md](model-add-remove.md) 一并核对

## 完成后自查

```sh
pnpm run sync:skill-assets
# 已发布版本试装
bl skill init
```

抽查：打开 `skills/bailian-cli/SKILL.md` 确认无领域子命令明细表、无 `companions`；打开对应领域 skill 确认有「勿猜 flag」与 hand-off。

## 常见漏点

- ✗ hub 路由表再次抄回 image / video / finetune / managed-agent 明细 → token 膨胀且与领域 skill 双份漂移
- ✗ 重新加回 `companions` 并宣称安装器硬依赖 → 与 `bl skill add` 合同不符
- ✗ 软 hand-off 写成硬路径 `../bailian-*/SKILL.md` 当执行前提 → 子集安装断链
- ✗ 只改 SKILL、忘改 `GROUP_OWNER_SKILL` → reference 落错 skill
- ✗ 手改 `skills/*/reference/*.md` → 下次 generate 被覆盖
- ✗ 改默认模型只动 flag description / reference，忘改领域 SKILL「When to use which command」表（见 [model-add-remove.md](model-add-remove.md)）
