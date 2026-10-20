# dsh 插件维护（bailian-*-dsh）

## 触发条件

- 改 `packages/bailian-kb-dsh` 或 `packages/bailian-memo-dsh` 的工具、Host/Client、settings、凭据解析
- 改 web 半（设置页 React 组件、CSS Modules、locale）
- 升级 `@deepseek-ai/dsh-*` peer 依赖
- 改插件包名、bundle 声明或产物布局
- 发布任一 dsh 插件到 npm

## 这个家族和其他 packages 不一样的地方

它们是**下游宿主适配层**：依赖方向朝外（消费百炼 API / 本地身份文件，装进 DeepSeek Harness 运行），不是 `core → runtime → commands → 产品入口` 这条链上的一环。

| 项       | dsh 插件包                 | 其他包    | 原因                                                                           |
| -------- | -------------------------- | --------- | ------------------------------------------------------------------------------ |
| 版本     | 与 bailian-cli 相同        | 七包锁步  | 同一次发布使用相同版本                                                         |
| 构建     | `tsc` + `tsdown`           | `vp pack` | 浏览器半需要 `__ModuleLoader__` banner/footer 与 lightningcss CSS Modules 内联 |
| 发布     | publish-stable/channel.mjs | 同左      | 共用校验、npm 发布与 git tag                                                   |
| tsconfig | 三个                       | 一个      | 见下                                                                           |

当前包：

| 包                 | 职责                                       | 目标 dsh                                  | 用户文档                                                                 |
| ------------------ | ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| `bailian-kb-dsh`   | 知识库 `kb_search` / `kb_chat` + skill     | **0.2.1** Volatile Config + SettingsForms | [README.zh.md](../../packages/bailian-kb-dsh/README.zh.md)               |
| `bailian-memo-dsh` | 个人记忆自动召回 / 静默筛选 / 工具与设置页 | **0.2.1** Volatile Config + SettingsForms | [README.zh.md](../../packages/bailian-memo-dsh/README.zh.md)             |

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
- [ ] 维护约定留在本文；不再另建 `docs/kb-dsh`、`docs/memo-dsh` 一类内部设计目录
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

入口：Actions → **Publish** → `mode=stable|channel`。两个插件与 CLI、kscli 共用 `publish-stable.mjs` / `publish-channel.mjs`，不提供独立发布入口。

- 七个包的 package.json 版本必须一致，升版时一起修改；统一发布前检查，任何版本不一致都会失败。
- channel 使用同一次生成的临时 beta 版本，完成或失败后统一还原。
- 插件保留 `tsc` / `tsdown` 构建，由 `check.mjs` 构建并 pack / 扫描，随后进入统一 npm 发布循环。
- stable 使用统一 `v<version>` tag，不再创建插件专属 tag；审批及发布顺序见 [publish.md](publish.md)。

本地 dry-run：

```sh
node tools/release/publish-channel.mjs --channel test --dry-run
```

### 首发前的 npm 侧前置（仓外，一次性）

1. 占住包名（OIDC Trusted Publishing 无法给不存在的包首发）
2. npm 包设置绑 Trusted Publisher：仓库 `modelstudioai/cli`、workflow `publish.yml`

### memo 发布验收范围

2.5.0按维护者确认与CLI整体发布；本轮明确不包含dsh/Skill实际宿主验收，不将其列为本轮发布前置，也不能将未执行的实机验证写成通过。构建、类型检查、单测及发布包检查仍由统一GitHub流程执行。

历史首发清单中的Memory服务可用性、画像值精确删除live和宿主实机安装不等同于CI通过。发布说明不得据此承诺服务GA、画像删除实链路或宿主实机已验收；未有证据的能力保持未验证状态。后续版本按实际约定更新验收范围。

## 相关文档

- 用户面：各包 `README.md` / `README.zh.md`

### Memo 画像规则

- `extractProfile` 默认 false，保存在 memo 的 dsh settings；显式记忆与自动整理共用此开关，模型参数不能越过它。
- 不创建画像模板；用户所选 `profileSchemaId` 保存在 memo dsh settings；每次实际提交画像抽取或读取画像前查询已有规则，普通 search 无需查询。
- 列表/详情实测都没有默认标记和创建时间；按用户约定，未选择时默认完整列表最后一项。UI 在开启抽取时显示选择框，保存时持久化所选 ID；已有 ID 不可用必须提示重选。不能将列表顺序解释为创建时间。
- 抽取关闭不删除或停止召回已有画像；画像读取失败不阻断普通记忆召回。画像删除全过程必须使用同一个已解析 ID。
- 个人配置 v3 保留 Skill 使用的可选画像引用及身份/授权/暂停/绑定；插件选择仍保存在 dsh settings，不能删除共享文件中其他宿主需要的字段。回归测试必须隔离 homedir 或显式传入临时路径，禁止真实个人配置读写。
