# Config Profile 与激活状态变更清单

适用于新增 Profile 预设、修改命名 Profile 选择规则、调整 `active_config`，或新增/修改 `bl config list/use/show/ui` 等 Profile 管理能力。

## 1. 保持存储边界

- Profile 业务字段继续由 `ConfigFile` / `CONFIG_FILE_KEYS` 管理。
- `active_config` 是 `config.json` 顶层元数据，不得进入命名 Profile block，也不得被 `config set` 当作普通字段写入。
- 识别命名 Profile 时必须排除业务字段和顶层元数据。
- 旧配置缺少 `active_config` 时继续等价于激活 `default`。

## 2. 保持选择语义

```text
显式 --config <name> > active_config > default
```

- 解析阶段用局部变量保留“是否显式传入 `--config`”的信息；完成 Config 选择后不进入 `Settings`。
- `--config default` 必须显式选择顶层配置并绕过命名激活项。
- 普通命令的显式 `--config` 只覆盖本次选择，不修改持久化激活状态；例外是
  `auth login --config ...`，凭证落盘成功后自动激活该 Profile。
- 激活状态只选择配置 block，不改变字段优先级；字段仍为 flag > env > selected config > 默认值。
- API Key capability fallback 是窄例外：命名 Profile 显式配置 `api_key_capabilities` 后，不在白名单中的 `auth: "apiKey"` 叶子命令只把 file 层 `api_key` / `base_url` 切到顶层 `default`；所选 Profile 的其他 settings 和 `active_config` 均不变。如果 `--api-key` / `--base-url` 或 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` 任一提供了更高优先级的模型连接参数，则整个 capability fallback 跳过，file 层也不切换；未显式提供的另一部分继续按 flag > env > 所选 Profile 解析。
- Profile 是否启用 capability fallback 只看持久化的 `api_key_capabilities`，与名称无关：字段缺失表示关闭策略，`[]` 表示全部 API Key 命令 fallback。runtime 不注入内置 preset；升级内置 Plan Profile 的 preset 需要重新登录。
- 对命中内置 preset 的 Profile，API Key 登录落盘成功后会把当前 preset 中缺少的 capability 追加落盘，同时保留已有项且不做删除；Console/OpenAPI 登录、自定义 Profile、dry-run 和失败登录均不修改该白名单。
- Capability ID 直接使用产品实际叶子命令路径并以 `.` 连接（例如 `video task get` → `video.task.get`）；不新增命令元数据。新增或改名后的 API Key 路由未进入白名单时自然 fail closed。
- Pipeline 等进程内调用链也要复用统一的 `buildSources()`，避免绕过激活状态。
- Console access token 自动刷新等后台读写必须携带 `settings.configName`，不得直接读写顶层 default。

## 3. 保持读写命令交互一致

- `auth login`、`config set` 等写命令未传 `--config` 时修改当前激活项。
- `auth login --config <name>` 显式指定不存在的 Profile 时，仅在凭证实际落盘时
  创建和激活；`config set --config <name>` 可创建但不自动激活。
- `config show`、`auth status` 和业务消费等读命令不得因为显式指定不存在的名称而创建 Profile。
- `auth logout` 默认只清理当前激活项；显式 `--config` 只清理指定项。
- 按凭证域退出时必须清理该域的完整字段集合，例如 OpenAPI 同时清理 AK、SK 和 STS `security_token`。
- 所有生产代码读取“当前配置”时优先经过 `buildSources()` 或携带解析后的 `configName`；直接调用无名称的 `readConfigFile()` / `writeConfigFile()` 只适用于明确操作顶层 default 的底层能力。

## 4. 保持状态一致性

- `config use` 只能激活已经存在的命名 Profile；`default` 始终有效。
- 配置文件中的 `active_config` 指向不存在的 Profile 时返回 usage error，不静默回退。
- 删除当前激活的命名 Profile 时，同一次落盘切回 `default`，不得留下悬空引用。
- 配置写入继续使用临时文件 + rename，避免中断后留下半写文件。

## 5. 命令与展示联动

- 新增/重命名命令时同步 `packages/commands/src/index.ts` 和产品入口 `packages/cli/src/commands.ts`。
- `config list` 标识所有 Profile 与当前激活项。
- `config show`、`auth status` 只输出本次最终选择的 `config` 和 `config_file`，不重复携带激活状态。
- `config ui` 从持久化元数据读取激活项，提供显式激活操作，并在删除激活项后刷新为 `default`。
- `config ui` 展示并可编辑完整 `ConfigFile`（含 `console_*`、`telemetry`），保存时按类型（数字/布尔/枚举）归一化写回；`config set` 仍只暴露较窄的 `VALID_KEYS`。UI 未管理的顶层元数据（如 `active_config`）不进入 Profile block，仍由写盘逻辑单独保留。
- `config ui` 只读展示本地 agent 生态：Skills 跨全部 agent skill 目录（`~/.agents/skills` 及各 agent 的 `skills/`，含软链接）按 id 聚合并标注安装来源；MCP、Agents 从各 agent 本地配置读取。
- `config ui` 提供 Assets 资产管理：扫描 `output_dir`（默认 `~/bailian-output`）下的 `images/videos/speech/omni` 分类及根目录散落文件，按分类与生成时间（mtime）标记，支持按分类筛选、内联预览（图/视频/音频）与删除单个文件；文件读取与删除均通过限定在输出目录内的路径校验（防目录穿越）。
- 同步 E2E topic routes、Skill setup 和自动生成 reference。

## 6. 最小测试矩阵

- 旧配置无 `active_config` -> `default`。
- 激活命名 Profile 后，无 `--config` 的命令选择该 Profile。
- 任意名称 Profile 的叶子路由 capability 命中时使用自身 API Key；未命中或空白名单时使用 `default` API Key；`--api-key` / `--base-url` 和 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` 任一覆盖时跳过 fallback。
- 旧内置 Plan Profile 缺 capability 字段时不启用 fallback；重新登录后使用并持久化当前 preset，显式配置（含 `[]`）按文件值生效。
- 显式命名 `--config` 和 `--config default` 均覆盖激活项且不修改磁盘状态。
- 激活不存在的 Profile 失败且不写盘。
- 悬空 `active_config` 明确失败。
- 删除激活 Profile 后切回 `default`。
- 登录、退出、`config set` 分别覆盖“当前激活项”和“显式不存在名称成功后创建”。
- 显式 `auth login --config <name>` 成功后激活该 Profile，失败或 dry-run 不创建、不切换；
  `--config default` 成功后切回 `default`。
- Console token 自动刷新不从其他 Profile 借用 AK/SK，也不把新 token 写入其他 Profile。
- Console/OpenAPI/none 命令不参与 API Key capability fallback；fallback 后的 Client 特殊端点行为必须跟随最终解析的 `base_url`，不能根据原 `settings.configName` 推断端点类型。
- Fallback 反馈只描述 CLI 能权威确认的本地行为：当前 Profile 不支持空格分隔的用户可见叶子命令，本次将从 `default` 读取 API Key 配置；不得声称整个 Profile 已切换，也不得展示 capability ID 或 `<undeclared>` 等内部值。存在 `--api-key` / `--base-url` 或 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` 任一显式覆盖时必须跳过 fallback 且不输出反馈。
- Fallback 反馈写 stderr，`--quiet` 抑制；text 模式输出本地化句子，`--output json` 输出两空格缩进的多行 `warning` 对象。dry-run 和后续鉴权失败仍保留反馈；JSON 模式下多个 diagnostics 以空行分隔，任何模式都不得输出凭证值。
- `config list/show/use/ui`、`auth status` 和依赖默认模型的消费命令覆盖对应 E2E。
- `config ui` 覆盖保存时保留顶层元数据（如 `active_config`），继续允许空值清除字段，并覆盖 `console_*`/`telemetry` 的类型归一化与枚举校验。
- Assets:`listAssets` 覆盖分类归类、时间倒序、目录缺失返回空；`resolveAssetPath` 覆盖目录穿越拦截;`contentType` 覆盖常见扩展名映射。

## 7. 完成检查

```sh
pnpm run sync:skill-assets
vp check
vp test
```

命令 E2E 会启动本地子进程，Config UI 测试还会监听 `127.0.0.1` 临时端口；受限沙箱内出现 `EPERM` 时，需要在允许本地进程和端口的环境中复跑。
