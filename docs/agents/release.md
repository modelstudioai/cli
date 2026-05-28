# 发版前自检

## 触发条件

- 准备发布 beta / rc / 正式版到 npm
- 准备打 git tag

## 主入口:`tools/release.mjs`

发版流程**必须**走这两个命令,不要手动跑 `pnpm publish`:

```sh
node tools/release.mjs check     # 全套自检,不发布
node tools/release.mjs publish   # 自检 + 交互确认 + 发布
```

### `check` 已自动覆盖(无需手动重复)

| 检查项                                                                                 | 实现                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------- |
| cli/core 版本号一致                                                                    | `validatePackages()`                        |
| `publishConfig.registry` 指向公共 npm                                                  | `assertPublishConfig()`                     |
| frozen lockfile install                                                                | `pnpm install --frozen-lockfile`            |
| format + lint + type check                                                             | `pnpm run check`                            |
| 构建 core + cli                                                                        | `pnpm --filter ... run build`               |
| **黑名单文件**(`.env` / `.npmrc` / `*.pem` / `*.key` / `*.crt` / SSH keys / debug log) | `denyPathPatterns` in `scanPackageContents` |
| **敏感字符串**(DashScope `sk-xxxxx`、Alibaba `LTAI...`、access key secret)             | `secretPatterns` in `scanPackageContents`   |
| tarball 里 cli 依赖 `bailian-cli-core@<exact version>`,无 `workspace:*` 泄漏           | `assertCliPackage()`                        |
| cli bin 含 `#!/usr/bin/env node` shebang                                               | 同上                                        |
| cli bundle 把 core 当外部依赖                                                          | 同上                                        |
| core tarball 含 `dist/index.mjs` + `dist/index.d.mts`                                  | `assertCorePackage()`                       |

如果新增了"应该自动检查"的项目级规则,优先加到 `tools/release.mjs`,不要单独靠人工或 AI 记。

## `release.mjs` 不覆盖的(手动确认)

### 版本号目标

- [ ] `packages/cli/package.json` 和 `packages/core/package.json` 已升到目标版本
- [ ] pre-release 格式正确(`1.0.0-beta.0` / `1.0.0-rc.1`,**不要直接用 `1.0.0` 当 beta**)

### 用户面文档

- [ ] `README.md` / `README_CN.md` 的 Quick Start 命令仍能跑通
- [ ] README 的 Node.js 徽章版本与 `cli/package.json.engines.node` 一致
- [ ] README 宣传的 bin 名称在 `cli/package.json.bin` 都真的注册(常见漏点)
- [ ] `LICENSE` 文件存在(根 + cli + core 各一份)

### AI 入口资产

- [ ] `pnpm --filter bailian-cli run build` 已执行(`generate:reference` 会刷新 `tools/generated/reference/`,仅本地校验用,不随 npm 包发布)
- [ ] SKILL.md 与命令手册的分发已迁出本仓库,改由独立的 `npx add skills` 机制安装;本仓库的 `cli/package.json.files` 不再包含 `skill` 与 `scripts/postinstall.js`

## 发布

### beta / rc(不进 `latest` dist-tag)

`tools/release.mjs publish` 当前不接受 `--tag` 参数(见末尾 TODO)。pre-release 版本 npm 默认行为不会污染 `latest`,但稳妥起见,**直接用 pnpm 命令显式带 tag**:

```sh
# 先跑一次 check 确保通过
node tools/release.mjs check

# 然后显式发布到 beta dist-tag
pnpm --filter bailian-cli-core publish --tag beta --no-git-checks
pnpm --filter bailian-cli      publish --tag beta --no-git-checks
```

### 正式版(默认进 latest)

```sh
node tools/release.mjs publish
```

## 完成后

- [ ] 推 git tag(如 `v1.0.0-beta.0`)
- [ ] 验证 npm 上能装:`npm view bailian-cli@beta version`
- [ ] 试装一次:`npm i -g bailian-cli@beta && bl --version`

## TODO(给 release.mjs 维护者)

- [ ] `releasePublish` 接受 `--tag <name>` 参数,beta/rc 不再绕开脚本
- [ ] `check` 增加 SKILL.md 与 `catalog.ts` / `reference/index.md` 一致性断言(如命令数、关键子命令名)

## 常见漏点(基于历史踩坑)

| 漏点                                             | 后果                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| 改了源码忘 `vp pack`,直接 publish                | npm 上是旧代码 — `tools/release.mjs publish` 会自动重建,**不要绕过它** |
| cli 升版号但 core 没升                           | release.mjs 会拦下                                                     |
| `1.0.0` 当 beta 直接发                           | 占了 `latest` tag,所有用户被强升,撤回成本极高                          |
| README 写的 bin 名实际 `package.json.bin` 没注册 | 用户复制命令报 `command not found`                                     |
| Node 徽章 `>=18`、engines `>=22.12` 不一致       | 用户在 Node 18 上 `npm i` 被 engine 警告或直接失败                     |
