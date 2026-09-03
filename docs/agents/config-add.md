# 配置项扩展

## 触发条件

- 新增 env var(如 `DASHSCOPE_*` / `BAILIAN_*` / `NO_COLOR`)
- 给 `~/.bailian/config.json` 加字段
- 给全局 flag 加新选项(`--xxx`)
- 改 config 字段优先级

## 配置三层来源

```
flag (--xxx)   ─┐
                ├─ buildSources() + buildSettings() ─→ Settings(命令读取面)
env (XXX=yyy)  ─┤
                │
config 文件     ─┘
~/.bailian/config.json
```

优先级一般是 **flag > env > config 文件 > 默认值**,具体见 `packages/core/src/config/loader.ts`。

## 必查清单

### A. 类型定义

- [ ] `packages/core/src/config/schema.ts`:
  - `Settings`(运行时有效配置面)加新字段
  - `ConfigFile`(disk 形状,snake_case)加新字段(如果允许写文件)
  - `parseConfigFile()` 解析新字段
  - 如果是 enum 字段,加校验
  - 如果是数组字段,明确“缺失 / 空数组 / 非法值”的不同语义；安全策略字段的非法值必须 fail closed

### B. 加载逻辑

- [ ] `packages/core/src/config/loader.ts`:
  - `buildSources()` 如需新增来源,把 flag/file/env 纳入 sources
  - `buildSettings()` 加新字段的合并逻辑(`flags.x ?? process.env.XXX ?? file.x ?? default`)
  - 校验(数值范围、枚举合法性等)
  - 校验失败抛 `BailianError(USAGE)`

### C. 全局 flag(如果加的是 flag)

- [ ] `packages/core/src/types/command.ts:GLOBAL_FLAGS`
- [ ] `packages/runtime/src/registry.ts` 会**自动**从 `GLOBAL_FLAGS` 生成 root help;`tools/generate-reference.ts` 会生成 `reference/index.md` 的全局 flag 段
- [ ] flag 的 type 标注(`switch` / `boolean` / `number` / `array` / `string`),让 `packages/runtime/src/args.ts` 正确解析
- [ ] 改完全局 flag 后跑 `pnpm --filter bailian-cli run generate:reference`

### D. 命令使用方

- [ ] 用到新字段的命令文件直接读 `ctx.settings.xxx`,不要重复解析 env/config
- [ ] 配置展示 / 修改命令同步:
  - `packages/commands/src/commands/config/show.ts` 显示新字段
  - `packages/commands/src/commands/config/set.ts` 的 `VALID_KEYS` / `KEY_ALIASES` / description 允许 set
  - `packages/commands/src/commands/config/ui.ts` / `ui-html.ts` 能按原类型往返数组字段,不能把 `[]` 保存成字段缺失

### E. 文档

- [ ] `README.md` / `README.zh.md` 的 env var 表格

### F. 测试

- [ ] 单测覆盖优先级:flag > env > file
- [ ] 校验失败抛错(非法值)
- [ ] 默认值正确
- [ ] 数组配置覆盖 CLI 逗号/JSON 输入、Config UI 往返、去重和显式空数组

## 完成后自查

```sh
# 三个来源都试一遍
pnpm -F bailian-cli exec tsx src/main.ts config show --output json | grep <new-field>
XXX=value pnpm -F bailian-cli exec tsx src/main.ts config show --output json | grep <new-field>
pnpm -F bailian-cli exec tsx src/main.ts config show --xxx value --output json | grep <new-field>

# 写到文件(会改用户 HOME,必要时先用临时 HOME)
pnpm -F bailian-cli exec tsx src/main.ts config set --key <key> --value <value>
cat ~/.bailian/config.json
```

## 常见漏点

- ✗ `Settings` 接口加字段但 `buildSettings` 没填,运行时永远 undefined
- ✗ `ConfigFile` 用 camelCase 字段名(disk schema 应该是 snake_case)
- ✗ 全局 switch 没标 `type: "switch"`,被当成需要值的 `--xxx <value>`
- ✗ 加了 env var 但 README 表格没更新,用户不知道有这条
- ✗ `config show` 不显示新字段,用户改了无法回查
- ✗ UI 用 `String([])` 把显式空数组渲染为空串,保存后意外关闭安全策略
