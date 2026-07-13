# 命令增删改

## 触发条件

- 增加新的 `bl xxx` 命令
- 删除已有命令
- 重命名命令(包括从单级 `bl x` 改成 `bl x y` 或反向)
- 调整某个 shared command 在 `bl` / `kscli` 等产品入口里的暴露路径

## 命令实现与产品路径的关系

命令实现住在 `packages/commands`,产品路径由入口包决定。实现文件路径按能力组织,但不再等同于最终命令路径。

```
实现文件:
  packages/commands/src/commands/knowledge/retrieve.ts
    ↓ packages/commands/src/index.ts export { default as knowledgeRetrieve }
产品入口:
  packages/cli/src/commands.ts  "knowledge retrieve": knowledgeRetrieve  ↔ bl knowledge retrieve
  packages/kscli/src/main.ts    "retrieve": knowledgeRetrieve             ↔ kscli retrieve
```

常见路径形态:

```
单级命令:  packages/commands/src/commands/update.ts              ↔ bl update
两级命令:  packages/commands/src/commands/text/chat.ts           ↔ bl text chat
子组命令:  packages/commands/src/commands/memory/profile-get.ts  ↔ bl memory profile get
```

子组要慎用:只有子组下有 ≥2 个 action 时才合理,否则优先拍平到两级。

## CLI 命令注册架构(必读)

`packages/commands` 是命令库,只导出单个 command;不内置 path presets,不关心 `bl` / `kscli`。每个产品入口传入自己的 command map,`runtime` 负责解析、help、鉴权、遥测、执行。

```
packages/commands/src/commands/<...>.ts
  defineCommand({ auth, flags, usageArgs, exampleArgs, validate, run })
        ↓
packages/commands/src/index.ts
  export { default as xxxCommand } from "./commands/...ts"
        ↓
┌──────────────────────────────┬──────────────────────────────┐
│ packages/cli/src/commands.ts │ packages/kscli/src/main.ts   │
│ { "text chat": textChat }    │ { "retrieve": knowledge... } │
└──────────────┬───────────────┴──────────────┬───────────────┘
               ↓                              ↓
        createCli(commands, identity)  →  runtime registry/help/middleware
               ↓
        tools/generate-reference.ts reads packages/cli/src/commands.ts
```

- **`packages/commands/src/commands/<...>.ts`**:命令实现;`usageArgs` / `exampleArgs` 只写参数片段,不写 `bl` / `kscli` 前缀
- **`packages/commands/src/index.ts`**:导出命令实现;新增命令必须在这里 re-export
- **`packages/cli/src/commands.ts`**:`bl` 产品命令 map;新增/删除/重命名 `bl` 命令必须改这里
- **`packages/kscli/src/main.ts`**:`kscli` 产品命令 map;只有该入口需要暴露/变更时才改
- **`packages/runtime/src/registry.ts`**:通用 registry,从传入 map 建树;不要在这里登记业务命令
- **`tools/generate-reference.ts`**:pre-commit / `pnpm run sync:skill-assets` 时读 `packages/cli/src/commands.ts`,写 `skills/bailian-cli/reference/index.md` + `<一级命令>.md`。该目录**纳入 git**,勿手改

已删除/勿再引用:旧的 `packages/cli/src/commands/catalog.ts`、旧的 `packages/cli/src/commands/index.ts` catalog re-export、`packages/cli/src/registry.ts`、`skipDefaultApiKeySetup`、`ensureApiKey` 启动拦截、`config/export-schema.ts`。

## 必查清单

### A. 命令库

- [ ] 新建/删除/移动对应的 `packages/commands/src/commands/<...>.ts`
- [ ] `defineCommand` 字段使用当前 schema:
  - `auth: "apiKey" | "console" | "openapi" | "none"`
  - `flags`(camelCase key,由 runtime 渲染为 kebab-case)
  - `usageArgs`(不含 bin/path 前缀)
  - `exampleArgs`(不含 bin/path 前缀)
  - `validate`(跨 flag 校验)
  - 普通业务命令的 `run(ctx)` 只读 `ctx.flags` / `ctx.settings` / `ctx.client`
  - `commands/auth/**` 可用 `ctx.authStore()`,`commands/config/**` 可用 `ctx.configStore()`;不要把这些 store accessor 扩散到普通业务命令
  - `commands/plugin/**` 可用 `ctx.commandPacks()`;产品 policy 由 runtime 绑定,命令不要自行 import 产品入口
- [ ] `packages/commands/src/index.ts`:新增或移除对应 export
- [ ] 如果命令调用 Console Gateway,设置 `auth: "console"`;不要重复声明 console 凭证域 flags
- [ ] 如果命令不需要网络或自己管理配置/登录,设置 `auth: "none"`;不要绕过 runtime auth stage

### B. 产品入口

- [ ] `packages/cli/src/commands.ts`:按需增删 `import` 与 `commands` map key
- [ ] 新 map key 就是 `bl` 下的命令路径;重命名时全仓 grep 旧路径字符串
- [ ] 如果 `kscli` 入口也要暴露/移除该能力,同步 `packages/kscli/src/main.ts`
- [ ] 不要在 `packages/runtime/src/registry.ts` 或 `create-cli.ts` 里写业务命令表

### C. 文档层

- [ ] 运行 `pnpm run sync:skill-assets`(或正常 `git commit` 走 pre-commit),刷新 `skills/bailian-cli/reference/` 与 `SKILL.md` 的 `metadata.version` 并提交
- [ ] `README.md` / `README.zh.md`:Quick Start、命令一览、认证说明(用户向,与 help 对齐)
- [ ] `skills/bailian-cli/SKILL.md`:若安装说明或能力边界有变,同步更新

### D. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 新建或更新 `packages/cli/tests/e2e/<topic>.e2e.test.ts`
- [ ] 删除命令时一并删对应 e2e / README 示例 / reference 生成结果
- [ ] 如果 shared command 在不同入口路径下复用,至少确保 `bl` 入口 e2e 覆盖;`kscli` 入口改动需补对应入口测试或手工 smoke

### E. 重命名特殊处理

- [ ] 全仓 grep **旧命令名字符串**,确保以下位置全部更新:
  - `packages/cli/src/commands.ts` map key
  - `packages/kscli/src/main.ts` map key(如适用)
  - 用户可见 hint / README / tests
  - `skills/bailian-cli/reference/`(重建后检查并提交)
- [ ] 检查 `usageArgs` / `exampleArgs` 没有硬编码旧的 `bl <path>` 前缀

## 完成后自查

```sh
pnpm run sync:skill-assets
pnpm -F bailian-cli exec tsx src/main.ts <new-command> --help
pnpm -F bailian-cli exec tsx src/main.ts
vp test packages/cli/tests/e2e/<topic>.e2e.test.ts
```

如改了 `kscli` 入口:

```sh
pnpm -F knowledge-studio-cli exec tsx src/main.ts <command> --help
```

## 常见漏点

- ✗ 只新增 `packages/commands/src/commands/...` 文件,忘了在 `packages/commands/src/index.ts` 导出
- ✗ 只导出了命令实现,忘了在 `packages/cli/src/commands.ts` 暴露路径 → `bl --help` 看不到
- ✗ 手改 `skills/bailian-cli/reference/*.md` → 下次 generate 被覆盖;应改 command metadata 后重新 generate 并提交
- ✗ 在 `usageArgs` / `exampleArgs` 写死 `bl text chat` → `kscli` 等入口复用时 help 错
- ✗ Console Gateway 命令忘设 `auth: "console"` → console flags / credential 注入都不生效
- ✗ 单 action 的子组是反模式,新增时优先拍平为两级
