# Config / Flags 解耦重构 — 实施方案(交接文档)

> 目的:把当前的"god `Config`"拆成职责清晰的 `Identity / Settings / Credential`,并让命令只依赖收窄后的 `settings + flags + client`。本文是**自包含实施说明**,可据此直接开工。
>
> 状态(2026-06-30):**尚未开始编码**,代码在基线。设计已充分对齐,并对照本地 clone 的 gh / vercel / oclif / citty / qwencloud 验证过。
>
> 实施(2026-07-06):**已按本方案完成**——前置 baseUrl 翻转 + 阶段 0–6 全部落地(含 flags 收窄/分流/同名守卫、console/advisor/pipeline 收口、tracker 传值、边界守卫测试 `packages/commands/tests/boundaries.test.ts`)。全量 `vp check`/单测/关键 e2e 绿;**未 commit,待 review**。实施中的偏差:advisor 匿名调网关促使 `callConsoleGateway` 收 `ConsoleGatewayTarget`(token 可选)而非整个 credential;`describeAuth` 更名 `describeAuthState`;`ConfigStore.reset` 无消费者未实现。
>
> flag 边界轮(2026-07-06):**域化完成**——flag 拆 `GLOBAL_FLAGS` + `MODEL_AUTH_FLAGS`/`CONSOLE_AUTH_FLAGS`(按命令 `auth` 可见),16 处遮蔽清零,跨域传 flag 报错,help 改为 Flags(自有+域)/Global Flags(全量)三段式,`pipeline run --timeout` 更名 `--step-timeout`,login 凭证输入由自有 flags + `AuthStore.login()` 落盘。workspaceId 已升入 console 域(链 flag > env > file),stats 命令内优先级删除。
>
> 修订(2026-07-04 评审后,均已拍板):§8 改 strangler 分阶段 + 阶段 0 行为锁定测试(已落地);§2 store 接口细化(write async / unset / AuthStore.login 揽登录落盘);§5 validate 收 ownFlags + 同名守卫 + authStage dry-run 双域容忍;§7 tracker/workspaceId 修法;§0/§9 优先级链保真口径。dry-run 决策:**保持"无需凭证"现状**,console 三元组归 Settings 服务 dry-run 展示(不引入 ConsoleTarget);dry-run 输出规范统一推后(§9)。
>
> 约束(务必遵守):
>
> - **不自动 commit**,改完等用户确认。
> - **改 `packages/core` 或 `packages/runtime` 的 src 后必须 rebuild**:dev/工具走 `dist`,不 build 会跑旧代码。核心包重建:`pnpm -F bailian-cli-core build`。
> - 每步用 `npx vp check`(= 类型检查 + 格式)兜底;基线是**绿的**(需先 `pnpm -F bailian-cli-core build` 刷新 dist,否则 `tools/generate-reference.ts` 从 dist 导入会报 stale 错)。
> - 测试:`npx vp test`。

---

## 0. 一句话定位与不变式

> **ctx 是唯一组合根。它在边界处把 flag / env / file / 默认 各源解析成 `identity / settings / credential`,交给命令。**
>
> 优先级链已**统一为 flag > env > file > 默认**:唯一异类 baseUrl(原 flag>file>env)已在前置独立 commit 翻转,锁定表(`packages/core/tests/config-priority.test.ts`)同步更新,`buildSettings` 逐字段对照锁定表移植。workspaceId 已升入 console 域(链 flag > env > file);verbose 为 OR 语义、telemetry 的 DO_NOT_TRACK 为业界标准,均非链序问题。

三条硬规矩:

1. **业务命令只依赖 `settings / flags / client`**;`config`、`auth` 管理命令**额外**用 `configStore()` / `authStore()` 访问器。
2. **只有边界(ctx 构造)知道优先级;只有 Client 持有 credential;raw `ConfigFile` 只在 `configStore` 后面。**
3. **命令的 `flags` 只含它自己声明的 flag**;全局 flag 进 `settings`,不进命令(实现见 §5 的分流规则)。

设计与 gh 的 `cmdutil.Factory` 模型同构(单一 context + 惰性能力访问器 + 边界收口解析);vercel `Client`、oclif `this.config` 亦然。已对照源码验证。

---

## 1. 划分判据(字段归属的唯一标准)

> **非秘密的值:命令读它 → `Settings`;只有传输层(Client)用、命令不读 → 跟 `credential` 走、Client 内部消化。秘密(token)→ credential。**

| 字段                                                   | 命令读吗                     | 归属                                       |
| ------------------------------------------------------ | ---------------------------- | ------------------------------------------ |
| `token`                                                | —(秘密)                      | credential                                 |
| `baseUrl`                                              | 否(Client 拼 URL)            | `ApiKeyCredential`(已有)                   |
| `region` / `site` / `switchAgent`                      | **是**(dry-run 分支展示)     | **Settings + ConsoleCredential**(受控重叠) |
| `workspaceId`                                          | **是**(塞请求 `data` + 校验) | **Settings**                               |
| `output` / `timeout` / `default*Model` / `verbose` / … | 是                           | Settings                                   |

依据:`dry-run` 只 `emitResult({ request: body })` 不打印 URL(见 `commands/video/generate.ts`),所以 baseUrl 不必留在 settings;baseUrl 与 key 是 region 绑定的;workspaceId 的消费者全是 `auth:"console"` 命令,来自 console 登录回调,但**命令要读它的值**,故归 settings。console 三元组同理:`mcp/list`、`quota/check`、`console/call` 的 dry-run 分支要**展示** region/site(e2e 有断言),命令读它 → 归 Settings;真实调用由 `resolveConsole` 再解析进 credential(受控重叠,同一条 flag>file 链)。dry-run 各域输出不一致(model 域不打路由、console 域打)属 dry-run 规范问题,推后统一(§9),本次不为它引入新概念。

---

## 2. 目标类型

`packages/core/src/config/schema.ts`(`ConfigFile` 磁盘格式**不变**;新增 `Identity` / `Settings`,删除旧 `Config`):

```ts
/** 静态产品身份,createCli 注入一次(bl/rag 各异,故注入,非模块常量)。*/
export interface Identity {
  binName: string;
  version: string;
  npmPackage: string;
  clientName: string; // CliOptions 必填,无默认
}

/** 命令唯一会读的配置面(解析后的有效值)。不含身份/连接/作用域/秘密。*/
export interface Settings {
  configPath?: string;
  output: "text" | "json";
  outputDir?: string;
  timeout: number;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageModel?: string;
  defaultSpeechModel?: string;
  defaultOmniModel?: string;
  workspaceId?: string; // 命令读它 → 归 settings
  consoleRegion?: string; // console 三元组:dry-run 展示要读 → 归 settings;真实调用另经 resolveConsole 进 credential
  consoleSite?: "domestic" | "international";
  consoleSwitchAgent?: number;
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
  telemetry: boolean;
}
```

`packages/core/src/auth/types.ts`(**已经和方案一致,无需改**):

```ts
export interface ApiKeyCredential {
  token;
  baseUrl;
  source: "flag" | "env" | "config";
}
export interface ConsoleCredential {
  token;
  region;
  site: "domestic" | "international";
  switchAgent?;
  source;
}
export interface AuthState {
  apiKey?: ApiKeyCredential;
  console?: ConsoleCredential;
}
```

新增管理能力接口(建议放 `config/` 与 `auth/`):

```ts
export interface ConfigStore {
  read(): ConfigFile;
  write(patch: Partial<ConfigFile>): Promise<void>; // writeConfigFile 本身 async
  unset(keys: (keyof ConfigFile)[]): Promise<void>; // 删 key 语义:Partial 表达不了 absent,单独给动词
  reset(): void;
  path: string;
}
// login 揽下登录回调的全部落盘(access_token/base_url/console_*/workspace_id):
// 登录产生的写入属 auth 域职责,configStore 的 lint 边界不为 auth 命令放宽。
export interface AuthStore {
  describe(): AuthState;
  login(opts): Promise<void>;
  logout(): void;
}
```

命令上下文 `packages/core/src/types/command.ts`(单一类型 + 惰性访问器):

```ts
export interface CommandContext<F extends FlagsDef = FlagsDef> {
  identity: Identity;
  settings: Settings;
  flags: ParsedFlags<F>; // 只含本命令声明的 flag(不含全局)
  client: Client;
  configStore(): ConfigStore; // 惰性;lint 限定只在 commands/config/** 使用
  authStore(): AuthStore; // 惰性;lint 限定只在 commands/auth/** 使用
}

export interface Command<F extends FlagsDef = FlagsDef> {
  description: string;
  auth: AuthRequirement; // 凭证要求,不变
  flags?: F;
  usageArgs?;
  exampleArgs?;
  notes?;
  validate?: (flags: ParsedFlags<F>) => string | undefined; // 收窄:只看命令自己的 flag
  run: (ctx: CommandContext<F>) => Promise<void>;
}
export const defineCommand = <F extends FlagsDef>(spec: Command<F>) => spec;
```

运行时组合根(runtime 内部,中间件用;命令拿到的是窄视图 `CommandContext`):

```ts
export interface RunContext<F extends FlagsDef = FlagsDef> extends CommandContext<F> {
  path: string[];
  command: AnyCommand;
  sources: ResolutionSources; // 内部:providers / 访问器用;业务命令看不到(类型不暴露)
}
```

---

## 3. Client(结构化入参 + console 收口)

`packages/core/src/client/client.ts`:

```ts
class Client {
  constructor(private deps: {
    identity: Identity;
    settings: Settings;           // 只读 timeout / verbose
    apiCred?: ApiKeyCredential;
    consoleCred?: ConsoleCredential;
  }) {}

  requestJson<T>(opts): Promise<T>          // 用 apiCred.token + apiCred.baseUrl;UA 用 identity
  request(opts): Promise<Response>
  get baseUrl(): string { return this.deps.apiCred!.baseUrl; }   // 删掉 ?? config.baseUrl 兜底

  // console 域:收口 callConsoleGateway,内部从 consoleCred 注入 region/site/switchAgent/token。
  // dry-run 展示不走 client:命令读 settings.console* 经 effectiveConsoleGatewayConfig(见 §4)。
  callConsole({ api, data }): Promise<unknown>
  uploadFile(...); mcp(...);
}
```

- `http.ts` 的 `request(config, opts)` / `requestJson`:改为从 `identity` 取 `clientName`(UA)、从 `settings` 取 `timeout`/`verbose`。建议 Client 把它需要的窄参数传进去(userAgent/timeout/verbose),而不是整个对象。
- `http.ts` 里 `!opts.noAuth` 分支现在会自己 `resolveApiKeyCredential(config)` —— 改为不再从 config 解析;Client 已注入 Authorization。梳理直接调用方(见 §7)。

---

## 4. 解析边界(单一源对象 + provider chain)

`packages/core/src/config/loader.ts`(把 `loadConfig(flags)` 拆掉):

```ts
// flags 收 Partial:ParsedFlags 里 switch 是必填 boolean,收 Partial 让 pipeline 传 {} 不必 as any
export interface ResolutionSources {
  flags: Partial<GlobalFlags>;
  file: ConfigFile;
  env: NodeJS.ProcessEnv; /* profile?: 未来 */
}

export function buildSources(globalFlags: GlobalFlags): ResolutionSources {
  return { flags: globalFlags, file: readConfigFile(), env: process.env };
}

/** 纯解析:不含身份、不含 baseUrl/console*、不含鉴权源;保留 timeout 校验逻辑。*/
export function buildSettings(s: ResolutionSources): Settings {
  /* 各字段按既有链保真移植(链不统一,见 §9);锁定表 tests/config-priority.test.ts */
}
```

`packages/core/src/auth/resolver.ts`(改吃 sources):

```ts
const apiKeyChain = [fromFlag, fromEnv, fromFile]; // 顺序即优先级
export function resolveApiKey(s: ResolutionSources): ApiKeyCredential; // { token, baseUrl: flags.baseUrl ?? file.base_url ?? env ?? REGIONS.cn, source }
export function resolveConsole(s: ResolutionSources): ConsoleCredential; // { token: file.access_token, region, site, switchAgent, source }
export function describeAuth(s: ResolutionSources): AuthState; // auth status 用
```

`packages/core/src/console/gateway.ts`:`callConsoleGateway` 改为从 `Client.callConsole` 传入的 consoleCred 取 region/site/switchAgent;`effectiveConsoleGatewayConfig` 参数从 `Config` 收窄为 settings 的 console 三元组,继续服务 dry-run 分支的展示(默认值 cn-beijing/domestic 仍在此兜)。credential 与 settings 两份三元组走同一条 flag>file 链,解析共用同一内部小函数防漂移。

---

## 5. dispatch 流程(`packages/runtime/src/create-cli.ts`)

```ts
case "run": {
  // 1) 一次解析(全局 + 凭证域 + 命令 flag 合并)
  const credDefs = credentialFlagDefs(res.command);
  const parsed = parseFlags(res.rest, {
    ...GLOBAL_FLAGS,
    ...credDefs,
    ...res.command.flags,
  });

  // 2) 分流(见下"分流规则"),validate 收收窄后的 ownFlags(与 §2 签名一致,别传 parsed)
  const globals  = pick(parsed, [...Object.keys(GLOBAL_FLAGS), ...Object.keys(credDefs)]); // 全局+凭证域 → sources
  const ownFlags = pick(parsed, Object.keys(res.command.flags ?? {})); // 命令声明的 → ctx.flags
  const invalid = res.command.validate?.(ownFlags);
  if (invalid) throw new UsageError(invalid);

  // 3) 建源一次 → settings
  const sources  = buildSources(globals);
  const settings = buildSettings(sources);

  // 4) 组 ctx;惰性访问器;client 由 authStage 填
  const ctx: RunContext = {
    identity, settings, flags: ownFlags, client: undefined,
    configStore: () => makeConfigStore(sources),
    authStore:   () => makeAuthStore(sources),
    path: res.path, command: res.command, sources,
  };
  await runMiddleware(ctx);     // authStage 用 sources 解析 credential、建 client
  await res.command.run(ctx);   // 统一一句,无分叉
  await flushTelemetry(1000);
}
```

**分流规则(重要):**

> **全局 flag + 当前命令可见的凭证域 flag 进 `sources`;命令自有 flag 进 `ctx.flags`。**

为什么这样:`MODEL_AUTH_FLAGS` / `CONSOLE_AUTH_FLAGS` 只按命令 `auth` 暴露,既保证 `--api-key` / `--console-region` 这类域 flag 能进入 credential/settings 解析链,也避免无关命令误收跨域 flag。历史同名遮蔽已清理,命令自有 flag 与全局/域 flag 不再受控重叠。

**同名守卫**:registry 构建时断言 —— 命令自有 flag 与全局/凭证域 flag 同名即报错。分流规则依赖"同一 key 只归一个域"这一约束,防止未来新增 flag 时把同名值静默分到错误通道。

`authStage`(`packages/runtime/src/middleware.ts`):

```ts
const authStage = async (ctx, next) => {
  const base = { identity: ctx.identity, settings: ctx.settings };
  if (ctx.command.auth === "apiKey")
    ctx.client = new Client({ ...base, apiCred: resolveApiKey(ctx.sources) });
  else if (ctx.command.auth === "console")
    ctx.client = new Client({ ...base, consoleCred: resolveConsole(ctx.sources) });
  else ctx.client = new Client(base);
  // dry-run:apiKey/console 两域 resolve 失败都不抛,保持"dry-run 无需凭证"现状
  // (console 的 dry-run 分支不走 client,展示读 settings.console*;真实执行仍 fail fast)
  await next();
};
```

`identity` 来自 `CliOptions`(`createCli` 的入参),在 createCli 里构造一次:`{ binName, version, npmPackage, clientName }`。`CliOptions.clientName` 由可选改**必填**、删 `?? binName` 默认(create-cli.ts:65);bl 的 main.ts 本就显式传 `"bailian-cli"`,无调用方受影响。

---

## 6. 字段迁移对照(旧 `Config` → 去向)

| 旧 `Config` 字段                                            | 去向                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `clientName` / `clientVersion`                              | **Identity**(`clientName` / `version`)                               |
| `binName` / `npmPackage`                                    | **Identity**                                                         |
| `apiKey` / `apiKeyEnv` / `fileApiKey` / `fileAccessToken`   | **删除** → provider chain 从 sources 读                              |
| `baseUrl`                                                   | **ApiKeyCredential.baseUrl**(resolveApiKey 里解析)                   |
| `consoleSite` / `consoleRegion` / `consoleSwitchAgent`      | **Settings**(dry-run 展示)+ **ConsoleCredential**(真实调用),受控重叠 |
| `workspaceId`                                               | **Settings**                                                         |
| `output` / `outputDir` / `timeout` / `default*Model`        | **Settings**                                                         |
| `verbose` / `quiet` / `dryRun` / `telemetry` / `configPath` | **Settings**                                                         |
| `async` / `concurrent`                                      | **命令自有 flag**(`ASYNC_FLAG` / `CONCURRENT_FLAG`)                  |
| `yes`                                                       | **命令自有 flag**(`quota request`)                                   |
| `nonInteractive`                                            | **删除**                                                             |

---

## 7. 关键消费点改动清单(编译器会逐一列出;这些是已知的)

- `new Client(config, apiCred?, consoleCred?)` → `new Client({ identity, settings, apiCred?, consoleCred? })`(约 3 处)
- `client/http.ts` / `client/mcp.ts`:`config.clientName/clientVersion` → `identity.*`;`config.timeout` → `settings.timeout`;`config.verbose` → `settings.verbose`
- `telemetry/tracker.ts`:`clientVersion`(:133)→ `identity.version`;**authMethod(:122-126)现从 `config.apiKey/apiKeyEnv/fileApiKey/fileAccessToken` 推断,这四个字段将被删** —— 改为 telemetryStage 调 `describeAuth(ctx.sources)` 映射出 authMethod 后**传值**进 tracker(不传 store 句柄,遥测不该拿到 login/logout 能力);`extractParams` 改收 `ctx.flags`(它现在就过滤全局 flag + allowlist,产出逐字节不变,过滤全局那行可删)
- `client/client.ts:38`:`apiCred?.baseUrl ?? config.baseUrl` → `apiCred.baseUrl`
- 命令读 `config.binName`(约 6 处:`auth/status`、`usage/stats`、`mcp/list`、`quota/history`、`quota/request`)→ `identity.binName`(经 ctx)
- **console 收口**:约 12 处 `callConsoleGateway(config, token, {api,data})`(`app/list`、`workspace/list`、`usage/*`、`mcp/list`、`quota/*`、`console/call`)→ `ctx.client.callConsole({api,data})`;dry-run 里的 `effectiveConsoleGatewayConfig(config)` → `effectiveConsoleGatewayConfig(settings)`(签名收窄,不走 client)
- **workspaceId**:`usage/stats.ts` 的 `resolveWorkspaceId(config, flag)` → `requireWorkspaceId(ctx.settings, identity.binName)`。`--workspace-id` 已升入 `CONSOLE_AUTH_FLAGS`,进入 sources/settings,链为 flag > env > file。
- **config/auth 命令**:`readConfigFile/writeConfigFile/resolver` 直接调用 → 走 `ctx.configStore()` / `ctx.authStore()`
- **auth/login `validate`**:`!f.console && !f.apiKey`——`apiKey`/`baseUrl` 是它自己声明的 flag(`login.ts:15`),收窄后仍在 `ctx.flags`,**无需改**
- **pipeline**:`buildPipelineConfig`(伪造整套 GlobalFlags,`runtime/src/pipeline/bl-config.ts`)→ `buildSettings({ flags: {}, file: readConfigFile(), env })`(flags 已收 Partial,见 §4) + 强制 `output:'json'/quiet`;pipeline executor 是"迷你边界",给 step 构造 settings/client
- 其余把 `Config` 当类型用的地方 → `Settings`;ctx 字段 `config` → `settings`(`ctx.config` 仅 2 处、解构 `const { config } = ctx` 约 46 处 + 其函数体内 `config.` → `settings.`)

**命名注意**:

- 类型 `Config` → `Settings`;但 `\bConfig\b` 也出现在**注释/字符串**里("Config saved to"、"Config key …"),**不能盲目 sed**,要按类型位置改。
- `ConfigFile` / `readConfigFile` / `writeConfigFile` / `loadConfig`→`buildSettings` / `getConfigPath` / `configPath` 这些**不是** `Config` 类型,别误改。
- ctx 字段用 `settings`;访问器 `configStore()` / `authStore()`(不用 `config`/`auth`,避免和 god-config、`command.auth` 撞名)。

---

## 8. 分阶段落地(strangler:只加不删、双轨过渡、最后删旧)

> 原则:**每阶段结束 `npx vp check` 真绿**,可提交、可交接;破坏性签名变更与其全部调用点落在同一阶段;跨阶段共存的旧载体最后统一删。改 core 后 `pnpm -F bailian-cli-core build`。

0. **行为锁定测试(已完成)**:`packages/core/tests/config-priority.test.ts` 锁住各字段既有优先级链(11 用例,绿)——阶段 1 写 `buildSettings` 时把同一张表指向它,任何链被归一/写错立刻红。dry-run 那族已有 `packages/cli/tests/e2e/console-flags.e2e.test.ts` 覆盖(无登录环境即锁未登录路径);可顺手加 `BAILIAN_CONFIG_DIR` 隔离,保证在已登录的开发机上也走未登录路径。
1. **核心类型与解析(只加不删)**:schema.ts 加 `Identity`/`Settings`(**保留**旧 `Config`);新 `CommandContext`/`Command` 形状、`ConfigStore`/`AuthStore` 接口;loader 加 `buildSources`/`buildSettings`(保留 `loadConfig`);resolver/gateway 加吃 `ResolutionSources` 的新函数(旧签名保留)。
2. **边界切换(runtime 双轨)**:Client 换新构造 `{identity,settings,creds}` + `callConsole`/`describeConsoleTarget`,http/mcp/telemetry 改读 identity/settings —— 连同其**全部调用点**(dispatch、authStage、约 3 处 new Client)同阶段改完;dispatch 同时构造旧 `config` 与新 `settings`,`RunContext` 双挂(临时胶水),commands 仍读 `ctx.config` 不受影响。
3. **commands 迁移**:`config.` → `settings.`/`identity.`、console 收口到 `ctx.client.callConsole`、workspaceId helper、config/auth 命令改访问器。可按命令域拆成多次,每次都绿。
4. **pipeline**:executor 改迷你边界,删 bl-config 假 flags。
5. **删旧**:删 `Config`/`loadConfig`/gateway 旧签名/`ctx.config` 及双轨胶水 —— 编译器把漏网之鱼全部列出,逐一清零。
6. **lint 规则**(`configStore()`/`authStore()` 仅 `commands/config/**`、`commands/auth/**`)+ 全量 `npx vp check` + `npx vp test` 绿;`pnpm -F bailian-cli-core build`。**不 commit**,交用户确认。

---

## 9. 本次不做(已在钉钉文档记录,后续单独轮次)

- ~~**flag 清理**~~ **已完成**:`nonInteractive` 删除;`async`/`concurrent` 改为命令级共享定义;`yes` 收窄为 `quota request` 自有;原颜色 CLI flag / Settings 字段删除,颜色由 `NO_COLOR` + 实际输出流 `isTTY` 共同决定,内联判断收束到 runtime helper。
- ~~workspaceId 的 flag 源~~ **已完成**(flag 边界轮):`--workspace-id` 升入 `CONSOLE_AUTH_FLAGS`,链为 flag > env > file;stats 删除自有声明与命令内优先级。(优先级链归一与同名遮蔽清理亦已完成:baseUrl 前置翻转见 §0,遮蔽经域化清零见 §5。)
- **dry-run 输出规范统一**:各域输出现状不一致 —— model/app 域只打请求 body(不含 URL/baseUrl),console 域额外打 api 名 + region/site 路由信息。应一次定规范、跨域对齐(是否展示路由、展示哪些字段);届时若 console 域不再展示,console 三元组可从 Settings 撤出、收敛为纯 credential。**本次保持现状输出**(e2e 有断言)。
- ~~全局↔命令私有 flag 同名遮蔽清理~~ **已完成**(flag 边界轮,经域化):16 处遮蔽全删,凭证 flag 按 `auth` 域可见,跨域报 Unknown flag,守卫升级为同名即抛。
- **key ↔ baseUrl 强校验**(region 锁)。落点已就位:`resolveApiKey` 是唯一同时产出 `{token, baseUrl}` 的地方,校验加在它内部即可;baseUrl 不在 Settings,命令侧无法绕过绑定;`AuthStore.login` 已支持 `api_key` + `base_url` 成对落盘。
- **多 profile / 多身份**(arkcli 式)。结构已留缝:单一 `ResolutionSources` 边界 + credential 封装。
- **IOStreams 注入**(gh `Factory.IOStreams` / vercel `Client.stdout`);颜色 stream helper 已先行收束,完整 IOStreams 注入仍留后续轮次。
- `ConfigFile`(磁盘格式)不变;无用户可见 CLI 变化。

外部记录:钉钉文档 `https://alidocs.dingtalk.com/i/nodes/YMyQA2dXW7gYo6MzcZzzERNMWzlwrZgb`(全局 flag 对比、flag 清理项、遮蔽问题)。

---

## 10. 为什么这套一次到位、可逆不返工

- **单一 CommandContext + 惰性访问器**:idiomatic(gh `f.Config()`/`f.Config().Authentication()`、vercel `client.config`/`authConfig`、oclif `this.config`),无 `kind`、无多工厂、无分叉。
- **flag 收窄**:`ctx.flags` 只含命令 flag,与 `settings` 零重叠(遮蔽的 ~15 个是本次已知的受控例外)。
- **credential 扁平但封在 Client**:将来要结构化(secret/connection/scope 分层)是 Client 内局部重构,类型兜底、磁盘格式不变——故现在 YAGNI。
- **单一 `sources` 边界**:未来 profile 加一维,dispatch/ctx 形状不变。
- **provider chain**:加鉴权源 = 加一个 provider。

## 11. 参考实现(本地 clone,`../cli架构/`)

- **gh**(`github-cli/`):`cmdutil.Factory` = 单一 context;全局 flag 经 `PersistentPreRunE` 注入访问器(`repo_override.go`);config set 用 `f.Config().Set/Write`(`cmd/config/set/set.go`);auth login 用 `f.Config().Authentication().Login()`(`cmd/auth/login/login.go`)。**最贴合本方案。**
- **vercel**(`vercel/packages/cli/`):单一 `Client` 注入每个命令;`config`(GlobalConfig)与 `authConfig` 分离;token 优先级链(flag>env>file)。
- **oclif**(`oclif-core/`):`this.config`(静态+持久);`baseFlags`+`flags` 在 `parse()` 合并(注意:oclif 默认命令能看到全局 flag,我们比它更严——收窄)。
- **qwencloud** / **citty**:身份/元数据与 flags 分离;citty 薄 context,依赖注入留给使用者。
