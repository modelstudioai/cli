# 安装文档变更

## 触发条件

- 修改根目录 `INSTALL.md` 的安装、鉴权或验证流程
- 修改发布包 Node.js 要求、全局 flag 或安装文档引用的命令
- 同步或发布 `https://bailian.aliyun.com/cli/install.md`

## 必查清单

### A. CLI 契约

- [ ] `INSTALL.md` 中的 `bl` 命令路径存在于 `packages/cli/src/commands.ts`
- [ ] 示例 flag 属于 `GLOBAL_FLAGS`、命令鉴权域 flag 或命令自身 `flags`
- [ ] Node.js 用户安装要求与 `packages/cli/package.json` 的 `engines.node` 一致，不使用根 `package.json` 的开发环境要求
- [ ] 鉴权流程与 `packages/commands/src/commands/auth/` 的实际校验、保存和 Profile 激活行为一致

### B. 静态副本

- [ ] 将 `INSTALL.md` 同步到 `bailian-cli-static-resources/public/install.txt`
- [ ] 使用 `cmp -s` 确认两份文档逐字节一致
- [ ] 静态资源仓库单独创建分支、提交和发布，不把跨仓库改动遗漏在 CLI PR 之外

### C. 线上验证

- [ ] 发布后读取 `https://bailian.aliyun.com/cli/install.md`，确认内容来自最新静态副本
- [ ] 带随机 query 参数复查，区分 CDN 缓存与源站未更新
- [ ] 验证线上文档中的安装命令、Node.js 要求和配置验证段落，不只检查页面可访问

## 完成后自查

```sh
pnpm -F bailian-cli test -- tests/install-doc.test.ts
cmp -s INSTALL.md ../bailian-cli-static-resources/public/install.txt
curl -L -s "https://bailian.aliyun.com/cli/install.md?verify=$(date +%s)"
```

## 常见漏点

- `--non-interactive` 已从 CLI 移除，但旧安装文档和静态副本仍把它当作全局 flag
- 根 `package.json` 是开发工具链 Node.js 要求；用户安装要求以 `packages/cli/package.json` 为准
- 静态仓库文件名是 `public/install.txt`，线上稳定地址是 `/cli/install.md`；只更新其中一侧不会自动证明发布成功
