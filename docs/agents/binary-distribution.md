# 二进制分发（GitHub Release → 外部 FC → OSS 安装）

> 完整技术方案：[docs/proposals/binary-distribution.md](../proposals/binary-distribution.md)

## 触发条件

- 修改 `packages/cli/src/main.ts` 或 `tools/release/lib/binary-*`
- 调整 Release 资产 / manifest / 可选 `BAILIAN_OSS_SYNC_WEBHOOK`
- 发版需要把独立二进制推到 **GitHub Releases**（本仓职责到此）

## 概念

```text
Publish workflow
  ├─ npm
  └─ GitHub Release          ← 本仓库
        ↓
  外部 FC → 同步 OSS         ← 仓外
        ↓
  外置 install.sh / ps1      ← 仓外，只拉 OSS
```

- **Source of truth**：GitHub Release
- **国内安装面**：OSS + 外置脚本
- 本仓 `packaging/install.*`：契约**参考**，不挂 Release、不作为生产入口

可选 Secret：`BAILIAN_OSS_SYNC_WEBHOOK`（发版后 POST 通知 FC；失败仅 warn）。

## 必查清单

### A. 本仓库构建 / Release

- [ ] `node tools/release/lib/binary-build.mjs --mode stable --host`
- [ ] `dist-bin/` 含矩阵二进制、`SHA256SUMS`、`latest.json`（channel 为 `<name>.json`）
- [ ] dry-run：`node tools/release/lib/binary-release.mjs --mode stable --skip-build --dry-run`
- [ ] Release **不含** 生产 install 脚本

### B. 仓外（联调时确认）

- [ ] FC 已同步本次 Release 到 OSS（路径与参考脚本一致）
- [ ] 外置 `install.sh` / `install.ps1` 可从 OSS 安装

### C. 运行时

- [ ] `bl update` 二进制路径读 OSS manifest（`BAILIAN_CLI_CDN`）
- [ ] 无 npm 时 plugin hint 明确

## 完成后自查

```sh
node tools/release/lib/binary-build.mjs --mode stable --host
node tools/release/lib/binary-release.mjs --mode stable --skip-build --dry-run
vp check
```

## 常见漏点

| 漏点                   | 后果                      |
| ---------------------- | ------------------------- |
| 只发 npm、未建 Release | FC 无源可同步             |
| FC 未跑完用户就 curl   | OSS 404 / 半包            |
| 矩阵变更未通知脚本方   | 装错 arch / 永久失败      |
| webhook 配错当发版失败 | 不应；webhook 失败只 warn |
| 用 `Bun.build({ compile })` 代替 CLI | Bun ≤1.2.19 可能 exit 0 但不写 outfile → `sha256` ENOENT |

## 编译实现注意

- `binary-compile.mjs` 必须走 **`bun build --compile --outfile …`**，不要用 `Bun.build({ compile })`（CI 钉 `1.2.19` 时 API 会假成功）。
- 编译后校验 outfile 存在再算 SHA256。
