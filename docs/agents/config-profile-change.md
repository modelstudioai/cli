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
- `--config` 和 `auth login --config ...` 不得隐式修改持久化激活状态。
- 激活状态只选择配置 block，不改变字段优先级；字段仍为 flag > env > selected config > 默认值。
- Pipeline 等进程内调用链也要复用统一的 `buildSources()`，避免绕过激活状态。
- Console access token 自动刷新等后台读写必须携带 `settings.configName`，不得直接读写顶层 default。

## 3. 保持读写命令交互一致

- `auth login`、`config set` 等写命令未传 `--config` 时修改当前激活项。
- 写命令显式指定不存在的 `--config <name>` 时，仅在业务操作成功并实际落盘时创建 Profile。
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
- 同步 E2E topic routes、Skill setup 和自动生成 reference。

## 6. 最小测试矩阵

- 旧配置无 `active_config` -> `default`。
- 激活命名 Profile 后，无 `--config` 的命令选择该 Profile。
- 显式命名 `--config` 和 `--config default` 均覆盖激活项且不修改磁盘状态。
- 激活不存在的 Profile 失败且不写盘。
- 悬空 `active_config` 明确失败。
- 删除激活 Profile 后切回 `default`。
- 登录、退出、`config set` 分别覆盖“当前激活项”和“显式不存在名称成功后创建”。
- Console token 自动刷新不从其他 Profile 借用 AK/SK，也不把新 token 写入其他 Profile。
- `config list/show/use/ui`、`auth status` 和依赖默认模型的消费命令覆盖对应 E2E。

## 7. 完成检查

```sh
pnpm run sync:skill-assets
vp check
vp test
```

命令 E2E 会启动本地子进程，Config UI 测试还会监听 `127.0.0.1` 临时端口；受限沙箱内出现 `EPERM` 时，需要在允许本地进程和端口的环境中复跑。
