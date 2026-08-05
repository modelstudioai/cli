# 阿里云百炼CLI 安装说明（供 AI Agent 阅读）

本文档面向 **AI Agent**：按下列步骤为用户安装并校验 **阿里云百炼CLI**（npm 包名 `bailian-cli`，命令 `bl` / `bailian`）。用户通常通过 **npm 全局安装** 使用，**无需**访问本仓库源码。不要臆造版本号或路径；以用户环境为准。

## 1. 安装前检查

**原则**：先执行检查；若 **Node / 包管理器 / 网络** 任一不满足下文要求，Agent 应 **在本机终端内主动完成安装或配置**（例如升级 Node、切换镜像、配置 `npm` 代理等），再继续 `bailian-cli` 安装。仅在无权限或环境无法自动化时，再向用户说明原因并请其配合。

1. **Node.js**
   - 要求 **≥ 18.17.0**，执行 `node -v` 确认。
   - 未安装或版本不足：由 Agent 自行安装或升级 Node。

2. **npm**（**唯一**允许的包管理器）
   - 执行 `npm -v` 确认可用。
   - 未安装或不可用：由 Agent **安装或修复 npm**（不要改用 pnpm/yarn 装 `bailian-cli`），再执行 `npm install -g bailian-cli`。
   - 即使本机已安装 `pnpm`、`yarn` 等，**也仅用于其它项目**；装 `bailian-cli` 时仍必须用 `npm`。

3. **网络**
   - 需能访问 npm registry（默认 **registry.npmjs.org**）。
   - 不可达：由 Agent 自行配置镜像或代理后重试。

---

## 2. 安装 CLI 与 Skills

**仅允许以下命令**（不要用 `pnpm add -g`、`yarn global add` 等）。按顺序执行，上一步通过后再进行下一步。

**2.1 安装 CLI**

```bash
npm install -g bailian-cli
```

安装成功后，应能在 PATH 中找到：

- `bl`（短别名）
- `bailian`（全名）

**校验**（Agent 应执行并检查退出码与输出）：

```bash
bl --version
which bl   # Windows 可用 where bl
```

若 `command not found`：检查全局 bin 是否在 PATH（`npm config get prefix`，其下 `bin` 目录应加入 PATH）。

**2.2 安装 Skills**

CLI 校验通过后，在本机终端执行：

```bash
npx skills add modelstudioai/cli --all -g
```

**Supported：** 始终使用 `--all -g`，一次装齐整套 `bailian-*`（含共享协议 `bailian-protocol`）。Agent Skills / `npx skills` **不会**按 metadata 自动拉依赖。

**Advanced / 不推荐：** 子集 `-s` 时 skills CLI 不会自动带上 `bailian-protocol`；若坚持子集，必须手动同时指定，例如：

```bash
# Advanced: you MUST include bailian-protocol yourself — installer does not pull it
npx skills add modelstudioai/cli -g -s bailian-protocol -s bailian-gen
```

安装成功后，用中文简要说明已安装的 skills 及用户可做什么。

---

## 3. 鉴权（安装后必做才能调 API）

### 推荐：浏览器登录（控制台会话）

适用于本机交互式安装，无需用户手动复制 API Key：

1. 执行 `bl auth status --output json`，判断是否已配置。
2. 若未配置，在**用户本机终端**执行 `bl auth login --console`；命令会拉起浏览器完成阿里云控制台登录授权。
3. 登录成功后执行 `bl auth status --output json` 确认；汇报时只使用 masked 字段，**禁止**回显完整凭据。

> 此方式同时打通 `app list`、`usage free` 等控制台能力，并自动配置 API Key 调用所需的鉴权信息。

### 备选一：由 Agent 引导用户输入普通 API Key 后登录

适用于无法拉起浏览器的对话式安装（远程 SSH、CI 调试、纯终端环境等）：

- 获取入口：[百炼控制台 API Key](https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key)

1. 执行 `bl auth status --output json`，判断是否已配置。
2. 若未配置或后续 API 校验失败，**请用户粘贴 API Key**（可说明从上述控制台复制；勿要求用户发到公开渠道）。
3. 用户提供了 Key 之后，在**用户本机终端**执行（Agent 用终端工具跑，勿把 Key 写进回复正文）：`bl auth login --api-key <用户提供的_Key>`
4. 登录成功后执行 `bl auth status --output json` 确认；汇报时只使用 masked 字段，**禁止**回显完整 Key。

### 备选二：使用 Token Plan API Key

- 获取入口：[Token Plan 订阅详情](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview)

1. 请用户从订阅详情页获取或复制 Token Plan API Key，勿要求用户发到公开渠道。
2. 在用户本机终端执行：`bl auth login --config token-plan --api-key <用户提供的_Key>`。
3. `token-plan` Profile 已内置默认 Base URL；登录命令会先测试 Key，通过后才保存并激活该 Profile，无需另行配置或重复测试。
4. 执行 `bl auth status --config token-plan --output json` 确认；汇报时只使用 masked 字段。

### 其他方式

- **环境变量**（不落盘到配置文件）：在 shell 中配置 API Key 环境变量；变量名见 `bl auth status --help`，勿在对话中向用户解释底层命名。
- **写入配置文件**（持久化，与 `auth login` 落盘相同）：`bl config set --key api_key --value <key>`（`--key api-key` 亦可）。**不会**像 `bl auth login --api-key` 那样先校验 Key 是否可用；Agent 引导安装时仍**优先**用 `auth login`。
- **命令行临时传入**：需要 API Key 的 `bl` 子命令可在**当次**执行附加全局 `--api-key <key>`，仅本次生效、不落盘（例：`bl text chat --api-key sk-xxx --message "你好"`）。与上文持久化方式不是同一用途。

### Agent 安全约束

- **禁止**把真实 API Key 写入仓库、日志、Skill、聊天记录的可公开部分。
- CI / 非交互环境：显式传入必填参数并使用 `--output json` 获取机器可读结果；如需纯文本输出，设置 `NO_COLOR=1`。通过密钥管理或环境变量注入，勿在脚本中硬编码 Key。

---

## 4. 配置验证

API Key 登录命令本身已经完成可用性测试，通过后只需确认配置状态：

```bash
bl auth status --output json
```

无需再执行重复的模型调用测试。若登录失败，根据 stderr / JSON 中的 `hint` 或 `message` 排查（网络、Key 无效、`base_url` 等）。DashScope 端点：使用 `--base-url` / `bl config set --key base_url` / `DASHSCOPE_BASE_URL`，默认中国大陆 `https://dashscope.aliyuncs.com`。

---

## 5. 常见问题（Agent 排障清单）

| 现象                    | 可能原因             | 建议动作                                                        |
| ----------------------- | -------------------- | --------------------------------------------------------------- |
| `bl: command not found` | 全局 bin 不在 PATH   | 检查 `npm prefix -g` 与 PATH                                    |
| 安装报错 engines        | Node 版本过低        | 升级到 ≥ 18.17                                                  |
| 401 / 鉴权失败          | 未 login 或 Key 无效 | 按 Key 类型重新执行普通或 Token Plan 登录命令                   |
| 企业网络无法访问 npm    | 代理 / 镜像          | 配置 registry 或代理后再装                                      |
| 本机只有 pnpm、没有 npm | Agent 误用 pnpm 安装 | 先装/修好 **npm**，再用 `npm install -g bailian-cli`；勿用 pnpm |
