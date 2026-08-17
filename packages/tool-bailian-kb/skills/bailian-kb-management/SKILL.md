---
name: bailian-kb-management
description: 管理阿里云百炼知识库（建库、上传文档、部署检索服务、Chunk 运维）。当用户要创建/更新/删除知识库、上传或导入文档、部署检索服务、管理数据中心文件时使用 kscli。检索与问答不走本 skill——用原生工具 kb_search / kb_chat。
---

# 百炼知识库管理（kscli）

检索面与管理面的分工：**查知识用 `kb_search`（取证据）/ `kb_chat`（成品问答）原生工具；本 skill 只覆盖管理长尾**——知识库全生命周期、文档、检索服务、Chunk、数据中心。

## 前置检查

1. `kscli --version` —— 未安装则运行 `npm install -g knowledge-studio-cli`（需 Node.js ≥ 18.17）；安装失败时把错误原样报告给用户，不要静默跳过。
2. 鉴权：需要 `DASHSCOPE_API_KEY`（环境变量，或 `kscli config set --key api_key --value sk-xxx`）。
3. workspace 解析优先级：`--workspace-id` 参数 > 环境变量 `BAILIAN_WORKSPACE_ID` > `kscli config set --key workspace_id --value ws-xxx`。

## 常用工作流：建库到可检索

```bash
kscli kb create --name "my-kb" --embedding-model text-embedding-v3   # 1. 建库
kscli doc upload --kb-id <kb-id> --file ./docs.pdf                    # 2. 上传本地文档
kscli doc status --kb-id <kb-id> --doc-id <doc-id>                    # 3. 轮询至 COMPLETED
kscli service create ... && kscli service deploy ...                  # 4. 建/部署检索服务 → 得到 agent_id
```

部署完成后用 `kscli service list` 确认服务可见，再用 `kb_search` 带该 `agent_id` 验证检索。

## 命令组速查

`kb`（list/info/create/update/delete/stats）· `doc`（list/upload/status/delete/tag/import-oss）· `service`（list/get/create/update/deploy/delete/copy）· `chunk`（add/list/update/delete）· `file` / `collection` / `category`（数据中心）。全部命令支持 `--output json`（结构化输出）、`--dry-run`（预览请求）、`--quiet`。完整手册：https://github.com/modelstudioai/cli/blob/main/docs/knowledge-cli-guide.md

## 最佳实践

- 用户反复使用同一检索服务时，建议其把 agent_id 写入项目指令（如 AGENTS.md）或让 agent 记住，后续 kb_search / kb_chat 直接携带。
- 服务有 draft/deployed 两种状态：只有 deployed 可被默认版本调用；draft 调试用 `--agent-version beta`。
