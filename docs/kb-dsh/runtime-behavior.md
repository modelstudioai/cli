# bailian-kb-dsh 运行时行为（内部说明）

面向维护者：记录 `packages/bailian-kb-dsh` 里那些**为什么这么做**的选择。用户面文档在 [packages/bailian-kb-dsh/README.md](../../packages/bailian-kb-dsh/README.md)（中文版 `README.zh.md`），改动清单在 [docs/agents/dsh-plugin.md](../agents/dsh-plugin.md)。

## Bundle 声明与配置分层

`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，向 profile 插入插件行：

```yaml
- insert:
    - id: tool-bailian-kb
      name: "bailian-kb-dsh"
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

`workspaceId` 只是解析链的一层，不是唯一来源：Config 同时注册为 `bailian-kb` settings namespace，patch entry 作 base 层，设置页 / 设置文档的用户层叠在其上；都未设置时 per-call 回退到 `BAILIAN_WORKSPACE_ID` credential。同样的回退覆盖 `defaultRetrieveAgentId`（`BAILIAN_DEFAULT_RETRIEVE_AGENT_ID`）、`defaultChatAgentId`（`BAILIAN_DEFAULT_CHAT_AGENT_ID`）与 API key（`DASHSCOPE_API_KEY`，无 settings 面）。

settings 注册是**手写**的，没有用 `installSettingsSection`：需要两个它不带的东西 —— `expose` opt-in（设置页从浏览器改这个 section）和凭据迁移要写入的 scope handle。所有值每次调用经 source thunk 读取，因此设置改动无需重启或重注册工具。

### 四个值的解析链

| 值                                  | 1️⃣ settings 用户层（设置页可编辑、回显） | 2️⃣ entry config（patch 或用户覆盖，作 base 层） | 3️⃣ credential（`~/.dsh/.credentials.yaml` / env） | 4️⃣ 都缺失时                                                       |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `DASHSCOPE_API_KEY`                 | —（无 settings 面）                      | —（无 config 面）                               | ✅                                                | 工具调用报错并引导配置                                            |
| `BAILIAN_WORKSPACE_ID`              | ✅ `workspaceId`                         | ✅ `workspaceId`                                | ✅                                                | 工具调用报错并引导配置                                            |
| `BAILIAN_DEFAULT_RETRIEVE_AGENT_ID` | ✅ `defaultRetrieveAgentId`              | ✅ `defaultRetrieveAgentId`                     | ✅                                                | 该 scene 只有一个已部署服务时取它；否则省略 `agent_id` 的调用报错 |
| `BAILIAN_DEFAULT_CHAT_AGENT_ID`     | ✅ `defaultChatAgentId`                  | ✅ `defaultChatAgentId`                         | ✅                                                | 同上                                                              |

"唯一服务即默认"这一层是 2C 部署的零配置路径：只有一个服务时没有可选项，逼用户在设置里点一次名字买不到任何东西。注意 `agent_id` 在两个工具的 schema 中**恒必填**，模型路径不会触发默认服务回退；回退保留是为程序化调用与 credential 热切换。

行为参数（`endpointHost` / `agentVersion` / `chatTimeoutMs`）只在 config/settings 层（设置文档可改，实时生效）。

解析后的 workspaceId 还经 `shellEnv` 注册导出为 `BAILIAN_WORKSPACE_ID`，否则 settings 文档里的值对 bash 子进程（`bl knowledge …`）不可见。

### 用户覆盖

用户 patch 层在本 bundle 之上，按 id 覆盖时**替换整个 config（无 deep-merge）**：

```yaml
# ~/.dsh/cordis.patch.yml 或 profile 的 cordis.patch.yml
- id: tool-bailian-kb
  config:
    defaultRetrieveAgentId: aid-search-service
    defaultChatAgentId: aid-chat-service
    chatTimeoutMs: 600000
```

禁用：`- id: tool-bailian-kb` + `disabled: true`。

## Web UI 配置页

装进 profile 后，Settings 左侧导航出现"百炼知识库"页（`settings.section` 槽位）：

- **DashScope API Key** — write-only，`type=password` 遮罩输入草稿，仅显示 configured / 来自环境变量 徽标；写 `~/.dsh/.credentials.yaml`
- **Bailian Workspace ID / 默认检索服务 ID / 默认对话服务 ID** — 回显：读写 `bailian-kb` settings 用户层，预填当前解析值；清空保存 = 移除用户层，回退 entry config → credential。两个服务 ID 可从服务缓存里选
- **自动获取** — 按钮调 Host 桥接路由 `/bailian-kb/autofill`：Host 在宿主机拉起浏览器登录百炼控制台（不经 `bl` 命令），回调落到本机 loopback 端口后直接把 API 密钥写入凭据存储、工作空间 ID 写入 settings，明文 key 不过浏览器；面板轮询到完成后自动刷新（无需再次点击）。登录 URL 始终请求签发新 key，因此每次都与当前账号配对，切换账号直接点一次即可
- **检索服务缓存** — 经 `/bailian-kb/services` 读缓存诊断（上次拉取时间、各 scene 条数、是否截断）并提供强制刷新按钮：面板存在的意义就是"开发者认为缓存不对"的那一刻

桥接路由（`/bailian-kb/settings`、`/bailian-kb/services`、`/bailian-kb/autofill`）而不是 settings wire：wire 需要 apiproxy 白名单，而 composition 不给树外 namespace 授权。GET 和 POST 共用一次 exact-route 注册 —— webServer map 按 (kind, path) 建键，同路径注册两次会抛 "duplicate route"。

首次接入 seed：启动时若 API key / workspaceId 从未被设置过（settings、credential、env 均无值），自动从 `~/.bailian/config.json` 采纳一次；`seededFields` 字段（settings 文档内，面板不可编辑）记账已消费 / 已由用户管理的字段，用户主动清空的值永不会被重新填回。

降级：远程浏览器（非 loopback，settings RPC 不可达）或未组合 settings 服务时，ID 字段退回旧的 write-only credential 控件，页面顶部显示提示。

## 检索服务缓存与上下文注入

模型要判断"该不该检索"，靠的是看到本 workspace 部署了哪些检索服务。插件内部经 `/api/v1/indices/rag/app/list` 拉取该清单并缓存，**不对模型暴露服务发现工具**（`kb_service_list` 不会回归：它会把"先 list 再 search"的额外一轮重新引入）；管理面仍用 bl。

### 载体：上下文消息，不是工具描述

两个工具的 **description 保持静态**（不含任何服务 id）。清单经 `agent/pre-step` 注入为一条带 source 的 `UserMessage`（`{ kind: 'plugin', plugin: 'tool-bailian-kb/services', form: 'catalog' }`），而不是烘进 tool description。两个原因：

1. **插件加载是每进程一次，不是每会话一次。** 描述在 `apply()` 时定型，长驻宿主里 TTL 只会被评估一次，用户在控制台新建的服务要等重启才能被感知；
2. **重注册工具会废掉 prompt 前缀缓存**（从第一个变化的 schema token 起）。走上下文消息则让 schema 永久稳定。

**变化抑制是正确性要求，不是优化**：`pre-step` 每个"步"（= 一次模型请求）触发一次，一轮里调 5 次工具就触发 6 次。只有清单内容变化时才重发，且判定叠加**可见性**（`session.surface.nodes`）—— 压缩把清单消息裁掉后会自动重新注入，否则模型会静默失去清单。

### 清单内容策略

| 情形                     | 注入内容                                              |
| ------------------------ | ----------------------------------------------------- |
| 配了默认服务             | 只列该服务 + "另有 N 个" 提示                         |
| 未配默认，deployed ≤ 10  | 全量 `agent_id` + 名称                                |
| 未配默认，deployed > 10  | 按 `modify_time` 倒序取 10 条，**显式标明截断**与总数 |
| 0 个 / 拉取失败 / 无缓存 | 不注入（工具仍可用）                                  |

英文框架 + 服务名原样保留；空 scene 整节省略；截断必须告知（静默截断会让模型把清单当全集，进而断言"没有对应知识库"）。

### 缓存与刷新

落点：`${DSH_HOME:-~/.dsh}/cache/bailian-kb/services-<workspaceId>.json`（临时文件 + `rename()` 原子发布，目录 `0o700`）。按 workspace 分文件是必需的：api key 只能访问自己的 workspace，而"自动获取"按钮就是为了切账号。

存：`agent_id` / `agent_name` / `scene` / `status` / `modify_time`，预留 `description`（待列表接口返回）。**不存 `pipeline_list`** —— 它不稳定携带 `pipeline_name`，做不了知识库标签。

| 刷新触发点                                                                         | 模型何时看见                         |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| pre-step 间隔调度（超 TTL 30 分钟，后台异步，**不阻塞**）                          | 下一步                               |
| 控制台登录成功（`/bailian-kb/autofill` 回调）                                      | 下一步                               |
| agent 跑了 `bl knowledge service create/deploy/delete/copy`（`tools/result` 观察） | 下一步                               |
| 面板强制刷新（`POST /bailian-kb/services`）                                        | 下一步                               |
| 调用撞 4xx（agent_id 已失效）                                                      | **本步**，刷新后的列表追加进错误消息 |
| workspaceId / apiKey 变更                                                          | 下一步                               |

`tools/result` 的匹配是在序列化参数里找命令串，而不是认某个具体工具名：agent 可能用 bash、终端工具或 run_code 跑 `bl`。宽匹配是故意的 —— 误判只多花一次 list 请求，漏判则退回 TTL。

刷新失败只 warn，保留旧文档；并发刷新共享一个请求（pre-step 每步都会检查）。pre-step 监听器**永不抛异常** —— 抛出会使用户当前这一步失败。未组合 `agents` 的 headless 装配只是没有清单，工具照常可用。

## 错误语义

- HTTP 错误：4xx 时刷新服务缓存并把当前可用服务追加进错误消息（这两个接口上 `agent_id` 是唯一的调用方标识符，所以 4xx 大多是 id 已失效）；5xx 与刷新本身失败则原错误透传；
- 凭证缺失：指向 `~/.dsh/.env` / `.credentials.yaml` 配置方式与控制台取 key 页面；
- chat 超时：说明服务端多轮检索特性，建议重试或改用 `kb_search`；
- 服务端错误体截断至 500 字符进入错误信息（优先 `code: message`）。

## 管理面 skill

`skills/bailian-kb/SKILL.md` 随包分发，插件通过 `ctx.inject(['skills'])` 在 skills 服务可用时以 `source: 'bundled'` 运行时注册；无 skills 服务的组合（headless 最小装配）不受影响。文件的 YAML frontmatter 是 name / description 的**单一事实源**，注册时会被剥离（`SkillDefinition.content` 契约上是已去元数据的正文，而 runtime 注册路径不做任何解析）。

内容：bl CLI 安装 / 鉴权 / workspace 解析、建库 → 上传 → 部署工作流、服务清单的行为语义。**skill 不承担"该不该检索"的引导**（那是工具描述与上下文清单的事：skill 正文要模型先决定加载才能读到，是二阶决策）；它反过来承担一件工具做不到的事：**引导 agent 在 `service create` 时把服务名写清楚**。无 desc 时服务名是唯一语义来源，管理面的动作直接决定检索面的效果。

## 已知限制的成因

- kb_chat 执行期无进展显示（缓冲式消费 SSE）。
- `top_k` 是客户端截断：请求体不含该参数，服务端返回条数由检索服务配置决定，截断只影响进入模型上下文的量。
- **服务画像的质量上限取决于服务名**：`service list` 接口当前不返回描述字段，所以模型只能靠 `agent_name` 判断一个服务能查什么。名字模糊的部署引导能力接近于零。列表接口补齐描述字段后只需改三处（`api-types` 补字段名 → `services.ts` 解析 → `buildServiceCatalog` 追加并截断到 200 字符），缓存已预留 `description` 键，无需迁移。
- 拉取每个 scene 最多 2 页，超出时标 `truncated` 并在清单里告知。
