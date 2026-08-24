# `bl config` / `auth` / `update` — 配置、鉴权与升级

> 通用全局 flag 见 [index.md](index.md)。这几组命令无需鉴权。

## `bl config show`

显示当前配置。

```
Usage: bl config show
```

```bash
bl config show
bl config show --output json
```

## `bl config set`

设置配置项。

```
Usage: bl config set --key <key> --value <value>
```

可用 key：`base_url`、`output`、`output_dir`、`timeout`、`api_key`、`access_token`、
`access_key_id`、`access_key_secret`、`security_token`、`default_*_model`、`workspace_id`。

```bash
bl config set --key workspace_id --value ws-xxx
bl config set --key output --value json
bl config set --key timeout --value 600
```

## `bl config list` / `bl config use`

列出配置 profile 并显示当前激活项 / 切换激活 profile。任意命令可用全局 flag `--config <name>` 临时指定 profile。

```
Usage: bl config list
Usage: bl config use --name <name>
```

```bash
bl config list
bl config use --name default
```

## `bl auth login`

存储 API key（或 console 浏览器登录、OpenAPI AK/SK，多种凭据可共存）。知识库命令只需要 API key。

```
Usage: bl auth login --api-key <key> | --console | --open-api --access-key-id <id> --access-key-secret <secret>
```

```bash
bl auth login --api-key sk-xxxxx
bl auth status
```

## `bl update`

升级 CLI 到最新或指定版本。

```
Usage: bl update [--to <version>]
```

| Flag             | 说明                     |
| ---------------- | ------------------------ |
| `--to <version>` | 安装该精确版本而非最新版 |

```bash
bl update
bl update --to 1.16.0
```
