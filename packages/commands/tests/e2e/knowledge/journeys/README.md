# Journey E2E（用户旅程链路测试）

从用户 case 出发验证关键流程可用性：每条 journey = 用户带着一个目标跨命令走完整回路，
以「fixture 标记词能否被召回」判定回路闭合（区别于 `../*.e2e.test.ts` 的单命令契约测试）。

## 旅程映射

| #   | 用户 Case                            | 文件                                                                                    | 闭环断言                                                                                                 |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| J1  | 冷启动：建库并获得首个答案           | `j1-cold-start.e2e.test.ts`                                                             | search(beta) 召回标记词（硬）；chat 回答引用标记词（软）                                                 |
| J2  | 内容运维：文档增删的可见性           | `j2-content-ops.e2e.test.ts`                                                            | search(beta) 双标记词命中 → 删除其一后 markerB 消失且 markerA 仍在（硬）                                 |
| J3  | 检索精修：chunk 排除生效             | `j3-chunk-tuning.e2e.test.ts`                                                           | exclude 后排除标志生效（硬）；include 恢复（软）。通过 chunk list 回读 `is_displayed_chunk_content` 标志 |
| J4  | 服务调优：草稿→修改→发布             | `j4-service-tuning.e2e.test.ts`                                                         | beta 草稿可用、update 落库、发布后正式版详情携带修改且可用（硬）                                         |
| J5  | 数据面治理：collection/category/file | `j5-data-plane.e2e.test.ts`                                                             | 自建类目内文件可见/可删，类目删后消失（硬）                                                              |
| J6  | 退场清理：删库验证消失               | 复用 [`../knowledge-kb-delete.e2e.test.ts`](../knowledge-kb-delete.e2e.test.ts) live 链 | delete 后 list 不再包含（硬）                                                                            |

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

测试初始化会读取根目录 `.env` 并覆盖同名进程环境变量。离线回归前须在 `.env` 中设置 `BAILIAN_E2E=0`；不要只依赖命令前缀中的环境变量。

## RAG 音视频验收（独立开启）

`rag-media.e2e.test.ts` 默认 skip。通用真实测试开关不足以开启此用例；普通 CI 保持 `BAILIAN_E2E_RAG_MEDIA_WRITE=0`。仓库仅提交脱敏 JSON/SSE，不存视频，也不使用 Git LFS 存放 2 GiB 样本。大小、49/50/51 数量、parser 分支和输出模式均离线验证。

另行安排一次真实验收时，配置普通知识库鉴权与 workspace，并显式设置：

| 变量                                  | 内容                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `BAILIAN_E2E_RAG_MEDIA_WRITE`         | `1`                                                      |
| `BAILIAN_E2E_RAG_MEDIA_FILE`          | 外部本地样本绝对路径，非空、≤5 MiB、≤10 秒               |
| `BAILIAN_E2E_RAG_MEDIA_RUN_ID`        | 本次验收唯一标识；重试保持同一值                         |
| `BAILIAN_E2E_RAG_MEDIA_PATH`          | `upload` 或 `existing-file`，单次只选一种                |
| `BAILIAN_E2E_RAG_MEDIA_COLLECTION_ID` | existing-file 路径的专用测试 collection                  |
| `BAILIAN_E2E_RAG_MEDIA_INDEX_ID`      | existing-file 路径的专用媒体库，名称须以 e2e-media- 开头 |
| `BAILIAN_E2E_RAG_MEDIA_EMBEDDING`     | 可选，显式媒体建库模型                                   |
| `BAILIAN_E2E_RAG_MEDIA_QUERY`         | 可选，与短样本内容对应的查询                             |

入口要求本机已有 `ffprobe`，无法读取时长或超限会在上传前失败，不自动下载工具或样本。existing-file 路径从分类/文件列表发现文件并校验大小、MD5；源文件及预置知识库不删除。业务知识库不可作为写入目标。

```sh
pnpm exec vp test packages/commands/tests/e2e/knowledge/journeys/rag-media.e2e.test.ts
```

同一 workspace 使用本机跨进程目录锁，整个运行串行。CI 若另行启用，须再配置按 workspace 的全局 concurrency group，禁止不同 runner 并行运行。解析额度在发送写请求前通过排他文件登记，超时也计为消耗；重复 RUN_ID 拒绝重新接入，不能改 ID 来自动重试。

锁及额度位于系统临时目录 `bailian-rag-media-tests` 下，以 workspace/run ID 哈希区分；保留原运行记录，在清理系统临时目录前归档。中断后不要自动抢锁或删除额度，应先查原 ingestionId 的状态。一次解析结果共享给 status/details/file/chunk/search/chat，检索与问答各一次；不会为不同输出模式重新解析。

仅回收本次拥有且满足终态条件的资源；失败/不确定状态保留 IDs 和 resources.json，供续查。缺少专用开关记为 skip；没有真实运行不能声称线上链路通过。2 GiB 真传不作为常规验收。

问答离线 PTY 测试在 macOS/Linux 使用系统 Python 3 创建终端；Windows 跳过该代表性 PTY 用例，其余模式合同仍离线覆盖。
