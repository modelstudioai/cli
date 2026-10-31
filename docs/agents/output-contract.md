# 输出契约

## 触发条件

- 新增结果、进度、提示、警告或诊断输出
- 修改 output / quiet / verbose 行为
- 修改错误出口、流式或二进制输出

## 输出约定

普通业务命令及其 SDK、传输、轮询、更新和 Command Pack 调用链统一使用本次调用的 `ctx.output`。不再使用全局 `emitResult/emitBare`，不自行创建 reporter。原始流和原生交互仅限下面列出的边界。

```ts
ctx.output.result(data, { text }); // 最终业务结果；text 可选，只控制文本呈现
ctx.output.progress(message); // 进度
ctx.output.info(message); // 过程提示
ctx.output.warning(warning); // 需要关注的问题
ctx.output.debug(details); // verbose 诊断
```

终止失败直接抛出，由 runtime 统一渲染；`CommandOutput` 不提供 `error()`。包含失败项的最终报告先 result，再按原有契约抛错。

| 信息                | text 默认       | text + quiet | text + verbose  | text + quiet + verbose |
| ------------------- | --------------- | ------------ | --------------- | ---------------------- |
| result              | stdout 文本结果 | 相同结果     | 相同结果        | 相同结果               |
| progress / info     | stderr 文本     | 隐藏         | stderr 文本     | 隐藏                   |
| warning             | stderr 文本警告 | 保留         | 保留            | 保留                   |
| debug               | 隐藏            | 隐藏         | stderr 文本诊断 | stderr 文本诊断        |
| 终止错误（runtime） | stderr 文本错误 | 保留         | 保留            | 保留                   |

| 信息                | JSON 默认             | JSON + quiet | JSON + verbose   | JSON + quiet + verbose |
| ------------------- | --------------------- | ------------ | ---------------- | ---------------------- |
| result              | stdout 完整 JSON 文档 | 相同 JSON    | 相同 JSON        | 相同 JSON              |
| progress / info     | 隐藏                  | 隐藏         | 隐藏             | 隐藏                   |
| warning             | stderr 单行 JSON      | 保留         | 保留             | 保留                   |
| debug               | 隐藏                  | 隐藏         | stderr 单行 JSON | stderr 单行 JSON       |
| 终止错误（runtime） | stderr 单行 JSON      | 保留         | 保留             | 保留                   |

stdout 与 stderr 分别解析：stdout 是一个 JSON 文档；stderr 的每个非空行是一条独立 JSON 记录（JSONL）。不要把两个通道拼成一个 JSON 文档。quiet 只减少过程提示，不选择数据字段、不隐藏警告或错误、不关闭 verbose。

### 配置与默认值

- 沿用现有 output / verbose 配置；quiet 增加 `DASHSCOPE_QUIET=1`，不增加持久化字段或反向 switch。未传 `--quiet` 的解析值 false 不是显式关闭；按开启型 switch 与环境变量共同决定。
- 命令 `defaultOutput` 仅在 flag / 环境变量 / Profile 都未选择格式时生效；既有 telemetry 的格式强制规则由 `defaultOutputOverridesProfile` 单独声明。
- 原生 TTY 专用默认值通过 `defaultInteractiveOutput` 声明；已有 `--trace` 等诊断开关通过 `verboseFlags` 在同一个 reporter 创建前解析，不能另建 reporter。

### 明确边界

| 入口                                                                   | 保留的行为                                                                                           | JSON 约束                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| text chat / app call / text omni / knowledge chat / Managed Agent 会话 | text 回答流可逐段写 stdout；最终仍提交一次 result；过程提示受 quiet 控制                             | 收集并提交一次完整结果，不写文本 token；会话原有事件脱敏投影保留                                                                    |
| speech synthesize                                                      | text 且没有 `--out` 时允许原始音频 stdout                                                            | 流式 JSON 要求 `--out`，副作用前校验；dry-run 保留预览                                                                              |
| pipeline run `--events jsonl`                                          | 显式 `--output text` 保留既有生命周期 JSONL 流                                                       | 与有效 JSON 格式冲突时，在读取/执行工作流前报用法错误                                                                               |
| 浏览器登录 / 终端问答 / 本地 UI / Workbench                            | text 原生交互；登录 URL、问题和 Workbench 子进程使用其原生通道；Workbench ready/reuse URL 是最终结果 | 无法满足普通结果契约的原生模式在浏览器、服务器、子进程或远程副作用前拒绝，提示 text 或既有非交互方式；dry-run 保留结构预览          |
| help / version / introspect                                            | runtime 负责的产品入口及协议输出                                                                     | 沿用各入口专属协议，不当成普通业务结果                                                                                              |
| Command Pack API 1                                                     | 兼容已有 result/line/write 表面；按调用缓存并最终提交一次 result                                     | 显式 result 保留数据；只有 raw write 时返回累计字符串；重复 result 报协议错误。用户扩展自行调用 process/console 不属于宿主 API 保证 |

OpenAgentPack SDK 没有 logger 注入接口：仅在 SDK 调用上下文内，以 AsyncLocalStorage 路由 transport 与 console；并发和延迟回调仍使用各自 output，外部 console 调用保持原行为。非结构化 SDK 日志仅保留安全摘要，禁止复制 `/files` 响应体或凭证；类型化 feedback 按 info/warning 输出。诊断写入失败不能改变 SDK 业务成功或失败。

## 必查清单

### A. 新接口

- [ ] 用 ctx.output.result(data, { text? }) 提交一次最终结果，text 只控制文本呈现；JSON 始终序列化 data，false/0/null/空列表都合法
- [ ] progress 与 info 写 stderr，仅 text 且非 quiet 时显示；progress 当前在非 TTY 下仍输出普通进度文本，不创建动画定时器；仅动画要求 TTY
- [ ] 并发请求提示通过 runConcurrent 的 output.info 输出，数量、请求顺序和失败传播不受 quiet/verbose 影响
- [ ] 下载进度沿用 TTY 原地刷新，非 TTY 不输出；quiet／JSON 时关闭，不把逐数据块更新转换为追加日志
- [ ] warning 始终保留；debug 仅 verbose 开启时显示；quiet 不关闭 verbose 明确请求的诊断
- [ ] 可升级通知使用 UPDATE_AVAILABLE warning，JSON／quiet 下保留；details 提供 current_version、latest_version、upgrade_command，业务结果和退出码不变，联网检查仍按既有间隔执行，命中版本缓存时仍生成可升级通知；自动更新阈值不变
- [ ] 消息支持 LocalizedText；warning/debug 可携带 code 与 details，details 的凭证键统一脱敏、循环/深层引用受控
- [ ] 结果自身的凭证与敏感字段继续由命令在提交前按现有业务规则脱敏；不要把真实凭证拼进诊断 message

### B. 错误与边界

- [ ] 业务不调用 error 或 process.exit；终止失败抛异常，由 runtime 统一处理
- [ ] report 包含失败项时，先保留业务报告；若契约要求失败退出，再抛一次失败摘要。查询 FAILED 资源不自动等价于查询失败
- [ ] text 错误保留 HTTP 状态、API 错误码、Request ID、cause 链及退出码；本地网络、超时、文件错误与旧出口共用分类，服务端错误原样透传
- [ ] 普通异常的调用栈通过 ERROR_STACK debug 记录输出，仅 verbose 开启时保留；quiet 不隐藏，JSON 模式仍逐条单行，终止 error 不重复输出
- [ ] reporter.error 是 runtime 内部渲染能力，只返回退出码；handleError 接收本次 reporter 并负责退出，不把 error 添加到 CommandOutput
- [ ] core 通过可选 debug 回调上报传输诊断，无回调时保持安静；runtime 注入 ctx.output.debug。请求体、认证头和查询参数值不直接打印
- [ ] 错误 cause 中的结构化对象复用安全序列化；服务端 message、api_code、request_id 不改写
- [ ] JSON 诊断每条一行；stdout 为单个业务 JSON 文档，stderr 单独解析
- [ ] speech synthesize 的原始音频仅在 text 流式模式下直接写 stdout；JSON 流式需 --out 文件并返回元数据，未指定文件时在请求和文件操作前报用法错误；dry-run 仍允许 JSON 预览。--list-voices 的 JSON 返回音色条目与已有文档链接，内置列表未知时 voices/total 为 null
- [ ] speech recognize 的同步 JSON 返回完整服务响应；异步完成后返回原始任务响应并附加 transcriptions 数组，保留失败子任务和 request_id。text 保留转写、说话人和批量分隔；--out 仍保存原有转写文件结构，下载及写盘失败不提前输出最终结果；部分子任务失败不改变原有退出码
- [ ] usage freetier 的启用 JSON 保留原始响应数组；停用 JSON 返回 `{ processed: [{ model, result }], skipped: [model] }`，跳过项仍不发起停用请求。失败与超时用 warning 提示，保留原有退出策略，不把部分失败丢出结果。
- [ ] Token Plan 创建密钥的完整响应和一次性明文仍属于业务结果，quiet 不裁剪；不得通过 warning/debug 泄露明文。
- [ ] 原始流与原生交互仅限上表；Command Pack API 1 由宿主缓存并提交一次结果，不再直接转发 stdout
- [ ] 每个调用使用独立 reporter，不共享结果状态、不替换全局 stdout/stderr；SDK console 桥接只能读取调用上下文，不缓存上一个 host
- [ ] 进程共用 SIGINT / stdout error 监听器，调用结束清理输出上下文；并发不触发 MaxListenersExceededWarning，单次中断只输出一条终止错误，EPIPE 保护覆盖 run 返回后的异步写入

### C. 新增与变更命令

- [ ] 按命令完整调用链迁移：业务、middleware、传输日志、轮询/下载、错误出口必须一起核对
- [ ] 移除 quiet 裁剪/吞结果分支；同步检查测试（含 live 门控用例）、脚本及示例中依赖 quiet 提取 ID/path 的调用方，改为显式 JSON 并读取对应字段
- [ ] 核对原始写入边界；普通命令不得恢复全局 emitter 或自行打印诊断。新增原始流例外需同时说明适用格式、通道和副作用前校验

### D. 回归测试隔离

- [ ] 本地假服务的子进程测试显式覆盖 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / NO_PROXY 及小写变量，关闭 NODE_USE_ENV_PROXY；仅代理专项测试按场景注入代理，不继承开发机的代理设置

## 完成后自查

```sh
pnpm exec vp test packages/runtime/tests/output-reporter.test.ts packages/runtime/tests/output-reporter.e2e.test.ts
pnpm exec vp check
```

本清单适用于仓内普通业务命令及其完整调用链；上表明确列出的协议与原生交互按各自边界验证。
