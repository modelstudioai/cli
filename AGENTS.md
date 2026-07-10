# bailian-cli — AI 维护指南

本文件是 AI agent 维护本仓库时的契约。每次进入项目先读这里,从"业务场景索引"挑一条,再进入对应 `docs/agents/*.md` 清单。

## 项目地图

monorepo 现在按"纯逻辑 → 运行时框架 → 命令库 → 产品入口"分层:

- `packages/core` — `bailian-cli-core`,纯逻辑层:鉴权、配置、HTTP client、错误、类型、文件工具
- `packages/runtime` — `bailian-cli-runtime`,通用 CLI 运行时:`createCli`、参数解析、registry/help、middleware、error handler、输出、pipeline
- `packages/commands` — `bailian-cli-commands`,可复用命令实现库,只导出 command,不决定产品路径
- `packages/cli` — `bailian-cli`,完整 `bl` 产品入口;`src/commands.ts` 组装 `bl` 暴露的命令路径
- `packages/kscli` — `knowledge-studio-cli`,Knowledge Studio 专用入口;`src/main.ts` 复用 commands 并重映射为 `kscli` 路径

### 关键文件

```
packages/cli/src/main.ts          # bl 入口,注入 binName/version/clientName/npmPackage
packages/cli/src/commands.ts      # bl 产品命令 map,tools/generate-reference.ts 也读它
packages/kscli/src/main.ts        # kscli 入口和命令 map

packages/commands/src/index.ts    # re-export 单个命令实现
packages/commands/src/commands/   # defineCommand({ auth, flags, usageArgs, exampleArgs, run })

packages/runtime/src/create-cli.ts # createCli(commands, identity)
packages/runtime/src/registry.ts   # 命令树解析 + 动态 help
packages/runtime/src/middleware.ts # auth / telemetry / update / run command
packages/runtime/src/urls.ts       # 用户面控制台 URL

packages/core/src/types/command.ts # Command / flags / auth 类型
packages/core/src/config/          # ConfigFile / Settings / source 解析
packages/core/src/auth/            # apiKey / console credential 解析与落盘
packages/core/src/client/          # HTTP client / endpoints / console gateway
```

Skill / 命令手册随 `skills/bailian-cli/` 经 `npx skills add modelstudioai/cli` 安装。`tools/generate-reference.ts` 从 **`packages/cli/src/commands.ts`** 生成 `skills/bailian-cli/reference/`(纳入 git);`tools/sync-skill-metadata.ts` 从 `packages/cli/package.json` 同步 `skills/bailian-cli/SKILL.md` 的 `metadata.version`。两者由根脚本 `pnpm run sync:skill-assets` 和 `.vite-hooks/pre-commit` 执行。

约定:

- 命令实现文件路径仍按能力放置:`packages/commands/src/commands/text/chat.ts`
- 产品命令路径由入口 map 决定:同一个实现可暴露为 `bl knowledge retrieve` 或 `kscli retrieve`
- `defineCommand` 只写命令元数据与逻辑: `auth`、`flags`、`usageArgs`、`exampleArgs`、`validate`、`run`
- `usageArgs` / `exampleArgs` 不写 `bl` 或 `kscli` 前缀;runtime / reference 生成器按产品路径补前缀
- 不再使用 `catalog.ts` 作为登记处;新增/重命名命令必须同时看命令库导出和产品入口 map

非代码资产:

- `tools/release/` — 发版自动化（CI 驱动,见 `.github/workflows/publish.yml`）
- `tools/generate-reference.ts` — 从 `packages/cli/src/commands.ts` 生成 `skills/bailian-cli/reference/`
- `tools/sync-skill-metadata.ts` — 同步 `skills/bailian-cli/SKILL.md` 的 `metadata.version`
- `README.md` / `README.zh.md` — npm 和 GitHub 主页

## 业务场景索引

按当前任务从下表挑一条进入对应文档:

| 场景           | 何时进入                                     | 详见                                                                     |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 命令增删改     | 增加 / 删除 / 重命名 `bl xxx` 或入口命令路径 | [docs/agents/command-add-remove.md](docs/agents/command-add-remove.md)   |
| E2E 测试维护   | 新增/改命令或 e2e 用例、补 help/缺参/dry-run | [docs/agents/cli-e2e-tests.md](docs/agents/cli-e2e-tests.md)             |
| 批量压测       | 改/跑多能力并发压测、`test:stress`、fixtures | [docs/agents/stress-batch-tests.md](docs/agents/stress-batch-tests.md)   |
| 选项变更       | 给已有命令加 `--flag` 或改默认值             | [docs/agents/command-flag-change.md](docs/agents/command-flag-change.md) |
| 模型上下架     | 增加新模型 / 改默认模型 / 废弃旧模型         | [docs/agents/model-add-remove.md](docs/agents/model-add-remove.md)       |
| 错误文案变更   | 改 `BailianError` 的 message 或 hint         | [docs/agents/error-hint-change.md](docs/agents/error-hint-change.md)     |
| URL / 渠道变更 | 控制台域名 / 文档站 / 追踪参数               | [docs/agents/url-change.md](docs/agents/url-change.md)                   |
| 鉴权扩展       | 加 OAuth / SSO / 换 token 来源               | [docs/agents/auth-change.md](docs/agents/auth-change.md)                 |
| 配置项扩展     | 新 env var 或 `~/.bailian/config.json` 字段  | [docs/agents/config-add.md](docs/agents/config-add.md)                   |
| 发布           | channel / stable 发布到 npm（CI 驱动）       | [docs/agents/publish.md](docs/agents/publish.md)                         |
| Change Log     | 发版说明 / 历史版本说明                      | [docs/agents/changelog-write.md](docs/agents/changelog-write.md)         |
| 工具链调整     | lint 规则 / 构建配置 / 依赖升级              | [docs/agents/lint-toolchain.md](docs/agents/lint-toolchain.md)           |

如果当前任务无法对应任何场景,先按经验完成,然后**回来评估这是不是一类新场景** —— 是就新增 `docs/agents/<scenario>.md`,把清单沉淀下来。

## 通用约定

### 1. 发布包版本号同步

源码包的 `version` 当前保持一致: `packages/core`、`packages/runtime`、`packages/commands`、`packages/cli`、`packages/kscli`。做版本 bump 时一动多动。release 工具当前强校验 / 发布范围以 `tools/release/lib/packages.mjs` 为准;把新包纳入发布前必须同步该清单和 [publish.md](docs/agents/publish.md)。

### 2. 分层边界

- `core` 是纯库:不依赖 `runtime` / `commands` / 产品入口;不调 `process.exit`;新增/改动时不硬编码 `bl` / `kscli` 命令名、控制台 URL 或渠道追踪参数。当前遗留项见 [error-hint-change.md](docs/agents/error-hint-change.md) 与 [url-change.md](docs/agents/url-change.md),触碰相关代码时顺手收敛
- `runtime` 是通用 CLI 框架:可以处理 TTY、help、错误输出、middleware,但不写具体业务命令逻辑
- `commands` 是命令实现库:不决定产品路径;不在 `usageArgs` / `exampleArgs` / hint 里硬编码产品 bin 前缀
- `cli` / `kscli` 是产品层:负责命令路径 map、产品 identity、README、技能 reference、发版入口
- URL 集中在 `packages/runtime/src/urls.ts`(用户面控制台)和 `packages/core/src/config/schema.ts` / client 层(API)

### 3. 错误处理边界:CLI 不翻译服务端错误

CLI 只为「自己能权威解释的错误」发出语义化信号,服务端的错误**原样透传**。详见 [docs/agents/error-hint-change.md](docs/agents/error-hint-change.md)。

| 错误来源                                             | 归类     | 处理方式                                                    |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 命令解析、缺 flag、参数校验                          | **内部** | `BailianError(USAGE)`                                       |
| 文件 I/O(ENOENT/EACCES/...)                          | **内部** | `BailianError(GENERAL)` + errno-specific hint               |
| 本地 credentials 缺失(resolver / auth stage 等)      | **内部** | `BailianError(AUTH)`                                        |
| `fetch` 自身失败(DNS/TCP/TLS/proxy)                  | **内部** | `BailianError(NETWORK)` + 读 `err.cause.code` 给 errno-hint |
| polling 客户端超时                                   | **内部** | `BailianError(TIMEOUT)`                                     |
| HTTP 4xx/5xx、HTTP 200 + 业务错码、async task FAILED | **服务** | `BailianError(GENERAL)`,**message 原样透传**,不分类、不替换 |

不要扮演服务端错误的翻译官——我们没有最新的错误码体系认知,二次包装只会撒谎。

### 4. Console Gateway 命令必须声明鉴权域

如果命令调用 Console Gateway,`defineCommand` 必须设置 `auth: "console"`。runtime 会基于 `CONSOLE_AUTH_FLAGS` 自动在 help 中展示 `--console-region`、`--console-site`、`--console-switch-agent`、`--workspace-id`,并由 `authStage` 解析/注入 console credential。命令不要重复声明这些凭证域 flag,也不要手动从 env/config 解析 token。

## 完成改动后的快速验证

```sh
vp check    # format + lint + type check
vp test     # unit + e2e (真实集成需 API key / console token)
```

## 这份指南本身怎么演化

这套文档不是写完就死,**随真实工作沉淀**。完成每次改动后回看:这次发现的漏点该不该补?是不是一类新场景?

新增场景 / 改主入口 / 跨文档引用规则 → [docs/agents/maintaining-agent-docs.md](docs/agents/maintaining-agent-docs.md)
