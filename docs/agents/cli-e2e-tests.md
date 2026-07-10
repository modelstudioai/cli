# CLI E2E 测试规范

## 架构分层

| 层级            | 路径                                                  | 测什么                                                          |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **共享基建**    | `packages/e2e`                                        | gating、子进程 runner、output、globalSetup（`private`，不发布） |
| **命令 E2E**    | `packages/commands/tests/e2e`                         | help、缺参、dry-run、live（gated）；harness `binName: "bl"`     |
| **bl smoke**    | `packages/cli/tests/e2e/registry.smoke.e2e.test.ts`   | 产品 map 全部 path `--help`、分组 help、根 help                 |
| **kscli smoke** | `packages/kscli/tests/e2e/registry.smoke.e2e.test.ts` | 6 条 flat path `--help`；`search --help` 与 harness 一致        |
| **runtime**     | `packages/runtime/tests`                              | `proxy.e2e`、console 跨域 flag 拒绝                             |

**依赖边界**：`e2e` → `core`；`commands/tests` → `e2e` + `commands/src`；产品 tests → `e2e` + 各自 `src`。**禁止**产品 import `commands/tests/**`（子进程 spawn harness 路径除外）。

## 触发条件

- 新增/修改 `packages/commands/src/commands` 下的 command 实现
- 新增/修改 `packages/cli/src/commands.ts` 的 `bl` 命令路径 map
- 新建或扩展 `packages/commands/tests/e2e/<topic>.e2e.test.ts`
- 新增 bl 产品 path → 同步 `registry.smoke`（自动覆盖 leaf path）与 `harness/e2e-command-map.ts`

跑测与环境变量见 `.cursor/skills/bailian-cli-e2e/SKILL.md`。

## 文件与工具

### commands E2E

- 路径：`packages/commands/tests/e2e/<kebab-topic>.e2e.test.ts`
- 子进程：`runCommandE2e` from `./helpers.ts`（spawn `harness/main.ts`）
- fixtures：`packages/commands/tests/e2e/fixtures/`
- map：`harness/e2e-command-map.ts`（自维护，初始从 `cli/commands.ts` 复制）

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
// 1) 不 skip：分组 + --help，无密钥、无真实 API
describe("e2e: <topic>", () => {
  test("<group> 分组展示子命令帮助且成功退出", ...);
  test("<subcommand> --help 正常退出", ...);
});

// 2) skipIf：缺参 / dry-run / 真实集成；原有集成用例放最后、勿改逻辑
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
| 视频 download/task      | 另需 `BAILIAN_E2E_VIDEO_TASK_ID`                                                                           |
| 知识库 chat/search live | `isChatE2EReady()` / `isSearchE2EReady()`（`knowledge chat/search`，需 `BAILIAN_WORKSPACE_ID` + agent ID） |

## 用例类型

1. **分组 help**：`runCommandE2e(["image"])` → `exitCode === 0`，stdout+stderr 含子命令名
2. **--help**：`runCommandE2e([..., "--help"])` → stderr 含主要 flags
3. **缺参**：带一个无害全局 flag（如 `--quiet`）且不传 required flag → `exitCode === 2`，stderr 匹配 `--flag|Missing required argument`
4. **--dry-run**：仅当实现在联网/上传/写盘**之前**返回；断言 stdout JSON/文本，不入网
5. **真实集成**：保留既有用例名称与断言；放在 skip 块**末尾**

## 契约与防漂移

- `harness/e2e-command-map.contract.test.ts`：path 唯一、合法 export、白名单、测试 argv 前缀在 map 中
- Advisory（不阻塞 CI）：`node tools/compare-e2e-command-map.ts` 对比 `cli/commands.ts` 与 harness map

增删命令须同步三处：**实现 export** + **`cli/commands.ts`** + **`e2e-command-map.ts`**（见 [command-add-remove.md](command-add-remove.md)）。

## 安全与例外

- **禁止真实破坏性操作**：`auth logout` 只用 `--dry-run`；`config set` 只用 `--dry-run`
- **不加 dry-run**：`dryRun` 在 `resolveFileUrl` / `resolveCredential` / 上传**之后**的命令（如 `image edit`、`speech recognize` 带 `--url`）
- **`--list-voices` 等旁路**：先于 `--text` 校验的 flag，缺参用例勿带该 flag
- 新增 required option → 至少一条缺参用例；改 dry-run 输出 → 更新对应断言

## 新增 command 检查清单

- [ ] `packages/commands/src/index.ts` 导出 + `packages/cli/src/commands.ts` 暴露路径 + `harness/e2e-command-map.ts` 登记
- [ ] `packages/commands/tests/e2e/<topic>.e2e.test.ts`（新建或扩展）
- [ ] 若改了 `usageArgs` / `flags` / `exampleArgs`,跑 `pnpm --filter bailian-cli run generate:reference` 更新 `skills/bailian-cli/reference/` 并提交
- [ ] 顶层：分组 help + 子命令 `--help`（多子命令则各一条 help）
- [ ] skip 块：每个 required flag 缺参；可 dry-run 则加一条
- [ ] 至少一条真实集成（或说明为何仅 smoke）；不破坏已有集成用例顺序
- [ ] `vp test packages/commands/tests/e2e/<file>` 通过

## 调试命令

```sh
pnpm --filter bailian-cli-commands exec vp test packages/commands/tests/e2e/text-chat.e2e.test.ts
pnpm --filter bailian-cli exec vp test packages/cli/tests/e2e/registry.smoke.e2e.test.ts
pnpm --filter knowledge-studio-cli exec vp test packages/kscli/tests/e2e/registry.smoke.e2e.test.ts
pnpm --filter bailian-cli-runtime exec vp test packages/runtime/tests/proxy.e2e.test.ts
node tools/compare-e2e-command-map.ts
```

## 示例片段

```ts
test("foo bar 缺少 --prompt 时退出为用法错误 (2)", async () => {
  const { stderr, exitCode } = await runCommandE2e(["foo", "bar", "--quiet"]);
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/--prompt|Missing required argument/i);
});

test("foo bar --dry-run 仅输出计划", async () => {
  const { stdout, stderr, exitCode } = await runCommandE2e([
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
