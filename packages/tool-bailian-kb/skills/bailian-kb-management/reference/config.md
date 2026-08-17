# `kscli config` / `update` — 配置与升级

> 通用全局 flag 见 [index.md](index.md)。这两组命令无需鉴权。

## `kscli config show`

显示当前配置。

```
Usage: kscli config show
```

```bash
kscli config show
kscli config show --output json
```

## `kscli config set`

设置配置项。

```
Usage: kscli config set --key <key> --value <value>
```

可用 key：`base_url`、`output`、`output_dir`、`timeout`、`api_key`、`access_token`、
`access_key_id`、`access_key_secret`、`security_token`、`default_*_model`、`workspace_id`。

```bash
kscli config set --key workspace_id --value ws-xxx
kscli config set --key output --value json
kscli config set --key timeout --value 600
```

## `kscli update`

升级 CLI 到最新或指定版本。

```
Usage: kscli update [--to <version>]
```

| Flag | 说明 |
| --- | --- |
| `--to <version>` | 安装该精确版本而非最新版 |

Notes：

- 管理命令在 `knowledge` 发行通道；若 `kscli update` 后管理命令消失（升到了 latest），用
  `npm install -g knowledge-studio-cli@knowledge` 装回。

```bash
kscli update
kscli update --to 0.1.14
```
