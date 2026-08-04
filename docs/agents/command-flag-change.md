# 命令选项变更

## 触发条件

- 给已有命令新增 `--flag <value>`
- 改 flag 默认值
- 删除 / 重命名已有 flag
- 把 flag 从可选变成必填(或反向)

## 必查清单

### A. 命令文件本身

- [ ] `packages/commands/src/commands/<group>/<action>.ts`:
  - `defineCommand({ flags: { ... } })` 里增删/改 camelCase flag key 与 `{ type, valueHint, description, required }`
  - `usageArgs` 字段只写参数片段(如 `"--message <text> [flags]"`),不写 `bl <path>`
  - `exampleArgs` 数组覆盖新 flag 至少一个示例,同样不写 bin/path 前缀
  - `run()` 里只从 `ctx.flags` 读取本命令 flag,从 `ctx.settings` 读取全局/config 解析结果
  - 类型由 `ParsedFlags<typeof FLAGS>` 推导;避免手写 `flags.x as number` 这类断言
  - 单 flag 必填用 `required: true`;跨 flag / 值相关校验放 `validate`
  - 默认值 fallback 写在命令实现或 `Settings` 解析层,不要重复解析 env/config

### B. 鉴权 / 全局选项

- [ ] 如果是**全局 flag**(所有命令通用),改 `packages/core/src/types/command.ts` 的 `GLOBAL_FLAGS`
- [ ] 如果是凭证域 flag,优先确认是否属于 `MODEL_AUTH_FLAGS` 或 `CONSOLE_AUTH_FLAGS`;不要在单个命令里重复声明
- [ ] 如果新 flag 影响有效配置面,改 `packages/core/src/config/schema.ts` 的 `Settings` 接口
- [ ] 如果对应 env var 或 config 文件字段,改 `packages/core/src/config/loader.ts` 的 `buildSettings`

### C. 文档层

- [ ] `README.md` / `README.zh.md` 如果在示例里展示了相关命令,补充新 flag
- [ ] 跑 `pnpm --filter bailian-cli run generate:reference`,让各 `skills/<skill>/reference/` 与命令一致(勿手改;改完提交)

### D. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 在 `packages/cli/tests/e2e/<command>.e2e.test.ts` 增加新 flag 的断言（含缺参、`--help`、dry-run 若适用）
- [ ] 删除 flag 时,清掉相关测试用例

### E. 重命名特殊处理

- [ ] 全仓 grep 旧 flag 名(包括 `--old-name`、`oldName`、`old_name` 三种形态,因为 args.ts 会做 kebab→camel 转换)
- [ ] 必要时保留**deprecated alias**(老 flag 仍可用,但 stderr 警告 → 下版本删)

## 完成后自查

```sh
pnpm -F bailian-cli exec tsx src/main.ts <command> --help          # 看新 flag 出现在 Flags
pnpm -F bailian-cli exec tsx src/main.ts <command> --new-flag x   # 实测一遍
```

## 常见漏点

- ✗ 加了 array 型 flag 但没考虑用户可能传多次
- ✗ 改默认值忘记更新 description 里的 "(default: xxx)" 文案
- ✗ 在 `usageArgs` / `exampleArgs` 里写死 `bl <path>`,导致其它产品入口复用时 help 错
- ✗ required flag 缺失又在 `run()` 里重复手写校验,与 parser/`validate` 的错误文案不一致
