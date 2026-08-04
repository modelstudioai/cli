# bailian-protocol

**bailian-\*** Agent 技能家族的共享执行协议（consent、版本预检、安装/鉴权、错误上报）。

业务 skill（`bailian-cli` / `bailian-gen` / `bailian-finetune` / `bailian-managed-agent`）都依赖本 skill 作为 **companion**。推荐：

```bash
npx skills add modelstudioai/cli --all -g
```

若只装子集，必须同时带上 `bailian-protocol`，例如：

```bash
npx skills add modelstudioai/cli -g -s bailian-protocol -s bailian-gen
```

CLI 安装与命令示例见[主 README](../../README.zh.md)。

## License

Apache-2.0
