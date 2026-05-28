# CLI E2E 测试规范

## 触发条件

- 新增/修改 `packages/cli/src` 下的 command（`commands/catalog.ts` 登记、`defineCommand` 实现、options/usage）
- 新建或扩展 `packages/cli/tests/e2e/*.e2e.test.ts` 用例
- 为命令补 help / 缺参 / dry-run / 真实集成测试

以上情况必须同步维护 `packages/cli/tests/e2e/<topic>.e2e.test.ts`。跑测与环境变量见 `.cursor/skills/bailian-cli-e2e/SKILL.md`。

## 文件与工具

- 路径：`packages/cli/tests/e2e/<kebab-topic>.e2e.test.ts`
- 框架：`vite-plus/test`；子进程跑 CLI：`runCli` from `./helpers.ts`
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

## skip 条件（helpers.ts）

| 场景                | 条件                                                  |
| ------------------- | ----------------------------------------------------- |
| 文本/搜索/记忆/配置 | `isDashScopeE2EReady()`                               |
| 图像/语音           | `isBailianE2EMediaEnabled() && isDashScopeE2EReady()` |
| 视频                | `isBailianE2EVideoEnabled() && isDashScopeE2EReady()` |
| 知识库              | `isKnowledgeE2EReady()`                               |
| 视频 download/task  | 另需 `BAILIAN_E2E_VIDEO_TASK_ID`                      |

## 用例类型

1. **分组 help**：`runCli(["image"])` → `exitCode === 0`，stdout+stderr 含子命令名
2. **--help**：`runCli([..., "--help"])` → stderr 含主要 flags
3. **缺参**：`--non-interactive` 且不传 required flag → `exitCode === 2`，stderr 匹配 `--flag|Missing required argument`
4. **--dry-run**：仅当实现在联网/上传/写盘**之前**返回；断言 stdout JSON/文本，不入网
5. **真实集成**：保留既有用例名称与断言；放在 skip 块**末尾**

## 安全与例外

- **禁止真实破坏性操作**：`auth logout` 只用 `--dry-run`；`config set` 只用 `--dry-run`
- **不加 dry-run**：`dryRun` 在 `resolveFileUrl` / `resolveCredential` / 上传**之后**的命令（如 `image edit`、`speech recognize` 带 `--url`）
- **`--list-voices` 等旁路**：先于 `--text` 校验的 flag，缺参用例勿带该 flag
- 新增 required option → 至少一条缺参用例；改 dry-run 输出 → 更新对应断言

## 新增 command 检查清单

- [ ] `commands/catalog.ts` 登记 + `tests/e2e/<topic>.e2e.test.ts`（新建或扩展）
- [ ] 若改了 `usage` / `options` / `examples`,跑 `pnpm --filter bailian-cli run generate:reference` 更新 `tools/generated/reference/`(本仓库 gitignore)
- [ ] 顶层：分组 help + 子命令 `--help`（多子命令则各一条 help）
- [ ] skip 块：每个 required flag 缺参；可 dry-run 则加一条
- [ ] 至少一条真实集成（或说明为何仅 smoke）；不破坏已有集成用例顺序
- [ ] `pnpm test packages/cli/tests/e2e/<file>` 通过

## 示例片段

```ts
test("foo bar 缺少 --prompt 时退出为用法错误 (2)", async () => {
  const { stderr, exitCode } = await runCli(["foo", "bar", "--non-interactive"]);
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/--prompt|Missing required argument/i);
});

test("foo bar --dry-run 仅输出计划", async () => {
  const { stdout, stderr, exitCode } = await runCli([
    "foo",
    "bar",
    "--dry-run",
    "--prompt",
    "x",
    "--non-interactive",
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

勿把压测并入 E2E 或默认 CI。详见 [stress-batch-tests.md](stress-batch-tests.md)。
