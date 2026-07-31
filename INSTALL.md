# 阿里云百炼CLI 安装说明（供 AI Agent 阅读）

本文档面向 **AI Agent**：按下列步骤为用户安装并校验 **阿里云百炼CLI**（命令 `bl` / `bailian`）。**优先**使用二进制一键安装（无需 Node）；若环境已有 Node / 需要 Command Pack，再用 npm。不要臆造版本号或路径；以用户环境为准。

## 1. 推荐：二进制安装（无需 Node）

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash
```

可选：正式安装读 CDN 上的 `manifest.json`。预发 / channel 验证示例：

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash -s -- --channel sync-release
```

也可用 `--version` / `--cdn`（或环境变量 `BAILIAN_CLI_CDN`）覆盖资源根。安装脚本本身不在本仓库维护。

Windows PowerShell：

```powershell
irm https://bailian.aliyun.com/cli/install.ps1 | iex
```

带参时先落盘再执行（`irm | iex` 不便传参），或使用仓外静态资源文档中的预发入口。

二进制安装布局为 `versions/<ver>/` + `current` 指针；`bl update` 只切换指针并清理旧版本（保留当前与上一版）。更新进程退出后，下次执行 `bl` 即使用新版本（无需「重启应用」）。

校验：

```bash
bl --version
which bl   # Windows: where.exe bl
```

> CDN / GitHub Release 未就绪或下载失败时，回退到下方 npm 安装。

## 2. 备选：npm 安装（要求 **≥ 18.17.0**）

1. `node -v` 确认版本。
2. `npm -v` 确认可用（**仅允许 npm** 全局安装，不要用 pnpm/yarn）。
3. 执行：

```bash
npm install -g bailian-cli
```

4. 校验：`bl --version`。

可选 skills（与 CLI 本体无关，按需）：

```bash
npx skills add modelstudioai/cli --all -g
```

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

## 5. 常见问题

| 现象                     | 可能原因                     | 建议动作                                         |
| ------------------------ | ---------------------------- | ------------------------------------------------ |
| `bl: command not found`  | bin 不在 PATH                | 检查 `~/.local/bin` 或 `npm prefix -g`           |
| curl 安装 404            | GitHub Release 资产未上传    | 改用 `npm install -g bailian-cli`                |
| Windows `bl update` 失败 | 旧布局 / 文件锁 / 网络       | 重跑 `irm .../install.ps1 \| iex` 迁移布局后重试 |
| `plugin` 需要 npm        | 二进制安装无本机 npm         | 安装 Node，或改用 npm 版 CLI                     |
| 安装报错 engines         | Node 版本过低（仅 npm 路径） | 升级到 ≥ 18.17.0                                 |
