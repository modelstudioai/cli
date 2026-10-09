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

| 包                 | 职责                                       | 目标 dsh                                  | 设计文档                       |
| ------------------ | ------------------------------------------ | ----------------------------------------- | ------------------------------ |
| `bailian-kb-dsh`   | 知识库 `kb_search` / `kb_chat` + skill     | **0.2.1** Volatile Config + SettingsForms | [docs/kb-dsh/](../kb-dsh/)     |
| `bailian-memo-dsh` | 个人记忆自动召回 / 静默筛选 / 工具与设置页 | **0.2.1** Volatile Config + SettingsForms | [docs/memo-dsh/](../memo-dsh/) |

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

|               | `bailian-memo-dsh` / `bailian-kb-dsh`           |
| ------------- | ----------------------------------------------- |
| Config        | `Volatile` / `.volatile()`                      |
| Client        | `SettingsFormModel` + `configForms.whileServed` |
| Host 辅助路由 | `webServer` + `connection.requestRejection`     |

**新插件禁止**复制已删除的 SettingsProvider / `/settings` bridge / `credentials/updated`。API Key 放凭据域，页面字段放插件 Volatile Config。

### 配置归属与迁移

- 两插件分别使用 dsh credentials 的 `BAILIAN_KB_API_KEY` / `BAILIAN_MEMO_API_KEY`，独立读写，运行时不读取通用 `DASHSCOPE_API_KEY`；Workspace、默认服务、行为设置只放各自的 dsh Volatile Config。
- `endpointHost` 不再是插件配置，使用固定北京端点。
- bl `~/.bailian/config.json` 只作为启动默认值来源，按根级 `active_config` 指向的命名 block 读取，不混用默认 Profile 的字段。
- 首次启动将旧 Workspace / 默认服务迁入 dsh settings；`configInitialized` 防止用户清空后再次导入。缺失的插件专属 Key 仍允许在启动时补入。
- memo 个人文件只负责身份、授权状态和 Workspace 绑定；请求 Workspace 取 dsh，绑定不一致必须阻止请求，不能静默修改绑定。
- kb 管理操作走 `kb_manage`，宿主用独立临时配置目录执行 bl，传递当前 dsh Key / Workspace，拒绝连接覆盖参数（含 camelCase 形式），保留 CLI 确认机制。
- 手动 Key / Workspace 编辑使用独立连接草稿和受鉴权保护的保存接口；Key 留空保留、旧值不回显，先验证组合再保存。密钥不进入 SettingsForm 业务配置，错误消息不能包含请求中的密钥；页面明确两个插件的 Key 和 Workspace 相互独立。
- 改配置时测试启动等待、迁移优先级、清空后重启、运行时配置修改、身份绑定和管理进程隔离。

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

### Memo 画像规则

- `extractProfile` 默认 false，保存在 memo 的 dsh settings；显式记忆与自动整理共用此开关，模型参数不能越过它。
- 不创建画像模板；用户所选 `profileSchemaId` 保存在 memo dsh settings；每次实际提交画像抽取或读取画像前查询已有规则，普通 search 无需查询。
- 列表/详情实测都没有默认标记和创建时间；按用户约定，未选择时默认完整列表最后一项。UI 在开启抽取时显示选择框，保存时持久化所选 ID；已有 ID 不可用必须提示重选。不能将列表顺序解释为创建时间。
- 抽取关闭不删除或停止召回已有画像；画像读取失败不阻断普通记忆召回。画像删除全过程必须使用同一个已解析 ID。
- 个人配置 v3 去掉旧画像引用，保留身份/授权/暂停/绑定；回归测试必须隔离 homedir 或显式传入临时路径，禁止真实个人配置读写。
