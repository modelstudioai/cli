# bailian-kb-dsh

阿里云百炼知识库能力的 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件 bundle：三个 API 直连模型工具（`kb_service_list` / `kb_search` / `kb_chat`）+ kscli 管理面 skill。

设计文档：[docs/specs/2026-08-15-bailian-kb-bundle-design.md](docs/specs/2026-08-15-bailian-kb-bundle-design.md) · 实现计划：[docs/plans/2026-08-15-bailian-kb-bundle.md](docs/plans/2026-08-15-bailian-kb-bundle.md)

## 仓库结构

| 包 | 职责 |
|---|---|
| [`packages/tool-bailian-kb`](packages/tool-bailian-kb/README.md) | 插件本体：Config、KbClient、三个工具、随包打包的管理 skill |
| [`packages/bundle`](packages/bundle/README.md) | 分发面：`dsh.bundle` 声明 + `cordis.patch.yml` |

## 安装（dsh 用户）

```sh
dsh plugin --profile web add bailian-kb-dsh   # npm 发布后；本地开发用绝对/相对路径
```

安装后 CLI 自动把 bundle 加入 profile 的层栈，无需手改 YAML。

配置写入 `~/.dsh/.env`：

```sh
BAILIAN_WORKSPACE_ID=ws-xxx        # 必填：百炼工作空间 id
DASHSCOPE_API_KEY=sk-xxx           # 必填：也可放 ~/.dsh/.credentials.yaml
```

验证：`dsh --profile web --dump-config` 应能看到 `tool-bailian-kb` row。缺 `BAILIAN_WORKSPACE_ID` 时加载期直接报错（fail loud），不会静默跳过。

卸载：`dsh plugin --profile web remove bailian-kb-dsh`。

## 开发

依赖 dsh 的运行时包（`@deepseek-ai/dsh-tools` 等）以 peerDependencies 声明、由 dsh 安装闭包在运行时提供；开发期通过 `link:` 指向同级的 `../deepseek-harness` checkout（npm registry 尚未发布完整 dsh 闭包）。

```sh
pnpm install
pnpm run test        # vitest 单元测试
pnpm run typecheck
pnpm run build       # tsc 产出 lib/
```

本地联调：`link:` 安装不会把被链接包的依赖装进 profile，需要把 bundle 和插件包**都** add 进去（插件包会报 "declares no dsh.bundle — installed as a plain dependency" 警告，符合预期）；npm 正式安装无此问题：

```sh
dsh plugin --profile dev add <本仓库>/packages/bundle
dsh plugin --profile dev add <本仓库>/packages/tool-bailian-kb   # 仅 link 联调需要
```

patch 文件受 HMR 监听。

## Known Limitations

- **无 keyless snapshot / e2e 基建**：首版以单元测试 + 手动集成验收覆盖；snapshot/e2e 依赖 dsh snapshot harness 对 out-of-tree bundle 的支持情况，v0.2 跟进。
- **kb_chat 执行期无进展显示**：服务端是分钟级 agentic loop，UI 只有 pending → 完成两态；进展会话事件 + Web 渲染器的设计见 spec 附录 A，等真实使用反馈再排期。
- **服务清单单 scene 上限 100 条**：超出部分靠 `name_filter` 收窄（结果带 truncated 提示）。
