# 配置项扩展

## 触发条件

- 新增 env var(如 `DASHSCOPE_*` / `BAILIAN_*` / `NO_COLOR`)
- 给 `~/.bailian/config.json` 加字段
- 给全局 flag 加新选项(`--xxx`)
- 改 config 字段优先级

## 配置三层来源

```
flag (--xxx)   ─┐
                ├─ loadConfig() 合并 ─→ Config(运行时单一对象)
env (XXX=yyy)  ─┤
                │
config 文件     ─┘
~/.bailian/config.json
```

优先级一般是 **flag > env > config 文件 > 默认值**,具体见 `core/config/loader.ts`。

## 必查清单

### A. 类型定义

- [ ] `packages/core/src/config/schema.ts`:
  - `Config`(运行时形状)加新字段
  - `ConfigFile`(disk 形状,snake_case)加新字段(如果允许写文件)
  - `parseConfigFile()` 解析新字段
  - 如果是 enum 字段,加校验

### B. 加载逻辑

- [ ] `packages/core/src/config/loader.ts:loadConfig()`:
  - 加新字段的合并逻辑(`flags.x ?? process.env.XXX ?? file.x ?? default`)
  - 校验(数值范围、枚举合法性等)
  - 校验失败抛 `BailianError(USAGE)`

### C. 全局 flag(如果加的是 flag)

- [ ] `packages/core/src/types/command.ts:GLOBAL_OPTIONS` 数组
- [ ] `registry.ts` 的 `buildGlobalFlagLines` 会**自动**从 `GLOBAL_OPTIONS` 生成 `bl --help` 与 `reference/index.md` 的全局 flag 段,无需手写
- [ ] flag 的 type 标注(`boolean` / `number` / `array`),让 args.ts 正确解析
- [ ] 改完全局 flag 后跑 `pnpm --filter bailian-cli run generate:reference`

### D. 命令使用方

- [ ] 用到新字段的命令文件直接读 `config.xxx`,不要重复解析
- [ ] 配置展示 / 修改命令同步:
  - `packages/cli/src/commands/config/show.ts` 显示新字段
  - `packages/cli/src/commands/config/set.ts` 允许 set
  - `packages/cli/src/commands/config/export-schema.ts` 在 schema 输出里

### E. 文档

- [ ] `README.md` / `README_CN.md` 的 env var 表格

### F. 测试

- [ ] 单测覆盖优先级:flag > env > file
- [ ] 校验失败抛错(非法值)
- [ ] 默认值正确

## 完成后自查

```sh
# 三个来源都试一遍
node packages/cli/src/main.ts config show --output json | grep <new-field>
XXX=value node packages/cli/src/main.ts config show --output json | grep <new-field>
node packages/cli/src/main.ts config show --xxx value --output json | grep <new-field>

# 写到文件
node packages/cli/src/main.ts config set --key <key> --value <value>
cat ~/.bailian/config.json
```

## 常见漏点

- ✗ `Config` 接口加字段但 `loadConfig` 没填,运行时永远 undefined
- ✗ `ConfigFile` 用 camelCase 字段名(disk schema 应该是 snake_case)
- ✗ 全局 flag 没标 `type: "boolean"`,被当成需要值的 `--xxx <value>`
- ✗ 加了 env var 但 README 表格没更新,用户不知道有这条
- ✗ `config show` 不显示新字段,用户改了无法回查
