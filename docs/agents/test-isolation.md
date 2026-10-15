# 测试隔离

## 触发条件

- 新增/修改会读 `~/.bailian`、`$HOME`、Agent 配置目录或 help 文案语言的单测 / E2E
- 修「本机绿、CI 红」或反过来、且怀疑是本地配置/语言/系统目录泄漏
- 调整 `packages/e2e` runner、skills/agent 探测、`BAILIAN_CONFIG_DIR` 相关测试基建

## 概念图

```
宿主机器
  ~/.bailian (language/output/凭证)
  /etc/codex、/Applications/…（系统级 Agent 探测）
  $CODEX_HOME 等覆盖变量
        │
        ▼
  e2e/isolation（统一入口）
        ├─ 进程内：withIsolatedHome / enterIsolatedHome
        └─ 子进程：runNodeMain → buildIsolatedCliEnv
              │
              ├─ 调用方 HOME，否则临时 HOME；XDG 始终改写到该 HOME
              ├─ 未传 BAILIAN_CONFIG_DIR：空 HOME 写 $HOME/.bailian；已有 config 则用自有临时目录（不覆盖）
              ├─ overrides 的 undefined / 隔离关键键空串忽略，不能拆掉隔离
              ├─ DashScope / OpenAPI 凭证继续走环境变量
              ├─ Console access_token 仅 seedCredentials: true 时拷贝
              ├─ 清空 AGENT_ENV_KEYS（含 OPENCLAW / ZCODE / LOCALAPPDATA）
              ├─ BL_SKIP_HOST_AGENTS=1
              └─ runNodeMain 结束时删除自己创建的临时目录

  Session 父目录（仅扫尾归堆，不承载隔离语义）：
  globalSetup createIsolationSessionRoot → provide → setupFiles 写 BL_ISO_ROOT
  → 临时子目录挂其下；无 BL_ISO_ROOT 时落 os.tmpdir()
  → teardown 只删闭包里的 root（无进程 ownership / 信号清理）
```

## 必查清单

### A. 选用哪一层隔离

- [ ] **core 进程内单测**（skills / advisor）：`import { withIsolatedHome } from "./helpers/isolation.ts"`（core 不依赖 e2e，避免环）
- [ ] **commands / runtime 进程内单测**（agent writer 等）：`import { withIsolatedHome, enterIsolatedHome } from "e2e/isolation"`
- [ ] 禁止本地再写 `inFakeHome` / 直接 `process.env.HOME =`
- [ ] **CLI 子进程 E2E**：走 `runCommandE2e` / `runCli` / `runKscli` → 底层 `runNodeMain` **默认已隔离**；用例只需在需要时传自己的 `BAILIAN_CONFIG_DIR` / `HOME`
- [ ] 只传 `HOME` 且该 HOME 下**已有** `config.json` 时，基建**不会覆盖**，改用自有临时 `BAILIAN_CONFIG_DIR`；空 HOME 才写 `$HOME/.bailian`
- [ ] 隔离关键键的 `undefined` / 空串会被忽略，不能拆掉隔离；其它键传 `undefined` 会删除继承凭证（如 `DASHSCOPE_API_KEY: undefined`）
- [ ] **必须继承真实用户配置**的极少数用例：`runNodeMain(..., { isolate: false })`，并在注释里写明原因

### B. 系统目录与 Agent 探测

- [ ] 依赖 `detectInstalledAgents` 的断言必须在隔离环境下跑（`BL_SKIP_HOST_AGENTS=1`）
- [ ] 新增落在 HOME / `XDG_CONFIG_HOME` 之外的绝对 detectDirs（含 `/etc`、`/Applications` 和 cwd 项目目录）时，确认 `isHostSystemDetectDir` 仍判为主机路径；并补一条「隔离开关打开时不被探测」的测试。不要把判断收窄成只认 `/etc` 和 `/Applications`
- [ ] 新增官方路径覆盖变量时，同步加入 `AGENT_ENV_KEYS`（含 MCP 的 `OPENCLAW_CONFIG_PATH` / `ZCODE_HOME`）
- [ ] inventory / mcp-agent-config 等「显式收 home、但仍读 process.env」的单测，用 `enterIsolatedHome` 或清空 `AGENT_ENV_KEYS`

### C. 语言 / 输出格式断言

- [ ] help / 文案断言默认按 **en-US** 写（隔离 config 已强制）；若测中文，显式构造带 `language: "zh-CN"` 的临时 config
- [ ] 解析 stdout 的 dry-run 用例：要么显式 `--output json`，要么依赖命令默认 JSON，**不要**依赖用户 `config.output`
- [ ] 禁止用本机 `~/.bailian` 的 language/output 作为隐式测试输入

### D. 文档

- [ ] 改隔离约定时同步更新本文与 [cli-e2e-tests.md](cli-e2e-tests.md) 的安全/隔离段落
- [ ] 复现本机污染：保留 `/etc/codex` 或 `language: zh-CN` 配置，确认相关用例仍绿

## 完成后自查

```sh
pnpm --filter e2e exec vp test tests/isolation.test.ts
pnpm --filter bailian-cli-core exec vp test tests/skills-agents.test.ts tests/advisor-sync.test.ts
pnpm --filter bailian-cli-commands exec vp test tests/e2e/managed-agent.e2e.test.ts tests/e2e/permission.e2e.test.ts
```

## 常见漏点

- 只改 `HOME`、忘了清 `CODEX_HOME` / `CLAUDE_CONFIG_DIR` / `OPENCLAW_CONFIG_PATH` / `ZCODE_HOME` / `XDG_CONFIG_HOME` / `LOCALAPPDATA` → 探测或写入仍指向开发机
- 只清 env、忘了系统路径 `/etc/codex` 或 cwd 下的项目目录 → 仍探测到本机 Agent
- 对调用方已有 `HOME/.bailian/config.json` 无条件 `writeFileSync` → 冲掉用户配置；应改用基建自有临时 config 目录
- 隔离关键键 `HOME: undefined` → 须忽略，否则 spawn 丢掉键后回退真实 home
- 非关键键 `DASHSCOPE_API_KEY: undefined` → 须删除该键；若 sanitize 一律丢弃 undefined，则「无需凭证」用例会带着父进程 Key 假绿
- E2E 子进程继承 `process.env` + 真实 `~/.bailian` → help 变成中文、output 偏好干扰 JSON 解析
- 各包各自写 `inFakeHome`，清单不一致 → 用 `e2e/isolation` 统一
- live console e2e 需要 `access_token`：调用 `runConsoleCommandE2e` / `runConsoleCli`，或给 `runNodeMain` 传 `seedCredentials: true`。默认不拷贝 `api_key` 和 AK/SK；不要为了带上 token 使用 `isolate: false`
