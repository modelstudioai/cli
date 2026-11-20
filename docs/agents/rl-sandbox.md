# RL / OPD 沙箱训练子系统

## 触发条件

- 增删改 `bl finetune rl *` / `bl finetune opd *` / `bl finetune runtime *` 命令
- 改执行隔离（凭据禁读、home 重定向、白名单代理、快照/暂存）或 OS 适配
- 改托管 Python 运行时（manifest / 安装生命周期 / doctor 自检 / 开发态 override）
- 改沙箱产物生命周期（任务目录销毁 / 孤儿 TTL 回收 / 旧版本运行时清理 / runtime clean）
- 改 RL / OPD 授权状态机或控制台网关授权接口

命令增删改的通用登记流程仍走 [command-add-remove.md](command-add-remove.md)；本文只沉淀本子系统特有的约束。

## 分层与关键文件

```
core（纯逻辑，不依赖 runtime/commands，不 process.exit）
  finetune/rl/config.ts      resolveTrainingSpec / buildTaskYaml：参数+YAML 深度合并，剥离 bailian 段
  finetune/rl/auth.ts        runRlAuthorization：可审计授权状态机（TS 侧调控制台网关）
  finetune/rl/types.ts       RlRunParams / RlJobSpec / IResolvedTrainingSpec
  isolation/                 两层隔离：app-layer（环境闭环 + 调用结束销毁 taskDir）+ os-isolation（OS 强制）+ proxy + snapshot + paths + cleanup（产物回收）
  rl-runtime/manifest.ts     清单 schema v2 解析 / 平台选择 / SHA256 完整性 / bundledRuntimeManifest
  rl-runtime/manifest-data.ts 随包受审查清单常量（由仓库根 runtime-manifest.json 生成，勿手改）
  rl-runtime/locks.ts        随包 universal 依赖锁文件（uv pip compile --generate-hashes 生成，勿手改）
  rl-runtime/manager.ts      resolveRuntime / installRuntime：独占锁→多源下载 CPython 校验→tar 解压→pip 装锁文件→自检→原子 READY
  rl-runtime/sandbox.ts      executeInSandbox：黑盒唯一执行入口（清单驱动初始化 + confinement + 结果归一化）
  rl-runtime/doctor.ts       runRuntimeDoctor / assertDoctorPassed：逐项自检 + 退出码归一化

commands（命令库，不决定产品路径）
  commands/finetune/rl-shared.ts        RL/OPD 命令组共享：executeRl / runRlJob / runRlAuthorize / RL_RUN_FLAGS / probeRlJob / followRlJob（后两者支持可选 workspaceId）
  commands/finetune/rl-job-commands.ts  任务管理命令工厂：get/watch/logs/cancel/delete 按 domain（rl|opd）参数化；opd 走宿主 fine-tunes OpenAPI，rl 走沙箱 SDK；list 仅 RL（opd list 已删，与 finetune list 冗余同源）
  commands/finetune/dataset-input.ts    create / opd run 共享的数据集解析+延迟上传管线（从 create.ts 提取）
  commands/finetune/rl-*.ts             rl run/authorize + 工厂薄包装（domain=rl）
  commands/finetune/opd-run.ts          OPD 提交：宿主 OpenAPI，create 风格 flag，零网络 dry-run，超参不填默认（charge_type 例外，见下）
  commands/finetune/opd-params.ts       OPD 参数查询（training_type=pg_opd，hyper/resource 分组）
  commands/finetune/opd-*.ts            opd authorize + 工厂薄包装（domain=opd）
  commands/finetune/runtime-*.ts        runtime prepare / doctor / clean（仅 RL 需要）

cli（产品入口）
  src/commands.ts            "finetune rl *" / "finetune opd *" / "finetune runtime *" 路径 map
```

`rl-shared.ts` 与 `rl-job-commands.ts` 是命令组内部共享，**不注册为命令**（不在 index.ts / commands.ts 出现）。RL 与 OPD 是两种训练类型，命令面对称独立（`finetune rl *` / `finetune opd *`），但**后端不同**：RL 的 run/get/list/logs/cancel 走沙箱 SDK（受审查基线 dashscope 1.25.23 的 CLI 面是 `rl run/get/list/logs/cancel`，**无 `jobs` 子组、无 delete、无顶层 --output**，JSON 输出是叶子级 `--output-format/-o json`，cancel 无 -o 且成功消息走 stderr）；**OPD 全组在宿主直连 fine-tunes OpenAPI**（run 提交 `training_type=pg_opd` + `teacher_model`，get/logs/cancel/delete/watch 走 core 的 fine-tunes wrapper；**无 opd list**——2026-11-18 删除，与 `finetune list` 冗余同源，OPD 任务直接用通用 list 查），不经沙箱、不需要托管运行时。任务管理命令仍由 `rl-job-commands.ts` 的 domain 参数化工厂生成，domain=opd 时切宿主后端并追加可选 `--workspace-id`，logs flag 为 `--page/--page-size`（RL 保持 `--offset/--lines`）。OPD 超参按用户提供值原样发送（JSON 文件 + `--hp` 覆盖），**不填参数接口 recommend_value**（它不是所选教师的有效默认值），未指定字段交服务端/教师解析；显式覆盖值按 hyper+resource 两组 schema 校验（`save_strategy` 即使 schema 未列出也放行，服务端校验器允许）。唯一本地默认是 `resource_config.charge_type`：服务端对 pg_opd 只接受 MTU 计费（缺失时按通用默认计费拒绝，400 "only support mtu charge type"），故缺省填 `mtu_postpaid`、显式传其他值本地报 USAGE。`mtu_spec_code`/`mtu_capacity` 为**本地必填**（文件或 flag 任一来源）：实测缺失时服务端落库后回 500、任务执行期 FAILED（2026-11-18，request_id 1d066588），故在上传/创建前报 USAGE 拦截；取值随师生组合变化，不填默认。本地前置校验套件（dry-run 同样生效）：唯一硬校验是 `opd_teacher_infer_tp == opd_teacher_n_gpus_per_node`（教师 Worker 模板约束，离线渲染取证）；其余均 warning 不拦——组合不在公开矩阵（`opd-model-matrix.ts`，官方文档"模型与训练单元"2026-11-18 快照，18 对邀测，URL 在 runtime/urls.ts `OPD_MODEL_MATRIX_DOC`；快照会过期故只提醒）、学生布局四字段不全（提示官方推荐 MTU4×24 与当前容量；容量等式检查服务端在执行期做，本地无模式合同算不了）、显式学生长度超过显式教师 max_model_len。**batch-fit 闸（2026-11-18 增，官方文档定义 + DLC 日志取证）**：`batch_size` 即官方"每步样本数"，总步数 = floor(本地训练集条数 × n_epochs / batch_size)；为 0 时执行期必炸 `lr_decay_steps > 0` 断言（ft-…e439：12 条 × 1 epoch / 64 = 0 步，创建返回 200 后 FAILED），故本地条数已知且 batch_size/n_epochs 显式时在上传/创建前报 USAGE——本地条数是预处理后的上界，"本地不够"是闭合硬拦，"本地够"不保证（预处理会过滤）。`ppo_mini_batch_size > batch_size × n_rollouts` 全显式时 USAGE（官方参数关系）。总步数可算时：显式 `lr_warmup_steps` ≥ 0 超总步数 → `OPD_WARMUP_EXCEEDS_STEPS`（文档建议小数据冒烟设 0）；`eval_steps`/`save_steps`（steps 策略）超总步数 → `OPD_INTERVAL_EXCEEDS_STEPS`（评估/保存不会触发）；batch_size/n_epochs 显式但条数未知（file-id）→ `OPD_BATCH_FIT_UNKNOWN`。纯函数在 `opd-batch-fit.ts`；skill `bailian-opd` 的 `lib.mjs` computeBatchFit/miniBatchLimit 同口径，preflight 有 batch-fit 阶段（用 dataset validate 的 totalRecords）。通用 finetune get 对带描述符的任务抑制空的 training_files/validation_files 旧字段（防"数据没传上"误导）。`opd params` 以 `training_type=pg_opd` 查参数接口；兼容教师发现服务端尚无合同，不做笛卡尔积；公开文档矩阵仅用于 warning 级提示，不用于硬拦截。watch/probe/delete 两域同走宿主。kscli 不暴露 RL/OPD。

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
- [ ] 任务目录生命周期绑定**调用**，不绑定 job 结果：`executeIsolatedRun` 的 finally 无条件 `rmSync(taskDir)`（成功/失败/超时同策，不保留）。SDK 不可断点续跑、taskDir 内全部产物可再生（spec 经 dry-run 重生成、start.sh 由 SDK 版本确定性生成、错误已经 stderr 脱敏输出），保留零收益。best-effort：清理失败不得掩盖执行结果；崩溃路径（SIGKILL/断电）孤儿由 TTL 兜底
- [ ] layout 随单次 `executeIsolatedRun` 调用消费：多次执行的调用方（如 doctor 多探针）**每次调用各自 `createTaskDir()`**，不得跨调用共享 layout——第二次执行的 `adapter.prepare` 会向已销毁目录写文件（darwin profile.sb）而 ENOENT。doctor 机制探测用实际执行的 `adapter.detect()`（与执行一致，注入 fake adapter 可确定性测试）；回归守卫见 `rl-runtime-doctor.test.ts` 多探针用例（prepare 写 marker 模拟 profile.sb）

### C. 托管运行时（黑盒清单驱动 · 首次下载+缓存 · 仅 RL；OPD 全组不经沙箱）

- [ ] 沙箱是工程内本地 TS 黑盒（`sandbox.ts` `executeInSandbox`）：命令层只传 SDK 参数+凭证+prepare，黑盒内部按受审查清单首次下载/缓存运行时并 confinement 执行；外围 `executeRl` 保持最薄，不再分别编排 resolveRuntime / executeIsolatedRun
- [ ] 清单默认取随包受审查产物（`bundledRuntimeManifest`，schema v2）：每平台 CPython（python-build-standalone install_only）+ 全平台共用 dashscope wheel（PyPI）；固定 CPython 3.11.9 + dashscope 1.25.23（端到端真实训练验证过的组合），求稳不耦合发版。改清单改仓库根 `runtime-manifest.json` 后重生成 `manifest-data.ts`（有同步测试守卫）
- [ ] 真实下载源：CPython 哈希取自 python-build-standalone 20240415 官方 SHA256SUMS；dashscope wheel SHA `7cb2cc48…` 取自 PyPI（等于基线 `RL_DASHSCOPE_WHEEL_SHA256`）。SHA 只能真实计算/取自官方，绝不臆造
- [ ] FC_PYPI_LIB 注入链（用户零感知）：`sandbox.ts` 从 `runtime.dashscopeVersion` 派生 `FC_PYPI_LIB=dashscope==<version>`，经 `IIsolatedRunInput.sdkEnv` → `IIsolationSpec.sdkEnv` → `buildSandboxEnv` 受控注入（绝不从宿主继承）。机理：start.sh 的 SERVER_CLASSPATH 默认模块路径由**提交端 SDK 版本**决定，FC_PYPI_LIB 只决定 FC 内 pip 装哪个 dashscope，两者锁步才不会启动即崩。override 运行时版本经 `importlib.metadata` 实测（不谎报基线常量）；doctor `fc-pypi-lib-injected` 是必过项
- [ ] 安装生命周期：多源下载 CPython→逐源校验 SHA256→系统 tar 解压→ensurepip→`pip install --require-hashes -r` 随包 universal 锁文件→版本/import 自检→原子 READY。中断不生成 READY；run 用解释器绝对路径，不 source activate、不改全局 PATH
- [ ] 沙箱 cwd 契约：SDK `create_deployment_files` 相对**进程 cwd** 写 `start.sh`（open+chmod）再按 `zipdir` 打包，原 demo 流程 cwd==zipdir。故 `executeInSandbox` 传 `cwd: layout.deployCopyDir`（可写且与 zipdir 一致）；默认 taskDir 不在写允许集会 EPERM（[2052] Registration failed），且落在包外会使上传 zip 缺启动脚本。doctor 等无代码包场景仍用默认 taskDir
- [ ] 下载韧性：CPython 走多源候选（`pythonDownloadCandidates`：`BAILIAN_RL_PYTHON_MIRROR` 自定义镜像优先 → GitHub canonical → 内置 npmmirror 回退），单次下载带超时（停滞快速失败转镜像，不无限挂起）；逐源校验同一 SHA256，换源不换哈希，任一源网络失败或哈希不符转下一源，全部失败才报错。npmmirror（阿里 CNPM）与 GitHub release 路径 1:1、已核验字节级一致（SHA 命中官方）。pip 索引可经 `BAILIAN_RL_PIP_INDEX_URL` 指向稳定 PyPI 镜像（清华 `pypi.tuna.tsinghua.edu.cn/simple` / 阿里 `mirrors.aliyun.com/pypi/simple`，自托管 wheel 可绕开受限地区卡住的 files.pythonhosted.org CDN 路由），默认 PyPI 不变；`--require-hashes` 仍逐包校验哈希。注意镜像同步滞后于 PyPI：锁文件钉精确传递依赖版本（如 regex），镜像缺该版本时 pip fail-closed 报 `No matching distribution found for X==ver`，换更新更快的镜像或回默认 PyPI（已 live 验证：阿里 lag 缺 regex 新版失败、tuna 齐全成功 READY）。镜像只换来源，绝不跳过 hash
- [ ] 依赖锁文件随包（`locks.ts`，universal 全平台 wheel 哈希），升级固定 dashscope 版本时重生成；1.25.23 未声明 pyyaml/tenacity（缺则 AgenticRL import 崩，且 CLI 懒注册会静默吞掉 rl 子命令），重生成时输入须显式带上它们及 fastapi/uvicorn/opentelemetry/tiktoken；绝不安装用户业务 requirements
- [ ] 开发态 `BAILIAN_RL_RUNTIME` 指向本机 dashscope Python 目录跳过发行校验联调；不支持平台返回 RUNTIME_UNAVAILABLE
- [ ] doctor 运行时缺失时相关项标 `skip`（不当通过），整体 `ok=false`；增强项（内核网络/进程树/内存）不可用降级提示，不阻断
- [ ] 产物回收（`isolation/cleanup.ts` `cleanupSandboxArtifacts`，计划式：先对每个目录产出 remove/keep 再执行，dry-run 零删除）：runs 按目录 mtime 超 TTL（默认 24h）回收孤儿；runtimes/rl 只保留 `currentManagedRuntimeId()`（随包清单派生）基线，旧版本目录回收；缺基线 id 时跳过运行时回收（fail-safe）。`runtime prepare` 顺手 prune runs（`pruneRuntimes: false`，best-effort 不阻断主流程，输出 `pruned_runs`）；`runtime clean`（auth none、risk destructive、`--ttl-hours`）做完整回收。下载缓存 `cache/rl`（按 SHA 内容寻址、跨版本复用）与 `BAILIAN_RL_RUNTIME` override 目录绝不触碰

### D. 授权状态机

- [ ] `auth.ts` 的控制台 API 名与响应形状是 **UNVERIFIED CONTRACT**（取自产品设计，未对线上网关核验）。`extractEnabledFlag` 防御性解析，无识别形状降级 `UNKNOWN`，不臆断开通/未开通
- [ ] 只读 probe 不做任何 mutation；`authorize: true` 才开通业务，且**只开请求目标**（RL 不自动开 OPD，反之亦然）；服务关联角色永不自动创建，缺失报 `REQUIRES_USER_ACTION` 并附手动授权文档（URL 经 `manualAuthDocUrl` 由命令层注入，core 不硬编码）
- [ ] 查询失败一律 `UNKNOWN`（绝不 READY/MISSING）；缺准入白名单/角色都是 `REQUIRES_USER_ACTION`，CLI 不创建角色
- [ ] authorize 命令 `auth: "console"`，用 `defineConsoleReadCommand` 包装做 workspace 绑定；risk high，CI 须显式 `--authorize --yes`，单独 `--yes` 不扩大权限
- [ ] 核验线上契约后：更新 `RL_AUTH_API` 与响应解析，并补真实网关集成测试

### E. 风险闸门与文案

- [ ] `rl run` / `opd run` 声明 `risk.reason: "billing"`；`rl cancel` / `delete` / `runtime clean` 声明 destructive；静态 risk 命令在远端请求/本地写入前处理 `settings.dryRun`
- [ ] 用户可见文案中英双语；服务端错误原样透传（不翻译，见 [error-hint-change.md](error-hint-change.md)）
- [ ] `exportApiCredential` 受 lint 限定，仅 `rl-shared.ts` 执行器有窄范围 override（`vite.config.ts`）；不要扩散到整个 finetune 族

### F. 注册与文档

- [ ] 四步登记：实现文件 → `commands/src/index.ts` re-export → `cli/src/commands.ts` map → `commands/tests/e2e/topic-routes.ts`（FINETUNE_ROUTES）
- [ ] reference 按一级命令组生成：RL/OPD/runtime 均属 `finetune` 组，自动并入 `skills/bailian-finetune/reference/finetune.md`，`GROUP_OWNER_SKILL` 无需改；跑 `pnpm run sync:skill-assets`，勿手改生成物
- [ ] 拥有方 `skills/bailian-finetune/SKILL.md` 路由表补意图；hub `bailian-cli` 不抄领域明细
- [ ] README.md / README.zh.md 与 packages/cli 两份保持一致（release 强校验）

## 测试

- core 单测：`packages/core/tests/rl-config.test.ts` / `rl-auth.test.ts` / `rl-isolation-*.test.ts` / `isolation-cleanup.test.ts` / `isolation-app-layer.test.ts`（fake adapter + 真实 node 子进程验 finally 销毁）/ `rl-runtime-*.test.ts`，从 `../src/index.ts` 导入，fs/env 用 `helpers/isolation.ts`，mock 网络用 `vi.spyOn(httpTransport, "fetch")`
- commands E2E：`packages/commands/tests/e2e/`（需注册后才能跑 `runCommandInProcess` / `runCommandHelp`），真实集成 gated（需 API key / console token / 已准备运行时）
- 全量注册守卫：`packages/cli/tests/e2e/registry.smoke.e2e.test.ts` 构建完整产品 map，捕获保留 flag 冲突
- 定向执行 + 记录耗时，见 [cli-e2e-tests.md](cli-e2e-tests.md)；全仓 `vp test` 本机可能静默 exit 1，须定向跑

## 常见漏点

- ✗ 用 `timeout` / `config` 作命令自有 flag → 注册时抛 reserved flag
- ✗ 共享 helper 用非泛型 `CommandContext` → TS2345 不变性报错
- ✗ 删负向测试或放宽 doctor 必过项来"提速" → 破坏安全底线
- ✗ 把授权查询失败当作未开通去 enable → 撒谎；应记 UNKNOWN（角色缺失只引导手动授权，不创建）
- ✗ authorize 跨开另一种训练模式（RL 开了 OPD）→ 违反只开请求目标
- ✗ 手改 `skills/*/reference/*.md` → 下次 generate 覆盖
- ✗ 在注释/文档引用仓外私有设计文档的章节号/文件名 → 开源读者无上下文，注释须自解释
- ✗ 把运行时初始化摊回外围（在 `executeRl` 里直接 resolveRuntime + 组装命令）→ 违背黑盒边界，初始化须在 `sandbox.ts` 内部
- ✗ 臆造下载 URL/SHA256，或把稳定运行时构建塞进发版流水线 → 求稳解耦，下载源与哈希取自官方、一次下载长期缓存
- ✗ 用参数接口 recommend_value 批量填充 OPD 超参 → 覆盖所选教师的真实默认（如 Flash/Max 教师长度 16385 ≠ 通用 34816）；未指定字段留空交服务端解析
- ✗ 失败/超时保留 taskDir 供“重试复用/排查” → SDK 不可断点续跑，网络步骤每次重做，产物全部可再生，保留零收益只泄漏磁盘与代码；生命周期绑定调用，结果连保留策略都不影响
- ✗ 多次 `executeIsolatedRun` 共享一个 layout（doctor 旧实现）→ 首次调用 finally 销毁 taskDir 后，下次 prepare 写 profile.sb ENOENT；每次调用各自 createTaskDir，不引入 keep opt-out
- ✗ 自动回收触碰当前基线运行时 / override 开发目录 / 下载缓存 → 复用边界是“不可变层按版本寻址”，回收只动孤儿 runs 与被取代的旧版本目录
