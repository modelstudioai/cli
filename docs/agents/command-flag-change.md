# 命令选项变更

## 触发条件

- 给已有命令新增 `--flag <value>`
- 改 flag 默认值
- 删除 / 重命名已有 flag
- 把 flag 从可选变成必填(或反向)

## 必查清单

### A. 命令文件本身

- [ ] `packages/cli/src/commands/<group>/<action>.ts`:
  - `defineCommand({ options: [...] })` 数组里增删/改 `{ flag, description, type, required }`
  - `usage` 字段(如 `"bl text chat --message <text> [flags]"`)反映新签名
  - `examples` 数组覆盖新 flag 至少一个示例
  - `run()` 里读取 flag 的代码:
    - 类型转换正确(`type: "number"` 时 `flags.x as number`,`"array"` 时 `as string[]`)
    - 必填校验:`if (!flags.x) failIfMissing("x", ...)` 或交互式 prompt
    - 默认值 fallback

### B. 鉴权 / 全局选项

- [ ] 如果是**全局 flag**(所有命令通用),改 `packages/core/src/types/command.ts` 的 `GLOBAL_OPTIONS`
- [ ] 如果新 flag 影响 `Config`,改 `packages/core/src/config/schema.ts` 的 `Config` 接口
- [ ] 如果对应 env var,改 `packages/core/src/config/loader.ts` 的 `loadConfig`

### C. 文档层

- [ ] `README.md` / `README_CN.md` 如果在示例里展示了相关命令,补充新 flag
- [ ] 跑 `pnpm --filter bailian-cli run generate:reference`,让 `tools/generated/reference/` 与命令一致(本仓库 gitignore,勿手改;SKILL.md 已迁出本仓库)

### D. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 在 `packages/cli/tests/e2e/<command>.e2e.test.ts` 增加新 flag 的断言（含缺参、`--help`、dry-run 若适用）
- [ ] 删除 flag 时,清掉相关测试用例

### E. 重命名特殊处理

- [ ] 全仓 grep 旧 flag 名(包括 `--old-name`、`oldName`、`old_name` 三种形态,因为 args.ts 会做 kebab→camel 转换)
- [ ] 必要时保留**deprecated alias**(老 flag 仍可用,但 stderr 警告 → 下版本删)

## 完成后自查

```sh
node packages/cli/src/main.ts <command> --help          # 看新 flag 出现在 Options
node packages/cli/src/main.ts <command> --new-flag x   # 实测一遍
```

## 常见漏点

- ✗ 加 `type: "number"` 但 `String(flags.x)` 触发 lint 警告(参考已修过的 memory/list.ts)
- ✗ 加了 array 型 flag 但没考虑用户可能传多次
- ✗ 改默认值忘记更新 description 里的 "(default: xxx)" 文案
- ✗ Required flag 缺失时直接抛硬错而不是 prompt(交互友好性问题,参考已实现 prompt 的命令文件作为示例)
