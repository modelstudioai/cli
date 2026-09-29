# 知识库迭代二验收记录

范围来自[产品设计](../specs/2026-09-25-knowledge-iteration-2-design.md)和 [A–D 开发计划](2026-09-24-knowledge-iteration-2.md)。工作基线为 `c1d9bd10`，本次不执行发布。

## 需求与证据

| 需求                                                        | 实现                                                                    | 验证证据                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建前告知持续费用，标准版 720 小时共享且有有效期，余额未知 | `knowledge/billing.ts`；直接 create 与 init 接入                        | `knowledge-billing.test.ts`、`knowledge-init-command.test.ts`；创建前拒绝、quiet、失败后的资源诊断均覆盖                                                               |
| 只读规划与实际风险确认，旧静态命令兼容                      | runtime `preparation.ts`、middleware、confirm                           | `preparation.test.ts`、`confirm.test.ts`、`registry-guard.test.ts`；预览零写入、AUTH、code 7、无后台升级；业务 fake backend 记录全部请求                               |
| 双入口根/组/叶命令发现，免鉴权、确定 JSON、双语元数据       | runtime `introspect.ts`、resolve/registry；产品实际命令表               | `introspect.test.ts`、双入口 registry smoke、`knowledge-skill-registry.e2e.test.ts`；生成器与真实入口 JSON 相等。路由测试收在 introspect 测试，未另建 resolve 测试文件 |
| init 完成首次样例检索、重复复用、恢复与资源清理指引         | `init.ts`、prepare/workflow/state/service-config、共享 operations       | prepare/workflow/state/command 单测；`knowledge-init-runtime.e2e.test.ts`；真实 J6 首次检索与二次复用通过                                                              |
| 同步完整内容扫描，排除状态文件、不跟随链接、类型变化不误删  | sync scan/tags/state/plan                                               | scan、tags、state、plan 测试；同大小内容变化、mtime 不变、读取失败、同名目录和文件类型变化均覆盖                                                                       |
| fileId/docId 可靠关联、完整分页、未托管文档保护             | operations/list、sync remote/reconcile                                  | C1 实测脱敏 fixture `sync-remote-contract.json`；remote/reconcile/resource-list 测试，重复/缺字段/不完整清单阻止执行                                                   |
| 新版就绪后删除旧索引，默认保留本地删除项，源文件保留        | sync execute/ports/delete/snapshot                                      | execute/ports/delete/snapshot 测试；CLI runtime 测试检查请求顺序、确认与源文件保留；真实 J7 哨兵保护                                                                   |
| 中断 checkpoint、未知写结果不重放、目标绑定及旧计划失效     | sync recover/recovery-run/verify；共享 state-store                      | recovery/revision/verify 测试；上传、导入、删除、写盘失败；精确操作标记；执行前再扫描和远端核对                                                                        |
| state 丢失时显式 syncId 恢复，不猜远端历史路径              | sync restore/prepare                                                    | restore/prepare 测试；J7 丢失 state 后恢复、内容回退、后续无变化重复通过；无法恢复的路径保留为 orphan                                                                  |
| 两种 CLI 同一行为与参数，帮助和缺参行为正确                 | commands export、bl/kscli maps                                          | 双入口 registry smoke；init/sync 命令级 E2E；完全不带参数沿用展示帮助行为，执行时缺必填参数 exit 2                                                                     |
| 个人知识库 Skill、protocol hand-off、schema 参考和安装闭环  | `skills/bailian-knowledge`、hub/protocol、reference generator、分发清单 | renderer/generator/assets/install 单测；临时 HTTP registry 的实际 init/add/update；6 个独立文本场景审查，非实际所有 Agent 宿主认证                                     |
| 用户文档、中英示例与维护规范                                | README 四份、knowledge guide/kb/doc、agents 文档                        | quickstart 示例与真实命令表校验；生成文档测试和格式检查                                                                                                                |

测试路径：命令单测位于 `packages/commands/tests/knowledge/`，CLI E2E 位于 `packages/commands/tests/e2e/knowledge/`；runtime 测试位于 `packages/runtime/tests/`，生成资产测试位于 `tools/`。

## 真实验收

- C1：2026-09-29，约 69 秒，通过。验证同名新旧文件共存、完整标签唯一关联、三页完整清单、删除最终一致性及源文件保留。8 条测试资源/未决操作记录已清理或解析。
- J6：2026-09-29 15:09，26.32 秒，通过。初始化首次检索、重复资源复用；3 个资源全部清理。
- J7：2026-09-29 15:07，约 91 秒，通过。新增、无变化复跑、确认替换、内容回退、状态丢失恢复、默认保留、确认删除；6 个资源全部清理。
- 凭证来自原仓库已有 `.env`，隔离工作目录配置已补齐。没有把凭证或真实用户状态纳入 Git。真实资源记录保存在忽略的 `test/output`，提交范围只含脱敏契约 fixture。

## 最终代码审查

独立审查覆盖 sync 扫描、规划、执行、删除、恢复和不可变上传快照。发现两项问题，均先用失败回归复现再修复：

1. 未知上传不能接管同路径、同内容的历史源文件：要求精确操作标记或 checkpoint 的文件 ID。
2. 托管文件变成同名目录不能当成文件消失：扫描保留目录记录并使该托管路径冲突；执行前复核也检测新目录，同时允许 CLI 自己创建 checkpoint 父目录。

复审 58 项定向测试通过；未发现其他可操作问题。

## 回归结果

- 全量非 E2E：165 个文件、1916 项通过（审查修复前基线）。
- 修复后：扫描/恢复/复核 35 项、CLI 同步及补充复核 18 项通过；复审独立运行 58 项通过。
- 双入口和 CLI 专项：初轮 441 项通过，2 项失败分别为新增用例错误及并行构建时安装测试超时。修正用例后同步 6 项通过；安装测试串行重跑 3 项通过。
- 全仓构建与审查修复后的 commands 构建通过。五个包实际 pack 后按发布 exports 启动，bl knowledge / kscli 分别输出 36 / 39 个命令，重复 JSON 一致，未生成配置。完整关闭云调用的测试集已运行完成，具体结果见下一项。
- 格式/lint/type：最终全仓检查 0 错误、3 条未修改文件既有警告；修复涉及 22 个文件检查无警告或错误。三份知识库参考重新生成后字节一致。
- 完整回归：270 个文件，3432 项通过、278 项跳过、7 项失败。3 项为既有权限命令用例读取本机 output 配置，已给默认值测试隔离临时配置；另 4 项为长运行缓存修复前模块所触发的新回归断言。最终在全量运行结束后，用新进程重跑这 4 个文件：48 项通过、3 项跳过，7 项失败全部闭环。未将初轮结果描述为单次全绿。
- diff 空白检查通过；变更/新增路径扫描未发现常见 API Key 或 OSS 签名模式；`.env` 未跟踪。临时关闭云调用的测试配置已恢复为原字节。

未验证或不承诺：全量真实云服务测试、跨机器同时写入、任意 Agent 宿主行为、账户实时费用/剩余额度、远端发布。真实 J6/J7 不替代故障注入测试，离线测试也不替代实际云契约。

## 结论

四项能力和计费提醒已交付，所有发现的问题均有修复与通过的回归证据；真实契约及初始化/同步旅程已验收。改动保留在开发工作树，未提交、合并或发布。
