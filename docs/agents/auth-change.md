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
- `resolveModelBaseUrl()` — model base URL;优先级 `--base-url` > `DASHSCOPE_BASE_URL` > config `base_url` > `REGIONS.cn`，返回前统一归一化为 URL origin（仅保留协议、host 和显式端口，去除 path、query、fragment）
- `--config` 只选择 config 文件 block，不提升该 block 的字段优先级；内置套餐 Profile（当前为 `token-plan`）的预设仅在登录时物化写入，运行时继续走统一的 flag > env > selected config file > 默认值
- 显式 `auth login --config <name>` 在凭证验证并落盘成功后自动激活目标 Profile；未传
  `--config` 时继续写当前激活项，失败和 dry-run 不切换
- `resolveConsole()` — `auth: "console"` 命令;当前 token 来自 config `access_token`,region/site/switchAgent 来自 flag > config > 默认
- `resolveOpenApi()` — `auth: "openapi"` 命令;优先级 `--access-key-id/--access-key-secret` > `ALIBABA_CLOUD_ACCESS_KEY_ID/ALIBABA_CLOUD_ACCESS_KEY_SECRET` > config `access_key_*`。兼容读取旧字段 `openapi_access_key_*`,新写入只写短字段
- `describeAuthState()` — `auth status` / banner / telemetry 使用的只读快照

命令不要直接解析 token、env 或 config。业务请求统一走 `ctx.client`;登录/配置命令通过 `ctx.authStore` / `ctx.configStore` 的窄接口操作落盘。

### 例外:agent 命令的分层鉴权与 SDK 凭证内存注入

`bl managed-agent *` 按调用链分两层，不再全命令硬门禁:

- **离线命令** — `init`、`validate`、`state list/show/rm`:`auth: "none"`，只读写本地文件，无需登录;引擎侧传 `credentials: "none"` 跳过凭证断言（`plan --no-refresh` 同样传 `"none"`）
- **provider-aware 命令** — `plan`(默认)、`apply`、`destroy`、`state import`、`skill-list`、全部 `session *`:仍声明 `auth: "apiKey"` 但加 `authOptional: true` —— authStage 照常经 `resolveApiKey(sources)` 解析 bailian 凭证(flag > env > active profile config)并注入 `ctx.client`，但缺失不在 authStage 抛;真正的门禁在引擎层 `assertProviderCredentials`，只校验本次运行涉及的 provider（`CredentialScope`:`--provider` / state 地址里的 provider / 配置默认 provider 链）。配了四个 provider 只跑 claude 时，缺 bailian key 不阻塞。

凭证不以真实值写入 `process.env`，而是经 `packages/commands/src/commands/managed-agent/_engine/` 的**内存注入管道**(`resolveAgentProjectConfig`)注入 SDK，管道五步:

1. `prepareProviderEnv()` — 先 `bootstrapRuntimeCredentialsSync()`(SDK 把 `.env` / `~/.agents/config.json` 灌进 env，服务 claude/ark/qoder 等非 bailian provider)，再把全部凭证类 env(`CREDENTIAL_ENV_KEYS`，含别名)中仍为 undefined 的占位为 `""`，使 agents.yaml 插值不因缺变量抛错
2. `resolveProjectConfig` — 插值发生:bailian 插值拿到占位空串，claude/ark 拿到真实 env 值;随后 `normalizeInterpolatedProviderBlocks()` 把插值为空导致的 YAML `null` 归一为 `""`(避免范围外 provider 在 SDK zod 层报 "received null")
3. `injectProviderCredentials()` — 用 `ctx.client.exportApiCredential()`(lint 限定 `managed-agent/_engine/**` 可用)覆写内存 config 对象的 bailian 块:有凭证时 `api_key` 无条件覆写;`base_url`(拼 `/api/v1/agentstudio` 后缀，无凭证时用 client 默认域名补齐以满足 schema)/`workspace_id`(取 `settings.workspaceId`)仅在引用且为空时填充
4. `scrubCredentialEnv()` — 从 `process.env` 删除全部凭证变量(真实凭证此后只存于 config 对象 → provider adapter 实例内存，不驻留 env / 不被子进程继承)
5. `assertProviderCredentials(providers, required)` — 按 `CredentialScope` 算出的 `required` 范围校验:范围内 provider 的 `api_key` 为空 → CLI 权威 `AUTH` 错误 + provider 专属 hint(取代 SDK 原始插值/zod 报错);范围外 provider 允许空 key

`bl auth login` 仅管理 bailian(DashScope)凭证;claude/ark/qoder 的 key 从 env(shell / `.env` / `~/.agents/config.json`)经插值进入 config 对象，同样被清扫。禁止命令层直接 `readConfigFile` 裸读凭证;bailian 字段以 CLI 鉴权链为唯一信源。

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
