# Asset Center 命令测试报告 — Phase 2

- **测试时间**: 2026-07-10 09:07:09 (UTC)
- **Workspace**: `llm-0xvms4kqhbqjlg8s`
- **测试 IMAGE**: `asset_98175cbf83294f7b8ada86657623dcf3`
- **测试 VIDEO**: `asset_df026105d2274ff9b8c824058fa23d60`
- **策略**: 可逆写操作（favorite/unfavorite 往返）；download 到 /tmp 后删除；其余只读
- **汇总**: 16 通过 / 0 失败 / 16 总计

> Phase 1 报告见同目录 [TEST-REPORT.md](./TEST-REPORT.md)（24 项 dry-run + 只读基础验证）

## Phase 2 测试结果

| #   | 分类 | 命令                                       | 模式     | 状态    | Exit | 耗时    | 结果摘要                                                                                                 |
| --- | ---- | ------------------------------------------ | -------- | ------- | ---- | ------- | -------------------------------------------------------------------------------------------------------- |
| 1   | 下载 | `asset-center download (IMAGE)`            | 真实调用 | ✅ PASS | 0    | 20045ms | saved /tmp/asset-center-test-asset_98175cbf83294f7b8ada86657623dcf3.png (1449847 bytes, reported 1.4 MB) |
| 2   | 查询 | `asset-center get --include-download-url`  | 真实调用 | ✅ PASS | 0    | 21226ms | download_url present                                                                                     |
| 3   | 查询 | `asset-center list --include-download-url` | 真实调用 | ✅ PASS | 0    | 19057ms | items contain download_url                                                                               |
| 4   | 查询 | `asset-center list --next-token`           | 真实调用 | ✅ PASS | 0    | 19584ms | page2=3 items, overlap=0, has_pre=true                                                                   |
| 5   | 统计 | `asset-center stats --type IMAGE`          | 真实调用 | ✅ PASS | 0    | 18830ms | image=7, total=7                                                                                         |
| 6   | 统计 | `asset-center stats --sync-failed`         | 真实调用 | ✅ PASS | 0    | 19084ms | total=27, sync_failed=0                                                                                  |
| 7   | 查询 | `asset-center list --recycle-bin`          | 真实调用 | ✅ PASS | 0    | 19314ms | 0 soft-deleted item(s)                                                                                   |
| 8   | 输出 | `asset-center list (text)`                 | 真实调用 | ✅ PASS | 0    | 17840ms | 4 lines table output                                                                                     |
| 9   | 收藏 | `asset-center favorite (真实)`             | 真实调用 | ✅ PASS | 0    | 22082ms | affected=1                                                                                               |
| 10  | 收藏 | `get 验证 favorited=true`                  | 真实调用 | ✅ PASS | 0    | 18865ms | favorited=true ✓                                                                                         |
| 11  | 查询 | `list --favorited 含测试资产`              | 真实调用 | ✅ PASS | 0    | 22120ms | found in favorited list                                                                                  |
| 12  | 收藏 | `asset-center unfavorite (真实)`           | 真实调用 | ✅ PASS | 0    | 22133ms | affected=1                                                                                               |
| 13  | 收藏 | `get 验证 favorited=false (恢复)`          | 真实调用 | ✅ PASS | 0    | 27797ms | favorited=false ✓                                                                                        |
| 14  | 收藏 | `favorite 批量 (--id x2)`                  | 真实调用 | ✅ PASS | 0    | 22947ms | affected=2                                                                                               |
| 15  | 收藏 | `unfavorite 批量 (--id x2)`                | 真实调用 | ✅ PASS | 0    | 15385ms | affected=2                                                                                               |
| 16  | 边界 | `get 不存在的 asset-id`                    | 真实调用 | ✅ PASS | 1    | 12207ms | exit 1, 服务端错误原样透传: "资产不存在"                                                                 |

## 边界行为说明

查询不存在的 `asset-id` 时，服务端返回业务错误 **「资产不存在」**，CLI 按约定 **原样透传**（exit code 1），不会替换为本地文案。这与 AGENTS.md 错误处理边界一致。
