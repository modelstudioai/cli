# 输出契约

## 触发条件

- 新增结果、进度、提示、警告或诊断输出
- 修改 output / quiet / verbose 行为
- 修改错误出口、流式或二进制输出

## 当前迁移阶段

公共 runtime 已接入 reporter：正常及早期错误、中间件提示、Client 传输诊断和轮询遵循统一策略；下载保留原有 TTY 原地刷新进度条，调用方在 quiet 或 JSON 模式下关闭进度。视频 generate / ref / edit / download / task get、图片 generate / edit、语音热词表 create / update / delete / get / list、speech synthesize / recognize、memory 全部 7 个命令、quota 全部 5 个命令、agents security overview / alerts、monitor 全部 7 个命令、log 全部 14 个命令、usage 全部 6 个命令和 token-plan 全部 5 个命令已迁移最终结果与过程提示，quiet 不再返回裸路径或只返回状态；其他存量业务 emitResult/emitBare、命令专属输出、SDK 全局适配器及 Command Pack API 1 尚需逐项迁移；不能宣称任意命令的完整输出已经遵循新协议。

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
- [ ] 其他原始字节流、既有事件流和 Command Pack API 1 仍走现有专用入口；不得绕过新接口承诺后混入 stdout
- [ ] 每个调用使用独立 reporter，不共享结果状态、不替换全局 stdout/stderr
- [ ] 进程共用 SIGINT / stdout error 监听器，调用结束清理输出上下文；并发不触发 MaxListenersExceededWarning，单次中断只输出一条终止错误，EPIPE 保护覆盖 run 返回后的异步写入

### C. 后续迁移

- [ ] 按命令完整调用链迁移：业务、middleware、传输日志、轮询/下载、错误出口必须一起核对
- [ ] 移除 quiet 裁剪/吞结果分支，更新依赖 quiet 提取 ID/path 的示例
- [ ] 迁移完后再为相应路径启用直接打印约束，保留协议/原始流等窄例外；不要先全仓禁用旧代码

### D. 回归测试隔离

- [ ] 本地假服务的子进程测试显式覆盖 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / NO_PROXY 及小写变量，关闭 NODE_USE_ENV_PROXY；仅代理专项测试按场景注入代理，不继承开发机的代理设置

## 完成后自查

```sh
pnpm exec vp test packages/runtime/tests/output-reporter.test.ts packages/runtime/tests/output-reporter.e2e.test.ts
pnpm exec vp check
```

本清单描述新输出组件的约定；存量命令完成整条调用链迁移后，才适用同样的输出保证。
