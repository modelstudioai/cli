# bailian-protocol

**bailian-\*** Agent 技能家族的共享执行协议（consent、版本预检、安装/鉴权、错误上报）。

业务 skill（`bailian-cli` / `bailian-gen` / `bailian-finetune` / `bailian-managed-agent`）在跑 `bl` 前应读取本 skill。**官方安装**为整包：

```bash
bl skill init
```

请使用 `bl skill init`。子集安装时如需要请显式带上 `bailian-protocol`。

CLI 安装与命令示例见[主 README](../../README.zh.md)。

## License

Apache-2.0
