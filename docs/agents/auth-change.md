# 鉴权扩展

## 触发条件

- 增加新的鉴权域或 token 来源(env / config / flag / 文件)
- 调整 API Key / Console token 解析优先级
- 改 `bl auth login` / `auth status` / `auth logout` 流程
- 改 runtime 对 command `auth` 的 gating 或 credential 注入

## 鉴权链路

```
argv flags ─┐
env var   ──┼─ buildSources(flags) ─┐
config    ──┘                       │
                                    ├─ buildSettings(sources) → ctx.settings
                                    │
                                    ├─ resolveApiKey(sources)     → model-domain Client
                                    ├─ resolveConsole(sources)    → console-domain Client
                                    └─ resolveOpenApi(sources)    → OpenAPI Client

defineCommand({ auth }) → runtime/authStage → ctx.client → command.run(ctx)
```

当前 command 鉴权域(`AuthRequirement`):

- `apiKey` — DashScope / OpenAI-compatible 模型域,用 API key 与 model base URL
- `console` — Bailian Console Gateway,用 console access token + region/site/switchAgent/workspace
- `openapi` — 阿里云 OpenAPI 签名域,用 AccessKey ID/Secret 调用 Token Plan 等 OpenAPI
- `none` — 本地命令、登录/配置类命令、无需 credential 的命令

### 多凭证并存

`~/.bailian/config.json` 可同时保存 `api_key`、`access_token` 与 `access_key_*`。登录任一种方式不得删除另一种:

- `bl auth login --api-key ...` 只更新 `api_key` / `base_url`
- `bl auth login --console` 只更新 `access_token` 以及回调携带的 console 作用域字段
- `bl auth login --open-api ...` 只更新 `access_key_id` / `access_key_secret`
- `bl auth logout --console` 只清 `access_token`
- `bl auth logout --open-api` 只清 `access_key_id` / `access_key_secret` / `security_token`
- `bl auth logout` 清 `api_key` + `base_url` + `access_token` + `access_key_*`

解析分工:

- `resolveApiKey()` — `auth: "apiKey"` 命令;优先级 `--api-key` > `DASHSCOPE_API_KEY` > config `api_key`
- `resolveModelBaseUrl()` — model base URL;优先级 `--base-url` > `DASHSCOPE_BASE_URL` > config `base_url` > `REGIONS.cn`，返回前统一去除 query、fragment、尾斜杠和已知 SDK/API Base 后缀，同时保留自定义网关前缀
- `--config` 只选择 config 文件 block，不提升该 block 的字段优先级；内置套餐 Profile（当前为 `token-plan`）的预设仅在登录时物化写入，运行时继续走统一的 flag > env > selected config file > 默认值
- 显式 `auth login --config <name>` 在凭证验证并落盘成功后自动激活目标 Profile；未传
  `--config` 时继续写当前激活项，失败和 dry-run 不切换
- `resolveConsole()` — `auth: "console"` 命令;当前 token 来自 config `access_token`,region/site/switchAgent 来自 flag > config > 默认
- `resolveOpenApi()` — `auth: "openapi"` 命令;优先级 `--access-key-id/--access-key-secret` > `ALIBABA_CLOUD_ACCESS_KEY_ID/ALIBABA_CLOUD_ACCESS_KEY_SECRET` > config `access_key_*`。兼容读取旧字段 `openapi_access_key_*`,新写入只写短字段
- `describeAuthState()` — `auth status` / banner / telemetry 使用的只读快照

命令不要直接解析 token、env 或 config。业务请求统一走 `ctx.client`;登录/配置命令通过 `ctx.authStore` / `ctx.configStore` 的窄接口操作落盘。

### 例外:agent 命令的 SDK 凭证桥接

`bl agent *` 命令声明 `auth: "none"`,凭证由 `@openagentpack/sdk` 自主从 env 解析(agents.yaml 的 `${DASHSCOPE_API_KEY}` / `${BAILIAN_WORKSPACE_ID}` 插值)。为让 bl 登录态复用,`packages/commands/src/commands/agent/_engine/credentials.ts` 的 `bridgeBailianCredentials()` 会**直接 `readConfigFile()`**,把 config 的 `api_key` / `workspace_id` 作为最低优先级兜底填入对应 env,仅填空值,不覆盖已有。这是唯一允许命令层直接读 config 的场景(SDK 只认 env,不走 `ctx.client`);优先级链:`~/.agents/config.json` > shell env > `.env` > `~/.bailian/config.json`。

## 必查清单

### A. core 层(类型 + 解析)

- [ ] `packages/core/src/types/command.ts`:
  - 如新增鉴权域,扩展 `AuthRequirement`
  - 更新 `credentialFlagDefs()` 暴露该域可见的 flag
  - 必要时新增 `*_AUTH_FLAGS`
- [ ] `packages/core/src/auth/types.ts`:
  - 新增 credential 类型 / source / scope 字段
- [ ] `packages/core/src/auth/resolver.ts`:
  - 新增或调整 resolver,保持优先级注释清晰
  - 新增/调整 resolver hint 时保持产品无关,不要新增 `bl` / `kscli` 硬编码;当前遗留的 `bl auth login` hint 如被触碰,迁到 runtime `enhanceHint`
- [ ] `packages/core/src/auth/store.ts`:
  - 如果新方式需要持久化,扩展 `AuthStore` / `AuthPersistPatch`
- [ ] `packages/core/src/config/schema.ts`:
  - `ConfigFile` 加 disk 字段(snake_case)
  - `Settings` 加运行时字段(如果命令需要读取)
- [ ] `packages/core/src/config/loader.ts`:
  - `buildSources()` / `buildSettings()` 把 flag/env/file 读到正确层

### B. runtime 层

- [ ] `packages/runtime/src/create-cli.ts`:
  - parse flags 时纳入新的全局/凭证域 flag
  - `globalFlags` 与 `ownFlags` 分流正确
- [ ] `packages/runtime/src/middleware.ts:authStage`:
  - 根据 `command.auth` 解析 credential 并注入 `ctx.client`
  - `settings.dryRun` 下是否允许缺 credential 的策略明确
- [ ] `packages/runtime/src/error-handler.ts`:
  - AUTH hint 增强使用 `binName`,不要硬编码 `bl`
  - URL 从 `packages/runtime/src/urls.ts` import

### C. command 层

- [ ] `packages/commands/src/commands/auth/login.ts`:
  - 新增/调整登录 flag 与流程
  - 持久化只走 `ctx.authStore.login(...)`
- [ ] `packages/commands/src/commands/auth/status.ts`:
  - 分别显示 model / console / openapi 鉴权状态,并 mask token
- [ ] `packages/commands/src/commands/auth/logout.ts`:
  - 清理范围与双凭证并存规则一致
- [ ] 新的业务命令设置正确 `auth`:
  - 模型域请求 → `auth: "apiKey"`
  - Console Gateway → `auth: "console"`
  - 阿里云 OpenAPI 请求 → `auth: "openapi"`
  - 本地/登录/配置 → `auth: "none"`

### D. 用户面文档

- [ ] `README.md` / `README.zh.md` "Authentication" 段落
- [ ] `skills/bailian-cli/reference/` 通过 `pnpm run sync:skill-assets` 重建

### E. 测试

- [ ] `packages/cli/tests/e2e/auth.e2e.test.ts` 增加新方式的 happy / failure 路径
- [ ] mask token 的输出格式不变(避免泄漏)
- [ ] 如调整 resolver 优先级,补 core/runtime 单测覆盖 flag > env > file

## 完成后自查

```sh
# 各种凭证组合
unset DASHSCOPE_API_KEY ALIBABA_CLOUD_ACCESS_KEY_ID ALIBABA_CLOUD_ACCESS_KEY_SECRET
HOME=/tmp/empty pnpm -F bailian-cli exec tsx src/main.ts auth status

# flag 注入(凭证域 flag 只在对应业务命令可见,auth status 不接收)
pnpm -F bailian-cli exec tsx src/main.ts text chat --message hi --api-key sk-xxx --dry-run
pnpm -F bailian-cli exec tsx src/main.ts token-plan list-seats --access-key-id ak-xxx --access-key-secret sec-xxx --dry-run
pnpm -F bailian-cli exec tsx src/main.ts auth login --open-api --access-key-id ak-xxx --access-key-secret sec-xxx --dry-run

# env 注入
DASHSCOPE_API_KEY=sk-xxx pnpm -F bailian-cli exec tsx src/main.ts auth status
ALIBABA_CLOUD_ACCESS_KEY_ID=ak-xxx ALIBABA_CLOUD_ACCESS_KEY_SECRET=sec-xxx pnpm -F bailian-cli exec tsx src/main.ts auth status
```

Console 登录/网关相关改动:

```sh
pnpm -F bailian-cli exec tsx src/main.ts auth login --console
pnpm -F bailian-cli exec tsx src/main.ts usage stats --dry-run --output json
```

## 常见漏点

- ✗ 加了新 token 来源但忘了改 resolver 优先级,实际不生效
- ✗ `ConfigFile` / `Settings` 加字段但 `parseConfigFile` 或 `buildSettings` 没读
- ✗ `auth login` 写成功但 `auth status` 不识别(两边走的 storage path 不一致)
- ✗ token mask 显示完整 token,日志泄漏
- ✗ `auth: "console"` 命令误用 `apiKey` 域,config 只有 API key 时会把 `sk-...` 发到网关
- ✗ 新增 core resolver hint 时写死产品命令,导致 `kscli` 等入口提示错误
