# 向本仓库投稿 Skill

本文说明如何向 `modelstudioai/cli` 提交**场景类（最佳实践）** Skill。  
官方总入口与命令面能力（名称以 `bailian-` 开头）由本团队维护；合作方请走本文路径，不要新增或修改 `bailian-*` Skill。

可复制的目录模板见：[templates/best-practice/](./templates/best-practice/)。

一作家族（`bailian-*`）的文案与路由约定见内部清单：[docs/agents/skill-change.md](../agents/skill-change.md)。

## 你能改什么

- **可以**：只改 `skills/<你的 skill 名>/`
- **CI 硬拦**：`packages/**`、`tools/**`、`.vite-hooks/**`、发布相关 workflow（以及手改 `skills/*/reference/`）
- **限制**：目录名不要以 `bailian-` 开头；不要改 `skills/bailian-*`（含总入口 `bailian-cli`）。`bailian-` 前缀为官方一作家族，合作方请用非此前缀的场景名。

合入后，用户用下面命令安装即可使用（**不必**改总入口 `bailian-cli`）：

```sh
bl skill add --name bailian-protocol,<你的-skill-名>
```

Agent 会根据你在 `SKILL.md` 里写的 `description` 判断要不要用这个 Skill。  
若希望用户从总入口 `bailian-cli` 也能被指引过来，由**本团队另开一个 PR** 在总入口里加一行说明；投稿 PR 里也尽量不要改 `bailian-cli`。加不加这一行都不影响你的 Skill 安装后单独被触发。

## 四条必须遵守的规则（CI 会检查）

1. **目录与命名**  
   目录名 = frontmatter 里的 `name`；使用安全目录名（不要空格、路径分隔符、`..` 等）；不要与仓库里已有的 `skills/<目录>` 重名。

2. **目录结构**  
   根目录要有 `SKILL.md`（YAML frontmatter，至少包含非空的 `name`、`description`）。手写流程放在 `references/`。  
   **不要**新增或修改任何 `skills/*/reference/`（那是命令手册生成物，给官方 `bailian-*` 用的）。

3. **如何指向百炼能力**  
   需要跑 `bl`、鉴权或共享协议时，用**技能名**去找已安装的 Skill（先找 `bailian-protocol`；生图/精调等再找对应的 `bailian-*`）。已安装就 Read；没有就提示用户执行上面的 `bl skill add`，或让用户跑 `bl … --help`。  
   **不要**写成「必须存在 `../bailian-xxx/SKILL.md` 才能继续」。

4. **安全**  
   不要引导自动补 `--yes`；不要写入真实凭证、真实内部资源或未公开的内部文档链接。

## 建议（不做 CI 硬性检查）

- 目录名不要以 `bailian-` 开头；投稿 PR 不要改 `skills/bailian-*`（含 `bailian-cli`）。
- `description` 写清：做什么、什么时候用、什么时候不要用；尽量别和现有 `bailian-*` 抢同一类意图。
- 用户可见说明尽量中英双语。
- 示例命令对照真实 `bl <command> --help`，不要猜 flag。

## 关于 `metadata.version`

模板里会给一个占位版本（例如 `0.1.0`），由你自己维护。

- 它**不会**自动变成 registry 里的分发版本，也**不需要**和本仓库 `packages/cli` 的版本对齐。
- 改 version **不会**单独走旁路发版；合入 `main` 后仍走现有的 skills 发布对账流程。

官方 `bailian-*` 的 version 仍由本仓库工具与 CLI 版本同步；你的 Skill **不会**被那套同步改写。

## 推荐步骤

1. 复制模板到目标目录：

   ```sh
   cp -R docs/skill-contribute/templates/best-practice skills/<你的-skill-名>
   ```

2. 把目录名、`SKILL.md` frontmatter 的 `name` / `description`、以及 `references/` 里的场景说明改成你的内容；保留「如何按技能名找到百炼 Skill」那段固定说明。
3. 本地确认只改了 `skills/<你的-skill-名>/`（若顺带改了投稿文档 `docs/skill-contribute/**` 也可以）。
4. 开 PR，描述里可粘贴下方自检清单。

## 投稿自检清单

提交前请确认：

- [ ] Skill 目录名：`skills/<name>/`；frontmatter 的 `name` 与目录名一致；`description` 非空
- [ ] 本 PR **只**改了 `skills/<name>/`（以及可选的 `docs/skill-contribute/**`）；**没有**改 `packages/**`、`tools/**`、`.vite-hooks/**`
- [ ] **没有**改任何 `skills/*/reference/**`
- [ ] （软限制）目录名不以 `bailian-` 开头；未改 `skills/bailian-*`
- [ ] 正文用技能名指向 `bailian-protocol` / 相关 `bailian-*`，没有把相对路径写成执行前提
- [ ] 维护人联系方式（GitHub 用户名或团队）已写在 PR 描述里
- [ ] （可选）无真实凭证、无未公开内部链接；未引导自动补 `--yes`
