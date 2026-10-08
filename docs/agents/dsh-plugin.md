# dsh 插件维护（bailian-*-dsh）

## 触发条件

- 改 `packages/bailian-kb-dsh` 或 `packages/bailian-memo-dsh` 的工具、Host/Client、settings、凭据解析
- 改 web 半（设置页 React 组件、CSS Modules、locale）
- 升级 `@deepseek-ai/dsh-*` peer 依赖
- 改插件包名、bundle 声明或产物布局
- 发布任一 dsh 插件到 npm

## 这个家族和其他 packages 不一样的地方

它们是**下游宿主适配层**：依赖方向朝外（消费百炼 API / 本地身份文件，装进 DeepSeek Harness 运行），不是 `core → runtime → commands → 产品入口` 这条链上的一环。

| 项       | dsh 插件包                                        | 其他包                               | 原因                                                                            |
| -------- | ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| 版本     | 各自独立（kb `0.1.x`，memo `0.1.x`）              | core/runtime/commands/cli/kscli 锁步 | 跟随 dsh 节奏，与 `bl` 发版无关；不在 `tools/release/lib/packages.mjs` 白名单里 |
| 构建     | `tsc` + `tsdown`                                  | `vp pack`                            | 浏览器半需要 `__ModuleLoader__` banner/footer 与 lightningcss CSS Modules 内联  |
| 发布     | `publish.yml` 选包名，走 `publish-dsh-plugin.mjs` | `publish-stable/channel.mjs`         | 不在 `bailian-cli` 依赖闭包内                                                   |
| tsconfig | 三个                                              | 一个                                 | 见下                                                                            |

当前包：

| 包                 | 职责                                       | 目标 dsh                                      | 设计文档                       |
| ------------------ | ------------------------------------------ | --------------------------------------------- | ------------------------------ |
| `bailian-kb-dsh`   | 知识库 `kb_search` / `kb_chat` + skill     | 仍为 rc-era SettingsProvider 模式（迁移另开） | [docs/kb-dsh/](../kb-dsh/)     |
| `bailian-memo-dsh` | 个人记忆自动召回 / 静默筛选 / 工具与设置页 | **0.2.1** Volatile Config + SettingsForms     | [docs/memo-dsh/](../memo-dsh/) |

## tsconfig 三件套（改动前先读）

| 文件                  | 谁在用                | 作用                                                    |
| --------------------- | --------------------- | ------------------------------------------------------- |
| `tsconfig.json`       | oxlint / `vp check`   | **纯类型检查**，`src` + `tests`，`noEmit` + `jsx` + DOM |
| `tsconfig.build.json` | `build`（`tsc -b`）   | 产出 node 半到 `dist/`，`exclude: src/web`              |
| `tsconfig.web.json`   | `build` / `typecheck` | web 半隔离检查：`types: []`                             |

- 不要把 `tsconfig.json` 改成产出配置。
- web 隔离检查挂在 `build` script 里。

## 必查清单

### A. 包身份（改包名时三处必须一起改）

- [ ] `package.json` 的 `name`
- [ ] `cordis.patch.yml` 的 `insert[].name`
- [ ] `tsdown.config.ts` 的 `PLUGIN_ID`

验证：`grep -rn "<新包名>" package.json cordis.patch.yml tsdown.config.ts`，且 `dist/web/client.js` 首行 `id` 正确。

### B. 产物布局

- [ ] `dist/`（node）+ `dist/web/client.js`（浏览器）；根 `.gitignore` 忽略 `dist` / `*.tsbuildinfo`
- [ ] `main` / `types` / `exports` / `files` 与产物一致
- [ ] tsdown `clean: false`

### C. web 半边界

- [ ] 只 import tsdown `CLIENT_EXTERNALS` 内的 `@deepseek-ai/*`
- [ ] 不 import `node:*` 与本仓 CLI 包
- [ ] 跨插件协作走 cordis service（type-only import 可）

### D. 现代 vs 遗留 Settings（重要）

|               | `bailian-memo-dsh`（新）                        | `bailian-kb-dsh`（遗留，待迁移）                  |
| ------------- | ----------------------------------------------- | ------------------------------------------------- |
| Config        | `Volatile` / `.volatile()`                      | 普通 Config + `SettingsProvider`                  |
| Client        | `SettingsFormModel` + `configForms.whileServed` | 自定义 `/settings` bridge + `credentials/updated` |
| Host 辅助路由 | `webServer` + `connection.requestRejection`     | 同类 bridge 路由                                  |

**新插件禁止**复制 kb-dsh 的 SettingsProvider / `/settings` bridge / `credentials/updated`。kb-dsh 迁移到 0.2.1 模式另开任务，不要塞进 memo 变更。

### E. 文档

- [ ] 用户可见行为变了 → `README.md` 与 `README.zh.md` 一起改
- [ ] 设计/门槛写进 `docs/<插件短名>/`，不要回流 README
- [ ] 包根保留 `LICENSE`

### F. 依赖与测试

- [ ] `@deepseek-ai/dsh-*` 同时列 peer + devDependencies，升级两处同步
- [ ] 测试从 `vite-plus/test` 导入
- [ ] 忽略的 catch / mock 参数用 `_` 前缀（根 `vite.config.ts` 已覆盖两个插件包）

### G. 改完跑

```sh
pnpm --filter bailian-memo-dsh run build
pnpm --filter bailian-kb-dsh run build
npx vp test packages/bailian-memo-dsh
npx vp test packages/bailian-kb-dsh
```

手动集成（改了 bundle / web / 工具 schema 时必做）：

```sh
dsh plugin --profile dev add <本仓库>/packages/bailian-memo-dsh
dsh --profile dev --dump-config
```

## 发布

入口：Actions → **Publish** → `package=bailian-kb-dsh|bailian-memo-dsh` + `mode=stable|channel`。

共享脚本：`tools/release/publish-dsh-plugin.mjs`（`publish-kb-dsh.mjs` / `publish-memo-dsh.mjs` 为薄包装）。

|           | stable                               | channel                                         |
| --------- | ------------------------------------ | ----------------------------------------------- |
| 版本      | `package.json` 当前值（先手动 bump） | 临时 `0.0.0-beta-<sha>-<stamp>`，`finally` 还原 |
| npm tag   | `latest`                             | 传入的 `channel`                                |
| preflight | 工作区干净 + `main`                  | 无                                              |
| git tag   | `<package>-v<version>`               | 不打 tag                                        |
| 审批      | `environment: production`            | 无                                              |

本地 dry-run：

```sh
node tools/release/publish-dsh-plugin.mjs --package bailian-memo-dsh --dry-run
node tools/release/publish-kb-dsh.mjs --dry-run
```

### 首发前的 npm 侧前置（仓外，一次性）

1. 占住包名（OIDC Trusted Publishing 无法给不存在的包首发）
2. npm 包设置绑 Trusted Publisher：仓库 `modelstudioai/cli`、workflow `publish.yml`

### memo 发布硬门槛

见 [docs/memo-dsh/2026-10-08-bailian-memo-dsh-design.md](../memo-dsh/2026-10-08-bailian-memo-dsh-design.md) 第 7 节：Memory GA、画像值精确删除 live 验证、dsh 0.2.1 实机安装。未通过前不要 stable。

## 相关文档

- memo 设计：[docs/memo-dsh/](../memo-dsh/)
- kb 设计 / 运行时：[docs/kb-dsh/](../kb-dsh/)
- 用户面：各包 `README.md` / `README.zh.md`
