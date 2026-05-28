# 工具链调整

## 触发条件

- 升级 Vite+ / TypeScript / Node 版本
- 调整 `vite.config.ts`(根 / 各包)
- 改 lint 规则(Oxlint / Oxfmt / typescript-eslint)
- 升级或替换依赖
- 修改 `.vite-hooks/` 或 git hooks

## 必查清单

### A. 版本一致性

- [ ] `package.json` 的 `engines.node` 与 README 的 Node.js 徽章一致
- [ ] `pnpm-lock.yaml` 同步生成(运行 `pnpm install`)
- [ ] 三处 `tsconfig.json`(根 + cli + core)的 target / module 设置一致

### B. lint / format 规则改动

- [ ] 全仓跑 `vp check --fix`,看是否产生大量自动 reformat
- [ ] 如果产生 mass diff,**单独提一个 commit**(代码语义改动和 lint reformat 不要混)
- [ ] 已有 warning 的处理:
  - 如果新规则消除了某些旧 warning,确认是否合理
  - 如果新规则产生了新 warning,评估是否要修

### C. 构建配置

- [ ] `packages/cli/vite.config.ts` 和 `packages/core/vite.config.ts` 的 entry / external / dts 设置
- [ ] cli 的 bundle 必须把 `bailian-cli-core` 当 **external**(不内联),确认 `dist/bailian.mjs` 第一行有 `from "bailian-cli-core"`
- [ ] cli 的 bundle 第一行必须有 `#!/usr/bin/env node` shebang(`tools/release.mjs check` 会断言)

### D. 依赖升级

- [ ] 检查 `bailian-cli-core` 在 cli 的 `dependencies` 里仍是 `"workspace:*"`(不要变成实际版本号 — `tools/release.mjs` 会拦)
- [ ] 升级后跑 `vp check && vp test`
- [ ] 升级 `@types/node` 时注意 Node API 变化(如 fs.existsSync 行为)

### E. git hooks / pre-commit

- [ ] `.vite-hooks/pre-commit` 改动后,`pnpm install` 重新软链(走 `prepare: vp config`)
- [ ] 增加 hook 时,确认在干净 clone 后能自动激活

### F. CI / 发版工具

- [ ] `tools/release.mjs` 中如有版本/规则相关的硬编码,同步更新
- [ ] 比如 `secretPatterns` 添加新的敏感值识别

## 完成后自查

```sh
# 完整冒烟
pnpm install --frozen-lockfile
vp check
vp test
node tools/release.mjs check
```

## 常见漏点

- ✗ 升级 Node engines 但忘了 README 徽章
- ✗ 改 lint 规则后没全仓 `--fix`,新人 PR 报红一片
- ✗ 改 cli 的 vite config 把 core 不小心打成 inline,bundle 体积暴涨
- ✗ Oxlint 配置改了但 IDE 缓存还是旧的(IDE 可能要重启 ts server)
- ✗ 升级依赖一并升 lockfile,改动量大但没拆 commit
