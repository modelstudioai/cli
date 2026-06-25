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

实现文件路径与命令语义 1:1 对齐;**产品在 map 里决定暴露路径**(rag 可将 `knowledge retrieve` remap 为 `retrieve`)。

## CLI 命令注册架构(必读)

composable-cli:命令库只 export 单命令,**路径 map 由产品 / 测试各自注入**;`createCli` + `CommandRegistry` 在 `bailian-cli-runtime` 里解析 help。

```
packages/commands/src/commands/<...>.ts
  defineCommand({ name, description, usage, options, examples, run })
        ↓
packages/commands/src/index.ts          单命令 re-export(无路径 preset)
        ↓
   ┌────┴────────────┬─────────────────────────┬──────────────────────────┐
   ↓                 ↓                         ↓                          ↓
cli/src/commands.ts  rag/src/main.ts   tests/fixtures/e2e-commands.ts   (其他产品…)
(bl 全量 map)        (rag 裁剪 map)    (契约 e2e 全量 map)
        ↓                 ↓                         ↓
   createCli(commands, opts)  →  runtime/registry.ts(建树、resolve、printHelp)
        ↓
tools/generate-reference.ts 读 cli/src/commands.ts → skills/bailian-cli/reference/
```

- **`packages/commands/src/index.ts`**: `export { default as textChat } from "./commands/text/chat.ts"` 等;**不**含 `"<path>": handler` 映射
- **`packages/cli/src/commands.ts`**: bl 产品 map;`main.ts` 传入 `createCli`
- **`packages/rag/src/main.ts`**: rag 产品 map(内联);路径可不同于 bl
- **`packages/commands/tests/fixtures/e2e-commands.ts`**: 契约 e2e 全量 map;**不** import `packages/cli`
- **`packages/runtime/src/registry.ts`**: 从注入的 `Record<string, Command>` 建树;Commands / Global Flags 从 `Command` 元数据与 `GLOBAL_OPTIONS` **动态生成**
- **`tools/generate-reference.ts`**: pre-commit / `pnpm run sync:skill-assets` 时读 **`packages/cli/src/commands.ts`**,写 `skills/bailian-cli/reference/index.md`(索引) + `skills/bailian-cli/reference/<一级命令>.md`(详情,勿手改)。该目录**纳入 git**,随 `npx skills add modelstudioai/cli` 分发

已删除、勿再引用:`packages/cli/src/commands/catalog.ts`、`groups.ts`、`packages/cli/src/registry.ts`、`config/export-schema.ts`。

## 必查清单

### A. 代码层

- [ ] **新建/删除/移动**对应的 `packages/commands/src/commands/<...>.ts` 文件
- [ ] **`packages/commands/src/index.ts`**: 增删 `export { default as xxx } from "./commands/.../xxx.ts"`
- [ ] **`packages/commands/tests/fixtures/e2e-commands.ts`**: 增删 import 与 `"<path>": xxx`(契约 e2e 命令面)
- [ ] **`packages/cli/src/commands.ts`**(bl 暴露该命令时): 同步 import 与 map key(key 与 `defineCommand({ name })` 一致)
- [ ] **`packages/rag/src/main.ts`**(rag 暴露该命令时): 同步 import 与 map key(路径可按 rag 产品约定 remap)
- [ ] 如果命令需要跳过入口的默认 DashScope API key 引导(`ensureApiKey`),在对应 `defineCommand` 上设 `skipDefaultApiKeySetup: true`(字段定义见 `packages/core/src/types/command.ts`;`createCli` 根据已解析的 `command` 读取)

### B. 文档层

- [ ] 运行 `pnpm run sync:skill-assets`(或正常 `git commit` 走 pre-commit),刷新 `skills/bailian-cli/reference/` 与 `SKILL.md` 的 `metadata.version` 并提交
- [ ] `README.md` / `README.zh.md`: Quick Start、命令一览(用户向,与 help 对齐即可)
- [ ] `skills/bailian-cli/SKILL.md`: 若安装说明或能力边界有变,同步更新

### C. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 新建或更新 `packages/commands/tests/e2e/<topic>.e2e.test.ts`
- [ ] bl / rag 命令面变更时,同步对应 smoke:`packages/cli/tests/e2e/smoke.e2e.test.ts`、`packages/rag/tests/e2e/smoke.e2e.test.ts`
- [ ] 删除命令时一并删对应 e2e

### D. 重命名特殊处理

- [ ] 全仓 grep **旧命令名字符串**,确保以下位置全部更新:
  - 各产品 / fixture map 的 key(`cli/src/commands.ts`、`e2e-commands.ts`、`rag/src/main.ts` 等)
  - error hints(cli 层)
  - `skills/bailian-cli/reference/`(重建后检查并提交)
  - README 示例
  - 测试断言

## 完成后自查

```sh
pnpm run sync:skill-assets   # reference/ + SKILL metadata.version 与 cli/commands.ts / package.json 一致
node packages/cli/src/main.ts <new-command> --help
node packages/cli/src/main.ts                        # 根 help 列表含新命令
pnpm --filter bailian-cli-commands test tests/e2e/<topic>.e2e.test.ts
pnpm --filter bailian-cli test tests/e2e/smoke.e2e.test.ts   # bl 命令面变更时
```

## 常见漏点

- ✗ 只改了命令文件,忘了 **`index.ts` 导出** → 产品 / e2e 无法 import
- ✗ 忘了 **`e2e-commands.ts`** → 契约 e2e 跑不起来或缺命令
- ✗ bl 要暴露却忘了 **`cli/src/commands.ts`** → `bl --help` 里没有、reference 也不会生成
- ✗ 手改 **`skills/bailian-cli/reference/*.md`** → 下次 generate 被覆盖;应改 `defineCommand` 后重新 generate 并提交
- ✗ 单 action 的子组是反模式,新增时优先拍平为两级
