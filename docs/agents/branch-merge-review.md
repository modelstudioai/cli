# 分支合并 Review

## 触发条件

- 评估某分支(feature / pipeline / 重构分支)能否合到 `main`
- 评估合并后对原有功能的侵入性影响
- 用户问"X 分支可以合 Y 吗 / 有什么影响"

## 目标

- **不破坏原功能**:共享文件的运行时行为、公共类型、构建配置不能静默变化
- **新功能可发现**:用户可见的新命令/新 flag 必须有文档和示例

## 步骤(按顺序)

### ① 看分歧

```sh
git fetch origin <base>
git log --oneline <base>..<head>     # head 比 base 多的提交
git log --oneline <head>..<base>     # base 比 head 多的提交(双向都看,base 已大幅领先时尤其重要)
```

### ② 干跑合并,先确认有无冲突

```sh
git merge-tree $(git merge-base <base> <head>) <base> <head> > /tmp/merge.txt
echo "exit=$?"
grep -E "^(<<<<<<<|>>>>>>>|CONFLICT)" /tmp/merge.txt | head -20
```

- exit=0 且无 `<<<<<<<` → 机器可合,继续 ③
- 有冲突 → 先列冲突文件,把方案讲清楚再动手

### ③ 拆 diff:共享文件 vs 新增文件

```sh
git diff --stat <base>...<head>
git diff --name-only <base>...<head>
```

- **新增文件**(对方分支没有)→ 侵入性 = 0,只看是否需要文档透出(跳到清单 B)
- **共享文件**(两边都有)→ 重点看,逐个跑 `git diff <base>...<head> -- <file>`,过清单 A

## 清单 A:侵入性(共享文件必看)

- [ ] **运行时行为没静默变化**:默认值、错误码 / `ExitCode`、retry 次数、并发度、超时
- [ ] **公共类型 / 导出签名向后兼容**:新增可选字段 OK;改必填、删字段、改返回类型 → 不行(参考 [packages/core/src/types/](packages/core/src/types/))
- [ ] **`pnpm-workspace.yaml` 没收窄通配**:`packages/*` 改成显式列表会漏掉目标分支新增的子包(本次 pipeline → main 踩过这个坑,漏了 `packages/skills`)
- [ ] **`package.json` 没破坏发布元数据**:`bin` / `exports` / `files` / `inlinedDependencies` 字段任何删除或改名都要单独评估
- [ ] **公共依赖没被悄悄升级**:catalog / 根 lockfile 改动要列出来
- [ ] **`package.json` version 没倒退**:目标分支已经更高时(如 main 1.0.3 vs head 1.0.0-beta.1),手动对齐版本号,不要被 head 覆盖
- [ ] **全局表没冲突**:`registry.ts`、`NO_AUTH_SETUP`(`packages/cli/src/main.ts`)、`ExitCode` 三个全局表新增项不和现有项冲突

## 清单 B:用户透出(用户可见的新东西必看)

- [ ] **新命令 / 新 flag** 已同步到用户面文档:
  - [README.md](README.md) + [README_CN.md](README_CN.md)(中英文都要,常漏 `_CN`)
  - (SKILL.md 已迁出本仓库,由 `npx add skills` 机制独立维护,不在本仓库 review 范围)
- [ ] **`bl <cmd> --help`** 文案完整:`description` / `examples` / `apiDocs` 都填了
- [ ] **demo / quickstart**:用户可调用的新命令至少有一个示例
- [ ] **行为变化的老命令**:在 commit message / CHANGELOG 注明用户感知的差异
- [ ] **错误信息 / 提示文案**:面向用户的字符串通顺、双语(项目主体是中文场景)

## 清单 C:容易漏的(每条一行扫一眼)

- [ ] **改了文件但没补测试**:`git diff --stat <base>...<head> -- '*test*' '*spec*'` 与改动文件清单对照
- [ ] **新功能埋点同步**:遥测事件名 + 参数 allowlist(参考 main 上的 `feat(telemetry): track console gateway api name in params allowlist` commit)
- [ ] **环境变量**:新增 / 重命名的 env var 进 README,旧的有没有兼容
- [ ] **i18n**:`README.md` 改了,`README_CN.md` 同步了吗

## 输出报告(照模板填)

```
冲突: 无 / 有 → <文件列表>
必须修(合并前在 head 分支上 commit 掉):
  - <清单项> + <文件:行号> + <一句话原因>
  ↑ 只放真正"head 分支自己写错了"的项,例如 pnpm-workspace.yaml 收窄、version 倒退、
    删了不该删的字段等。这些 fix 应该作为 head 分支上的新 commit,而不是合并解冲突时顺手处理。
解冲突要点(merge 时不要漏):
  - <冲突文件> + <字段/段落> + <怎么取舍>
  ↑ 放"合并那一刻才会出现"的细节,例如 package.json 的 files/scripts/devDependencies 各取并集、
    NO_AUTH_SETUP 这种全局表两边都加项时不要丢一侧、pnpm-lock.yaml 直接 rm 后 pnpm install 重生等。
建议修(可后置):
  - ...
仅信息(无需动作,告知即可):
  - ...
合并姿势:
  1. 在 head 分支上修上面"必须修"的项,提 commit
  2. 合并 main,按"解冲突要点"逐项处理冲突
  3. <pnpm install / 测试 / 构建命令>
  4. 提 MR 合 main
```

## 常见漏点(基于历史踩坑)

| 漏点                                                                           | 后果                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` 把 `packages/*` 收窄成显式列表                           | 合并后目标分支的新子包不再被 workspace 识别,`pnpm install` 看似正常但子包失联 |
| 源分支 version 比目标分支低,直接 merge 覆盖                                    | npm 上版本号回退,latest tag 错乱                                              |
| `registry.ts` 注册新命令但忘了 [README](README.md) / [README_CN](README_CN.md) | 用户完全感知不到新功能                                                        |
| 共享 util 重构(抽公共函数)只改了一处调用方                                     | 其它调用方静默走旧分支,行为分裂                                               |
| `NO_AUTH_SETUP` 加了不该免登录的命令                                           | 安全风险,用户没登录也能调付费 API                                             |
| `NO_AUTH_SETUP` / `registry.ts` 这类全局表两边都加项,解冲突时被合掉一侧        | 某个命令突然要求登录 / 某个新命令注册丢失,编译能过、回归不易察觉              |
