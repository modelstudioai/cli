# Journey E2E（用户旅程链路测试）

从用户 case 出发验证关键流程可用性：每条 journey = 用户带着一个目标跨命令走完整回路，
以「fixture 标记词能否被召回」判定回路闭合（区别于 `../*.e2e.test.ts` 的单命令契约测试）。

## 旅程映射

| #   | 用户 Case                            | 文件                                                                                    | 闭环断言                                                                                                                |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| J1  | 冷启动：建库并获得首个答案           | `j1-cold-start.e2e.test.ts`                                                             | retrieve/search(beta) 召回标记词（硬）；chat 回答引用标记词（软）                                                       |
| J2  | 内容运维：文档增删的可见性           | `j2-content-ops.e2e.test.ts`                                                            | 双标记词命中 → 删除其一后 markerB 消失且 markerA 仍在（硬）                                                             |
| J3  | 检索精修：chunk 排除生效             | `j3-chunk-tuning.e2e.test.ts`                                                           | exclude 后排除标志生效（硬）；include 恢复（软）。retrieve 不过滤被排除 chunk，以 `is_displayed_chunk_content` 标志为准 |
| J4  | 服务调优：草稿→修改→发布             | `j4-service-tuning.e2e.test.ts`                                                         | beta 草稿可用、update 落库、发布后正式版可用（硬）                                                                      |
| J5  | 数据面治理：collection/category/file | `j5-data-plane.e2e.test.ts`                                                             | 自建类目内文件可见/可删，类目删后消失（硬）                                                                             |
| J6  | 退场清理：删库验证消失               | 复用 [`../knowledge-kb-delete.e2e.test.ts`](../knowledge-kb-delete.e2e.test.ts) live 链 | delete 后 list 不再包含（硬）                                                                                           |

## 约定

- **gating**：J1–J4 `isKbAdminE2EReady()`；J5 `isConnectorE2EReady()`（collection 无删除 API，仅手动开启；gating 函数/环境变量保留 CONNECTOR 旧名）。
- **自建自清**：所有资源自建 + `try/finally` 清理；kb 删除走 `deleteKbWithRetry`（IndexStatusError 重试）；
  数据中心文件用 `knowledge file delete` 回收；清理失败不掩盖，落 `resources.json` 供人工回收。
- **软/硬断言**：可用性关键路径硬断言（fail）；依赖服务端语义/延迟波动的信号软断言
  （`recordSoft`，只落报告不 fail，人工复核）。
- **日志产物**：每次 live 运行在 `test/output/<session>/e2e-vp-<journey>-<ts>/` 生成
  `journey-report.md`（步骤表 + 软断言区 + 未清理资源警示）、分步 stdout/stderr、`resources.json`、`journey.log`。

## 运行

```sh
pnpm run test:journey            # 全部 journey（无凭证时全部 skip）
vp test packages/commands/tests/e2e/knowledge/journeys/j1-cold-start.e2e.test.ts
```

live 运行需 `.env`：`BAILIAN_E2E=1` + DashScope API key + `BAILIAN_WORKSPACE_ID`；J5 另需 `BAILIAN_E2E_CONNECTOR=1`。
