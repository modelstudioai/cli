# bailian-cli-dsh

把阿里云百炼（Model Studio）的能力接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 profile bundle。

一个包提供 5 个插件行，外加对 base bundle 的 `llm-pi-ai` 行做一次配置覆盖：

| row id                       | 能力                                                            | 默认 | 依赖                  |
| ---------------------------- | --------------------------------------------------------------- | ---- | --------------------- |
| `llm-pi-ai`（覆盖 base 行）  | 把百炼 TokenPlan 网关注册成 LLM provider（`bailian-tokenplan`） | 启用 | TokenPlan Key         |
| `bailian-tool-vision`        | `bailian_vision_describe`：图片/视频理解                        | 启用 | `bl`                  |
| `bailian-tool-image`         | `bailian_image_generate`：文生图                                | 启用 | `bl`                  |
| `bailian-tool-managed-agent` | `bailian_run_remote_task`：按需在云端创建 agent 并跑任务        | 启用 | `bl` + 按量付费 Key   |
| `bailian-web-search-rag`     | 百炼知识库检索，注册为 `web_search` 的后端                      | 停用 | 按量付费 Key + 知识库 |
| `bailian-memory`             | 跨会话长期记忆（tools + 自动检索/落库）                         | 停用 | 按量付费 Key          |

`web-search-rag` 与 `memory` 默认停用是有意的：它们要么需要部署方特有的资源 ID，要么按次计费，不该在用户没配置时就生效。`tool-managed-agent` 默认启用——它加载时不建任何资源，只有模型真正调用时才在云端创建 agent。

---

## 1. 前置条件

- Node ≥ 22.19（`dsh` 的要求）
- `bl`（vision / image / 远程任务 三个工具通过子进程调它）

  ```sh
  npm install -g bailian-cli
  ```

- 百炼 API Key。**注意有两类且不可混用**：

  | 类型      | 前缀     | 能访问                                  | 不能访问       |
  | --------- | -------- | --------------------------------------- | -------------- |
  | TokenPlan | `sk-sp-` | TokenPlan 网关（LLM / vision / 文生图） | 记忆库、知识库 |
  | 按量付费  | `sk-ws-` | 记忆库、知识库、DashScope 全量接口      | TokenPlan 网关 |

  两者互相返回 `401 InvalidApiKey`，所以本包用**两个不同的环境变量**，不会互相踩：

  ```sh
  export BAILIAN_TOKENPLAN_API_KEY=sk-sp-xxx   # 只给 bailian-tokenplan provider
  export DASHSCOPE_API_KEY=sk-ws-xxx           # 给 bl、memory、RAG
  ```

  只有一类 Key 也能用，只是能力范围相应缩小。若只有 TokenPlan Key：

  ```sh
  export BAILIAN_TOKENPLAN_API_KEY=sk-sp-xxx
  export DASHSCOPE_API_KEY=sk-sp-xxx
  export DASHSCOPE_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com
  ```

  这样 LLM / vision / 文生图可用，memory 与 RAG 不可用（保持停用即可）。

---

## 2. 安装到 `web` profile

`npx @deepseek-ai/dsh web` 是 `dsh --profile web` 的别名，所以要装进**名为 `web` 的 profile**，配置目录是 `~/.dsh/profiles/web/`（`$DSH_HOME` 可覆盖）。

本包尚未发布到 npm，先在本仓库打包：

```sh
pnpm -F bailian-cli-dsh build
cd packages/dsh && pnpm pack          # 产出 bailian-cli-dsh-<version>.tgz
```

装入 profile（`dsh plugin` 是 pnpm 的转发器，接受本地路径 / tarball / npm 包名 / git）：

```sh
npx @deepseek-ai/dsh plugin --profile web add /absolute/path/to/bailian-cli-dsh-1.14.2.tgz
```

因为 `package.json` 声明了 `dsh.bundle`，安装后会自动加入该 profile 的 bundle 层，无需手动改 `cordis.patch.yml`。

确认 5 个插入行都在，且 TokenPlan provider 已配到 `llm-pi-ai` 上：

```sh
npx @deepseek-ai/dsh --profile web --dump-config | grep -E 'bailian|tokenplan'
```

启动：

```sh
npx @deepseek-ai/dsh web
```

Web UI 在 http://127.0.0.1:3080。

> 发布到 npm 后直接 `npx @deepseek-ai/dsh plugin --profile web add bailian-cli-dsh`，跳过打包步骤。

---

## 3. 开箱能用的部分

装完不做任何配置就生效：

**LLM provider** — 模型选择器里出现 `bailian-tokenplan`，可选模型（已逐个实测）：

| 模型                     | 读图               |
| ------------------------ | ------------------ |
| `qwen3.8-max`            | 是                 |
| `qwen3.7-plus`           | 是                 |
| `qwen3.6-flash`          | 是                 |
| `glm-5.2`                | 是                 |
| `qwen3.7-max`            | 否（传图直接 400） |
| `deepseek-v4-pro`        | 否                 |
| `deepseek-v4-flash-0731` | 否                 |

**三个工具** — `bailian_vision_describe`、`bailian_image_generate`、`bailian_run_remote_task`。

前两个走 TokenPlan（vision/image）。`bailian_run_remote_task` 见 [§3.1](#31-远程任务-bailian_run_remote_task)——它默认启用但用的是**按量付费 Key + dashscope 端点**，与 TokenPlan 那两个不同。

### 关于看图，有个坑值得知道

dsh 会在两处**提前**拦截图片：Web UI 粘图前会查当前模型的输入模态，`read_image` 也有同样的门禁。所以主模型选 DeepSeek 时，图片根本进不到对话里。

- 主模型选 `qwen3.8-max` 等标着"是"的 → 直接粘图，原生看图，不需要任何工具
- 主模型选 DeepSeek → 让它调 `bailian_vision_describe`，工具返回**文字描述**，绕过模态门禁

DeepSeek 那两个模型在 TokenPlan 网关上传图**不报错但也看不见**（实测会回答 "None"），所以本包坚决没给它们声明 `input: [image]`——否则会从"明确拒绝"退化成"静默失明"，更难排查。

`bailian_image_generate` 同理：模型能看图时返回内联图片，不能看图时降级为返回落盘路径，你可以接着用 vision 工具读它。文件不会被删除，正是为了这个衔接。

### 3.1 远程任务（`bailian_run_remote_task`）

把一个任务甩到百炼云端的托管 agent 上跑，不占本地会话。**无需预先写 `agents.yaml` 或 `apply`**：工具首次被调用时，`bl managed-agent run` 会在你的账号里幂等创建一个 agent + cloud environment，之后复用。

- 模型自己按用户意图填 `instructions`（远程 agent 的角色），`task` 是要它做的事。例如你说「在云端帮我审计这个依赖树，它该懂安全」→ 模型调 `bailian_run_remote_task(task="审计依赖树", instructions="你是安全专家")`。
- **前提**：这条路走的是 managed-agent（agentstudio）服务，需要**按量付费 Key**（`sk-ws-`）+ dashscope 端点，且账号已开通 managed-agent。TokenPlan Key 不适用。若 `DASHSCOPE_API_KEY`/端点没配好，首次调用会返回 `Bailian API 404`。
- 首次会创建云资源（可能计费、启动有延迟）；同名 agent 后续复用。默认 agent 名 `dsh-remote-runner`，可在配置里改。

需要非默认的 agent 名 / 模型时：

```yaml
- id: bailian-tool-managed-agent
  config:
    agent: my-runner
    model: qwen3.8-max
    timeoutMs: 600000
```

---

## 4. 开启可选插件

用户层配置写在 `~/.dsh/profiles/web/cordis.patch.yml`，按 row `id` 覆盖 bundle 的默认值。

> **一个必须记住的语义**：patch 是按 row **整体替换 `config`**，不是深合并。所以覆盖一行时要把该行完整的 config 重写一遍。

### 知识库检索（RAG）

注册 id 为 `bailian-kb` 的搜索后端，模型用它熟悉的 `web_search` 就能检索私域文档。

```yaml
- id: bailian-web-search-rag
  disabled: false
  config:
    workspaceId: llm-xxxxxxxx # 百炼控制台工作空间 ID
    agentId: aid-xxxxxxxx # 知识库"检索服务"ID
    maxResults: 10
    # apiKey 省略则读 $DASHSCOPE_API_KEY
```

一个实例对一个知识库（`WebSearchRequest` 只带 `query` / `maxResults`，agentId 只能来自配置）。要多个知识库就插多行不同 `id`。

**如果 profile 里还有别的搜索 provider**（base bundle 默认带 `web-search-deepseek`），必须显式指定用哪个，否则 dsh 报 `WEB_PROVIDER_AMBIGUOUS`：

```yaml
- id: web
  config:
    searchProvider: bailian-kb
```

### 长期记忆

dsh 自身没有跨会话记忆（`ctx.compaction` 只在单会话内压缩上下文）。开启后：两个工具 `bailian_memory_search` / `bailian_memory_add`，加上每个会话首轮自动检索注入、每轮结束自动落库。

```yaml
- id: bailian-memory
  disabled: false
  config:
    userId: your-name # 省略则读 $BAILIAN_MEMORY_USER_ID，再退到系统用户名
    planVersion: lite
    topK: 10
    autoInject: true
    injectEveryTurn: false # 开启会变成每轮一次检索，成本相应上升
    autoPersist: true
```

**费用**：记忆库自 2026-08-20 起商业化，add 与 search 按次计费，pro 档约为 lite 档的 50 倍。

实测发现一个与文档不符的地方：单独传 `plan_version: lite` 会被服务端忽略、仍按 pro 计费，真正生效的开关是 `enable_rerank: false`。本插件已按此处理——`planVersion: lite`（默认）会同时下发 `enable_rerank: false`，所以默认就是便宜的那档。

不想要自动行为、只保留手动工具：

```yaml
- id: bailian-memory
  disabled: false
  config:
    userId: your-name
    autoInject: false
    autoPersist: false
```

> 远程任务（`bailian_run_remote_task`）默认启用，配置见 [§3.1](#31-远程任务-bailian_run_remote_task)。

---

## 5. 验证

```sh
# 配置是否被正确合成（改完 patch 后先看这个）
npx @deepseek-ai/dsh --profile web --dump-config | grep -A5 bailian-memory

# bl 是否就绪
bl auth status
```

启动后逐项试：

- **LLM**：切到 `bailian-tokenplan / qwen3.8-max`，随便发一句
- **原生看图**：同上模型，直接粘一张图提问
- **间接看图**：切到 `deepseek-v4-pro`，让它用 `bailian_vision_describe` 读同一张图
- **文生图**：让模型生成一张图
- **RAG**：问一个只有知识库里才有答案的问题
- **记忆**：会话 A 告诉它一个事实 → 关掉 → 新开会话 B 提问，看是否命中
- **远程任务**：说「在云端帮我跑一个任务：<something>，它该擅长 <role>」→ 确认模型调用 `bailian_run_remote_task`（`instructions` 由模型按 role 填）→ 首次触发云端创建 → 返回远程会话结果（需按量付费 Key + 已开通 agentstudio）

---

## 6. 常见问题

| 现象                                   | 原因                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| LLM 路由 `401 InvalidApiKey`           | `BAILIAN_TOKENPLAN_API_KEY` 没设，或误填了 `sk-ws-` 的按量付费 Key     |
| memory / RAG `401 InvalidApiKey`       | `DASHSCOPE_API_KEY` 误填了 `sk-sp-` 的 TokenPlan Key                   |
| `WEB_PROVIDER_AMBIGUOUS`               | 有多个搜索 provider，需在 `web` 行 pin `searchProvider`                |
| 粘图报 `MODEL_DOES_NOT_SUPPORT_IMAGES` | 当前模型不支持图片输入，换成上表标"是"的，或改用 vision 工具           |
| 工具报找不到 `bl`                      | `bl` 不在 PATH：`npm install -g bailian-cli`                           |
| 改了 patch 但没生效                    | `config` 是整体替换，检查是否漏写了原有字段；再用 `--dump-config` 确认 |
| `memoryLibraryId does not exist`       | 记忆库 ID 属于另一个账号，与当前 Key 不匹配                            |

---

## 7. 卸载

```sh
npx @deepseek-ai/dsh plugin --profile web remove bailian-cli-dsh
```

移除后 bundle 层会自动从 `dsh.profile.bundles` 摘掉；`~/.dsh/profiles/web/cordis.patch.yml` 里你手写的覆盖行需要自己清理。
