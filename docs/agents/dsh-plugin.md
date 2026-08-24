# dsh 插件维护（packages/bailian-kb-dsh）

## 触发条件

- 改 `packages/bailian-kb-dsh` 的工具（`kb_search` / `kb_chat`）、服务缓存、settings / 凭据解析
- 改 web 半（Settings 配置页 React 组件、CSS Modules）
- 升级 `@deepseek-ai/dsh-*` peer 依赖
- 改插件包名、bundle 声明或产物布局
- 发布插件到 npm

## 这个包和其他 packages 不一样的地方

它是**下游宿主适配层**：依赖方向朝外（消费 `bl` CLI 与百炼 API，装进 DeepSeek Harness 运行），不是 `core → runtime → commands → 产品入口` 这条链上的一环。由此带来四条与 `packages/*` 通行约定的**故意偏离**：

| 项       | 本包                                   | 其他包                               | 原因                                                                                             |
| -------- | -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 版本     | 独立 `0.1.x`                           | core/runtime/commands/cli/kscli 锁步 | 跟随 dsh 的 rc 节奏，与 `bl` 发版无关；不在 `tools/release/lib/packages.mjs` 白名单里            |
| 构建     | `tsc` + `tsdown`                       | `vp pack`                            | 浏览器半需要 `__ModuleLoader__` banner/footer 与 lightningcss CSS Modules 内联，`vp pack` 产不出 |
| 发布     | `.github/workflows/publish-kb-dsh.yml` | `publish.yml`                        | 不在 `bailian-cli` 依赖闭包内，走独立通道                                                        |
| tsconfig | 三个                                   | 一个                                 | 见下                                                                                             |

## tsconfig 三件套（改动前先读）

| 文件                  | 谁在用                       | 作用                                                                                                            |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`       | oxlint / `vp check` 自动发现 | **纯类型检查**，覆盖 `src` + `tests` 两半：`noEmit` + `jsx: react-jsx` + DOM lib + `allowImportingTsExtensions` |
| `tsconfig.build.json` | `build` script（`tsc -b`）   | **产出** node 半到 `dist/`，`exclude: src/web`                                                                  |
| `tsconfig.web.json`   | `build` / `typecheck` script | web 半的**隔离检查**：`types: []`，确保浏览器代码不误用 node 全局                                               |

- 不要把 `tsconfig.json` 改成产出配置：`allowImportingTsExtensions` 与 emit 互斥，一改 oxlint 就再也检查不了 `.tsx`（报 TS17004 `--jsx` not set）。
- web 半的隔离检查挂在 `build` script 里，因为 CI 只跑 `build` / 根 `check` / 根 `test`，`typecheck` script 没有调用点。

## 必查清单

### A. 包身份（改包名时三处必须一起改）

- [ ] `package.json` 的 `name`
- [ ] `cordis.patch.yml` 的 `insert[].name`（profile 层栈按这个名字解析插件）
- [ ] `tsdown.config.ts` 的 `PLUGIN_ID`（进 `window.__ModuleLoader__.load({ id })` 与 `<style data-plugin>`）

漏任何一处都不会在构建期报错，只会在 dsh 里运行时崩。验证：`grep -rn "<新包名>" package.json cordis.patch.yml tsdown.config.ts` 三处齐全，且 `dist/web/client.js` 首行的 `id` 是新名。

### B. 产物布局

- [ ] 产物落 `dist/`（node 半）与 `dist/web/client.js`（浏览器半）；根 `.gitignore` 忽略 `dist` 与 `*.tsbuildinfo`，**不要**改回 `lib/`（那会把产物提交进库）
- [ ] `package.json` 的 `main` / `types` / `exports["."]` / `exports["./client"]` / `files` 与实际产物一致
- [ ] tsdown 的 `clean` 保持 `false`：默认 clean 会清掉 `tsc` 刚产出的 node 半

### C. web 半的模块边界

- [ ] 只 import tsdown `CLIENT_EXTERNALS` 名单里的 `@deepseek-ai/*`（宿主 frozen module table 只能应答这些）——构建期由 `dsh-client-bundle-purity` 插件把关
- [ ] 不 import `node:*` 与本仓 CLI 包（`bailian-cli-core` 等）——根 `vite.config.ts` 的 `no-restricted-imports` override 在 lint 期把关
- [ ] 跨插件协作走 cordis service，不做 value import（type-only import 会被擦除，不受限制）

### D. skill 资产

- [ ] `skills/bailian-kb/` 留在**包内**，不要挪到仓库顶层 `skills/`：`.github/workflows/publish-skills.yml` 把 `skills/**` 全量对账到 OSS registry，`bl skill init` 会装给所有 `bl` 用户，而这个 skill 讲的 `kb_search` / `kb_chat` 原生工具只在 dsh 里存在
- [ ] `SKILL.md` 手写（承载"检索走原生工具、管理走 `bl`"的路由决策）；`reference/` 由 `tools/generate-reference.ts` 生成，不要手改

### E. 依赖与测试约定

- [ ] `@deepseek-ai/dsh-*` 同时列在 `peerDependencies`（运行时由 dsh 安装闭包提供）和 `devDependencies`（本地类型检查）——升级时两处同步
- [ ] 测试从 `vite-plus/test` 导入（仓库统一约定），不要用 `vitest`
- [ ] 忽略的 catch 绑定与 mock 签名参数用 `_` 前缀（根 `vite.config.ts` 已为本包放开 `no-unused-vars` 的对应 pattern）

### F. 改完跑

```sh
pnpm --filter bailian-kb-dsh run build   # tsc 出 dist/ + web 半隔离检查 + tsdown 出 client.js
pnpm run check                           # 根 lint + 格式 + 类型
npx vp test packages/bailian-kb-dsh
```

手动集成（改了 bundle 声明 / web 半 / 工具 schema 时必做）：

```sh
dsh plugin --profile dev add <本仓库>/packages/bailian-kb-dsh
dsh --profile dev --dump-config          # 应能看到 tool-bailian-kb row
```

## 相关文档

- 设计与实现计划归档：[docs/kb-dsh/](../kb-dsh/)
- 包内实现说明：[packages/bailian-kb-dsh/README.md](../../packages/bailian-kb-dsh/README.md)
- skill 文案与路由约定：[skill-change.md](skill-change.md)
