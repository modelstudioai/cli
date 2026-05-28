# 批量压测脚本（多能力统一入口）

**使用者文档**（方案说明、命令示例、fixtures、默认值表）：[../stress-testing.md](../stress-testing.md)

## 触发条件

- 新增、修改或排查 `packages/cli/tests/stress/**/*.mjs` 批量压测代码
- 用户要求并发压测 `bl` 各能力（文本 / 语音 / 图像 / 视频等）、生成 Markdown/HTML 报告
- 修改对应命令的 JSON 输出字段后，需同步 `packages/cli/tests/stress/lib/parsers.mjs` 与各 `targets/*.mjs` 的成功判定
- 在 monorepo 根 `package.json` 调整 `test:stress` 入口

**不要**为压测去改 CLI 产品行为（除非用户明确要求修 CLI bug）；压测侧通过子进程参数与解析逻辑适配现有命令。

## 与 E2E / `vp test` 的关系

| 维度 | E2E（Vitest）                            | 批量压测（`.mjs`）                                                 |
| ---- | ---------------------------------------- | ------------------------------------------------------------------ |
| 路径 | `packages/cli/tests/e2e/*.e2e.test.ts`   | `packages/cli/tests/stress/run.mjs` + `targets/*.mjs`、`lib/*.mjs` |
| 运行 | `vp test`（真实 API 需 `BAILIAN_E2E=1`） | **仅手动** `pnpm run test:stress -- <target> -- ...`               |
| 目的 | 回归：help、缺参、dry-run、单条集成      | 并发、限流、耗时统计、批量报告、前置资源 fixtures                  |
| CI   | 可纳入 `vp test`（skip 块默认跳过）      | **禁止**默认 CI / `vp test` 自动执行                               |

`vp test` 只收集 `*.test.ts` / `*.spec.ts` 等，**不会**执行 `tests/stress/*.mjs`。勿将压测逻辑写成 Vitest 用例并放进默认测试流。

E2E 规范见 [cli-e2e-tests.md](cli-e2e-tests.md)。

## 文件与入口

```
packages/cli/tests/stress/
├── run.mjs                 # 路由入口（解析 target、全局 flags、`--`）
├── lib/
│   ├── argv-parse.mjs      # 共用 --count/-n、-c、-m、--voice、--report-dir 等
│   ├── stress-config.mjs   # count/concurrency 配置加载与解析
│   ├── cli-runner.mjs      # spawn main.ts、限流重试、线程池
│   ├── fixtures.mjs        # prerequisites.json + 前置音频/图/视频生成
│   ├── parsers.mjs         # 各命令 stdout / 文件解析
│   ├── paths.mjs
│   ├── rate-limit.mjs
│   ├── finish-run.mjs      # 写报告；套件模式返回摘要而不 exit
│   ├── run-suite.mjs       # 全量套件编排
│   ├── suite-catalog.mjs   # 用例顺序与中文名
│   ├── suite-report.mjs    # SUITE_REPORT.md / .html
│   ├── trace-ids.mjs       # requestId / taskId 提取
│   └── report.mjs          # REPORT.md / REPORT.html / results.json
└── targets/
    ├── text-chat.mjs
    ├── speech-synthesize.mjs
    ├── speech-recognize.mjs
    ├── image-generate.mjs
    ├── image-edit.mjs
    ├── video-t2v.mjs
    ├── video-i2v.mjs
    ├── video-ref.mjs
    └── video-edit.mjs
```

monorepo 根 `package.json`:

```json
"test:stress": "node packages/cli/tests/stress/run.mjs"
```

`pnpm` 会在子进程 argv 中插入 `--`；入口会**跳过**孤立的 `--`，因此 `pnpm run test:stress -- list` 与 `pnpm run test:stress list` 均可。

## 如何运行

在 **monorepo 根目录**执行（需已配置 `DASHSCOPE_API_KEY` 或 `~/.bailian/config.json`）:

```sh
# 顺序执行全部 9 个用例，并生成套件总报告 SUITE_REPORT.md（耗时长、会打真实 API）
pnpm run test:stress
pnpm run test:stress -- all -- --count 5 -c 2

# 列出全部 target
pnpm run test:stress -- list

# 文本对话
pnpm run test:stress -- text -- --count 20 -c 5

# 语音合成（音色可用 --voice 或环境变量 STRESS_TTS_VOICE）
pnpm run test:stress -- speech-tts -- --count 10

# 语音识别（先在同批次目录下生成 fixtures/setup-audio.mp3 等）
pnpm run test:stress -- speech-asr -- --count 5

# 生图 / 修图 / 视频类
pnpm run test:stress -- image-generate -- --count 50 -c 2
pnpm run test:stress -- image-edit --reuse-fixtures -- --count 10
pnpm run test:stress -- video-t2v -- --count 3 -c 1
pnpm run test:stress -- video-i2v --setup-only              # 仅生成前置图 + manifest
pnpm run test:stress -- video-edit --reuse-fixtures -- --count 3
```

**环境变量**：可写在 `pnpm` 前，例如 `COUNT=5 pnpm run test:stress -- video-t2v`。

**命令行参数**：`--` 之后传给具体 target（与旧 `stress:* -- --count` 语义一致）。

配置优先级：

- **任务数 / 并发**：命令行 `--count` / `-n`、`--concurrency` / `-c` > `packages/cli/tests/stress/stress.defaults.json`（或 `--stress-config` / `STRESS_CONFIG`）> `lib/stress-config.mjs` 中 `CODE_DEFAULTS`
- **其它参数**（如 `MODEL`）：命令行 > 环境变量 > target 内默认值

### 全局选项（由 `run.mjs` 解析，可从 argv 任意位置剥离）

| 选项                    | 含义                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `--reuse-fixtures`      | 若当前批次的 `fixtures/prerequisites.json` 已存在且校验通过，则不再跑前置 CLI   |
| `--setup-only`          | 仅生成前置资源并写入 manifest，不进入压测循环（适用于带 fixtures 的 target）    |
| `--fixtures-dir <path>` | 使用**已有**目录下的 `prerequisites.json`（不拷贝），满足本 target 所需字段即可 |

前置 manifest 写入路径：`{REPORT_DIR}/fixtures/prerequisites.json`（默认 REPORT_DIR 含时间戳）。

## 脚本架构（不可随意破坏的约束）

### 子进程调用方式

- **实际执行**：`node packages/cli/src/main.ts <args>`，`cwd` 为 `packages/cli`
- **禁止**用 `pnpm run dev` 跑子任务：`pnpm` 会向 stdout 打生命周期日志，污染 JSON 解析
- **报告中的「完整命令」**：用 `pnpm run dev ...` 展示（`buildDisplayCommand`）

### 必须带的 CLI 参数（通用）

- `--non-interactive`
- 除 `speech recognize` 外，压测子进程宜带 `--output json`（语音识别以 `--out` 文件为准 stdout 可能为纯文本）
- 异步类命令带 `--timeout`、对应 `--poll-interval`

**禁止**对子进程加 `--quiet`（与 `--output json` 并存时可能丢 `urls` / `video_url`）。

**禁止**对视频相关子进程加 `--no-wait`；须阻塞到任务完成（及下载路径正确时落盘）。

### 成功 / 失败判定（概要）

| Target / 能力 | 成功条件                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| text          | JSON 含有效 `choices[0].message.content` 或流式汇总后的 `content`                          |
| speech-tts    | JSON 含 `audio_url` / `audio_urls` 与 `saved`                                              |
| speech-asr    | 进程 exit 0，且 `--out` JSON 可被解析出 `transcripts` 文本（或 stdout 有非空正文作为兜底） |
| image         | JSON 含 `urls` 和/或 `saved`（不可仅凭 `task_id` 判失败）                                  |
| video         | JSON 含 `video_url` 和/或 `saved`（同上）                                                  |

详见 `lib/parsers.mjs`。

### 墙钟耗时

报告中的 **墙钟总耗时** = `finishedAt - startedAt`（整批真实经过时间），不是各任务 `durationMs` 之和。

## 默认参数（摘要）

各 target 默认值见对应 `targets/*.mjs` 文件头与常量；常见约定：

- **count / concurrency**：见仓库内 `packages/cli/tests/stress/stress.defaults.json`，可按 target 修改
- **video-t2v / i2v / ref / edit**：默认视频类较低 `COUNT`、并发多为 1，`TIMEOUT_MS` 可达 1 小时；前置 `video` fixtures 使用文生视频生成约 5s 样片
- **speech-asr**：默认 `POLL_INTERVAL=2`；输入音频由 `speech synthesize` 写入 fixtures

## 报告产物

### 单用例

每次运行在 `REPORT_DIR`（默认 `test/output/<target>-batch-<时间戳>/`）生成:

| 文件                          | 内容                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `REPORT.md`                   | 汇总与明细表（含 **Request ID**、**Task ID** 列，便于排查）                              |
| `REPORT.html`                 | 同上                                                                                     |
| `results.json`                | 精简后的原始结果（含 `requestId` / `taskId` 字段）                                       |
| `fixtures/prerequisites.json` | 需前置资源时：记录 `audio` / `image` / `video` 的 http URL、`saved` 本地路径与可复制命令 |

`requestId` / `taskId` 提取逻辑见 `lib/trace-ids.mjs`（**仅压测脚本**）：

- 成功时 CLI stdout 通常不含 `request_id`；压测会默认加 `--verbose`，从 stderr 的 `request_id:` / JSON 块解析
- 有 `task_id` 仍缺 `request_id` 时，压测会额外调用 DashScope `GET /tasks/{id}` 补齐（`lib/fetch-request-id.mjs`）
- 关闭方式：`STRESS_VERBOSE_REQUEST_ID=0`（不注入 `--verbose`）、`STRESS_FETCH_REQUEST_ID=0`（不查任务 API）

### 全量套件

`pnpm run test:stress`（无 target 或 `all`）在 `test/output/stress-suite-<时间戳>/` 下为每个用例建子目录，并生成:

| 文件                    | 内容                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `SUITE_REPORT.md`       | 各用例中文名、墙钟耗时、任务数、并发、成功/失败、成功率、子报告路径 |
| `SUITE_REPORT.html`     | 同上                                                                |
| `suite-results.json`    | 结构化汇总                                                          |
| `<canonical>/REPORT.md` | 该用例明细报告                                                      |

进程退出码：存在失败任务 → `1`，全部成功 → `0`。

根目录 `.gitignore` 已忽略 `test/`，压测产物勿提交。

## Agent 修改清单

### 只改压测脚本时

- [ ] `lib/paths.mjs` 解析的 `CLI_PACKAGE` / `MONOREPO_ROOT` 仍正确
- [ ] 子进程仍为 `node` + `src/main.ts`，未改回裸 `pnpm run dev` 执行任务
- [ ] 未对子进程加 `--quiet`，视频未加 `--no-wait`
- [ ] `parsers.mjs` 与文档中的成功判定一致
- [ ] 根 `package.json` 仅保留 `test:stress` 入口指向 `run.mjs`
- [ ] `node --check` 对相关 `.mjs` 通过，`pnpm run test:stress -- list` 可运行

### 改了某命令 JSON 输出时

- [ ] 同步 `lib/parsers.mjs` 及受影响 `targets/*.mjs`
- [ ] 有 API Key 时跑小规模：`pnpm run test:stress -- <target> -- --count 2 -c 1`

### 禁止（除非用户明确要求）

- [ ] 为压测专门改 CLI `--quiet` + `--output json` 行为
- [ ] 压测写进默认 `vp test` 路径且未 skip
- [ ] CI / `ready` 自动调用 `test:stress`

## 常见漏点

- 环境变量写在 `pnpm run test:stress` **之后** → 未注入进程
- **未知 target `"--"`**：已在新入口中跳过孤立 `--`；若仍报错请检查是否多空格或 shell 引用
- 高并发无节流 → DashScope Rate limit（exit 4）；应依赖脚本内限流或降低 `-c`
- `image-generate` 大批量开启 `REPORT_THUMBNAILS=1` → HTML 变慢
- 改压测却未同步本文档与 `AGENTS.md`/`CLAUDE.md` 索引

## 与 E2E 的分工

- **改命令选项、help、缺参、单条真实调用** → `tests/e2e/*.e2e.test.ts`
- **并发、配额、fixtures、批量报告** → `tests/stress/` + **手动** `pnpm run test:stress -- <target>`
