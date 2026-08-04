# Skill 文案 / 路由 / companion

## 触发条件

- 改 `skills/*/SKILL.md` 的 description、路由表、consent、安全闸、hand-off、references 落款
- 调整 companion（`bailian-protocol`）或业务 skill 之间的软 hand-off 约定
- 新增 / 拆分 / 合并 `bailian-*` 业务 skill，或改 `tools/generate-reference.ts` 的 `GROUP_OWNER_SKILL` 归属（与命令增删改交叉时两边都看）
- 给业务 skill 补安装说明、README，或统一「勿猜 flag → `reference/`」类约定

纯改生成物 `skills/*/reference/*.md`（由命令 metadata 驱动）→ 走 [command-add-remove.md](command-add-remove.md) / [command-flag-change.md](command-flag-change.md)，**不要手改 reference**。

## 概念图

```text
bailian-protocol          ← companion（硬依赖；consent / 鉴权 / 版本 / 错误上报）
        ▲
        │ companions: ["bailian-protocol"]
┌───────┴────────┬────────────────┬──────────────────┐
bailian-gen      bailian-finetune  bailian-managed-agent
（领域路由表）    （领域工作流）     （IaC 安全闸）
        │                │                  │
        └────────────────┼──────────────────┘
                         ▼ 软 hand-off（按 skill 名）
                   bailian-cli（hub）
                   hub 路由表：本职命令 + 领域 hand-off 行
                   细节 → 各 skill reference/（生成）
```

## 必查清单

### A. 分层边界

- [ ] **Companion（硬依赖）**：业务 skill frontmatter 保留 `companions: ["bailian-protocol"]`；CRITICAL / references 可链 `../bailian-protocol/…`
- [ ] **软 hand-off**：兄弟业务 skill **只写 skill 名**；已安装则 Read，未安装则 `bl … --help` 或提示 `-s bailian-protocol -s <skill>`；**不要**把 `../bailian-gen/…` 等写成执行前提
- [ ] **Hub vs 领域**：`bailian-cli` 的「When to use which command」只列 hub 拥有的意图；媒体 / 精调 / managed-agent 各留 hand-off 行，**不抄**领域默认模型与子命令明细
- [ ] **渐进披露**：SKILL 写意图路由与领域硬规则；flags / usage / examples 以 `reference/` 或 `bl <command> --help` 为准，表后保留「勿猜 flag」指向句

### B. 文案与落款一致性

- [ ] 领域 skill（gen / finetune / managed-agent）路由或命令表后有指向 `reference/` 的句；文末 `## references`（protocol + reference）与家族对齐
- [ ] description 含 WHAT + WHEN + 反触发 + companion 必装说明；与正文路由不打架
- [ ] Quick examples 只演示本 skill 职责（hub 不示范 `bl image` / `bl video` 等）
- [ ] 若改了安装方式：同步 `README.md` / `README.zh.md` / `INSTALL.md` / `skills/*/README*` 中的 `npx skills add …` 示例

### C. 归属与生成

- [ ] 新一级命令组归属领域时：改 `tools/generate-reference.ts` 的 `GROUP_OWNER_SKILL`，并更新**拥有方** skill 的路由表；hub 最多加一行 hand-off
- [ ] 跑 `pnpm run sync:skill-assets`（或 commit 走 pre-commit），提交生成的 `reference/` 与 version 同步结果
- [ ] 默认模型若写在领域路由表（如 `bailian-gen`）：与命令 default / [model-add-remove.md](model-add-remove.md) 一并核对

## 完成后自查

```sh
pnpm run sync:skill-assets
# 本地试装（测本仓库改动，勿只拉远端）
npx skills add "$(pwd)" --all -g -y
```

抽查：打开 `skills/bailian-cli/SKILL.md` 确认无领域子命令明细表；打开对应领域 skill 确认有「勿猜 flag」与 hand-off。

## 常见漏点

- ✗ hub 路由表再次抄回 image / video / finetune / managed-agent 明细 → token 膨胀且与领域 skill 双份漂移
- ✗ 软 hand-off 写成硬路径 `../bailian-*/SKILL.md` 当执行前提 → 子集安装断链
- ✗ 只改 SKILL、忘改 `GROUP_OWNER_SKILL` → reference 落错 skill
- ✗ 手改 `skills/*/reference/*.md` → 下次 generate 被覆盖
- ✗ 改默认模型只动 flag description / reference，忘改领域 SKILL「When to use which command」表（见 [model-add-remove.md](model-add-remove.md)）
