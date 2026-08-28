# CLI E2E 测试规范

## 架构分层

| 层级            | 路径                                                  | 测什么                                                                                   |
| --------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **共享基建**    | `packages/e2e`                                        | gating、子进程 runner、output、globalSetup（`private`，不发布）                          |
| **命令 E2E**    | `packages/commands/tests/e2e`                         | help、缺参、dry-run、live（gated）；每用例最小路由                                       |
| **Journey E2E** | `packages/commands/tests/e2e/knowledge/journeys`      | 用户旅程全链路（跨命令回路 + 标记词召回闭环），全部 live gated；见 `journeys/README.md`  |
| **bl smoke**    | `packages/cli/tests/e2e/registry.smoke.e2e.test.ts`   | 产品 map 全部 path `--help`、分组 help、根 help                                          |
| **kscli smoke** | `packages/kscli/tests/e2e/registry.smoke.e2e.test.ts` | 从 `kscli/src/commands.ts` 推导 path/分组；identity（`--version`、`search --help` path） |
| **runtime**     | `packages/runtime/tests`                              | `proxy.e2e`、console 跨域 flag 拒绝                                                      |

**依赖边界**：`e2e` → `core`；`commands/tests` → `e2e` + `commands/src`；产品 tests → `e2e` + 各自 `src`。**禁止**产品 import `commands/tests/**`（子进程 spawn harness 路径除外）。

## 触发条件

- 新增/修改 `packages/commands/src/commands` 下的 command 实现
- 新增/修改 `packages/cli/src/commands.ts` 的 `bl` 命令路径 map
- 新建或扩展 `packages/commands/tests/e2e/<topic>.e2e.test.ts`
- 新增 bl 产品 path → `registry.smoke` 自动覆盖 leaf path；commands topic 测试在 `topic-routes.ts` 补最小路由

跑测与环境变量见 `.cursor/skills/bailian-cli-e2e/SKILL.md`。

> **规则**：共享 command 行为在 `commands/tests/e2e`；产品 map、identity、CLI-only 命令留在对应产品 `tests/e2e`。

## 文件与工具

### commands E2E

- 路径：`packages/commands/tests/e2e/<kebab-topic>.e2e.test.ts`；knowledge 领域集中在 `packages/commands/tests/e2e/knowledge/` 子目录（新增 knowledge 命令测试放这里）
- 子进程：`runCommandE2e(routes, args)` from `./helpers.ts`（spawn `harness/main.ts`，`routes` 为本 topic 最小 path → export 映射）
- fixtures：`packages/commands/tests/e2e/fixtures/`
- 路由常量：`topic-routes.ts`（按 topic 维护，**非**全量产品 map）

### 产品 smoke

- bl：`runCli` from `packages/cli/tests/e2e/helpers.ts`
- kscli：`runKscli` from `packages/kscli/tests/e2e/helpers.ts`

### 共享

- gating / output / runner：`e2e/gating`、`e2e/output`、`e2e/runner`
- globalSetup：根 `vite.config.ts` → `packages/e2e/src/global-setup.ts`
- 解析 JSON stdout：`parseStdoutJson`；输出目录：`makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url))`
- 长任务：`cliTimeoutPrefix()`；视频用例加 `test(..., 3_600_000)` 等显式超时

## 双层 describe（固定结构）

```ts
// 1) 不 skip：--help，无密钥、无真实 API（分组 help 由 bl registry.smoke 覆盖）
describe("e2e: <topic>", () => {
  test("<subcommand> --help 正常退出", ...);
});

// 2) skipIf：缺参 / dry-run / 真实集成
describe.skipIf(<ready>)("e2e: <topic>（DashScope …）", () => {
  test("缺少 --<flag> 时退出为用法错误 (2)", ...);
  test("<cmd> --dry-run ...", ...); // 若适用
  test("【model】真实流程", ..., LONG_TIMEOUT);
});
```

## skip 条件（`e2e/gating`，commands helpers re-export）

| 场景                    | 条件                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| 文本/搜索/记忆/配置     | `isDashScopeE2EReady()`                                                                                    |
| 图像/语音               | `isBailianE2EMediaEnabled() && isDashScopeE2EReady()`                                                      |
| 视频                    | `isBailianE2EVideoEnabled() && isDashScopeE2EReady()`                                                      |
| OpenAPI AK/SK           | `isOpenApiE2EReady()`（`.env` 中必须同时提供完整 AK/SK）                                                   |
| 视频 download/task      | 另需 `BAILIAN_E2E_VIDEO_TASK_ID`                                                                           |
| 知识库 chat/search live | `isChatE2EReady()` / `isSearchE2EReady()`（`knowledge chat/search`，需 `BAILIAN_WORKSPACE_ID` + agent ID） |

## 用例类型

1. **--help**：`runCommandE2e(ROUTES, [..., "--help"])` → stderr 含主要 flags
2. **缺参**：带无害全局 flag（如 `--quiet`）且不传 required flag → `exitCode === 2`
3. **--dry-run**：实现在联网/上传/写盘**之前**返回；断言 stdout JSON/文本
4. **真实集成**：放在 skip 块**末尾**

高风险命令额外要求：

- `--help` 展示 runtime 注入的 `--yes`
- 无 `--yes` 返回 exit code 7 和 JSON `type: "requires_confirmation"`
- `--dry-run` 无需 `--yes`，且必须证明在任何远端请求或本地写入之前返回
- runtime 的离线 high-risk fixture 必须覆盖带 `--yes` 确实进入 `run()`，并断言 `yes` 不进入 command 自有 flags

## Journey 层（用户旅程全链路）

- **定位**：命令 E2E 验单命令契约；journey 验“用户带着目标跨命令走通回路”，结构性断言不在 journey 重复
- **闭环断言**：fixture 埋独特标记词，以“标记词能否被召回”判定回路闭合；硬断言 fail，软断言 `recordSoft` 落报告人工复核
- **日志产物**：`createJourneyReporter` 在 `test/output/<session>/` 落盘 `journey-report.md`、分步 stdout/stderr、`resources.json`（未清理资源警示）
- **入口**：`pnpm run test:journey`；旅程清单与约定见 [journeys/README.md](../../packages/commands/tests/e2e/knowledge/journeys/README.md)
- **新增命令时**：评估是否属于某条旅程的环节，是则纳入对应 journey 并更新 README 映射表

## 增删命令同步

- **commands export** + **topic 路由**（`topic-routes.ts` 或测试文件内 `ROUTES`）+ **产品 map**（`cli/commands.ts` / `kscli/commands.ts`）
- 分组 help 由产品 `registry.smoke` 负责，无需在 commands 重复

## 安全与例外

- **禁止破坏真实用户配置**：`auth logout` 和 `config set` 默认只用 `--dry-run`；只有验证持久化契约时，才允许通过
  `BAILIAN_CONFIG_DIR` 指向每个用例独占的临时目录实际落盘，并必须在 `finally` 中清理；禁止写入或复用真实 `~/.bailian`
- **不加 dry-run**：`dryRun` 在 `resolveFileUrl` / `resolveCredential` / 上传**之后**的命令（如 `image edit`、`speech recognize` 带 `--url`）
- **`--list-voices` 等旁路**：先于 `--text` 校验的 flag，缺参用例勿带该 flag
- 新增 required option → 至少一条缺参用例；改 dry-run 输出 → 更新对应断言

## 新增 command 检查清单

- [ ] `packages/commands/src/index.ts` 导出 + `packages/cli/src/commands.ts` 暴露路径 + `topic-routes.ts` 补最小路由
- [ ] `packages/commands/tests/e2e/<topic>.e2e.test.ts`（新建或扩展）
- [ ] 若改了 `usageArgs` / `flags` / `exampleArgs`,跑 `pnpm --filter bailian-cli run generate:reference` 更新各 `skills/<skill>/reference/` 并提交
- [ ] 子命令 `--help`（分组 help 由 bl `registry.smoke` 覆盖）
- [ ] skip 块：每个 required flag 缺参；可 dry-run 则加一条
- [ ] 至少一条真实集成（或说明为何仅 smoke）；不破坏已有集成用例顺序
- [ ] `vp test packages/commands/tests/e2e/<file>` 通过

## 调试命令

```sh
pnpm --filter bailian-cli-commands exec vp test packages/commands/tests/e2e/text-chat.e2e.test.ts
pnpm --filter bailian-cli exec vp test packages/cli/tests/e2e/registry.smoke.e2e.test.ts
pnpm --filter knowledge-studio-cli exec vp test packages/kscli/tests/e2e/registry.smoke.e2e.test.ts
pnpm --filter bailian-cli-runtime exec vp test packages/runtime/tests/proxy.e2e.test.ts
```

## 示例片段

```ts
import { FOO_ROUTES } from "./topic-routes.ts";

test("foo bar 缺少 --prompt 时退出为用法错误 (2)", async () => {
  const { stderr, exitCode } = await runCommandE2e(FOO_ROUTES, ["foo", "bar", "--quiet"]);
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/--prompt|Missing required argument/i);
});

test("foo bar --dry-run 仅输出计划", async () => {
  const { stdout, stderr, exitCode } = await runCommandE2e(FOO_ROUTES, [
    "foo",
    "bar",
    "--dry-run",
    "--prompt",
    "x",
    "--output",
    "json",
  ]);
  expect(exitCode, stderr).toBe(0);
  const data = parseStdoutJson<{ request?: unknown }>(stdout);
  expect(data.request).toBeDefined();
});
```

## 与批量压测的关系

- **E2E**：单条/少量调用、断言固定、可进 `vp test`（见上文 skip 条件）
- **批量压测**：`packages/cli/tests/stress/run.mjs` + `targets/*.mjs`，并发 + 报告，**仅手动** `pnpm run test:stress -- <target>`

勿把压测并入 E2E 或默认 CI。详见 [stress-batch-tests.md](stress-batch-tests.md).
