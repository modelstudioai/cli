# 错误文案变更

## 触发条件

- 修改 `BailianError` 的 message 或 hint
- 调整 cli 的 hint 增强逻辑(`enhanceHint`)
- 改 ensure-key 的 setup 流程文案
- 改任何抛错位置的分类(exitCode)

> 注意:`mapApiError` **不再做错误分类**(参见下方"边界原则")。如果你想给某种 HTTP 错误码加白名单分类,请先回到本文档读完"边界原则"再说。

## 边界原则:CLI 不翻译服务端错误

**CLI 只为「自己能权威解释的错误」发出语义化信号,服务端的错误原样透传。**

| 错误来源                                             | 归类     | 处理方式                                                    |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 命令解析、缺 flag、参数校验                          | **内部** | `BailianError(USAGE)`                                       |
| 文件 I/O(ENOENT/EACCES/...)                          | **内部** | `BailianError(GENERAL)` + errno-specific hint               |
| 本地 credentials 缺失(resolver/ensure-key/AK-SK 等)  | **内部** | `BailianError(AUTH)`                                        |
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
cli/main.ts: main().catch(handleError)
  ↓
cli/error-handler.ts:
  - 服务端错误(BailianError(GENERAL)) → text 直接打 message
  - 内部 AUTH/USAGE/NETWORK/TIMEOUT → 走 enhanceHint(只 AUTH 还有增强)
  - TypeError("fetch failed") → 读 err.cause.code 翻成 NETWORK
  - Node fs errno → 翻成 GENERAL + errno hint
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
- 例外:CLI **自己**因为本地状态产生的 BailianError(resolver、ensure-key 等)可以用语义化 exitCode

### 3. core 的 hint 必须不含 cli 关切

- ❌ 不写 `bl xxx` 命令名
- ❌ 不写控制台 URL 或 region
- ❌ 不写渠道追踪参数(`source_channel=xxx`)
- ✅ 只描述抽象做法(如 `"Set DASHSCOPE_API_KEY environment variable, or pass --api-key."`)

### 4. cli 端可以自由使用 cli 命令名 + URL

- 命令文件、`error-handler.ts`、`utils/ensure-key.ts` 是 cli 层,内部可以写 `bl xxx`
- URL 必须从 `packages/cli/src/urls.ts` import,不能硬编码

## 必查清单

### A. core 改动(message / hint)

- [ ] `packages/core/src/errors/api.ts` 的 `mapApiError`:**保持透传形态**,不要加白名单分支
- [ ] `packages/core/src/auth/resolver.ts` 改 throw 语句:hint 不含 cli 关切
- [ ] 任何 core 文件 throw 的 BailianError:同上

### B. cli 增强(`enhanceHint`)

- [ ] `packages/cli/src/error-handler.ts:enhanceHint`:**当前只为 internal AUTH 增强**(因为只有 resolver/ensure-key 等内部位置会发 AUTH)
- [ ] URL 必须是 `import { API_KEY_PAGE } from "./urls.ts"`

### C. cli 直接抛错(`ensure-key`、命令文件)

- [ ] cli 层抛 BailianError 时,hint 里可以放 cli 命令名,但 **URL 一律走 `urls.ts` import**
- [ ] 抛错位置如果**已经在调用服务端**,catch 时不要替换 message——重新评估是否需要 catch

### D. 文案一致性

- [ ] 服务端错误的 message:必含 `HTTP <status>` 字段;有 apiCode/request_id 也拼上
- [ ] 网络层错误的 message:必含 `err.cause.code`(如 ENOTFOUND)
- [ ] 中英文混用慎重 —— 当前主要是英文文案

## 完成后自查

```sh
# 触发对应错误,看 text 输出
HOME=/tmp/empty node packages/cli/src/main.ts text chat --message "x" --non-interactive

# 看 JSON 输出(应包含 cause 字段当 cause 存在时)
HOME=/tmp/empty node packages/cli/src/main.ts text chat --message "x" --non-interactive --output json

# 模拟网络层错误,验证 errno 透传
DASHSCOPE_BASE_URL=https://nonexistent-host.invalid \
  node packages/cli/src/main.ts text chat --message hi
# 预期:"Network request failed: ENOTFOUND ..." + Caused by 链
```

text 模式应看到准确诊断,JSON 模式应能解析出 cause.code(用于 agent 决策)。

## 常见漏点

- ✗ 在 core 的 hint 里"顺便"写了 `bl auth login` —— 违反第 3 条不变量
- ✗ 给 `mapApiError` 加了"401 → AUTH"等白名单分支 —— 违反边界原则
- ✗ 用 `try/catch` 包住服务调用,catch 里 throw 了一个新的 BailianError 替换原错误 —— 违反第 1 条不变量
- ✗ 加新 ExitCode 但没想清楚谁产生它 —— 服务端永远不应产生新 ExitCode,内部错误才需要新分类
