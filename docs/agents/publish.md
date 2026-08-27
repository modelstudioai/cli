# 发布（npm + GitHub Release 二进制）

## 触发条件

- 准备发布 channel（mcp/plugin 等）或正式版到 npm **与** GitHub Releases 二进制
- 准备打 git tag（仅 stable）

## 发布方式：GitHub Actions 总入口

发版**必须**通过 CI 完成，不要本地手动 `pnpm publish`。

入口：GitHub Actions → **Publish** workflow（`.github/workflows/publish.yml`）→ Run workflow。

**编排关系（重要）：**

```text
publish-stable.mjs / publish-channel.mjs   ← 唯一发版入口
        ├─ npm（pnpm publish）
        └─ binary（lib/binary-release
              → binary-build
              → gh-release
              → oss-direct-upload）
```

`tools/release/lib/binary-release.mjs` 等是实现，一般不要单独当发版入口（调试可用）。

### bailian-kb-dsh（独立版本、npm-only）

同一个 Publish 入口，`package=bailian-kb-dsh`。它走单独的 `tools/release/publish-kb-dsh.mjs`，不复用 `publish-stable.mjs` / `publish-channel.mjs`（版本独立、无 binary、无 OSS CDN）。详见 [dsh-plugin.md](dsh-plugin.md#发布)。

两种模式：

| 模式    | 用途                                                                                    | 触发方式                                     |
| ------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| channel | npm dist-tag +（仅 bailian-cli）二进制 + CDN **一律**覆盖 `sync-release.json`           | mode=channel，channel 填 **npm dist-tag** 名 |
| stable  | npm latest + GitHub Release `v<ver>` + CDN **`manifest.json`**（及 `latest.json` 别名） | mode=stable，需 production environment 审批  |

可选 flag：`--skip-binary`（仅发 npm，紧急逃生）。

### CDN 滚动指针（bailian-cli）

| 发布模式 | CDN 指针                           | 本机安装 / 更新                                                   |
| -------- | ---------------------------------- | ----------------------------------------------------------------- |
| channel  | 始终覆盖 `sync-release.json`       | `BAILIAN_CHANNEL=sync-release` / `install --channel sync-release` |
| stable   | `manifest.json`（+ `latest.json`） | 默认安装 / `bl update`（无 channel）                              |

workflow 的 `channel` 输入**只决定 npm dist-tag**（如 `mcp` / `plugin` / `sync-release`），**不再**生成 `release-test.json` 这类旁路文件。

### channel 发布

1. 在 GitHub 触发 Publish workflow，mode 选 `channel`，channel 填 npm dist-tag 名：
   - **`bailian-cli`**：npm 发到该 tag；二进制同时刷新 CDN `sync-release.json`（与 tag 名无关）。本机验证：`BAILIAN_CHANNEL=sync-release`
   - **`knowledge-studio-cli`**：仅 npm（自动跳过 binary，不碰 `sync-release.json`）
2. CI 自动：生成 `0.0.0-beta-<sha7>-<YYYYMMDDHHMM>`（UTC 到分钟；同 commit 同分钟重跑会覆盖同号）→ 临时 bump → 自检 → **npm 发到 dist-tag** →（bailian-cli）**Bun 编二进制 + GH prerelease + 覆盖 `sync-release.json`** → 还原 package.json
3. 对应脚本：`tools/release/publish-channel.mjs`

### stable 发布

1. 确保当前 release tooling 覆盖的包(`tools/release/lib/packages.mjs`)已升到目标版本且一致;当前基础集合为 `packages/core` / `packages/runtime` / `packages/commands` / `packages/cli`，`knowledge-studio-cli` 发布会额外包含 `packages/kscli`
2. 在 GitHub 触发 Publish workflow，package 选目标包集合，mode 选 `stable`
3. 需要 production environment 审批人批准
4. CI 自动：自检 → **npm 发到 latest** → **推送 git tag `v<ver>`** → **Bun 编二进制并创建/更新 GitHub Release** →（bailian-cli）维护 CDN **`manifest.json`** → 完成
5. 如果所选发布集合的当前版本已全部存在于 npm，stable 发布会失败并提示先升级版本号；如果只有部分包已发布，CI 会继续补发缺失包
6. 对应脚本：`tools/release/publish-stable.mjs`

## 自检（`tools/release/check.mjs`）

两种模式都会先跑 `check.mjs`，覆盖以下检查：

| 检查项                           | 说明                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | lockfile 一致性                                                                                                 |
| README 同步                      | `packages/cli/README.md` 与根 README 一致                                                                       |
| 版本号一致                       | `tools/release/lib/packages.mjs` 中待发布包集合 version 相同                                                    |
| `workspace:*` 替换               | 发布包间 workspace 依赖解析为真实版本号                                                                         |
| 构建                             | 基础发布构建 core/runtime/commands 依赖和 cli;`--knowledge` 额外构建 `knowledge-studio-cli`                     |
| 生成资产                         | 重建各 `skills/<skill>/reference/`;非 channel 模式还同步各 `skills/*/SKILL.md` version（含 `bailian-protocol`） |
| pnpm pack                        | 打 tarball                                                                                                      |
| publint                          | 包元数据校验                                                                                                    |
| gitleaks                         | 敏感信息扫描                                                                                                    |

本地可以 dry-run 验证：

```sh
node tools/release/publish-channel.mjs --channel test --dry-run
node tools/release/publish-channel.mjs --channel test --knowledge --dry-run
```

## CI 基础设施

- **认证**：npm OIDC Trusted Publishing（无 token），需要 `id-token: write` 权限
- **GitHub Release**：`contents: write` + `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`（stable / channel 均需）
- **Node 版本**：24（npm 11.5+ 才支持 OIDC token 交换）
- **Bun**：`oven-sh/setup-bun`，版本钉死在 workflow 中
- **Actions 版本**：checkout/setup-node/pnpm-action 均为 v6（Node 24 兼容）
- **npm 配置**：当前 release tooling 发布的包(`bailian-cli-core` / `bailian-cli-runtime` / `bailian-cli-commands` / `bailian-cli` / `knowledge-studio-cli`)的 Trusted Publisher 指向 `modelstudioai/cli` 的 `publish.yml`;新增发布包时同步 npm Trusted Publisher

## `check.mjs` 不覆盖的（手动确认）

### 版本号目标（仅 stable）

- [ ] `tools/release/lib/packages.mjs` 覆盖的目标包集合已升到目标版本且一致
- [ ] 源码包 `packages/core/package.json`、`packages/runtime/package.json`、`packages/commands/package.json`、`packages/cli/package.json`、`packages/kscli/package.json` 是否需要同步升版已人工确认;当前仓库通常保持五包版本一致
- [ ] `tools/release/lib/packages.mjs` 的 `PACKAGES` 覆盖基础发布包;`KSCLI_PACKAGE` / `ALL_PACKAGES` 覆盖 `knowledge-studio-cli` 发布路径;如果新增发布包,同步 `publish-stable.mjs` / `publish-channel.mjs` 的 bump、publish、idempotency 逻辑和 `.github/workflows/publish.yml` 的 package 选项
- [ ] pre-release 格式正确（`1.0.0-beta.0` / `1.0.0-rc.1`，**不要直接用 `1.0.0` 当 beta**）

### CHANGELOG（仅 stable）

- [ ] `CHANGELOG.md` 和 `CHANGELOG.zh.md` 都已新增目标版本条目，中英文一一对应
- [ ] 分类标题用 Keep a Changelog 规范的 `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`（中文版对应 `新增` / `变更` / `已弃用` / `已移除` / `修复` / `安全`），**不要自创 `Improved` / `优化` 等规范外分类**
- [ ] 条目日期与发版日期一致

### 用户面文档

- [ ] `README.md` / `README.zh.md` 的 Quick Start 命令仍能跑通
- [ ] README 的 Node.js 徽章版本与 `cli/package.json.engines.node` 一致
- [ ] README 宣传的 bin 名称在 `cli/package.json.bin` 都真的注册
- [ ] `packages/kscli/README.md` / `README.zh.md` 与 `knowledge-studio-cli` 的 bin、控制台 URL、认证方式一致
- [ ] `LICENSE` 文件存在（根 + 当前实际发布包;新增发布包时补该包 LICENSE）

## 完成后

- [ ] 验证 npm 上能装：`npm view bailian-cli@<tag> version`;如发布 `knowledge-studio-cli`，同时 `npm view knowledge-studio-cli@<tag> version`
- [ ] 试装一次：`npm i -g bailian-cli@<tag> && bl --version`;如发布 `knowledge-studio-cli`，同时 `npm i -g knowledge-studio-cli@<tag> && kscli --version`

## 常见漏点（基于历史踩坑）

| 漏点                                                                | 后果                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 只升部分包,漏升 runtime/commands/kscli                              | 当前 check.mjs 按所选发布集合校验,但未选择 `knowledge-studio-cli` 时不会覆盖 kscli |
| 新增发布包但没加 `tools/release/lib/packages.mjs`                   | CI 不会 bump/publish/校验该包                                                      |
| cli 升版号但 core 没升                                              | check.mjs 会拦下                                                                   |
| 发版漏更 CHANGELOG，或分类写成规范外的 `优化`/`Improved`            | 用户看不到本次变更，分类与历史不一致                                               |
| `1.0.0` 当 beta 直接发                                              | 占了 `latest` tag，所有用户被强升，撤回成本极高                                    |
| README 写的 bin 名实际 `package.json.bin` 没注册                    | 用户复制命令报 `command not found`                                                 |
| Node 徽章与 `cli/package.json.engines` 不一致（当前应为 `>=18.17`） | 用户在声明外的 Node 上 `npm i` 被 engine 警告或直接失败                            |
| npm Trusted Publisher 的 workflow filename 改了没同步               | OIDC 匹配不上，publish 报 404                                                      |
| CI 用 Node 22（npm 10）跑 publish                                   | npm 10 不支持 OIDC token 交换，publish 报 404                                      |
| stable 发布前没有升级版本号                                         | 所选发布集合的版本已全部存在于 npm，CI 明确报错并要求先升级版本号                  |
| channel job 缺少 `contents: write`                                  | `gh release create` 失败                                                           |
| stable 未先推 tag 就建 Release                                      | `--verify-tag` 失败                                                                |
