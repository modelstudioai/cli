# RL / OPD 沙箱训练子系统

## 触发条件

- 增删改 `bl finetune rl *` / `bl finetune opd *` / `bl finetune runtime *` 命令
- 改执行隔离（凭据禁读、home 重定向、白名单代理、快照/暂存）或 OS 适配
- 改托管 Python 运行时（manifest / 安装生命周期 / doctor 自检 / 开发态 override）
- 改 RL / OPD 授权状态机或控制台网关授权接口

命令增删改的通用登记流程仍走 [command-add-remove.md](command-add-remove.md)；本文只沉淀本子系统特有的约束。

## 分层与关键文件

```
core（纯逻辑，不依赖 runtime/commands，不 process.exit）
  finetune/rl/config.ts      resolveTrainingSpec / buildTaskYaml：参数+YAML 深度合并，剥离 bailian 段
  finetune/rl/auth.ts        runRlAuthorization：可审计授权状态机（TS 侧调控制台网关）
  finetune/rl/types.ts       RlRunParams / RlJobSpec / IResolvedTrainingSpec
  isolation/                 两层隔离：app-layer（环境闭环）+ os-isolation（OS 强制）+ proxy + snapshot + paths
  rl-runtime/manifest.ts     清单 schema v2 解析 / 平台选择 / SHA256 完整性 / bundledRuntimeManifest
  rl-runtime/manifest-data.ts 随包受审查清单常量（由仓库根 runtime-manifest.json 生成，勿手改）
  rl-runtime/locks.ts        随包 universal 依赖锁文件（uv pip compile --generate-hashes 生成，勿手改）
  rl-runtime/manager.ts      resolveRuntime / installRuntime：独占锁→多源下载 CPython 校验→tar 解压→pip 装锁文件→自检→原子 READY
  rl-runtime/sandbox.ts      executeInSandbox：黑盒唯一执行入口（清单驱动初始化 + confinement + 结果归一化）
  rl-runtime/doctor.ts       runRuntimeDoctor / assertDoctorPassed：逐项自检 + 退出码归一化

commands（命令库，不决定产品路径）
  commands/finetune/rl-shared.ts        RL/OPD 命令组共享：executeRl / runRlJob / runRlAuthorize / RL_RUN_FLAGS / probeRlJob / followRlJob
  commands/finetune/rl-job-commands.ts  任务管理命令工厂：get/list/watch/logs/cancel/delete 按 domain（rl|opd）参数化
  commands/finetune/rl-*.ts             rl run/authorize + 工厂薄包装（domain=rl）
  commands/finetune/opd-*.ts            opd run/authorize + 工厂薄包装（domain=opd）
  commands/finetune/runtime-*.ts        runtime prepare / doctor

cli（产品入口）
  src/commands.ts            "finetune rl *" / "finetune opd *" / "finetune runtime *" 路径 map
```

`rl-shared.ts` 与 `rl-job-commands.ts` 是命令组内部共享，**不注册为命令**（不在 index.ts / commands.ts 出现）。RL 与 OPD 是两种训练类型，命令面对称独立（`finetune rl *` / `finetune opd *` 各自拥有 run/authorize/get/list/watch/logs/cancel/delete）；任务管理命令由 `rl-job-commands.ts` 的 domain 参数化工厂生成，仅文案、dry-run action 前缀与错误措辞随 domain 变化。受审查基线 dashscope 1.25.23 的 SDK CLI 面是 `rl run/get/list/logs/cancel`（**无 `jobs` 子组、无 delete、无顶层 --output**，JSON 输出是叶子级 `--output-format/-o json`，cancel 无 -o 且成功消息走 stderr）；delete 走宿主 `deleteFineTune`（RL/OPD 共用 fine-tunes 后端），watch/probe 同走宿主。`opd run` 强制 `training.type=pg_opd` 且 `--teacher-model` 必填，但 1.25.23 不含 pg_opd：真实提交 fail-fast（dry-run 仍可预览），查询类命令不受影响。kscli 不暴露 RL/OPD。

## 必查清单

### A. 保留 flag 守卫

- [ ] 命令自有 flag 不得与全局/确认/凭证保留 flag 同名（`registry.ts` register 会抛 `redeclares reserved flag`）。本子系统已踩过的坑：
  - 轮询超时用 `pollTimeout`（`--poll-timeout`，rl watch）/ `waitTimeout`（`--wait-timeout`，rl run），**不能**用 `timeout`（全局保留）；监控在 TS 宿主轮询 fine-tunes 端点（`getFineTune`），不再经沙箱 SDK wait
  - YAML 输入用 `configFile`（`--config-file`），**不能**用 `config`（profile 全局 flag）
  - `--yes` 由 runtime 注入，命令不得自声明
- [ ] 共享 helper 取 `ctx` 必须用泛型 `<F extends FlagsDef>(ctx: CommandContext<F>)`；`CommandContext<具体Flags>` 不能赋给 `CommandContext<FlagsDef>`（不变性）

### B. 执行隔离（安全底线，fail-closed）

- [ ] 环境闭环是硬性要求：`python -I` isolated 模式 + 全新最小环境 + home 重定向 + 凭据 deny 路径。OS 强制层（macOS SBPL / Linux bwrap）不可用时 fail-closed，不降级放行
- [ ] Windows AppContainer 当前为占位：全平台注册命令，运行时返回 `Not supported on Windows yet.`（中文 `Windows 暂不支持。`）。文案保持简单，不堆技术术语
- [ ] 负向测试不可删：沙箱内直接读真实 `~/.dashscope` 必须失败；`expanduser('~')` 必须等于任务 home。doctor 的 `credential-deny-negative` / `home-redirect` 是必过项
- [ ] 白名单代理拒无关域名 / 私网 / metadata IP，只允许 CONNECT 443；doctor 用回环真实断言，不依赖外网
- [ ] 用户业务 requirements 只被读取/上传，**绝不**进入 SDK 执行器安装步骤

### C. 托管运行时（黑盒清单驱动 · 首次下载+缓存）

- [ ] 沙箱是工程内本地 TS 黑盒（`sandbox.ts` `executeInSandbox`）：命令层只传 SDK 参数+凭证+prepare，黑盒内部按受审查清单首次下载/缓存运行时并 confinement 执行；外围 `executeRl` 保持最薄，不再分别编排 resolveRuntime / executeIsolatedRun
- [ ] 清单默认取随包受审查产物（`bundledRuntimeManifest`，schema v2）：每平台 CPython（python-build-standalone install_only）+ 全平台共用 dashscope wheel（PyPI）；固定 CPython 3.11.9 + dashscope 1.25.23（端到端真实训练验证过的组合），求稳不耦合发版。改清单改仓库根 `runtime-manifest.json` 后重生成 `manifest-data.ts`（有同步测试守卫）
- [ ] 真实下载源：CPython 哈希取自 python-build-standalone 20240415 官方 SHA256SUMS；dashscope wheel SHA `7cb2cc48…` 取自 PyPI（等于基线 `RL_DASHSCOPE_WHEEL_SHA256`）。SHA 只能真实计算/取自官方，绝不臆造
- [ ] FC_PYPI_LIB 注入链（用户零感知）：`sandbox.ts` 从 `runtime.dashscopeVersion` 派生 `FC_PYPI_LIB=dashscope==<version>`，经 `IIsolatedRunInput.sdkEnv` → `IIsolationSpec.sdkEnv` → `buildSandboxEnv` 受控注入（绝不从宿主继承）。机理：start.sh 的 SERVER_CLASSPATH 默认模块路径由**提交端 SDK 版本**决定，FC_PYPI_LIB 只决定 FC 内 pip 装哪个 dashscope，两者锁步才不会启动即崩。override 运行时版本经 `importlib.metadata` 实测（不谎报基线常量）；doctor `fc-pypi-lib-injected` 是必过项
- [ ] 安装生命周期：多源下载 CPython→逐源校验 SHA256→系统 tar 解压→ensurepip→`pip install --require-hashes -r` 随包 universal 锁文件→版本/import 自检→原子 READY。中断不生成 READY；run 用解释器绝对路径，不 source activate、不改全局 PATH
- [ ] 下载韧性：CPython 走多源候选（`pythonDownloadCandidates`：`BAILIAN_RL_PYTHON_MIRROR` 自定义镜像优先 → GitHub canonical → 内置 npmmirror 回退），单次下载带超时（停滞快速失败转镜像，不无限挂起）；逐源校验同一 SHA256，换源不换哈希，任一源网络失败或哈希不符转下一源，全部失败才报错。npmmirror（阿里 CNPM）与 GitHub release 路径 1:1、已核验字节级一致（SHA 命中官方）。pip 索引可经 `BAILIAN_RL_PIP_INDEX_URL` 指向稳定 PyPI 镜像（清华 `pypi.tuna.tsinghua.edu.cn/simple` / 阿里 `mirrors.aliyun.com/pypi/simple`，自托管 wheel 可绕开受限地区卡住的 files.pythonhosted.org CDN 路由），默认 PyPI 不变；`--require-hashes` 仍逐包校验哈希。注意镜像同步滞后于 PyPI：锁文件钉精确传递依赖版本（如 regex），镜像缺该版本时 pip fail-closed 报 `No matching distribution found for X==ver`，换更新更快的镜像或回默认 PyPI（已 live 验证：阿里 lag 缺 regex 新版失败、tuna 齐全成功 READY）。镜像只换来源，绝不跳过 hash
- [ ] 依赖锁文件随包（`locks.ts`，universal 全平台 wheel 哈希），升级固定 dashscope 版本时重生成；1.25.23 未声明 pyyaml/tenacity（缺则 AgenticRL import 崩，且 CLI 懒注册会静默吞掉 rl 子命令），重生成时输入须显式带上它们及 fastapi/uvicorn/opentelemetry/tiktoken；绝不安装用户业务 requirements
- [ ] 开发态 `BAILIAN_RL_RUNTIME` 指向本机 dashscope Python 目录跳过发行校验联调；不支持平台返回 RUNTIME_UNAVAILABLE
- [ ] doctor 运行时缺失时相关项标 `skip`（不当通过），整体 `ok=false`；增强项（内核网络/进程树/内存）不可用降级提示，不阻断

### D. 授权状态机

- [ ] `auth.ts` 的控制台 API 名与响应形状是 **UNVERIFIED CONTRACT**（取自产品设计，未对线上网关核验）。`extractEnabledFlag` 防御性解析，无识别形状降级 `UNKNOWN`，不臆断开通/未开通
- [ ] 只读 probe 不做任何 mutation；`authorize: true` 才补角色/开通，且**只开请求目标**（RL 不自动开 OPD，反之亦然）
- [ ] 查询失败一律 `UNKNOWN`（绝不 READY/MISSING）；缺准入白名单是 `REQUIRES_USER_ACTION`，不能靠 createSLR 解决
- [ ] authorize 命令 `auth: "console"`，用 `defineConsoleReadCommand` 包装做 workspace 绑定；risk high，CI 须显式 `--authorize --yes`，单独 `--yes` 不扩大权限
- [ ] 核验线上契约后：更新 `RL_AUTH_API` 与响应解析，并补真实网关集成测试

### E. 风险闸门与文案

- [ ] `rl run` / `opd run` 声明 `risk.reason: "billing"`；`rl cancel` / `delete` 声明 destructive；静态 risk 命令在远端请求/本地写入前处理 `settings.dryRun`
- [ ] 用户可见文案中英双语；服务端错误原样透传（不翻译，见 [error-hint-change.md](error-hint-change.md)）
- [ ] `exportApiCredential` 受 lint 限定，仅 `rl-shared.ts` 执行器有窄范围 override（`vite.config.ts`）；不要扩散到整个 finetune 族

### F. 注册与文档

- [ ] 四步登记：实现文件 → `commands/src/index.ts` re-export → `cli/src/commands.ts` map → `commands/tests/e2e/topic-routes.ts`（FINETUNE_ROUTES）
- [ ] reference 按一级命令组生成：RL/OPD/runtime 均属 `finetune` 组，自动并入 `skills/bailian-finetune/reference/finetune.md`，`GROUP_OWNER_SKILL` 无需改；跑 `pnpm run sync:skill-assets`，勿手改生成物
- [ ] 拥有方 `skills/bailian-finetune/SKILL.md` 路由表补意图；hub `bailian-cli` 不抄领域明细
- [ ] README.md / README.zh.md 与 packages/cli 两份保持一致（release 强校验）

## 测试

- core 单测：`packages/core/tests/rl-config.test.ts` / `rl-auth.test.ts` / `rl-isolation-*.test.ts` / `rl-runtime-*.test.ts`，从 `../src/index.ts` 导入，fs/env 用 `helpers/isolation.ts`，mock 网络用 `vi.spyOn(httpTransport, "fetch")`
- commands E2E：`packages/commands/tests/e2e/`（需注册后才能跑 `runCommandInProcess` / `runCommandHelp`），真实集成 gated（需 API key / console token / 已准备运行时）
- 全量注册守卫：`packages/cli/tests/e2e/registry.smoke.e2e.test.ts` 构建完整产品 map，捕获保留 flag 冲突
- 定向执行 + 记录耗时，见 [cli-e2e-tests.md](cli-e2e-tests.md)；全仓 `vp test` 本机可能静默 exit 1，须定向跑

## 常见漏点

- ✗ 用 `timeout` / `config` 作命令自有 flag → 注册时抛 reserved flag
- ✗ 共享 helper 用非泛型 `CommandContext` → TS2345 不变性报错
- ✗ 删负向测试或放宽 doctor 必过项来"提速" → 破坏安全底线
- ✗ 把授权查询失败当作未开通去 createSLR / enable → 撒谎；应记 UNKNOWN
- ✗ authorize 跨开另一种训练模式（RL 开了 OPD）→ 违反只开请求目标
- ✗ 手改 `skills/*/reference/*.md` → 下次 generate 覆盖
- ✗ 在注释/文档引用仓外私有设计文档的章节号/文件名 → 开源读者无上下文，注释须自解释
- ✗ 把运行时初始化摊回外围（在 `executeRl` 里直接 resolveRuntime + 组装命令）→ 违背黑盒边界，初始化须在 `sandbox.ts` 内部
- ✗ 臆造下载 URL/SHA256，或把稳定运行时构建塞进发版流水线 → 求稳解耦，下载源与哈希取自官方、一次下载长期缓存
