# Memory 修复与 live 验收结果（2026-10-19）

## 修复范围

| Review 问题           | 已实现修复                                    | 回归覆盖                                 |
| --------------------- | --------------------------------------------- | ---------------------------------------- |
| 重启自动恢复暂停      | 启动只初始化，显式 resume 才恢复              | paused 启动不变、显式恢复                |
| 自动召回可无限等待    | 总预算 5 秒，转发取消，结束时取消并行遗留请求 | 挂起超时、父取消、搜索失败时画像请求取消 |
| v3 迁移丢画像绑定     | 保留 profile schema 引用，Skill 支持 v2/v3    | 迁移、暂停、恢复与绑定读取               |
| 遗忘后同内容无法重记  | 去重按操作身份，同操作合并，独立操作可重写    | 同操作并发、跨操作相同内容、真实工具重记 |
| kb_manage 后缓存陈旧  | 等待旧刷新完成，再重新发现并更新磁盘          | 实际管理回调、旧请求并发、磁盘持久化     |
| memory Skill 版本落后 | 同步到 CLI 2.3.2                              | Skill metadata/reference 校验            |

另补验收清理防护：事件返回但列表尚未可见的节点仍清理；模板创建响应丢失时保留名称并报告清理不完整，禁止假报成功。上述异常通过离线回归覆盖。live 运行期间补入的清理防护不影响已加载用例；本轮 live 无丢失回执或清理失败，最终代码的防护由离线回归验证。

## 自动化验收

本次验收 **PASS**：8/8 在表中声明的层级通过。按用户确认的范围，dsh/Skill 实际宿主验证不在本次验收内。

| Journey | 场景                           | 证据层                 | 结果 |
| ------- | ------------------------------ | ---------------------- | ---- |
| J1      | 首次保存并召回                 | 真实 CLI / Memory 云端 | PASS |
| J2      | 新进程召回、身份隔离           | 真实 CLI / Memory 云端 | PASS |
| J3      | 纠正长期偏好                   | 真实 CLI / Memory 云端 | PASS |
| J4      | 遗忘、保留对照、重新记忆       | 真实 CLI / Memory 云端 | PASS |
| J5      | 画像抽取与纠正                 | 真实 CLI / Memory 云端 | PASS |
| J6      | 暂停、重建生命周期、恢复       | 真实云端 / 受控宿主    | PASS |
| J7      | 共用身份与 v3 画像绑定         | 真实云端 / 受控宿主    | PASS |
| J8      | 真模型整理、任务恢复、工具重记 | 真实云端 / 受控宿主    | PASS |

J1–J5 共 531.57 秒。测试使用随机合成身份和专用模板；这五条已确认 pending=0、cleanupErrors=0。J6–J8 共 383.04 秒，三条均清理成功。J8 使用真实 `qwen3.8-max`，不使用固定模型回答。

本地证据（`test/output` 不入 Git）：

- `test/output/memory-cli-acceptance.json`：J1–J5 Vitest 结果。
- `test/output/**/evidence.json`：CLI 步骤、事件、节点与清理结果。
- `test/output/memory-plugin-journeys/J*.json`：插件云端步骤及清理结果。
- `test/output/memory-acceptance-2026-10-19T04-12-13-935Z/`：J6–J8 严格入口结果（3 passed）与分层汇总。
- `test/output/memory-acceptance-combined.json`：八条结果合并，本次范围 PASS。

## 范围之外的宿主测试

dsh/Skill 实际宿主验证不属于本仓本次验收门槛。下列场景保留为宿主侧手工测试协议，未在此执行，不影响本次 PASS。

宿主侧测试场景：

1. 实际宿主启用/拒绝与遗忘确认，设置 UI、插件加载及事件触发。
2. 新会话回答确实采用召回结果，纠正后只把最新偏好作为当前事实。
3. 实际安装 Skill 的 Agent 读取 v3 配置并继续使用同一身份/画像。
4. dsh 原生 Storage Domain 在真正进程重启后恢复任务。当前验证是文件 TaskStore 重开加生产 poller。
5. 真实模型 provider 路由与宿主审批集成。当前模型请求通过测试适配器接真实 DashScope。
6. 单用户画像值精确遗忘的实际链路；删除测试模板只用于清理，不代替该能力验收。

API key、Workspace 和默认库可用；未配置显式 library ID 不阻断默认库主干。已执行路径未发现权限阻断。完整执行协议见 [live-acceptance.md](live-acceptance.md)。

## 工程验证

- 定向回归：208 passed，3 skipped（普通运行按设计跳过 opt-in live 测试；另有独立 live 执行结果）。
- 严格报告规则：4 passed，覆盖缺凭据、默认库、缺项/skip 不算 PASS、失败传播。
- `vp check`：0 errors，3 条已有 lint/type warnings。
- kb/memo 两个插件构建成功。
- 本机 Node 23.11.1 不在根仓声明的 Node 范围内，正式 CI 应在声明支持的 Node 版本复验。

未提交 Git，也未修改本次任务之外的发布改动。
