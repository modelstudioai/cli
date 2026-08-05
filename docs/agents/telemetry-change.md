# 埋点变更

## 触发条件

- 调整 AEM 命令事件、事件字段或参数 allowlist
- 调整 `User-Agent`、`x-dashscope-source-config` 或其他后端渠道标识
- 新增鉴权域、请求网关或绕开统一 Client 的网络出口
- 排查命令量、成功率、版本、鉴权域或后端渠道数据不一致

## 当前数据流

三套鉴权对应三套请求域，但不代表三套网关使用相同的后端埋点。命令侧另有一套覆盖所有实际执行命令的 AEM 客户端事件，两者必须分开理解。

```text
命令进入 run
  ├─ telemetryStage
  │    ├─ ~/.bailian/telemetry.jsonl
  │    └─ AEM(pid=bailian-cli-node, event name=命令路径)
  │
  └─ authStage
       ├─ apiKey  → DashScope / 模型域
       ├─ console → Bailian Console Gateway
       ├─ openapi → 阿里云 OpenAPI
       └─ none    → 无凭证域；本地命令也仍有 AEM 命令事件
```

### 1. 三套鉴权与埋点标识

| 命令声明          | 凭证 / 请求域                                       | 主要请求出口                                                                          | 后端埋点标识                                  | 前端埋点标识（AEM）                              |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `auth: "apiKey"`  | API Key；DashScope / OpenAI-compatible 模型域       | `Client.request/requestJson`、`McpClient`、Managed Agent instrumented fetch、上传策略 | 有：`User-Agent`、`x-dashscope-source-config` | 有：`pid=bailian-cli-node`、`authMethod=apiKey`  |
| `auth: "console"` | Console access token；Bailian Console Gateway       | `callConsoleGateway()` → `/cli/api.json`                                              | 无                                            | 有：`pid=bailian-cli-node`、`authMethod=console` |
| `auth: "openapi"` | AccessKey ID/Secret，可选 STS token；阿里云 OpenAPI | `Client.openApiJson()`                                                                | 有：`x-dashscope-source-config`               | 有：`pid=bailian-cli-node`、`authMethod=openapi` |
| `auth: "none"`    | 无凭证域                                            | 本地逻辑或命令自行管理的登录/配置流程                                                 | 无                                            | 有：`pid=bailian-cli-node`、`authMethod=none`    |

`authMethod` 记录的是命令声明的鉴权域，不是凭证来源。它不会区分 API Key 来自 flag、env 还是 config。
鉴权域是命令的准入门槛和主请求域，不保证命令内部只有一种网络出口；例如部分 `apiKey` 命令也可能读取匿名 Console 公共目录，Managed Agent 还可能访问其他 provider。

表中的后端埋点按该鉴权域的主要业务请求填写：

- Managed Agent 的 `User-Agent` 对所有 SDK 请求注入；`x-dashscope-source-config` 仅对阿里云 host 注入
- DashScope 上传策略 `getPolicy` 只有 `x-dashscope-source-config`，没有显式 CLI `User-Agent`
- OpenAPI 的 ACS 签名头，以及 Console Gateway 的 `product`、`action`、`api` 是鉴权或路由字段，不计为埋点标识

### 2. 后端渠道参数

当前 `x-dashscope-source-config` 结构为：

```json
{
  "channel": "bailian-cli",
  "tags": {
    "t1": "public",
    "t2": "bl 或 kscli",
    "t3": "实际 CLI 版本"
  }
}
```

- `t2` 取产品 `identity.binName`：完整 CLI 为 `bl`，Knowledge Studio CLI 为 `kscli`
- `t3` 取产品 `identity.version`，由产品入口的 `package.json` 注入
- `channel` 与 `t1` 是当前固定口径
- `User-Agent` 是独立标识：`bl` 为 `bailian-cli/<version>`，`kscli` 为 `knowledge-studio-cli/<version>`

source-config 只用于百炼 / DashScope API 侧消费，不发送到通用网络传输：

| 请求                                 | source-config |
| ------------------------------------ | ------------- |
| 模型 API、任务提交与轮询             | 有            |
| Bailian MCP / OpenAPI                | 有            |
| DashScope 上传策略 `getPolicy`       | 有            |
| OSS 文件上传                         | 无            |
| 图片、视频、音频、转录结果下载       | 无            |
| npm / 二进制更新检查、Skill registry | 无            |

当前已知例外：Pipeline runtime 自建的 `Identity.version` 为 `0.0.0-dev`，因此 Pipeline 内部模型请求的 `t3` 不代表产品包版本；现阶段不纳入本轮收敛。

### 3. 全命令 AEM 客户端埋点

`packages/runtime/src/middleware.ts` 的 `telemetryStage` 包裹 `authStage` 与命令执行，因此成功、业务失败、网络失败和鉴权失败都会形成一次命令事件。事件名是空格连接的命令路径，例如 `text chat`。

以下情况不会形成命令事件，因为没有进入 middleware 的 `run`：

- 根帮助、子命令 `--help`、`--version`
- 未识别命令、参数解析失败、缺少必填参数
- `defineCommand.validate` 在 dispatch 阶段拒绝的请求

遥测默认开启；`DO_NOT_TRACK=1` 一票否决，配置文件 `telemetry: false` 也可关闭。关闭后本地和远端均不记录。

单条 `TrackingEvent` 当前包含：

- `command`、`timestamp`、`durationMs`、`success`
- `cliVersion`、`nodeVersion`、`os`
- `authMethod`
- 失败时的 `errorMessage`、`httpStatus`、`requestId`
- 安全 allowlist 过滤后的 `params`

参数默认不上传，只有 `packages/core/src/telemetry/tracker.ts` 的 `PARAM_ALLOWLIST` 中字段会进入事件。不得加入 prompt、凭证、文件路径、URL、账号/租户/工作空间 ID 或其他用户内容。

事件同时写入两处：

1. 本地 `~/.bailian/telemetry.jsonl`：权限 `0600`，超过 5 MB 后重建
2. AEM：`pid=bailian-cli-node`，源码运行自动使用 `env=dev`，npm 安装或编译二进制使用 `env=prod`

底层 Node tracker 还会附加公共设备字段：OS 类型/版本、Node 应用名与版本、平台，以及由本机网络标识计算的 MD5 `device_id`。

当前 AEM 事件没有 `binName` 或 `clientName` 产品维度，并且 `bl`、`kscli` 共用 `pid=bailian-cli-node`。两边相同路径的 `config show`、`config set`、`update` 无法仅凭当前事件稳定区分产品；Knowledge 命令虽然因路径映射不同而表现为 `knowledge chat` 与 `chat`，也不应把命令路径当作长期产品标识。后端 source-config 的 `t2` 已能区分 `bl/kscli`，但这个维度尚未进入 AEM 客户端事件。

AEM 映射：

| AEM 字段   | 内容                                      |
| ---------- | ----------------------------------------- |
| event name | 命令路径                                  |
| `et`       | `EXP`                                     |
| `ext`      | 除 `command`、`params` 外的结构化事件字段 |
| `c1`       | allowlist 参数                            |
| `c2`       | `success` / `failure`                     |
| `c3`       | HTTP status                               |
| `c4`       | 错误文案，最多 500 字符                   |
| `c5`       | request ID                                |

远端发送是 best-effort，不得阻塞命令或改变退出码。正常退出最多等待 1 秒，SIGINT 最多等待 500 ms。

## 必查清单

### A. 新增或调整命令

- [ ] `defineCommand({ auth })` 必须声明真实请求域；AEM 的 `authMethod` 直接读取该值
- [ ] 新命令进入 `run` 后自动有基础事件，不得在命令内重复发送同名事件
- [ ] 需要按产品分析 AEM 数据时，必须显式设计产品字段；不得从命令路径推断 `bl/kscli`
- [ ] 只有可枚举、数值或布尔等低风险字段才可加入 `PARAM_ALLOWLIST`
- [ ] 新增 console raw API flag 时只允许记录公开 API 名，不得记录请求 `data`

### B. 调整后端渠道参数

- [ ] 同时核对 `packages/core/src/client/http.ts`、`mcp.ts`、`instrumented-fetch.ts`、`client.ts` 与 `files/upload.ts`
- [ ] 产品身份必须来自 `Identity`；不得从命令路径、环境变量或 `process.argv` 猜测
- [ ] `bl` 与 `kscli` 必须分别验证 `binName`、`clientName`、`version`
- [ ] OSS、结果文件、npm、二进制和 Skill 下载不得为了业务渠道统计新增 source-config
- [ ] 改 URL / host 范围时同时执行 [URL / 渠道变更](url-change.md) 清单

### C. 调整 AEM 事件

- [ ] 更新 `TrackingEvent`、`createTrackingEvent()` 与 `buildRemoteAemOptions()` 的字段映射
- [ ] 本地 JSONL 与远端 AEM 必须基于同一结构化事件，不能维护两套字段口径
- [ ] 成功与失败均覆盖；遥测异常必须静默且不改变业务退出码
- [ ] 检查 `DO_NOT_TRACK=1` 与 `telemetry: false` 两个关闭入口
- [ ] 错误字段不得额外拼接 token、请求体、prompt 或本地路径

## 完成后自查

```sh
rg -n "trackingHeaders|x-dashscope-source-config|User-Agent" packages --glob '*.ts'
rg -n "trackCommandExecution|PARAM_ALLOWLIST|buildRemoteAemOptions" packages/core packages/runtime --glob '*.ts'
vp check
vp test packages/core/tests packages/commands/tests/e2e/auth.e2e.test.ts
```

## 常见漏点

- ✗ 只看 AEM 命令事件，误以为它能替代网关侧请求渠道统计
- ✗ 把 `authMethod` 当成实际凭证来源；它只是命令声明的鉴权域
- ✗ 新增 bypass `fetch` 后漏掉应由网关消费的 source-config，或把它发给 OSS / npm / 第三方下载地址
- ✗ 只改 `bl` 入口，导致 `kscli` 的产品名或版本标签错误
- ✗ 把帮助、版本或参数校验失败算进“全部命令”；这些路径当前没有进入 telemetry middleware
