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

core/files/upload.ts                     ← 文件上传 endpoint(cn-pinned)
  UPLOAD_API                ${REGIONS.cn}/api/v1/uploads
```

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
- [ ] `README.md` / `README.zh.md` 中所有 URL

### C. 渠道追踪参数

- [ ] **当前现状**:TS 源码不带 `source_channel=...`;README / package README 中保留 `cli_github` / `key_github` 等用户入口追踪参数
- [ ] 如未来调整追踪参数,统一评估 README、`packages/cli/README*`、`packages/core/README*` 与 package homepage,不要单点改造成不一致
- [ ] grep `source_channel=`,确认每个残留都属于预期用户面文档或已批准的追踪入口

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
- ✗ 在 runtime / command 文件里 inline `https://bailian.console.aliyun.com/...` 而不是从 `urls.ts` import
- ✗ 在 core 的 hint 里写 URL(违反 [error-hint-change.md](error-hint-change.md) 不变量 1)
