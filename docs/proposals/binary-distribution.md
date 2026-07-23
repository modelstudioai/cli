# 技术方案：GitHub Release 发布 + 外部 FC 同步 OSS 安装

> 状态：**已定架构**（本仓库不直传 OSS；安装脚本外置；**不含 Homebrew**）。  
> 范围：仅 `bailian-cli`（`bl`）；不含 `kscli` 二进制。  
> 操作清单：[docs/agents/binary-distribution.md](../agents/binary-distribution.md)  
> 发版编排：[docs/agents/publish.md](../agents/publish.md)

---

## 1. 目标架构

```text
Publish workflow（本仓库）
  ├─ npm
  └─ GitHub Release（source of truth）
        ↓
  调用外部 FC：拉取最新 Release → 同步 OSS
        ↓
  别处维护的 install.sh / install.ps1 → 只拉 OSS
```

| 环节                      | 谁负责       | 本仓库是否实现                  |
| ------------------------- | ------------ | ------------------------------- |
| npm publish               | 本仓库 CI    | ✅                              |
| Bun 编译 + GitHub Release | 本仓库 CI    | ✅                              |
| Release → OSS 同步        | **外部 FC**  | ❌（仅可选 webhook 触发）       |
| 生产安装脚本              | **别处维护** | ❌（`packaging/` 仅作契约参考） |
| 用户 curl / irm           | OSS 上的脚本 | ❌                              |

本仓库**不存放、不上传 OSS AccessKey**；开源侧只用 `GITHUB_TOKEN`。

---

## 2. 本仓库发版（Publish）

入口：`.github/workflows/publish.yml` → `publish-stable.mjs` / `publish-channel.mjs`。

```text
stable:
  check → npm latest → git tag v<ver> → gh release（正式）
  assets: bl-*, SHA256SUMS, latest.json
  （不再把 install.sh/ps1 挂到 Release；生产脚本外置）

channel:
  bump beta → npm @channel → gh prerelease v<beta>
  + 滚动 prerelease tag channel-<name>（仅 <name>.json）
```

可选：发版成功后 `POST` `BAILIAN_OSS_SYNC_WEBHOOK`，通知 FC 开始同步（Secret 配置，无则跳过）。

`--skip-binary`：只发 npm。

### 构建矩阵

| Bun target         | 产物              |
| ------------------ | ----------------- |
| `bun-darwin-arm64` | `darwin-arm64`    |
| `bun-darwin-x64`   | `darwin-x64`      |
| `bun-linux-x64`    | `linux-x64`       |
| `bun-windows-x64`  | `windows-x64.exe` |

不构建 `linux-arm64` / `windows-arm64`。

---

## 3. GitHub Release 约定（source of truth）

基址：`https://github.com/modelstudioai/cli/releases`

| 模式           | Tag                                            | 资产                                    |
| -------------- | ---------------------------------------------- | --------------------------------------- |
| stable         | `v<version>`（先 push tag，再 `--verify-tag`） | 矩阵二进制、`SHA256SUMS`、`latest.json` |
| channel 版本化 | `v0.0.0-beta-<sha7>-<date>`（prerelease）      | 二进制、`SHA256SUMS`                    |
| channel 滚动   | `channel-<name>`（prerelease，clobber）        | `<name>.json`                           |

Manifest 内 `url` 指向 GitHub download（给 FC / 镜像方解析用）。FC 同步到 OSS 时应**改写**为 OSS URL，或安装脚本忽略 `url`、按固定 OSS 路径拼接。

---

## 4. 外部 FC（本仓库不实现）

建议契约：

1. 触发：Publish webhook，或监听 `release` 事件 / 定时拉取 Latest
2. 读取 GitHub Latest（stable）或约定 channel tag
3. 下载资产 → 上传 OSS，建议布局：

```text
https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/
  channels/latest.json          # 改写 url 后的正式版 manifest
  channels/<channel>.json       # 可选测试渠道
  releases/<version>/
    bl-<version>-<os>-<arch>[.exe]
    SHA256SUMS
  install.sh                    # 由脚本维护方上传，非本仓库 CI
  install.ps1
```

4. **完整校验后再对外**：SHA256 对齐、矩阵文件齐全，避免「Release 已发、OSS 半同步」窗口误导用户
5. 失败告警（钉钉/飞书/SLS），因用户安装不经过本仓库 CI

---

## 5. 安装脚本（别处维护）

生产入口（示例，以实际 OSS 域名为准）：

```bash
curl -fsSL https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/install.sh | bash
# Windows:
irm https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/install.ps1 | iex
```

脚本只依赖 OSS；不要求用户访问 GitHub。

本仓 `packaging/install.sh` / `install.ps1`：**契约参考**（路径、校验、`install-method=binary`），不作为生产分发物挂 Release。

### 与本仓的契约（脚本方必须遵守）

- 资产名：`bl-<ver>-<os>-<arch>[.exe]`
- 校验：`SHA256SUMS`
- 渠道：默认 `latest`；可选 `BAILIAN_CHANNEL`
- 写入：`~/.bailian/install-method` = `binary`
- 不支持：linux-arm64 / windows-arm64 → 提示 `npm i -g bailian-cli`

---

## 6. 运行时（本仓库）

- `BAILIAN_COMPILED=1`、install-method、`bl update` 分流仍在本仓
- 二进制更新默认读 **OSS** manifest（`BAILIAN_CLI_CDN` 可覆盖）；与用户安装源一致
- GitHub Release 仍是发版真相源；更新链路走 OSS 镜像

---

## 7. 职责边界（验收标准）

| 验收项            | 通过条件                                              |
| ----------------- | ----------------------------------------------------- |
| 本仓库 Publish 绿 | npm 可装 + GitHub Release 资产齐全                    |
| 国内可一键安装    | FC 已同步 + 外置脚本可 curl（**不在本仓 CI 门禁内**） |
| 无 AK 进 git      | OSS 密钥只在 FC / 脚本发布流水线                      |

---

## 8. 风险

- Release 成功 ≠ 用户能装（依赖 FC）→ 必须有同步监控
- 脚本外置 → 命名/矩阵变更要同步通知脚本方
- `latest.json` 双份（GH / OSS）→ FC 负责改写与一致性
- channel 是否进 OSS：由 FC 与脚本方另定；本仓照常发 prerelease

---

## 9. 本仓库代码落点

| 路径                                          | 职责                                  |
| --------------------------------------------- | ------------------------------------- |
| `publish-stable.mjs` / `publish-channel.mjs`  | npm + Release + 可选 webhook          |
| `lib/binary-build.mjs` / `binary-compile.mjs` | 编译与 manifest                       |
| `lib/binary-release.mjs`                      | `gh release`（不含生产 install 脚本） |
| `packaging/*`                                 | 安装契约参考                          |
| `.github/workflows/publish.yml`               | CI                                    |

调试：

```sh
node tools/release/lib/binary-build.mjs --mode stable --host
node tools/release/lib/binary-release.mjs --mode stable --skip-build --dry-run
node tools/release/publish-stable.mjs --dry-run
```
