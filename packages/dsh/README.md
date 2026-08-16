# bailian-cli-dsh

把阿里云百炼（Model Studio）的能力接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 profile bundle。

本包提供两项能力：

| 能力               | 说明                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Bailian 设置页** | 通用的百炼凭证配置（AK/SK 存入 `dsh` bl profile + DashScope API Key）+ TokenPlan 用量展示 + 记忆库配置 + 新会话欢迎页 |
| **跨会话长期记忆** | 自动检索注入 + 自动落库，模型可主动 search/add/list。按量计费，默认停用                                               |

---

## 1. 前置条件

- Node ≥ 22.19（`dsh` 的要求）
- `bl`（用量展示通过子进程调用 `bl console call`）

  ```sh
  npm install -g bailian-cli
  ```

- **阿里云 AK/SK**（AccessKey ID + AccessKey Secret）—— 用于控制台鉴权，查询用量信息。在 webui 设置页填入即可，无需环境变量。
- **DashScope API Key**（`sk-` 前缀，按量付费）—— 用于记忆库等 DashScope API 调用。在设置页「凭证配置」填入，与 AK/SK 并列为通用凭证。

  获取方式：[阿里云控制台 → AccessKey 管理](https://ram.console.aliyun.com/manage/ak)

---

## 2. 安装到 `web` profile

`npx @deepseek-ai/dsh web` 是 `dsh --profile web` 的别名，配置目录是 `~/.dsh/profiles/web/`。

```sh
pnpm -F bailian-cli-dsh build   # vp pack（host）+ esbuild（client.bundle.js）
cd packages/dsh && pnpm pack

npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/bailian-cli-dsh-<version>.tgz
```

确认 bailian 行都在：

```sh
npx @deepseek-ai/dsh --profile web --dump-config | grep -E 'bailian'
```

启动：

```sh
npx @deepseek-ai/dsh web
```

Web UI 在 http://127.0.0.1:3080。

---

## 3. Bailian 设置页 + 欢迎页

安装并重启后：

- **Settings → Bailian**：通用设置页（凭证配置 / TokenPlan 用量 / 记忆库）。
- **新会话欢迎页**：每个新会话（blank）在输入框上方显示「百炼 Agent」欢迎页（Tab + 功能卡片），发出第一条消息后自动隐藏。

### 凭证配置（通用）

1. 在「凭证配置」区填入 **AccessKey ID** 和 **AccessKey Secret**
2. 点击 **「保存凭证」**

Host 会执行 `bl auth login --open-api --config dsh`，将 AK/SK 和新生成的 access_token 存入 bl 的 `dsh` 专属 profile。**所有后续百炼插件共用此凭证**，无需重复配置。

### TokenPlan 用量

1. 选择区域和站点
2. 点击 **「查询用量」**

Host 执行 `bl console call --config dsh` 调用 3 个个人版控制台接口，返回：

- **用量百分比** —— 5 小时窗口 / 1 周窗口的用量百分比和重置时间
- **套餐信息** —— 套餐类型（基础版/标准版/高级版）、状态、剩余天数、到期时间、自动续费
- **额外用量包** —— Credits 总量、剩余量、生效中数量

### 凭证解析优先级

凭证保存到 bl 的 `dsh` profile 后，所有百炼插件通过 `--config dsh` 读取。行内 config 的 `accessKeyId`/`accessKeySecret` 作为兜底（未通过 UI 保存时自动使用）。

### 行内配置（可选）

如果不想在 UI 里每次输入，可以在 profile 的 `cordis.patch.yml` 里固化凭证：

```yaml
- id: bailian-tokenplan-usage
  config:
    # accessKeyId / accessKeySecret: 兜底凭证（未通过 UI 保存时使用）
    # consoleRegion: cn-beijing
    # consoleSite: domestic
    # profile: dsh  # 默认用 dsh 专属 profile
```

配置后 UI 表单会留空，但点击「查询用量」会使用行内凭证。

---

## 4. 跨会话长期记忆

默认停用（按量计费）。在 `cordis.patch.yml` 中设 `disabled: false` 启用，然后在设置页配置 API Key 和参数。

### 功能

- **自动检索注入**：新会话首轮，用用户消息搜索记忆，将结果注入上下文（`autoInject`，默认开启）
- **自动落库**：每轮结束，将该轮新消息发送到记忆库 add API（`autoPersist`，默认开启）
- **模型工具**：`bailian_memory_search`（检索）、`bailian_memory_add`（存储）、`bailian_memory_list`（浏览）

### 触发机制

| 时机       | 触发方式                                                  |
| ---------- | --------------------------------------------------------- |
| 新会话首轮 | 自动检索记忆注入上下文（`agent/pre-step` 事件）           |
| 对话中     | 模型主动调用 `bailian_memory_search`/`bailian_memory_add` |
| 轮次结束   | 自动落库新消息（`agent/turn-stopping` 事件）              |

### 凭证与配置

- **API Key**：DashScope 按量付费 Key（`sk-`），在设置页「凭证配置」填入
- **Base URL**：默认 `https://dashscope.aliyuncs.com/api/v2/apps/memory/`
- **User ID**：记忆归属 ID，默认读系统用户名
- **Plan Version**：`lite`（便宜，关闭 rerank）或 `pro`（开启 rerank，约 50 倍成本）。注意：实际计费由 `enable_rerank` 控制
- **Top K**：检索返回数量（1-100，默认 10）
- **Memory Library ID**：记忆库 ID，留空用默认

### 计费

- Add：120 QPM
- Search：300 QPM（Lite ¥0.00002/次，Pro ¥0.001/次）
- 总计不超过 3000 QPM

### 启用

```yaml
- id: bailian-memory
  disabled: false
  config:
    baseUrl: "https://dashscope.aliyuncs.com/api/v2/apps/memory/"
    planVersion: "lite"
    topK: 10
    autoInject: true
    autoPersist: true
```

启用后在设置页「记忆库」section 配置 API Key 和参数。

> 记忆库调用 DashScope memory v2 API（非 `bl memory`），因为 v2 API 暴露了 `min_score`、`enable_rerank`、`plan_version`、`memory_library_id` 等参数 `bl memory` 不支持。

## 5. 验证

```sh
# 配置合成
npx @deepseek-ai/dsh --profile web --dump-config | grep bailian

# bl 就绪
bl auth status
```

启动后验证：

- **欢迎页**：新开一个会话，输入框上方出现「百炼 Agent」欢迎页
- **凭证配置**：打开 Settings → Bailian → 填入 AK/SK → 保存凭证
- **用量展示**：同页面选择区域 → 查询用量
- **记忆库**：启用 `bailian-memory` 后，同页面配置 API Key

---

## 6. 常见问题

| 现象                                  | 原因                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 用量查询报 `bl auth login failed`     | AK/SK 无效或无权限；确认 AK 有百炼控制台访问权限                                                                                   |
| 用量查询报 `NotLogined` 或 token 过期 | bl 的 access token 已过期；Host 会自动通过 AK/SK 刷新，确认 AK/SK 正确                                                             |
| 用量查询报 `bl console call failed`   | 控制台接口调用失败；检查 region/site 是否匹配你的账号                                                                              |
| 用量查询报 `Workspace.NotAuthorised`  | bl 用了其他 profile 的旧 access_token；Host 默认用 `--config dsh` 专属 profile 隔离，首次 login 会生成新 token                     |
| 工具报找不到 `bl`                     | `bl` 不在 PATH：`npm install -g bailian-cli`                                                                                       |
| 设置页/欢迎页看不到 Bailian           | 需**重启 `dsh web`**（bundle 在启动时加载）；确认 `dump-config` 有 `bailian-client` 行，且 `client.bundle.js` 为 ModuleLoader 格式 |
| 启动报 `invalid plugin ... apply`     | 包根 `dist/index.mjs` 必须导出 `apply`（no-op 插件）；重新 `pnpm build` 再装                                                       |

---

## 7. 卸载

```sh
npx @deepseek-ai/dsh plugin --profile web remove bailian-cli-dsh
```

---

## 架构说明

### Host 半

- `src/tokenplan-usage/index.ts` —— 凭证 + TokenPlan 用量。`inject: ['subprocess']`，所有 bl 命令带 `--config dsh` 隔离凭证。两个 webServer 路由：
  - `POST /bailian/credentials` — 保存 AK/SK（`bl auth login --open-api --config dsh`，生成新 token）
  - `POST /bailian/tokenplan/usage` — 查询用量（`bl console call --config dsh`，3 个个人版接口）
- `src/memory/index.ts` —— 记忆库（默认停用）。直接调 DashScope memory v2 API，注册 tools + auto-inject/persist。路由 `/bailian/memory/config`、`/bailian/memory/status`。
- `src/index.ts` —— 包根 no-op 插件，供 `bailian-client` 行加载（该行只为了让 client-modules 服务浏览器 bundle）。

> 路由用 `/bailian/*` 而非 `/api/*`：`/api` 前缀被 dsh 的 RPC 网关（apiProxy）占用，自定义路由会被遮蔽。

调用链路：**AK/SK → `bl auth login --open-api --config dsh`（存入 dsh profile）→ `bl console call --config dsh`（读 dsh profile token → 控制台网关）→ 个人版 TokenPlan 接口**

### Client 半（`src/client.ts`）

- 唯一的浏览器源码，构建为 DSH ModuleLoader 格式（见下）。
- 注册 `settings.section`（id: `bailian`，label: `Bailian`），渲染通用百炼设置页（凭证配置 / TokenPlan 用量 / 记忆库）。
- 注册 `conversation.input.dock`（id: `bailian-welcome`）：当 `session.blank === true`（新会话）渲染「百炼 Agent」欢迎页（Tab + 功能卡片），开始对话后自动隐藏。
- 通过 `fetch('/bailian/*')` 调 Host 路由。

### Client 构建（ModuleLoader 格式）

DSH 浏览器只加载 `window.__ModuleLoader__.load({ id, factory })` 格式的 bundle（`require('react')` 由浏览器 ModuleLoader 提供）。vite-plus 产出裸 ES module，格式不对，所以 client 单独用 esbuild 构建：

- `scripts/build-client.mjs` —— 把 `src/client.ts` 构建为 CJS + browser + `react` external，包上 ModuleLoader banner/footer，输出 `client.bundle.js`。
- `package.json` 的 `build` = `vp pack && node scripts/build-client.mjs`。
- `package.json` 的 `exports["./client"]` 与 `dsh.client: { platform: "web" }` 指向 `client.bundle.js`，被 client-modules 扫描并服务。
- `cordis.patch.yml` 的 `bailian-client` 行 `name` 必须是**包根**（`bailian-cli-dsh`，无子路径），client-modules 才能 `require.resolve("<name>/package.json")` 识别 `dsh.client`。

改 client UI 只需编辑 `src/client.ts`，`pnpm build` 自动重新生成 `client.bundle.js`。

### 共享模块（`src/shared/`）

- `bl.ts` —— `bl` 子进程调用封装（env 转发、stdout/stderr 收集、JSON 解析）
- `credentials.ts` —— TokenPlan / 按量付费 Key 分类工具
- `http.ts` —— DashScope HTTP 客户端

这些模块来自早期版本（vision / image / managed-agent / RAG / memory 工具），已移除工具实现但保留共享逻辑作为参考。
