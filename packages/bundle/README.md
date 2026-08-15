# bailian-kb-dsh（分发包）

dsh bundle 分发面：`package.json` 的 `dsh.bundle.patch` 声明 + [`cordis.patch.yml`](cordis.patch.yml)，向 profile 插入 `tool-bailian-kb` row，并随包分发浏览器端配置卡片（`dsh.client` → `lib/client.js`）。

## Patch row

```yaml
- insert:
    - id: tool-bailian-kb
      name: dsh-tool-bailian-kb
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

`workspaceId` 只是解析链的一层，不是唯一来源：config 显式值（含此环境变量读取）per-call 优先；未设置时回退到 `BAILIAN_WORKSPACE_ID` credential。同样回退覆盖 `defaultAgentId`（`BAILIAN_DEFAULT_AGENT_ID`）与 API key（`DASHSCOPE_API_KEY`）。

## 三个值的解析链

| 值 | 1️⃣ config 显式值（本 patch 或用户覆盖） | 2️⃣ credential（UI 卡片 / `~/.dsh/.credentials.yaml`） | 3️⃣ 都缺失时 |
|---|---|---|---|
| `DASHSCOPE_API_KEY` | —（无 config 面） | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_WORKSPACE_ID` | `workspaceId` | ✅ | 工具调用报错并引导配置 |
| `BAILIAN_DEFAULT_AGENT_ID` | `defaultAgentId` | ✅ | `agent_id` 参数变必填（schema 恒 optional，运行时校验） |

行为参数（`endpointHost`/`agentVersion`/`chatTimeoutMs`）只在 config 层，见 [tool-bailian-kb README](../tool-bailian-kb/README.md)。

## Web UI 配置卡片

装进 profile 后，Settings → Plugins 出现“百炼知识库”卡片，可配置三个 credential（写 `~/.dsh/.credentials.yaml`）：

- **DashScope API Key** — write-only，`type=password` 遮罩输入草稿
- **Bailian Workspace ID** — 明文（便于粘贴核对 workspace id）
- **默认服务 ID（agent_id）** — 明文，附独立“清除”按钮（留空保存 = 不写，清除须显式 unset）

值永不回显：字段始终空白起步，仅显示 configured/来自环境变量 徽标；来自 shell export 或 `~/.dsh/.env` 的值只读（继承环境层），输入框禁用。

## 用户覆盖

用户 patch 层在本 bundle 之上，按 id 覆盖时**替换整个 config（无 deep-merge）**。`workspaceId`/`defaultAgentId` 均为可选，只需重述想显式固定的字段：

```yaml
# ~/.dsh/cordis.patch.yml 或 profile 的 cordis.patch.yml
- id: tool-bailian-kb
  config:
    defaultAgentId: aid-customer-service   # 场景固定式部署；省略 workspaceId 走 credential
    chatTimeoutMs: 600000
```

禁用：`- id: tool-bailian-kb` + `disabled: true`。

## 安装（本地 checkout 链接）

bundle 是 `dsh.bundle` 声明层，真正的插件包 `dsh-tool-bailian-kb` 是它的依赖；`link:` 安装不携带传递依赖，**两个包都要 add**（第二个无 bundle 声明，dsh 会以 plain dependency 装入，CLI 的 warning 即预期行为）：

```sh
dsh plugin --profile web add /path/to/bailian-kb-dsh/packages/bundle
dsh plugin --profile web add /path/to/bailian-kb-dsh/packages/tool-bailian-kb
```

## 卸载

```sh
dsh plugin --profile <name> remove bailian-kb-dsh dsh-tool-bailian-kb
```
