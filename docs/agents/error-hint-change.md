# 错误文案变更

## 触发条件

- 修改 `BailianError` 的 message 或 hint
- 调整 runtime 的 hint 增强逻辑(`errorHint`)
- 改 auth stage / resolver 的鉴权失败文案
- 改任何抛错位置的分类(exitCode)

> 注意:`mapApiError` **不再做错误分类**(参见下方"边界原则")。如果你想给某种 HTTP 错误码加白名单分类,请先回到本文档读完"边界原则"再说。

## 边界原则:CLI 不翻译服务端错误

**CLI 只为「自己能权威解释的错误」发出语义化信号,服务端的错误原样透传。**

| 错误来源                                             | 归类     | 处理方式                                                    |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 命令解析、缺 flag、参数校验                          | **内部** | `BailianError(USAGE)`                                       |
| 文件 I/O(ENOENT/EACCES/...)                          | **内部** | `BailianError(GENERAL)` + errno-specific hint               |
| 本地 credentials 缺失(resolver / authStage 等)       | **内部** | `BailianError(AUTH)`                                        |
| `fetch` 自身失败(DNS/TCP/TLS/proxy)                  | **内部** | `BailianError(NETWORK)` + 读 `err.cause.code` 给 errno-hint |
| polling 客户端超时                                   | **内部** | `BailianError(TIMEOUT)`                                     |
| HTTP 4xx/5xx、HTTP 200 + 业务错码、async task FAILED | **服务** | `BailianError(GENERAL)`,**message 原样透传**,不分类、不替换 |

**判断标准**:错误信息的"权威来源"在哪一侧 —— 来自服务端响应 → 服务错误,透传;来自本地(OS / Node / CLI 自己)→ 内部错误,包装。

### 反面 case(为什么这条原则是必要的)

历史上的几个错误处理 bug 都是因为越过了这条边界:

1. **`mapApiError` 白名单未覆盖 OpenAI 兼容错误码** —— `qwen3.7` 不存在时服务端返回 `invalid_request_error`,白名单只认 `ModelNotFound`,fall through 到 GENERAL,该是 USAGE 信号被丢
2. **`bl auth login` 用 try/catch 替换错误** —— key 有效但缺模型权限时,显示"API key validation failed"撒谎,误导用户去换 key
3. **`error-handler.ts` 用 message 关键词归并网络错误** —— ENOTFOUND / ECONNREFUSED / TLS 错误全归并成"Network request failed.",错误根源完全丢失

共同根因:**我们试图在没有"权威信息"的位置代理服务端做分类**。修复方案是统一退回到透传 + 让本地错误的真实诊断浮上来。

## 错误流的分层架构

```
core 抛出 BailianError(message, exitCode, hint, cause?)
  ↓ 沿调用栈冒泡
runtime/create-cli.ts: 每次调用创建 reporter，统一捕获初始化/解析/业务异常
  ↓
runtime/error-handler.ts:
  - 服务端错误(BailianError(GENERAL)) → text 直接打 message
  - 内部 AUTH/USAGE/NETWORK/TIMEOUT → 走 errorHint(AUTH 增强;另可对已知可恢复服务端错误追加 hint)
  - TypeError("fetch failed") → 读 err.cause.code 翻成 NETWORK
  - Node fs errno → 翻成 GENERAL + errno hint
  - reporter：JSON 错误、warning、debug 各占 stderr 一行，无空行；stdout 仅保留最终业务结果
  - 早期错误使用只读 CLI/env/Profile 格式来源，不在渲染时重新初始化配置
  - 其它 Error → 默认走 cause 链
  ↓
process.exit(err.exitCode)
```

## 不变量(必须遵守)

### 1. 不替换服务端错误的 message

- ❌ `try { call() } catch { throw new BailianError("xxx failed", FIXED_CODE) }`
- ✅ `try { call() } catch (err) { /* 加上下文不替换 */ throw err; }` 或直接不 catch

### 2. 不在 `mapApiError` 里加 status / apiCode 白名单分支

- ❌ 不要回退到"401 → AUTH、429 → QUOTA"那套白名单
- ✅ message 把 status / apiCode / request_id 拼进去就够,exit 统一 GENERAL
- 例外:CLI/runtime **自己**因为本地状态产生的 BailianError(resolver、authStage 等)可以用语义化 exitCode

### 3. core 的 hint 必须不含 cli 关切

- ❌ 新增/改动时不写 `bl xxx` 命令名
- ❌ 新增/改动时不写 `kscli xxx` 等产品入口命令名
- ❌ 新增/改动时不写控制台 URL 或 region
- ❌ 新增/改动时不写渠道追踪参数(`source_channel=xxx`)
- ✅ 只描述抽象做法(如 `"Set DASHSCOPE_API_KEY environment variable, or pass --api-key."`)
- 本地凭证错误用 `CredentialError.reason` 表达失败事实；resolver 的纯提示不含产品命令，runtime `errorHint` 保留原有登录指引。

### 4. runtime / 产品层可以使用入口名 + URL

- 用 `formatCommand(identity, "<path> [args]")` 生成用户操作提示；`identity.binName`
  保持产品身份，用于渠道、安装包及独立入口默认名；宿主可执行信息另行声明。不要全局替换输出或服务端文本。
- 可执行命令引用用 `buildCommandInvocation(identity, path, args)` 生成 `{ bin, path, args }`；
  `identity.commandInvocation` 显式声明宿主 executable/固定子命令，不拆分展示字符串。
  消费者使用 `spawn(bin, [...path, ...args], { shell: false })`，不隐式添加确认参数。
- 静态 CLI 元数据使用 `commandRef("<path> [args]")` 声明命令引用，由 help、introspect
  和 reference 生成器调用 `renderCommandText` 渲染；固定模板不可用于服务端文本或用户输入。
- 动态错误在构造时生成完整字符串；helper 只接收必要的格式化函数或恢复提示。
  `BailianError.message/hint/toJSON()` 不携带模板，也不要求调用方理解渲染协议。
- Console 失效恢复提示由 runtime 提供给 client/gateway，在业务包装前完成；普通包装无需传播模板或凭证域状态。
- 前缀适配只改变命令引用，不增删原有操作步骤、不重组鉴权提示、不改写周围文案。

- `packages/runtime/src/error-handler.ts` 通过本次调用的 `commandPrefix` 渲染 `bl` / `kscli` 等入口名,不要硬编码
- 产品入口 / README / E2E 可以写具体入口命令
- shared command 实现不写 `bl` / `kscli` 前缀;`usageArgs` / `exampleArgs` 只写参数片段
- URL 必须从 `packages/runtime/src/urls.ts` import,不能硬编码

## 必查清单

### A. core 改动(message / hint)

- [ ] `packages/core/src/errors/api.ts` 的 `mapApiError`:**保持透传形态**,不要加白名单分支
- [ ] `packages/core/src/auth/resolver.ts` 新增/改 throw 语句时:hint 不含 cli 关切;已有 `bl auth login` 遗留点被触碰时要收敛
- [ ] 任何 core 文件新增/改 BailianError:同上

### B. runtime 增强(`errorHint`)

- [ ] `packages/runtime/src/error-handler.ts:errorHint`:**主要为 internal AUTH 增强**(resolver / authStage 等内部位置会发 AUTH)
- [ ] **允许的有限扩展**:对已知可恢复的服务端错误,**追加**恢复 hint(保留原 message / exitCode)。当前仅 `AllocationQuota.FreeTierOnly`(及同义英文 message 短语)。message / apiCode 匹配**只用于追加**,不参与分类、归并或替换 message(勿与下方反面 case 3 的关键词归并混淆)
- [ ] 追加时若已有 hint(如 video task id),拼接并按标记去重;不要 `hint` 非空就跳过
- [ ] 渲染产品命令前须经能力门控(命令表是否暴露对应 path),不要对 `kscli` 等缺命令的产品硬拼 `usage freetier`
- [ ] 命令名使用 `commandPrefix`,不要硬编码 `bl`
- [ ] 恢复命令经 `recoveryCommand` 渲染：命名 Profile 激活时追加 `--config <name>`（default / 未指定不加）
- [ ] URL 必须是 `import { API_KEY_PAGE } from "./urls.ts"`

### C. command / runtime 直接抛错

- [ ] runtime 层抛 BailianError 时,hint 里可以放 `commandPrefix` 渲染的入口命令,但 **URL 一律走 `urls.ts` import**
- [ ] `packages/commands` 作为 shared command 库,默认不硬编码产品 bin;如果确需用户操作提示,优先依赖 runtime error handler 或 `formatCommand(ctx.identity, args)`
- [ ] 抛错位置如果**已经在调用服务端**,catch 时不要替换 message——重新评估是否需要 catch

### D. 文案一致性

- [ ] 服务端错误的 message:必含 `HTTP <status>` 字段;有 apiCode/request_id 也拼上
- [ ] 网络层错误的 message:必含 `err.cause.code`(如 ENOTFOUND)
- [ ] 中英文混用慎重 —— 当前主要是英文文案

## 完成后自查

```sh
# 触发对应错误,看 text 输出
HOME=/tmp/empty pnpm -F bailian-cli exec tsx src/main.ts text chat --message "x"

# 看 JSON 输出(应包含 cause 字段当 cause 存在时)
HOME=/tmp/empty pnpm -F bailian-cli exec tsx src/main.ts text chat --message "x" --output json

# 模拟网络层错误,验证 errno 透传
DASHSCOPE_BASE_URL=https://nonexistent-host.invalid \
  pnpm -F bailian-cli exec tsx src/main.ts text chat --message hi
# 预期:"Network request failed: ENOTFOUND ..." + Caused by 链
```

text 模式应看到准确诊断,JSON 模式应能解析出 cause.code(用于 agent 决策)。

## 常见漏点

- 分批写操作失败时应立即停止，保留原始错误和已有 hint，并补充已确认成功的批次编号与对象 ID；失败批次结果可能未确认，不得宣称完全未执行。网络/超时错误先复用 runtime 的 `normalizeError` 分类，避免附加进度时丢失退出码；用模拟请求验证中途失败，不做真实破坏性测试。
- ✗ 在 core 的 hint 里"顺便"写了 `bl auth login` —— 违反第 3 条不变量
- ✗ 给 `mapApiError` 加了"401 → AUTH"等白名单分支 —— 违反边界原则
- ✗ 用 `try/catch` 包住服务调用,catch 里 throw 了一个新的 BailianError 替换原错误 —— 违反第 1 条不变量
- ✗ 加新 ExitCode 但没想清楚谁产生它 —— 服务端永远不应产生新 ExitCode,内部错误才需要新分类
