# URL / 渠道变更

## 触发条件

- 控制台域名变更(如 `bailian.console.aliyun.com` → 新域名)
- API endpoint 迁移
- 文档站迁移
- 调整 / 删除 / 新增渠道追踪参数(`source_channel` 等)

## URL 的分层架构

```
core/config/schema.ts                   ← API endpoint / 文档站(region-aware)
  REGIONS{cn, us, intl}     dashscope.aliyuncs.com 等
  DOCS_HOSTS{cn, us, intl}  help.aliyun.com/zh/model-studio
  BAILIAN_HOST              bailian.cn-beijing.aliyuncs.com (OpenAPI)

runtime/src/urls.ts                      ← 用户面控制台 URL(cn-only)
  BAILIAN_CONSOLE_ROOT      bailian.console.aliyun.com
  BAILIAN_CONSOLE           BAILIAN_CONSOLE_ROOT/cn-beijing
  API_KEY_PAGE              BAILIAN_CONSOLE/?tab=app#/api-key
  TOKEN_PLAN_PAGE           BAILIAN_CONSOLE_ROOT/cn-beijing?tab=plan#/efm/subscription/overview
  MCP_WEBSEARCH_PAGE        mcpMarketplaceDetailPage("WebSearch")
  mcpMarketplaceDetailPage    BAILIAN_CONSOLE?tab=mcp#/mcp-market/detail/<serverCode>

core/files/upload.ts                     ← model baseUrl → 同源临时上传 endpoint
  北京/新加坡公共站         保持当前公共站 origin + /api/v1/uploads
  北京/新加坡 Workspace     保持当前 Workspace origin + /api/v1/uploads
  显式自定义代理            保持代理 origin,不改写到公共站
  其他官方地域 / Token Plan 联网前报 usage error,引导使用 HTTPS URL
  UploadOptions.baseUrl     直接 SDK 调用未提供时保持北京公共站默认值
```

Prime 视频命令通过 `Client.uploadFile` / `resolveImageInput` 的 `defaultBaseUrl` 回调,
复用 `resolvePrimeEndpoint` 推导 model Workspace origin;上传策略与模型提交均保持该
Workspace origin。显式配置的 model origin 仍优先;已有媒体 URL 不触发上传或求值上传默认地址。

官方临时文件上传当前只支持 `cn-beijing` 与 `ap-southeast-1`。Token Plan 主机,以及这些官方
endpoint 上的 `sk-sp-` 密钥,在发送 API Key 前失败。显式自定义代理视为自身路由的权威来源,
保持同源且不按密钥前缀拦截,由代理/服务决定能力。任何路径都不得回退公共站或跨 origin 重试;
不支持时用户可改用服务可访问的 HTTPS 媒体 URL。服务端错误保留 message/code/request ID/raw
response,并在 message 的结构化上下文中展示本次有效上传 endpoint。

## 必查清单

### A. TS 源码(必须 import,不准硬编码)

- [ ] `packages/core/src/config/schema.ts` 是所有 API/docs 基址的源头
- [ ] `packages/runtime/src/urls.ts` 是所有用户面控制台 URL 的源头
- [ ] 改完后 grep 验证:

```sh
# 控制台 URL — 应只在 urls.ts 出现
grep -rnE "https://bailian\.console\.aliyun\.com" packages/ --include="*.ts" \
  | grep -v "node_modules" | grep -v "/dist/"
# 期望:匹配 packages/runtime/src/urls.ts;
# 当前遗留例外:packages/commands/src/commands/auth/login-console.ts(登录站点映射)、
# packages/core/src/advisor/recommend.ts(模型文档 deep link)。触碰时优先收敛到统一 URL 模块。

# API endpoint — 应只在 schema.ts 和 upload.ts 出现
grep -rnE "https://dashscope[a-z-]*\.aliyuncs\.com" packages/ --include="*.ts" \
  | grep -v "node_modules" | grep -v "/dist/"
# 期望:只匹配 schema.ts(REGIONS)、upload.ts(派生)、tests
```

### B. 非 TS 文件(只能人工同步,无法 import)

- [ ] `skills/*/reference/` 各 `<group>.md` 中 API/控制台 URL(`generate:reference` 重建后核对并提交)
- [ ] `README.md` / `README.zh.md` 中所有 URL；内容图必须用可公网绝对 URL，且根目录与 `packages/cli` 逐字节一致（`assertReadmeSync`）。`img.alicdn.com` 会被 GitHub Camo 拒绝；相对路径在 npm 上解析不到。优先 `https://raw.githubusercontent.com/modelstudioai/cli/main/assets/...`

### C. 渠道追踪参数

- [ ] **当前现状**:TS 源码不带追踪参数;用户可点击的 `https://bailian.console.aliyun.com` 跳转(README、package README、skill setup 正文链接)统一带 `spm=a2ty07.github`。行内代码、站点标识、代码块里的域名没有跳转,不加
- [ ] 如未来调整追踪参数,统一评估上述用户面文档,不要单点改造成不一致
- [ ] grep `source_channel=` / `spm=`,确认每个残留都属于预期用户面文档或已批准的追踪入口

## 完成后自查

```sh
# 验证错误 hint 不再泄漏旧 URL
HOME=/tmp/empty pnpm -F bailian-cli exec tsx src/main.ts text chat --message x
# 看输出的 Get API Key URL 是否走新值

# 验证 banner / help
pnpm -F bailian-cli exec tsx src/main.ts                     # banner
pnpm -F bailian-cli exec tsx src/main.ts help                # help 命令
```

## 常见漏点

- ✗ 改了 `urls.ts` / 登录站点 / 文档 deep link 但忘记同步 README(用户最先看到)
- ✗ README 内容图用相对路径或阿里云 CDN：发版 `assertReadmeSync` / GitHub Camo / npm 子包 README 至少会坏一处
- ✗ 在 runtime / command 文件里 inline `https://bailian.console.aliyun.com/...` 而不是从 `urls.ts` import
- ✗ 在 core 的 hint 里写 URL(违反 [error-hint-change.md](error-hint-change.md) 不变量 1)
