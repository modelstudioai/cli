# 命令增删改

## 触发条件

- 增加新的 `bl xxx` 命令
- 删除已有命令
- 重命名命令(包括从单级 `bl x` 改成 `bl x y` 或反向)

## 命令路径与文件路径的对应规则

```
单级命令(无 group):  commands/<name>.ts          ↔  bl <name>
                     例: commands/update.ts      ↔  bl update

两级命令(有 group):  commands/<group>/<action>.ts ↔  bl <group> <action>
                     例: commands/text/chat.ts   ↔  bl text chat

三级命令(子组,慎用): commands/<group>/<sub>/<action>.ts ↔ bl <group> <sub> <action>
                     例: commands/memory/profile/create.ts ↔ bl memory profile create
                     仅当子组下有 ≥2 个 action 时合理(否则拍平到两级)
```

文件路径与命令路径必须 1:1 对齐。

## CLI 命令注册架构(必读)

命令元数据以 **`catalog.ts` 为单一登记处**;`registry.ts` 只负责解析与打印 help,不再内嵌命令表或手写 Resources 列表。

```
commands/<...>.ts   defineCommand({ name, description, usage, options, examples, apiDocs?, run })
        ↓
commands/catalog.ts   export const commands: Record<string, Command>
        ↓
   ┌────┴────┬──────────────────────┬─────────────────────┐
   ↓         ↓                      ↓                     ↓
registry.ts  main.ts      tools/generate-reference.ts   export-schema.ts
(解析/help)  (入口)       → skills/bailian-cli/reference/index.md + <group>.md
```

- **`packages/cli/src/commands/catalog.ts`**: `import` 命令模块 + `"<path>": handler` 映射;**不** `import registry.ts`(避免构建时循环依赖)
- **`packages/cli/src/commands/index.ts`**: `export { commands } from "./catalog.ts"`(给包内 re-export 用)
- **`packages/cli/src/registry.ts`**: `import { commands } from "./commands/catalog.ts"`,建树、`resolve`、`printHelp`;Commands / Global Flags 从 `Command` 元数据与 `GLOBAL_OPTIONS` **动态生成**
- **`tools/generate-reference.ts`**: pre-commit / `pnpm run sync:skill-assets` 时读 `catalog.ts`,写 `skills/bailian-cli/reference/index.md`(索引) + `skills/bailian-cli/reference/<一级命令>.md`(详情,勿手改)。该目录**纳入 git**,随 `npx skills add modelstudioai/cli` 分发

已删除、勿再引用:`commands/help.ts`、`registry.ts` 内联 `new CommandRegistry({...})`、`printRootHelp` 手写命令行。

## 必查清单

### A. 代码层

- [ ] **新建/删除/移动**对应的 `packages/cli/src/commands/<...>.ts` 文件
- [ ] **`packages/cli/src/commands/catalog.ts`**:
  - 增删 `import xxx from "./.../xxx.ts"`
  - 在 `export const commands` 里增删 `"<group> <action>": xxx`(key 与 `defineCommand({ name })` 一致)
- [ ] **不要**在 `registry.ts` 里重复登记命令(已从 catalog 读取)
- [ ] 命令需在 `bl help` / `reference/` 展示 API 文档链接时,在 `defineCommand` 里设 `apiDocs`(相对路径);help 与 reference 均从此字段生成
- [ ] 如果命令需要鉴权之外的特殊路径,看 `packages/cli/src/main.ts` 的 `NO_AUTH_SETUP`
- [ ] **`config/export-schema.ts`**: 若新命令不适合作为 agent tool,评估是否加入 `SKIP_PREFIXES`;该文件在 `run()` 内 `import("../catalog.ts")`,勿顶层 import catalog 以免循环依赖

### B. 文档层

- [ ] 运行 `pnpm run sync:skill-assets`(或正常 `git commit` 走 pre-commit),刷新 `skills/bailian-cli/reference/` 与 `SKILL.md` 的 `metadata.version` 并提交
- [ ] `README.md` / `README.zh.md`: Quick Start、命令一览(用户向,与 help 对齐即可)
- [ ] `skills/bailian-cli/SKILL.md`: 若安装说明或能力边界有变,同步更新

### C. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 新建或更新 `packages/cli/tests/e2e/<topic>.e2e.test.ts`
- [ ] 删除命令时一并删对应 e2e

### D. 重命名特殊处理

- [ ] 全仓 grep **旧命令名字符串**,确保以下位置全部更新:
  - `catalog.ts` 的 key
  - error hints(cli 层)
  - `skills/bailian-cli/reference/`(重建后检查并提交)
  - README 示例
  - 测试断言

## 完成后自查

```sh
pnpm run sync:skill-assets   # reference/ + SKILL metadata.version 与 catalog / package.json 一致
node packages/cli/src/main.ts <new-command> --help
node packages/cli/src/main.ts                        # 根 help 列表含新命令
vp test packages/cli/tests/e2e/<topic>.e2e.test.ts   # 相关 e2e
```

## 常见漏点

- ✗ 只改了命令文件,忘了 **`catalog.ts`** → 命令不存在或 help 里没有
- ✗ 手改 **`skills/bailian-cli/reference/*.md`** → 下次 generate 被覆盖;应改 `defineCommand` 后重新 generate 并提交
- ✗ 在 `export-schema.ts` 顶层 `import catalog` → 可能与 registry 循环依赖
- ✗ 单 action 的子组是反模式,新增时优先拍平为两级
