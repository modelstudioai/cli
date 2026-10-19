# 输出契约

## 触发条件

- 新增结果、进度、提示、警告或诊断输出
- 修改 output / quiet / verbose 行为
- 修改错误出口、流式或二进制输出

## 当前迁移阶段

第一波仅提供 DASHSCOPE_QUIET、ctx.output 和 reporter 组件。旧 emitResult/emitBare、底层 HTTP logger 和公共 handleError 尚未迁移；不能宣称任意命令的 JSON stderr 已经遵循新协议。

## 必查清单

### A. 新接口

- [ ] 用 ctx.output.result(data, { text? }) 提交一次最终结果，text 只控制文本呈现；JSON 始终序列化 data，false/0/null/空列表都合法
- [ ] progress 与 info 写 stderr，仅 text 且非 quiet 时显示；progress 当前在非 TTY 下仍输出普通进度文本，不创建动画定时器；仅动画要求 TTY
- [ ] warning 始终保留；debug 仅 verbose 开启时显示；quiet 不关闭 verbose 明确请求的诊断
- [ ] 消息支持 LocalizedText；warning/debug 可携带 code 与 details，details 的凭证键统一脱敏、循环/深层引用受控
- [ ] 结果自身的凭证与敏感字段继续由命令在提交前按现有业务规则脱敏；不要把真实凭证拼进诊断 message

### B. 错误与边界

- [ ] 业务不调用 error 或 process.exit；终止失败抛异常，由 runtime 统一处理
- [ ] report 包含失败项时，先保留业务报告；若契约要求失败退出，再抛一次失败摘要。查询 FAILED 资源不自动等价于查询失败
- [ ] text 错误保留 HTTP 状态、API 错误码、Request ID、cause 链及退出码；本地网络、超时、文件错误与旧出口共用分类，服务端错误原样透传
- [ ] reporter.error 是后续 runtime 接入的内部渲染能力，只返回退出码，不自行退出进程；不把它添加到 CommandOutput
- [ ] JSON 诊断每条一行；stdout 为单个业务 JSON 文档，stderr 单独解析
- [ ] 原始音频/字节流、既有事件流和 Command Pack API 1 仍走现有专用入口；不得绕过新接口承诺后混入 stdout
- [ ] 每个调用使用独立 reporter，不共享结果状态、不替换全局 stdout/stderr

### C. 后续迁移

- [ ] 按命令完整调用链迁移：业务、middleware、传输日志、轮询/下载、错误出口必须一起核对
- [ ] 移除 quiet 裁剪/吞结果分支，更新依赖 quiet 提取 ID/path 的示例
- [ ] 迁移完后再为相应路径启用直接打印约束，保留协议/原始流等窄例外；不要先全仓禁用旧代码

## 完成后自查

```sh
pnpm exec vp test packages/runtime/tests/output-reporter.test.ts packages/runtime/tests/output-reporter.e2e.test.ts
pnpm exec vp check
```

本清单描述新输出组件的约定；存量命令完成整条调用链迁移后，才适用同样的输出保证。
