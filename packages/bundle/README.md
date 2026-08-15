# bailian-kb-bundle（分发包）

dsh bundle 分发面：`package.json` 的 `dsh.bundle.patch` 声明 + [`cordis.patch.yml`](cordis.patch.yml)，向 profile 插入 `tool-bailian-kb` row。

## Patch row

```yaml
- insert:
    - id: tool-bailian-kb
      name: dsh-tool-bailian-kb
      config:
        workspaceId: !!js process.env.BAILIAN_WORKSPACE_ID
```

`workspaceId` 默认从环境变量读取（`~/.dsh/.env` 写 `BAILIAN_WORKSPACE_ID=ws-xxx` 即可运行）；未设置时插件加载期 fail loud。

## 用户覆盖

用户 patch 层在本 bundle 之上，按 id 覆盖时**替换整个 config（无 deep-merge），必须连 workspaceId 一起重述**：

```yaml
# ~/.dsh/cordis.patch.yml 或 profile 的 cordis.patch.yml
- id: tool-bailian-kb
  config:
    workspaceId: ws-xxx
    defaultAgentId: aid-customer-service   # 场景固定式部署
    chatTimeoutMs: 600000
```

禁用：`- id: tool-bailian-kb` + `disabled: true`。

## 卸载

```sh
dsh plugin --profile <name> remove bailian-kb-bundle
```
