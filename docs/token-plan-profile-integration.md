# Token Plan Profile 与激活配置接入方案

> 状态：Token Plan 模型消费、Config 激活状态与通用 Base URL 归一化均已实现。
>
> 目标分支：`feat/cli-access-token`。

## 结论摘要

Token Plan 的模型消费能力继续使用现有 `apiKey` 鉴权域和模型 Client，不新增 Token Plan 鉴权模式或专用 Client。

本次接入拆为三类相互独立的能力，并按业务紧急度而不是最终调用链顺序交付：

1. 优先完成 `token-plan` 内置 Profile 预设、登录和文本/图片消费。
2. 然后完成 Config 激活状态，允许用户选择未传 `--config` 时默认使用的命名配置。
3. 最后以独立 commit 完成通用模型 Base URL 归一化，覆盖所有输入来源，不只服务 Token Plan。

`token-plan` 是有默认值的内置 Profile 名，不是 `active_auth_mode`，也不是新的 `AuthRequirement`。

## 背景与边界

当前分支已经包含以下 Token Plan 管控命令：

```text
token-plan list-seats
token-plan create-key
token-plan assign-seats
token-plan add-member
```

这些命令属于管理面，继续使用 OpenAPI AK/SK。本方案增加的是模型消费面：用户把 `create-key` 获得的 `PlainApiKey` 保存到 Profile，然后通过现有文本、图片和视频命令调用模型。

```text
OpenAPI AK/SK
  -> token-plan create-key
  -> PlainApiKey
  -> auth login --config token-plan
  -> text/image model command
```

### 目标

- 将 Token Plan 模型 API Key 作为普通 `apiKey` credential 使用。
- 将 `token-plan` 作为内置命名 Profile 管理。
- 支持 Config 激活状态和默认切换。
- 复用现有文本、图片、视频命令与 Client。
- 对所有来源的模型 Base URL 做统一归一化。
- 登录验证成功后原子保存 API Key 和 Base URL。
- 服务端错误保持原消息，不在 CLI 内翻译。

### 非目标

- 不重写现有 Token Plan 管控命令。
- 不把模型消费 API Key 合并到 OpenAPI AK/SK 鉴权域。
- 不新增 Token Plan 专用 Client。
- 基础阶段不承诺语音和音频模型消费。
- 暂不维护会阻断请求的本地模型白名单。
- 暂不把服务端错误翻译成 CLI 自定义错误。

## 用户交互

### 1. 配置 Token Plan

`token-plan` 提供默认 Base URL，因此推荐登录命令不要求用户输入地址：

```sh
bl auth login \
  --config token-plan \
  --api-key sk-sp-xxx
```

CLI 应解析并保存以下配置：

```json
{
  "active_config": "token-plan",
  "token-plan": {
    "api_key": "<TOKEN_PLAN_API_KEY>",
    "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com",
    "default_text_model": "qwen3.8-max-preview",
    "default_video_model": "happyhorse-1.1-t2v",
    "default_image_to_video_model": "happyhorse-1.1-i2v",
    "default_reference_to_video_model": "happyhorse-1.1-r2v",
    "default_image_model": "wan2.7-image"
  }
}
```

凭证验证和配置落盘成功后，CLI 在同一次配置文件写入中将 `token-plan` 设为激活项；验证失败和
dry-run 不创建、不切换 Profile。

用户仍可显式覆盖 Base URL，用于代理、测试或未来新增地域：

```sh
bl auth login \
  --config token-plan \
  --api-key sk-sp-xxx \
  --base-url https://proxy.example.com/bailian/compatible-mode/v1
```

显式地址归一化后应保存为：

```text
https://proxy.example.com/bailian
```

推荐路径仍是不传 `--base-url`，直接使用 `token-plan` 预设中的 canonical 根地址。显式覆盖时可以传服务根地址、自定义代理前缀，或带 `/compatible-mode/v1`、`/apps/anthropic` 的 SDK Base URL；CLI 会在验证和落盘前统一归一化。

### 2. 单次选择 Config

`--config` 只影响当前命令，不修改激活状态：

```sh
bl text chat --config token-plan --message "你好"
bl image generate --config token-plan --prompt "一只猫"
```

### 3. 激活 Config

登录时显式选择的 Profile 会自动激活；之后也可以主动切换：

```sh
bl config use --name token-plan
```

激活后，未传 `--config` 的命令默认使用 `token-plan`：

```sh
bl text chat --message "你好"
bl image generate --prompt "一只猫"
```

切回顶层默认配置：

```sh
bl config use --name default
```

单次绕过当前激活项、临时使用其他 Profile：

```sh
bl text chat --config staging --message "你好"
```

单次显式使用顶层默认配置：

```sh
bl text chat --config default --message "你好"
```

上述两种单次覆盖都不得改变持久化的激活状态。

### 4. 查看 Config

新增列表能力，用于展示所有 Profile 和当前激活项：

```sh
bl config list
```

示例输出：

```text
NAME         ACTIVE
default
staging
token-plan   *
```

`config show` 和 `auth status` 的行为：

- 未传 `--config`：展示当前激活的 Config。
- 传 `--config <name>`：展示指定 Config，不改变激活状态。
- 输出中包含最终选择的 `config` 和 `config_file`；激活状态统一由 `config list` / `config ui` 展示。

`config ui` 应展示当前激活项，并提供激活操作。

## Config 激活状态设计

### 存储形状

激活状态保存在 `~/.bailian/config.json` 顶层元数据中：

```json
{
  "active_config": "token-plan",
  "api_key": "<DEFAULT_API_KEY>",
  "token-plan": {
    "api_key": "<TOKEN_PLAN_API_KEY>",
    "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com"
  }
}
```

`active_config` 只允许出现在顶层，不属于单个 Profile 的业务字段。允许值为：

- `default`：顶层默认配置。
- 一个实际存在的命名 Profile。

旧配置没有 `active_config` 时等价于：

```json
{
  "active_config": "default"
}
```

因此该能力对现有用户向后兼容。

### 选择优先级

Config block 的选择顺序为：

```text
显式 --config <name>
  > active_config
  > default
```

需要保留“参数是否出现”的信息：

- 未传 `--config`：读取 `active_config`。
- `--config default`：明确选择顶层配置，不能被 `active_config` 替换。
- `--config <name>`：明确选择该命名 Profile。

当前 `normalizeConfigName("default")` 会返回 `undefined`，实现时不能只根据归一化结果判断参数是否出现。

Config 激活只改变配置文件 block 的选择，`--config` 本身不提升所选 block 的字段优先级。运行时和 Base URL 登录验证保持“具体字段 flag > 环境变量 > selected config file > Profile 预设或系统默认值”。环境变量只影响本次有效值，不复制进 Profile；登录成功时，如果 Token Plan Profile 尚未保存 `base_url`，仍物化写入官方预设地址。Token Plan 默认模型是例外：每次登录都重置为内置版本。`config show` / `auth status` 应展示最终生效来源，避免用户误判套餐流量去向。

### 异常状态

- 激活不存在的 Profile：`config use` 返回 usage error，不写入状态。
- 配置文件中的 `active_config` 指向不存在的 Profile：命令失败并提示切回 `default`，不得静默使用其他凭证。
- 删除当前激活的 Profile：删除操作同时切回 `default`，或者要求用户先切换；不能保留悬空引用。
- `config use --name token-plan` 只切换状态，不创建 Profile，也不执行登录。
- `auth login --config token-plan` 在凭证验证并落盘成功后自动激活该 Profile；验证失败和
  dry-run 不创建、不切换。

## `token-plan` 内置 Profile 预设

`token-plan` 是允许用户选择的内置 Profile 名，不应加入非法名称列表。它提供以下默认值：

```text
base_url:            https://token-plan.cn-beijing.maas.aliyuncs.com
default_text_model:  qwen3.8-max-preview
default_video_model: happyhorse-1.1-t2v
default_image_to_video_model: happyhorse-1.1-i2v
default_reference_to_video_model: happyhorse-1.1-r2v
default_image_model: wan2.7-image
```

Token Plan Base URL 预设只在登录写入阶段提供最低优先级的缺省值：

```text
显式命令参数
  > 环境变量
  > 已保存的 Profile 字段
  > token-plan 预设值
```

登录成功时应把显式 Base URL 或缺失的预设 Base URL，以及默认模型写入 Profile，使 `config show --config token-plan` 能看到完整配置。环境变量不复制进 Profile。运行时不再合并预设；如果手工删除字段，则按统一的环境变量、配置文件和系统默认值链继续解析。

默认模型采用更简单的固定策略：每次执行 `auth login --config token-plan`，都将 `default_text_model` 重置为 `qwen3.8-max-preview`，将 `default_video_model` 重置为 `happyhorse-1.1-t2v`，将 `default_image_to_video_model` 重置为 `happyhorse-1.1-i2v`，将 `default_reference_to_video_model` 重置为 `happyhorse-1.1-r2v`，将 `default_image_model` 重置为 `wan2.7-image`。登录不保留用户之前写入的其他 Profile 默认模型；用户需要临时调用其他 Token Plan 模型时，通过具体模型命令的 `--model` 覆盖，不修改这些内置默认值。

预设建议通过集中 registry 表达，不在 resolver、命令和 Client 中散落名称判断：

```ts
const MODEL_PROFILE_PRESETS = {
  "token-plan": {
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com",
    defaultTextModel: "qwen3.8-max-preview",
    defaultVideoModel: "happyhorse-1.1-t2v",
    defaultImageToVideoModel: "happyhorse-1.1-i2v",
    defaultReferenceToVideoModel: "happyhorse-1.1-r2v",
    defaultImageModel: "wan2.7-image",
  },
};
```

Profile 预设不改变命令协议：

```text
Selected Profile
  -> API Key Credential
  -> Client
  -> Command Endpoint
```

## 通用模型 Base URL 归一化

Base URL 归一化是独立的通用能力，不针对 Token Plan hostname 做特判。

### 语义

CLI 中 `base_url` 表示模型服务根地址或自定义网关前缀，不包含 CLI 已知的 SDK/API Base 后缀。

建议新增统一函数：

```text
normalizeModelBaseUrl(input) -> canonical base URL
```

通用规则：

1. 去除首尾空白。
2. 使用 `URL` 解析，只接受 `http:` 和 `https:`。
3. 去除 query 和 fragment。
4. 去除末尾 `/`。
5. 保留协议、hostname、端口和自定义代理路径。
6. 去除末尾已知 SDK/API Base 后缀，例如：
   - `/compatible-mode/v1`
   - `/apps/anthropic`
7. 不无条件返回 `url.origin`，避免破坏自定义代理路径。

示例：

| 用户输入                                                             | 归一化结果                                        |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `https://dashscope.aliyuncs.com/`                                    | `https://dashscope.aliyuncs.com`                  |
| `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `https://token-plan.cn-beijing.maas.aliyuncs.com` |
| `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`     | `https://token-plan.cn-beijing.maas.aliyuncs.com` |
| `https://proxy.example.com/bailian/`                                 | `https://proxy.example.com/bailian`               |
| `https://proxy.example.com/bailian/compatible-mode/v1`               | `https://proxy.example.com/bailian`               |

### 覆盖入口

所有模型 Base URL 来源都必须经过同一个函数：

- 模型命令的 `--base-url`。
- `DASHSCOPE_BASE_URL`。
- `config.json` 中的 `base_url`。
- `config set --key base_url`。
- `config ui`。
- `auth login --base-url`。
- Console 登录回调返回的 `base_url`。
- 手工修改的旧配置。
- 内置默认地址和 Profile 预设地址。

归一化采用双层防线：

- 写入前归一化，保证磁盘配置整洁。
- `resolveModelBaseUrl()` 返回前防御性归一化，兼容旧配置和手工修改。

### URL 拼接

归一化后，命令继续拼接已有 endpoint：

```text
text:  <base_url>/compatible-mode/v1/chat/completions
image: <base_url>/api/v1/services/aigc/.../generation
```

最终 URL 中不得重复出现 `/compatible-mode/v1`。

## API Key 登录与原子保存

当前登录流程可能先写入 `base_url`，再验证 API Key。该顺序需要独立修复：

```text
解析 Profile 和预设
  -> 归一化 Base URL
  -> 使用最终 Base URL 验证 API Key
  -> 验证成功后一次写入 api_key + base_url + 默认模型
```

验证失败时，不得产生以下半配置状态：

```json
{
  "token-plan": {
    "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com"
  }
}
```

登录验证使用的模型必须在目标 Profile 中可用。Token Plan 预设使用 `qwen3.8-max-preview`；后续如不同订阅计划的模型集合分化，应将验证模型纳入 Profile 预设，而不是继续在登录函数里硬编码唯一模型。

## 模型消费范围

基础阶段承诺：

| 能力           | 默认模型              | 调用方式                           |
| -------------- | --------------------- | ---------------------------------- |
| 文本生成和推理 | `qwen3.8-max-preview` | OpenAI Compatible Chat Completions |
| 图片生成和编辑 | `wan2.7-image`        | DashScope 多模态图片接口           |
| 文生视频       | `happyhorse-1.1-t2v`  | DashScope 原生视频接口             |
| 图生视频       | `happyhorse-1.1-i2v`  | `bl video generate --image`        |
| 参考生视频     | `happyhorse-1.1-r2v`  | `bl video ref`                     |

Token Plan 当前模型快照中还包含其他文本、视觉理解、图片和视频模型，但该列表可能由后端调整。基础接入不维护阻断请求的本地白名单；用户可通过具体模型命令的 `--model` 临时覆盖本次请求，但再次登录时 Profile 默认模型仍重置为内置版本。

### 当前模型与本地图片兼容范围

| 模型                                | 图片输入能力   | CLI 本地图片处理                                           |
| ----------------------------------- | -------------- | ---------------------------------------------------------- |
| `qwen3.8-max-preview`               | 视觉理解       | Token Plan 下转换为 Base64 Data URI                        |
| `qwen3.7-plus`                      | 视觉理解       | Token Plan 下转换为 Base64 Data URI                        |
| `qwen3.7-max`                       | 纯文本         | 不涉及图片上传                                             |
| `qwen3.6-flash`                     | 视觉理解       | Token Plan 下转换为 Base64 Data URI                        |
| `wan2.7-image` / `wan2.7-image-pro` | 图片生成与编辑 | 文生图不需要输入图片；编辑本地图片时转换为 Base64 Data URI |
| `happyhorse-1.1-i2v`                | 图生视频       | 首帧本地图片转换为 Base64 Data URI                         |
| `happyhorse-1.1-t2v`                | 文生视频       | 不涉及图片上传                                             |
| `happyhorse-1.1-r2v`                | 参考生视频     | 参考本地图片转换为 Base64 Data URI                         |
| `deepseek-v4-pro` / `glm-5.2`       | 纯文本         | 不涉及图片上传                                             |

Token Plan 图片兼容只处理官方明确支持 Base64 的图片字段；参考视频和参考音频仍要求可访问 URL。普通 API Key 保持各命令既有行为：图片编辑和视频入口继续使用临时 OSS，视觉理解的小图继续使用原有 Base64 路径。

语音和音频不作为本阶段支持承诺。现有命令仍保持通用实现，但 Token Plan Profile 的验收不包含这些模态。

## 错误处理

CLI 继续遵循“服务端错误消息原样透传”的规则。

例如服务端返回：

```json
{
  "code": "InvalidParameter",
  "message": "Model not exist."
}
```

CLI 保留 `Model not exist.`，不改写成“Token Plan 不支持该模态”，因为本地没有权威、实时的模型开放列表。

## Commit 拆分

以下 commit 按紧急度和必要依赖提交，每个 commit 都应能独立通过对应测试和静态检查。前三个 commit 组成可优先交付的 Token Plan 模型消费 MVP，后两个 commit 再补齐默认激活体验和通用 URL 输入兼容。

### Commit 1：Token Plan 内置 Profile 预设（已实现）

建议提交信息：

```text
feat(core): add token-plan model profile preset
```

完成内容：

- 将 `token-plan` 注册为内置、可选择的 Profile 名。
- 提供 canonical 默认 Base URL、文本模型、图片模型和视频模型。
- Base URL 登录验证遵循 flag > 环境变量 > 已保存 Profile > 预设；环境变量不复制进 Profile。
- Profile 缺少 Base URL 时物化预设地址；每次 Token Plan 登录都重置并写入内置默认文本、图片和视频模型。
- 运行时 loader/resolver 不再合并预设。
- 不新增 AuthRequirement，不修改 Token Plan 管控命令。
- 补充预设值单元测试；不重复增加 Token Plan 专属消费 E2E。
- 不依赖通用 Base URL 归一化；预设直接使用规范化后的根地址。

### Commit 2：Token Plan API Key 登录（已实现）

建议提交信息：

```text
feat(auth): support token-plan API key login
```

完成内容：

- 支持 `bl auth login --config token-plan --api-key ...`。
- 未传 `--base-url` 且没有更高优先级的环境变量或已保存地址时，使用 Token Plan Profile 预设地址。
- 使用 Token Plan 预设文本模型验证 API Key。
- 登录验证前不写配置。
- 验证成功后一次写入 API Key、canonical Base URL 和默认模型。
- 每次登录都将默认模型重置为 `qwen3.8-max-preview`、`wan2.7-image`、`happyhorse-1.1-t2v`、`happyhorse-1.1-i2v` 和 `happyhorse-1.1-r2v`。
- 验证失败不留下半配置。
- 补充一个最小 Token Plan 登录 E2E，覆盖命名 Profile 落盘、环境变量不复制、预设 Base URL 物化和默认模型重置；通用 API Key 登录 E2E 继续覆盖成功原子保存和失败不写半配置。
- 该 commit 暂不承诺自动归一化用户显式输入的 SDK Base URL。

### Commit 3：Token Plan 文本、图片与视频消费验收（已实现）

建议提交信息：

```text
feat(cli): enable token-plan text, image, and video consumption
```

完成内容：

- Token Plan 消费复用现有 API Key、文本、图片和视频调用链，不重复增加专属 E2E。
- 发布前按需人工验证 `auth login --config token-plan --api-key ...`、文本、图片和视频调用。
- 更新 Token Plan 消费方案文档和 Skill reference。
- 到该 commit 为止即可先交付显式 `--config token-plan` 的紧急消费能力。

### 运营文档 TODO

- [ ] 由运营同事补充 `README.md` 和 `README.zh.md` 的 Token Plan 模型消费说明。
- [ ] 区分 `sk-sp-...` 模型消费 API Key 与管控命令使用的 OpenAPI AK/SK。
- [ ] 增加 `auth login --config token-plan --api-key ...`、文本消费和图片消费示例。
- [ ] 与届时实际上线范围核对模型名称、服务地域、限制条件和用户措辞。

### Commit 4：Config 激活状态与切换命令（已实现）

建议提交信息：

```text
feat(config): add active profile selection
```

完成内容：

- 增加顶层 `active_config` 元数据。
- 实现 `--config > active_config > default` 的选择顺序。
- 保证 `--config default` 能显式覆盖激活项。
- 新增 `bl config list`。
- 新增 `bl config use --name <name>`。
- `config show`、`auth status` 展示最终选择项，`config list` 和 `config ui` 展示激活状态。
- 删除激活 Profile 时处理状态一致性。
- 验证激活 `token-plan` 后不传 `--config` 的文本、图片和视频请求。
- 验证临时 `--config default` 不改变激活状态。
- 更新命令导出、`packages/cli/src/commands.ts`、E2E 和生成 reference。

实现选择：删除当前激活的命名 Profile 时，在同一次配置文件写入中将 `active_config` 重置为
`default`。普通命令的显式 `--config` 仍只作用于本次命令；`auth login --config <name>` 是
例外，在凭证验证和落盘成功的同一次配置写入中激活目标 Profile。`--config default` 登录成功后
切回默认配置。

相关写入交互统一为：`auth login`、`auth logout` 和 `config set` 未传 `--config` 时作用于当前激活项；显式指定名称时作用于该名称。写命令可在成功落盘时创建不存在的 Profile，读命令不创建。Console access token 自动刷新同样限定在当前选中的 Profile，不得回退读写顶层 default。

激活项选择的是完整 Config，而不是只选择模型消费凭证。激活 `token-plan` 后，Token Plan 管控命令也会从该 Profile 解析 OpenAPI AK/SK，Console 命令也会从该 Profile 解析 Console 凭证。如果相应凭证仍保存在顶层 `default`，用户需要为单次命令显式传入 `--config default`，或将对应凭证域登录到 `token-plan`；CLI 不为不同鉴权域做隐式跨 Profile 回退。

### Commit 5：通用模型 Base URL 归一化（已实现）

建议提交信息：

```text
fix(core): normalize model base URLs across all sources
```

完成内容：

- 新增 `normalizeModelBaseUrl()`。
- 保留自定义网关路径，去除尾斜杠、query、fragment 和已知 API Base 后缀。
- `resolveModelBaseUrl()` 对 flag、env、配置文件和默认值统一归一化。
- `auth login`、Console callback、`config set`、`config ui` 写入前归一化。
- 验证 Token Plan 显式输入 `/compatible-mode/v1` 和 `/apps/anthropic` 的兼容行为。
- 补充通用 URL 单元测试和各来源解析测试。
- 更新 README、中文 README、Skill reference 和本方案状态。

## 验证清单

### Base URL

- 根地址和自定义路径正确保留。
- 尾部 `/` 被移除。
- `/compatible-mode/v1` 和 `/apps/anthropic` 后缀被移除。
- query 和 fragment 不进入最终请求地址。
- flag、env、配置文件和所有写入入口结果一致。
- 最终文本 URL 只包含一次 `/compatible-mode/v1`。

### Config 激活

- 旧配置缺少 `active_config` 时继续使用 `default`。
- `config use` 只能激活存在的 Profile。
- 未传 `--config` 时使用激活项。
- 显式 `--config` 优先且不修改激活项。
- `--config default` 能绕过命名激活项。
- 悬空激活项不会静默回退到其他凭证。
- 删除激活项后状态保持一致。
- `config list/show/ui` 正确标识激活项。

### Token Plan

- `token-plan` 登录初始化时缺省写入官方根地址。
- 显式 Base URL 覆盖预设并经过通用归一化。
- 登录验证失败不写入任何 Token Plan 半配置。
- 文本默认使用 `qwen3.8-max-preview`。
- 图片默认使用 `wan2.7-image`。
- 视频默认使用 `happyhorse-1.1-t2v`；图生和参考生入口分别使用 `happyhorse-1.1-i2v` 和 `happyhorse-1.1-r2v`。
- 文本、图片和视频均复用现有 `apiKey` Client。
- 管控命令继续使用 OpenAPI AK/SK，不受模型 Profile 影响。

## 完成后检查

```sh
pnpm run sync:skill-assets
vp check
vp test
```

“Profile 预设与激活状态”的维护要求已沉淀到 `docs/agents/config-profile-change.md`。

## 最终结论

Token Plan 模型消费最终表现为一个可激活的内置 Profile：

```text
通用 Base URL 归一化
  -> Config 选择与激活
  -> 登录时物化 token-plan 预设
  -> 普通 apiKey Client
  -> 文本/图片 endpoint
```

用户执行 `auth login --config token-plan` 成功后，该 Profile 会成为默认激活配置；仍可通过
显式 `--config` 做单次覆盖，或使用 `bl config use --name <name>` 主动切换。整个过程不引入
Token Plan 模式，也不复制现有模型调用实现。
