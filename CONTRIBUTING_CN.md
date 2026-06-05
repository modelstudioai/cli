# 参与贡献 bailian-cli

`bailian-cli` 是阿里云百炼(DashScope)的官方 CLI。本文是面向**开发者**的指南;终端用户请看 [README_CN.md](README_CN.md)。

[English](CONTRIBUTING.md) · [README](README_CN.md) · [更新日志](CHANGELOG_CN.md)

## 环境要求

- Node.js ≥ 22.12
- pnpm 10.33.2(`npm i -g pnpm@10.33.2`)
- 跑 e2e 需要一个百炼 API Key

## 仓库结构

```
bailian-cli/
├── packages/
│   ├── cli/              # `bailian-cli` —— CLI 入口、命令、UI
│   └── core/             # `bailian-cli-core` —— 鉴权、HTTP、类型
├── docs/agents/          # 场景化维护文档
├── tools/                # 发版自动化与命令手册生成
├── AGENTS.md             # AI agent 维护契约
└── README.md
```

## 本地搭建

```bash
git clone https://github.com/modelstudioai/cli.git bailian-cli
cd bailian-cli
pnpm install
```

### 从源码运行 CLI

开两个终端:

```bash
# 终端 1 —— core watch 重建
pnpm dev

# 终端 2 —— 跑任意 bl 命令
pnpm bl auth login --api-key sk-xxxxx
pnpm bl text chat --message "你好"
pnpm bl video generate --prompt "一只走路的猫"
```

## 常用脚本

| 命令             | 作用                                     |
| ---------------- | ---------------------------------------- |
| `pnpm bl <args>` | 从源码运行 CLI                           |
| `pnpm dev`       | watch-build `bailian-cli-core`           |
| `pnpm check`     | format + lint + 类型检查                 |
| `pnpm test`      | 单测 + e2e(e2e 需要 `DASHSCOPE_API_KEY`) |
| `pnpm ready`     | 提 PR 前的完整自检                       |

## AI Native 工程化

我们把 AI agent 当作一等公民的维护者。下面三套基建让这件事能跑起来,无论你是人类贡献者还是 AI agent,都值得了解一下:

- **[AGENTS.md](AGENTS.md) + [docs/agents/](docs/agents/)** —— 本仓库的维护契约。`AGENTS.md` 给出项目地图和场景索引;每份 `docs/agents/<场景>.md` 把高频任务(加命令、改 flag、加模型、改错误提示……)拆成一份可端到端执行的清单,不需要事先摸索全仓库。新场景随真实工作沉淀回来——这份文档随项目生长,不是一次性的设计产物。

- **E2E 测试体系** —— [packages/cli/tests/e2e/](packages/cli/tests/e2e/) 下的用例覆盖文本 / 图像 / 视频 / 语音 / 理解 / 知识库 / 记忆库的主链路,黑盒方式打真实的 DashScope 服务。任何人或 agent 改了行为,会以真实用户感知到的方式被兜住。

- **主链路压测**(`pnpm test:stress`)—— 对所有模型能力做并发压测,验证它们在大量请求下仍然稳定;同时捕捉单次 e2e 抓不到的限流边界、竞态、静默回归。每次发版前跑。

**如果你是在本仓库上工作的 AI agent,先读 [AGENTS.md](AGENTS.md)** —— 它是会把你引到正确场景文档的入口。

## 分支与 PR

- 从 `main` 拉分支。命名:`feat/<short-name>`、`fix/<short-name>`、`docs/<short-name>`。
- 提 PR 前先跑 `pnpm check`。
- 一个 PR 只解决一类问题。
- 提交信息祈使句、带 scope。例:`feat(image): add --negative-prompt`、`fix(auth): handle expired console token`。
- 功能 PR 不要去动 `packages/*/package.json` 的版本号。

## 反馈问题

Bug 和需求都走 https://github.com/modelstudioai/cli/issues。如果是 bug,请包含:

- CLI 版本(`bl --version`)
- Node 版本(`node --version`)
- 触发问题的完整命令
- 完整输出(请脱敏 API Key)

## License

提交贡献即表示你同意以 [Apache License 2.0](LICENSE) 协议授权。
