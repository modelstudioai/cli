# 发布（npm publish）

## 触发条件

- 准备发布 channel（beta/mcp/plugin 等）或正式版到 npm
- 准备打 git tag

## 发布方式：GitHub Actions + npm OIDC

发版**必须**通过 CI 完成，不要本地手动 `pnpm publish`。

入口：GitHub Actions → **Publish** workflow（`.github/workflows/publish.yml`）→ Run workflow。

两种模式：

| 模式    | 用途                          | 触发方式                                          |
| ------- | ----------------------------- | ------------------------------------------------- |
| channel | 发 channel 版本到指定 dist-tag | 选 mode=channel，填 dist-tag 名称（如 mcp/plugin） |
| stable  | 正式发版到 latest              | 选 mode=stable，需 production environment 审批     |

### channel 发布

1. 在 GitHub 触发 Publish workflow，mode 选 `channel`，channel 填 dist-tag 名（如 `mcp`）
2. CI 自动：生成 `0.0.0-beta-<sha7>-<date>` 版本号 → 自检 → 构建 → 发布到指定 dist-tag
3. 对应脚本：`tools/release/publish-channel.mjs`

### stable 发布

1. 确保 `packages/cli/package.json` 和 `packages/core/package.json` 已升到目标版本且一致
2. 在 GitHub 触发 Publish workflow，mode 选 `stable`
3. 需要 production environment 审批人批准
4. CI 自动：自检 → 构建 → 发布到 latest → 打 git tag
5. 对应脚本：`tools/release/publish-stable.mjs`

## 自检（`tools/release/check.mjs`）

两种模式都会先跑 `check.mjs`，覆盖以下检查：

| 检查项                       | 说明                                        |
| ---------------------------- | ------------------------------------------- |
| `pnpm install --frozen-lockfile` | lockfile 一致性                         |
| README 同步                  | `packages/cli/README.md` 与根 README 一致   |
| 版本号一致                   | cli 与 core 的 version 字段相同             |
| `workspace:*` 替换           | cli 对 core 的依赖解析为真实版本号          |
| 构建 core + cli              | `pnpm build`                                |
| pnpm pack                    | 打 tarball                                  |
| publint                      | 包元数据校验                                |
| gitleaks                     | 敏感信息扫描                                |

本地可以 dry-run 验证：

```sh
node tools/release/publish-channel.mjs --channel test --dry-run
```

## CI 基础设施

- **认证**：npm OIDC Trusted Publishing（无 token），需要 `id-token: write` 权限
- **Node 版本**：24（npm 11.5+ 才支持 OIDC token 交换）
- **Actions 版本**：checkout/setup-node/pnpm-action 均为 v6（Node 24 兼容）
- **npm 配置**：两个包的 Trusted Publisher 都指向 `modelstudioai/cli` 的 `publish.yml`，environment 留空

## `check.mjs` 不覆盖的（手动确认）

### 版本号目标（仅 stable）

- [ ] `packages/cli/package.json` 和 `packages/core/package.json` 已升到目标版本
- [ ] pre-release 格式正确（`1.0.0-beta.0` / `1.0.0-rc.1`，**不要直接用 `1.0.0` 当 beta**）

### 用户面文档

- [ ] `README.md` / `README_CN.md` 的 Quick Start 命令仍能跑通
- [ ] README 的 Node.js 徽章版本与 `cli/package.json.engines.node` 一致
- [ ] README 宣传的 bin 名称在 `cli/package.json.bin` 都真的注册
- [ ] `LICENSE` 文件存在（根 + cli + core 各一份）

## 完成后

- [ ] 验证 npm 上能装：`npm view bailian-cli@<tag> version`
- [ ] 试装一次：`npm i -g bailian-cli@<tag> && bl --version`

## 常见漏点（基于历史踩坑）

| 漏点                                             | 后果                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| cli 升版号但 core 没升                           | check.mjs 会拦下                                     |
| `1.0.0` 当 beta 直接发                           | 占了 `latest` tag，所有用户被强升，撤回成本极高       |
| README 写的 bin 名实际 `package.json.bin` 没注册 | 用户复制命令报 `command not found`                   |
| Node 徽章 `>=18`、engines `>=22.12` 不一致       | 用户在 Node 18 上 `npm i` 被 engine 警告或直接失败   |
| npm Trusted Publisher 的 workflow filename 改了没同步 | OIDC 匹配不上，publish 报 404                   |
| CI 用 Node 22（npm 10）跑 publish               | npm 10 不支持 OIDC token 交换，publish 报 404        |
