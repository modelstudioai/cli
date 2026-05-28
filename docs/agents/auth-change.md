# 鉴权扩展

## 触发条件

- 增加新的鉴权方式(OAuth、SSO、控制台回调登录)
- 增加新的 token 来源(env / config / flag / 文件)
- 调整凭证解析优先级
- 改 `bl auth login` 流程

## 鉴权链路

```
flag 优先 ─→ config 文件 ─→ env var
   │             │            │
   └──── resolveCredential() (core) ───┐
                                         │
                                         ▼
                       cli/utils/ensure-key.ts (启动时拦)
                       命令注入 Authorization 头
```

凭证类型(`AuthMethod`):

- `api-key` — DashScope SK(`sk-...`),走 Bearer 头
- `access-token` — 控制台 OAuth 回调拿到的临时 token,走 Bearer + 不同 endpoint
- `ak/sk` — Alibaba Cloud 标准 AK/SK,走 ROA 签名(只用于知识库)

### 双凭证并存（API Key + Console）

`~/.bailian/config.json` 可同时保存 `api_key` 与 `access_token`。**登录任一种方式不得删除另一种**（`bl auth login --api-key` / `--console` 只更新对应字段）。

解析分工:

- `resolveCredential()` — DashScope API 命令（`text chat`、`file upload` 等）；config 里两者都有时 **优先 `api_key`**
- `resolveConsoleGatewayCredential()` — 控制台网关（`app list`、`usage free`、`console call`）；**只用** env/file 的 `access_token`，忽略 `api_key`

必改调用点: 凡 `callConsoleGateway` 必须用 `resolveConsoleGatewayCredential`，不能误用 `resolveCredential`（否则 config 仅有 api_key 时会拿 sk- 打网关）。

`bl auth logout --console` 只清 `access_token`；全量 `bl auth logout` 清两者。

## 必查清单

### A. core 层(类型 + 解析)

- [ ] `packages/core/src/auth/types.ts`:
  - 新增 `AuthMethod` 字面量
  - 新增 `ResolvedCredential` 字段(如 token 类型 / 过期时间)
- [ ] `packages/core/src/auth/resolver.ts`:
  - `resolveCredential()` 增加新分支
  - 控制台网关命令用 `resolveConsoleGatewayCredential()`（与 DashScope 解析分离）
  - 优先级注释保持清晰(数字标号)
- [ ] `packages/core/src/auth/credentials.ts`:
  - 如果新方式需要持久化,加 `save*` / `load*` / `clear*`
- [ ] `packages/core/src/config/schema.ts`:
  - `Config` 接口加新字段(如 `fileAccessToken`、`accessTokenEnv`)
  - `ConfigFile` 接口加对应 disk 字段(snake_case)
- [ ] `packages/core/src/config/loader.ts`:
  - `loadConfig()` 把 env / 文件读到 Config 上

### B. core 客户端

- [ ] `packages/core/src/client/http.ts`:
  - 不同 `credential.method` 走不同分支(参考已有 `access-token` 分支走 console gateway)
  - Authorization 头注入正确

### C. cli 层

- [ ] `packages/cli/src/utils/ensure-key.ts`:
  - 启动时检查新凭证方式是否已配置,缺的话提示
  - 如果是交互式 setup(类似 `bl auth login --console`),增加新分支
- [ ] `packages/cli/src/commands/auth/login.ts`:
  - 新增 `--xxx` flag 触发新登录流程
  - 持久化到 config(调用 core 的 save 函数)
- [ ] `packages/cli/src/commands/auth/status.ts`:
  - 分别显示 `api_key` / `access_token` 是否已配置，以及 DashScope vs 控制台网关各自生效的 credential
- [ ] `packages/cli/src/output/status-bar.ts`:
  - 顶部状态条显示新凭证 method

### D. main 启动逻辑

- [ ] `packages/cli/src/main.ts:NO_AUTH_SETUP` 列表:
  - 如果新增的命令"自己管鉴权或不需要鉴权",加进去绕开 ensureApiKey 拦截
  - 当前清单以 `main.ts:NO_AUTH_SETUP` 为准

### E. 错误文案

- [ ] core 的 `BailianError` 鉴权失败 hint **保持通用**(不写 cli 命令名,见 [error-hint-change.md](error-hint-change.md))
- [ ] cli 的 `enhanceHint` (error-handler.ts) 按 `ExitCode.AUTH` 注入新方式的 cli 命令引导

### F. 用户面文档

- [ ] `README.md` / `README_CN.md` "Authentication" 段落

### G. 测试

- [ ] `packages/cli/tests/e2e/auth.e2e.test.ts` 增加新方式的 happy / failure 路径
- [ ] mask token 的输出格式不变(避免泄漏)

## 完成后自查

```sh
# 各种凭证组合
unset DASHSCOPE_API_KEY DASHSCOPE_ACCESS_TOKEN
HOME=/tmp/empty node packages/cli/src/main.ts auth status

# flag 注入
node packages/cli/src/main.ts auth status --api-key sk-xxx

# env 注入
DASHSCOPE_ACCESS_TOKEN=xxx node packages/cli/src/main.ts auth status
```

## 常见漏点

- ✗ 加了新 token 来源但忘了改 `resolveCredential` 优先级,实际不生效
- ✗ `Config` 加字段但 `loadConfig` 没读 → 字段永远 undefined
- ✗ `bl auth login` 写成功但 `bl auth status` 不识别(两边走的 storage path 不一致)
- ✗ token mask 显示完整 token,日志泄漏
