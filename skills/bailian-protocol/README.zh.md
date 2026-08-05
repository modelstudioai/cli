# bailian-protocol

**bailian-\*** Agent 技能家族的共享执行协议（consent、版本预检、安装/鉴权、错误上报）。

业务 skill（`bailian-cli` / `bailian-gen` / `bailian-finetune` / `bailian-managed-agent`）在跑 `bl` 前应读取本 skill。**官方安装**为整包：

```bash
npx skills add modelstudioai/cli --all -g
```

Agent Skills / `npx skills` **不会**自动解析 skill 依赖。请优先使用 `--all -g`，避免只装单个业务 skill。

CLI 安装与命令示例见[主 README](../../README.zh.md)。

## License

Apache-2.0
