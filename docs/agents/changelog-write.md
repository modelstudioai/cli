# 撰写 Change Log

## 触发条件

- 发布新版本(beta / rc / stable)后,需要为这个版本写一份 release notes
- 补写历史版本遗漏的 changelog

## 发布位置

更新仓库内的两份文件,英文优先,中文同步:

- [`CHANGELOG.md`](../../CHANGELOG.md)
- [`CHANGELOG_CN.md`](../../CHANGELOG_CN.md)

新版本条目插在文件顶部"## [X.Y.Z] - YYYY-MM-DD"位置,旧版本依次向下保留。两份文件保持一一对应——任何条目只在一份里出现,另一份漏写,视为错误。

## 输出格式:Keep a Changelog

本项目采用 [Keep a Changelog](https://keepachangelog.com/) 规范,标准 6 段(按出现顺序):

| 段名         | 含义                          | 示例                              |
| ------------ | ----------------------------- | --------------------------------- |
| `Added`      | 新增功能 / 命令 / 参数        | 新增 `bl app list`                |
| `Changed`    | 已有功能行为/形式变化(非破坏) | `--page-num` 改名 `--page`        |
| `Deprecated` | 即将移除但当前仍可用          | `--legacy-flag` 弃用,下个版本移除 |
| `Removed`    | 本版本删除的能力              | 移除 `--instructions`             |
| `Fixed`      | Bug 修复                      | 修复视频生成模型错误              |
| `Security`   | 安全相关修复                  | 修复凭据明文落盘                  |

项目扩展段:`Internal`(放研发体系 / 工具链 / 测试基建,与用户无关但值得记录的工程改动)。

某段没内容就**直接省略**,不要写"无"。

## 撰写步骤

### 1. 确定版本边界

通过 `package.json` 的版本号变更找出两个版本的 commit 边界:

```sh
# 找出 packages/cli/package.json 历次版本变更
git log --all --oneline --pretty=format:'%h %ad %s' --date=short \
    -G '"version"' -- packages/cli/package.json | head
```

记下:

- `prevBumpCommit` — 上一个版本号 bump commit(如 `1.0.0` 的 commit)
- `currBumpCommit` — 当前版本号 bump commit(如 `1.0.1` 的 commit)

本版本内容 = `git log prevBumpCommit..currBumpCommit`。

### 2. 列出本版本所有 commit

```sh
git log <prevBumpCommit>..<currBumpCommit> --no-merges \
    --pretty=format:'%h %ad %s' --date=short
```

> 注意:用 `--no-merges` 过滤 merge commit,避免重复条目。

### 3. 逐条核对 commit 是否真的进了本版本

merge 顺序复杂时,commit 标题在但内容未必合入。用 `git merge-base --is-ancestor` 严格验证:

```sh
git merge-base --is-ancestor <featureCommit> <releaseCommit> \
    && echo "IN" || echo "NOT IN"
```

例:验证 `agent chat`(commit `12f2b1b`)是否在 `1.0.0`(commit `3fc54ae`)里:

```sh
git merge-base --is-ancestor 12f2b1b 3fc54ae && echo "IN" || echo "NOT IN"
```

**不要凭 commit 标题猜**——分支模型常导致一个功能开发完成但未合入当前 release。

### 4. 在 release commit 上抽样校验代码真实存在

光看 commit 还不够,要确认目标功能的代码 / 文件在 release commit 上真的存在:

```sh
# 列出 release commit 下某目录的文件
git ls-tree -r <releaseCommit> --name-only -- packages/cli/src/commands/

# 看 release commit 下某文件的内容
git show <releaseCommit>:packages/cli/src/commands/console/call.ts | head
```

特别注意被一行带过的"杂项" commit。本仓库历史踩过坑:`feat(cli): enhance output options and add new commands` 这种标题里藏了**新命令** + **新输出格式** + **logout 增强**三件事,粗看会全部漏掉。

```sh
# 看整个 commit 改了哪些文件、新增了多少行
git show <commit> --stat
```

只要 `--stat` 里出现新文件或大块新增,就值得展开看。

### 5. 区分 Added vs Changed

- **Added**:新文件、新命令、新参数、新输出格式 → 用户能"用上一个新东西"
- **Changed**:已有功能改名、改默认值、改交互文案、性能优化、参数命名统一 → 用户"原来就在用的东西变样了"

判断方法:在 `prevBumpCommit` 上 `git show <prevBumpCommit>:<file>` 看这个文件 / 函数原来在不在。

### 6. 排除"不该写进去"的内容

| 不要写                                            | 原因                               |
| ------------------------------------------------- | ---------------------------------- |
| 未发布 / 仅在分支上的功能                         | release commit 不包含 → 用户拿不到 |
| 仅在文档 / 设计稿层面的能力                       | 没代码就没"功能",不能写进 Added    |
| 内部包 / 私有工具的开发过程 commit                | 用户不可见                         |
| 仓库内 file path / 模块路径(如 `core/telemetry/`) | 用户感知不到内部结构               |
| 临时调试 commit(remove console / 补 TODO 等)      | 噪音                               |

### 7. 标记 Breaking Change

- 单条:在条目末尾加 `**(BREAKING)**` 或行内提示
- 多条:版本头单独开 `### Breaking Changes` 段(major 升级才允许)

判断标准:用户**已有的命令 / 脚本 / 集成会因为升级而坏掉**。常见来源:

- 命令重命名 / 删除
- 参数重命名 / 删除
- 默认值变化导致输出格式变化
- 包结构 / import 路径变化(monorepo 拆包)
- 配置文件 schema 不兼容

### 8. 写完后给用户过一遍再写入文件

**不要直接编辑 `CHANGELOG.md` / `CHANGELOG_CN.md`**。先把中英两份草稿都贴回对话里,让用户:

- 增删条目
- 调整措辞(中英、术语)
- 确认 BREAKING 标记
- 确认版本边界假设是否成立

用户确认后,把新版本块插入两个文件顶部(在 H1 标题与上一个版本块之间)。

## 模板

```markdown
## [X.Y.Z] - YYYY-MM-DD

> 一句话概括本版本主线(可省略,大版本/含 breaking 时建议加)

### Added

- **<能力名>**:一句话描述用户能做什么
  - 子项 1
  - 子项 2

### Changed

- **<点名>(BREAKING)**:变化前 → 变化后,影响范围

### Fixed

- 修复 X 在 Y 场景下的问题

### Internal

- 工程类改动(不影响用户行为)
```

## 常见漏点(基于真实踩坑)

| 漏点                                              | 后果                                                    |
| ------------------------------------------------- | ------------------------------------------------------- |
| 只看 commit 标题不看 `--stat`                     | "enhance output options" 这种笼统标题里藏的新命令被漏掉 |
| 凭 commit 标题判断是否进了 release                | 分支没合入,标题在但代码不在                             |
| 把分支上 WIP 当作已发布功能                       | 用户升级后找不到对应能力,被投诉                         |
| 把内部文件路径写进 changelog                      | 用户看不懂,且暴露内部结构                               |
| 优化类改动错放到 Added                            | 用户以为是新功能去找,找不到入口                         |
| 版本号 bump commit 自身的 README 改动算进上个版本 | 重复 / 错位                                             |
| 中英两份不同步                                    | 文档可信度直接崩,等同于撒谎                             |

## 与 publish.md 的边界

| 文档                     | 管什么                                        |
| ------------------------ | --------------------------------------------- |
| [publish.md](publish.md) | 发布流程:自检 / 构建 / npm publish（CI 驱动） |
| 本文档                   | 发版后写说明:面向用户的 release notes         |

两者顺序:`publish.md` → npm publish → 本文档(更新 `CHANGELOG.md` + `CHANGELOG_CN.md`)→ 推到 GitHub。
