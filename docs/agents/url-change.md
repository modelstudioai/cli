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
  BAILIAN_HOST              bailian.cn-beijing.aliyuncs.com (POP API)

cli/src/urls.ts                          ← 用户面控制台 URL(cn-only)
  BAILIAN_CONSOLE_ROOT      bailian.console.aliyun.com
  BAILIAN_CONSOLE           BAILIAN_CONSOLE_ROOT/cn-beijing
  API_KEY_PAGE              BAILIAN_CONSOLE/?tab=app#/api-key

core/files/upload.ts                     ← 文件上传 endpoint(cn-pinned)
  UPLOAD_API                ${REGIONS.cn}/api/v1/uploads
```

## 必查清单

### A. TS 源码(必须 import,不准硬编码)

- [ ] `packages/core/src/config/schema.ts` 是所有 API/docs 基址的源头
- [ ] `packages/cli/src/urls.ts` 是所有用户面控制台 URL 的源头
- [ ] 改完后 grep 验证:

```sh
# 控制台 URL — 应只在 urls.ts 出现
grep -rnE "https://bailian\.console\.aliyun\.com" packages/ --include="*.ts" \
  | grep -v "node_modules" | grep -v "/dist/"
# 期望:只匹配 packages/cli/src/urls.ts

# API endpoint — 应只在 schema.ts 和 upload.ts 出现
grep -rnE "https://dashscope[a-z-]*\.aliyuncs\.com" packages/ --include="*.ts" \
  | grep -v "node_modules" | grep -v "/dist/"
# 期望:只匹配 schema.ts(REGIONS)、upload.ts(派生)、tests
```

### B. 非 TS 文件(只能人工同步,无法 import)

- [ ] `skills/bailian-cli/reference/` 各 `<group>.md` 中 API/控制台 URL(`generate:reference` 重建后核对并提交)
- [ ] `README.md` / `README.zh.md` 中所有 URL

### C. 渠道追踪参数

- [ ] **当前现状**:全仓不带 `source_channel=aliway` 等追踪参数
- [ ] 如未来要恢复以收集分析数据,**统一评估再加回**(不要单点恢复造成不一致)
- [ ] 全仓 grep `source_channel=`,确认无残留

## 完成后自查

```sh
# 验证错误 hint 不再泄漏旧 URL
HOME=/tmp/empty node packages/cli/src/main.ts text chat --message x --non-interactive
# 看输出的 Get API Key URL 是否走新值

# 验证 banner / help
node packages/cli/src/main.ts                     # banner
node packages/cli/src/main.ts help                # help 命令
```

## 常见漏点

- ✗ 改了 `urls.ts` 但忘记同步 README(用户最先看到)
- ✗ 在 cli 命令文件里 inline `https://bailian.console.aliyun.com/...` 而不是 `${API_KEY_PAGE}`
- ✗ 在 core 的 hint 里写 URL(违反 [error-hint-change.md](error-hint-change.md) 不变量 1)
