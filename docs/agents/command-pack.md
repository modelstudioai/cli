# Command Pack 维护

## 触发条件

- 新增或移除 Command Pack 包
- 调整包白名单、允许的命令前缀或协议字段
- 修改 `plugin install/link/list/remove`
- 修改 Command Pack 加载、隔离、兼容性或独立安装目录

## 分层边界

- `packages/core/src/types/command-pack.ts`：稳定的协议元数据和导出类型，不知道具体产品或白名单。
- `packages/runtime/src/command-packs/`：所有 CLI 共用的加载、校验、API 适配、产品隔离安装目录和 manager 实现。
- `packages/runtime/src/create-cli.ts`：始终接收静态 command map，按 `CliOptions.commandPacks` 统一合并 pack，并把已绑定产品 identity/policy 的 manager 注入 `ctx.commandPacks`。
- `packages/commands/src/commands/plugin/`：普通共享管理命令，只依赖 `ctx.commandPacks`，不 import 任何产品 policy。
- `packages/cli/src/command-pack-policy.ts`：`bl` 支持的包、命令前缀和凭据授权。
- `kscli` 当前不传 `commandPacks`，使用 runtime 的默认空 policy。
- 当前只有 `bl` 从 `bailian-cli-commands` 导入并登记 `plugin *`；使用默认空 policy 的产品不提前暴露管理命令。

不要把产品白名单写进 core/runtime，也不要通过扫描全局 `node_modules` 自动发现包。通用机制放 runtime，产品差异只由 policy 表达。

## 安全与兼容性清单

- [ ] 包名必须精确命中当前产品 policy 的 `supported`，命令路径必须位于该包允许的前缀。
- [ ] 正式安装只接受包名加 version/tag；本地目录只走 `plugin link`。
- [ ] npm 使用独立安装目录和 `--ignore-scripts`，不污染 CLI 自身依赖树。
- [ ] npm 子进程只继承明确允许的 registry/config/cache/proxy/TLS 配置，不通配透传 pnpm 注入的 `npm_config_*`。
- [ ] 安装目录按 `identity.npmPackage` 隔离，不能让一个产品安装/删除另一个产品的 pack。
- [ ] 安装目录只隔离依赖位置，不隔离执行权限；Command Pack 必须视为 CLI 进程内的完全可信代码。
- [ ] 入口 realpath 不能逃逸包根目录。
- [ ] 加载前检查 `type`、`apiVersion`、`minCliVersion`；报告状态只使用 `loaded/failed`，具体原因写入 `error`。
- [ ] Command Pack 不能覆盖内置命令、其他 pack 命令或重声明保留 flag。
- [ ] 普通网络请求走 `ctx.client`；基础 Context 提供 `identity/settings/flags/client/output/errors`，不提供原始凭据。
- [ ] `ctx.credentials.apiKey()` 仅限 policy 显式声明 `credentialAccess: ["apiKey"]`，且命令自身为 `auth: "apiKey"`。
- [ ] 不向 Command Pack 暴露原始 Console Token、OpenAPI AK/SK、`authStore` 或 `configStore`。
- [ ] 不向 Command Pack 暴露宿主的 `commandPacks` manager，避免 pack 安装或删除其他 pack。
- [ ] 单包失败必须 fail-open：保留内置命令和其他合法 pack。
- [ ] 破坏协议前优先在适配层兼容；确实无法兼容时才提升 `apiVersion`。

## 测试与文档

- [ ] `packages/runtime/tests/command-packs.test.ts` 覆盖产品 policy、安装目录隔离、协议版本、前缀和导出契约。
- [ ] `packages/cli/tests/e2e/command-packs.e2e.test.ts` 覆盖 help、link、执行、output/errors、凭据授权、list、remove。
- [ ] `packages/kscli/tests/e2e/command-packs.e2e.test.ts` 覆盖统一 host 和 runtime 默认空 policy 下不暴露管理命令。
- [ ] fixture 的包名必须在测试白名单内，且构建入口不依赖工作区运行时解析。
- [ ] 更新生成的 `skills/bailian-cli/reference/plugin.md`（或归属表指定的 skill reference）；公开 `README.md` / `README.zh.md` 等正式对外发布时再补。

验证：

```sh
vp test packages/runtime/tests/command-packs.test.ts
vp test packages/cli/tests/e2e/command-packs.e2e.test.ts
vp test packages/kscli/tests/e2e/command-packs.e2e.test.ts
pnpm run sync:skill-assets
vp check
```
