# 阿里云百炼CLI 安装说明（供 AI Agent 阅读）

本文档面向 **AI Agent**：按下列步骤为用户安装并校验 **阿里云百炼CLI**（命令 `bl` / `bailian`）。**优先**在已有 Node.js（**≥ 18.17.0**）的环境用 npm 安装；若没有可用 Node / npm，再走二进制一键安装。不要臆造版本号或路径；以用户环境为准。

## 1. 推荐：npm 安装（要求 **≥ 18.17.0**）

1. `node -v` 确认版本 ≥ 18.17.0。
2. `npm -v` 确认可用（**仅允许 npm** 全局安装，不要用 pnpm/yarn）。
3. 执行：

```bash
npm install -g bailian-cli
```

4. 校验：`bl --version`。
5. 按下方「安装 skills」安装。

### 安装 skills

**Supported（优先）：** 用 CLI 内置命令一次装齐 registry 中全部 `bailian-*`（含共享协议 `bailian-protocol`）：

```bash
bl skill init
```

**降级：** 若 `bl skill init` 失败，且本机有可用 Node / npm（`node -v` / `npm -v` 成功），再回退到：

```bash
npx skills add modelstudioai/cli --all -g
```

无 Node 时不要走 `npx` 降级；向用户说明 skill 安装失败，并保留 `bl skill init` 的错误信息。

安装成功后，按第 5 节向用户说明语言切换与能力 tip（若也装了 skills，一并简要说明）。

## 2. 备选：二进制安装（无需 Node）

当环境没有 Node / npm，或 Node 版本过低无法走 npm 时，使用二进制安装脚本。脚本安装 CLI 成功后会自动执行 `bl skill init`。

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash
```

可选：正式安装读 CDN 上的 `manifest.json`。预发 / channel 验证一律读 `sync-release.json`（bailian-cli 的 channel 发版都会覆盖它）：

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash -s -- --channel sync-release
```

也可用 `--version` / `--cdn`（或环境变量 `BAILIAN_CLI_CDN`）覆盖资源根。安装脚本本身不在本仓库维护。

Windows PowerShell：

```powershell
# 正式（manifest.json）
irm https://bailian.aliyun.com/cli/install.ps1 | iex

# channel / 预发验证（sync-release.json）
$env:BAILIAN_CHANNEL = 'sync-release'; irm 'https://bailian.aliyun.com/cli/install.ps1' | iex
```

带其它参时先落盘再执行（`irm | iex` 不便传参），或使用仓外静态资源文档中的预发入口。

二进制安装布局为 `versions/<ver>/` + `current` 指针；`bl update` 只切换指针并清理旧版本（保留当前与上一版）。更新进程退出后，下次执行 `bl` 即使用新版本（无需「重启应用」）。

校验：

```bash
bl --version
which bl   # Windows: where.exe bl
```

> CDN / GitHub Release 未就绪或下载失败时，若本机已有合格 Node，回退到上方 npm 安装。

---

## 3. 鉴权（安装后必做才能调 API）

### 推荐：浏览器登录（控制台会话）

1. 执行 `bl auth status --output json`，判断是否已配置。
2. 若未配置，在**用户本机终端**执行 `bl auth login --console`。
3. 登录成功后执行 `bl auth status --output json` 确认；汇报时只使用 masked 字段，**禁止**回显完整凭据。

### 备选：API Key / Token Plan

- 普通 Key：`bl auth login --api-key <Key>`
- Token Plan：`bl auth login --config token-plan --api-key <Key>`

### Agent 安全约束

- **禁止**把真实 API Key 写入仓库、日志、Skill、聊天记录的可公开部分。
- CI / 非交互环境：显式传入必填参数并使用 `--output json` 获取机器可读结果；如需纯文本输出，设置 `NO_COLOR=1`。通过密钥管理或环境变量注入，勿在脚本中硬编码 Key。

---

## 4. 配置验证

```bash
bl auth status --output json
```

## 5. 安装成功后向用户说明（必做）

安装与校验完成后，**主动**用中文向用户说明下列两项；不要等用户追问。可执行 `bl`（已登录时）对照终端 tip，但以下列表为准，勿臆造。

### 5.1 界面语言

Bailian CLI 支持中英文界面（help / 欢迎语 / Quick Start 主次文案）。默认 `en-US`，可切换为 `zh-CN`：

```bash
bl config set --key language --value zh-CN
bl config set --key language --value en-US
```

向用户说明：可随时用上述命令切换语言。

### 5.2 能力 tip（Quick Start）

向用户展示「试试使用Bailian CLI完成这些任务」及下列 5 条（中英各一行，与 `bl` 根帮助 tip 一致）：

1. 帮我创建一个能够生成短片分镜和视频的 Managed Agent。  
   Help me create a Managed Agent that can generate short-film storyboards and videos.
2. 生成一张穿着太空服的猫站在火星上的图片，再把它制作成一段视频。  
   Generate an image of a cat in a spacesuit standing on Mars, then turn it into a video.
3. 查看最近的模型用量、免费额度和限流情况。  
   Check my recent model usage, free quota, and rate limits.
4. 推荐一个适合图片理解和智能客服的模型。  
   Recommend a model suitable for image understanding and intelligent customer service.
5. 介绍一下 Bailian CLI 能帮我完成哪些任务，并根据我的需求推荐使用方式。  
   Explain what Bailian CLI can help me accomplish, and recommend how to use it based on my needs.

## 6. 常见问题

| 现象                     | 可能原因                     | 建议动作                                                                             |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------ |
| `bl: command not found`  | bin 不在 PATH                | 检查 `~/.local/bin` 或 `npm prefix -g`                                               |
| curl 安装 404            | GitHub Release 资产未上传    | 改用 `npm install -g bailian-cli`                                                    |
| Windows `bl update` 失败 | 旧布局 / 文件锁 / 网络       | 重跑 `irm .../install.ps1 \| iex` 迁移布局后重试                                     |
| `plugin` 需要 npm        | 二进制安装无本机 npm         | 安装 Node，或改用 npm 版 CLI                                                         |
| 安装报错 engines         | Node 版本过低（仅 npm 路径） | 升级到 ≥ 18.17.0                                                                     |
| `bl skill init` 失败     | 网络 / registry 不可达等     | 有 Node 时降级 `npx skills add modelstudioai/cli --all -g`；无 Node 则重试或告知用户 |
