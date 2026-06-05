# bailian-cli — AI 维护指南

本文件是 AI agent 维护本仓库时的契约。每次进入项目首先读这里,从下方"业务场景索引"挑一条,跳到对应的详细文档,按它的清单完成改动。

## 项目地图

monorepo 双包结构:

- `packages/cli` — `bailian-cli` 包,CLI 命令、UI、入口
- `packages/core` — `bailian-cli-core` 包,鉴权 / HTTP / 类型,纯逻辑层

### `packages/cli` 目录要点

```
packages/cli/
├── src/
│   ├── main.ts              # 入口、鉴权分支、调用 registry
│   ├── registry.ts          # 命令树解析、动态 help(读 catalog)
│   ├── commands/
│   │   ├── catalog.ts       # 命令总表(登记处,构建脚本也读它)
│   │   ├── index.ts         # re-export commands
│   │   └── <group>/...ts    # 各命令 defineCommand 实现
│   ├── output/              # CLI 输出、prompt、progress
│   └── urls.ts              # 控制台/文档 URL(仅 cli)
└── tests/e2e/
```

Skill / 命令手册不再随 npm 包发布,改由独立的 `npx add skills` 机制安装。`tools/generate-reference.ts` 仍然从 `catalog.ts` 生成命令手册到 `tools/generated/reference/`(gitignore,临时),等新机制接入后再迁走。

非代码资产:

- `tools/release/` — 发版自动化（CI 驱动，见 `.github/workflows/publish.yml`）
- `tools/generate-reference.ts` — 从 `catalog.ts` 生成命令手册(临时输出到 `tools/generated/reference/`)
- `README.md` / `README_CN.md` — npm 和 GitHub 主页

约定:

- core 是纯库,不依赖 cli(详见下方通用约定)
- 文件路径与命令路径一一对应:`commands/text/chat.ts` ↔ `bl text chat`
- 单级命令:`commands/<name>.ts`(如 `update.ts`);两级:`commands/<group>/<action>.ts`
- 命令登记在 **`catalog.ts`**;`bl --help` 与 `tools/generate-reference.ts` 生成的命令手册同源,见 [command-add-remove.md](docs/agents/command-add-remove.md)

## 业务场景索引

按当前任务从下表挑一条进入对应文档:

| 场景           | 何时进入                                     | 详见                                                                     |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 命令增删改     | 增加 / 删除 / 重命名 `bl xxx`                | [docs/agents/command-add-remove.md](docs/agents/command-add-remove.md)   |
| E2E 测试维护   | 新增/改命令或 e2e 用例、补 help/缺参/dry-run | [docs/agents/cli-e2e-tests.md](docs/agents/cli-e2e-tests.md)             |
| 批量压测       | 改/跑多能力并发压测、`test:stress`、fixtures | [docs/agents/stress-batch-tests.md](docs/agents/stress-batch-tests.md)   |
| 选项变更       | 给已有命令加 `--flag` 或改默认值             | [docs/agents/command-flag-change.md](docs/agents/command-flag-change.md) |
| 模型上下架     | 增加新模型 / 改默认模型 / 废弃旧模型         | [docs/agents/model-add-remove.md](docs/agents/model-add-remove.md)       |
| 错误文案变更   | 改 `BailianError` 的 message 或 hint         | [docs/agents/error-hint-change.md](docs/agents/error-hint-change.md)     |
| URL / 渠道变更 | 控制台域名 / 文档站 / 追踪参数               | [docs/agents/url-change.md](docs/agents/url-change.md)                   |
| 鉴权扩展       | 加 OAuth / SSO / 换 token 来源               | [docs/agents/auth-change.md](docs/agents/auth-change.md)                 |
| 配置项扩展     | 新 env var 或 `~/.bailian/config.json` 字段  | [docs/agents/config-add.md](docs/agents/config-add.md)                   |
| 发布           | channel / stable 发布到 npm（CI 驱动）       | [docs/agents/publish.md](docs/agents/publish.md)                         |
| 工具链调整     | lint 规则 / 构建配置 / 依赖升级              | [docs/agents/lint-toolchain.md](docs/agents/lint-toolchain.md)           |

如果当前任务无法对应任何场景,先按经验完成,然后**回来评估这是不是一类新场景** —— 是就新增一份 `docs/agents/<scenario>.md`,把清单沉淀下来。

## 通用约定

下面两条与场景无关,任何改动都适用。每次完成改动后自查。

### 1. cli 和 core 版本号同步

`packages/cli/package.json` 和 `packages/core/package.json` 的 `version` 字段必须始终相等。一动两动。

### 2. core 是纯库,cli 是 core 的 UI 层

core 不应该知道 cli 的存在。具体表现:

- core 不写 stderr,不调 `process.exit`(用 `console.*` 或 `throw`)
- core 抛的 `BailianError`,hint 字符串不出现 `bl xxx` 命令名
- core 不写死域名 / region / 追踪参数(URL 集中在 `packages/cli/src/urls.ts`)
- core 接收 cli 通过 `Config` 注入的 metadata(`clientName` / `clientVersion`)

### 3. 错误处理边界:CLI 不翻译服务端错误

CLI 只为「自己能权威解释的错误」发出语义化信号,服务端的错误**原样透传**。详见 [docs/agents/error-hint-change.md](docs/agents/error-hint-change.md)。

| 错误来源                                             | 归类     | 处理方式                                                    |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 命令解析、缺 flag、参数校验                          | **内部** | `BailianError(USAGE)`                                       |
| 文件 I/O(ENOENT/EACCES/...)                          | **内部** | `BailianError(GENERAL)` + errno-specific hint               |
| 本地 credentials 缺失(resolver/ensure-key/AK-SK 等)  | **内部** | `BailianError(AUTH)`                                        |
| `fetch` 自身失败(DNS/TCP/TLS/proxy)                  | **内部** | `BailianError(NETWORK)` + 读 `err.cause.code` 给 errno-hint |
| polling 客户端超时                                   | **内部** | `BailianError(TIMEOUT)`                                     |
| HTTP 4xx/5xx、HTTP 200 + 业务错码、async task FAILED | **服务** | `BailianError(GENERAL)`,**message 原样透传**,不分类、不替换 |

不要扮演服务端错误的翻译官——我们没有最新的错误码体系认知,二次包装只会撒谎(详见 `docs/agents/error-hint-change.md` 中的反面 case)。

## 完成改动后的快速验证

```sh
vp check    # format + lint + type check
vp test     # unit + e2e (e2e 需 API key)
```

## 这份指南本身怎么演化

这套文档不是写完就死,**随真实工作沉淀**。完成每次改动后回看:这次发现的漏点该不该补?是不是一类新场景?

新增场景 / 改主入口 / 跨文档引用规则 → [docs/agents/maintaining-agent-docs.md](docs/agents/maintaining-agent-docs.md)
