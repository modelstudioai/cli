# Setup, authentication & configuration

> Hand-maintained. Lives in `assets/` (not auto-generated from `catalog.ts`).
> Entry point: [SKILL.md → Setup & auth](../SKILL.md#setup--auth).

Read this only when you need to install `bl`, change credentials/endpoint, or
inspect config keys. Day-to-day command routing lives in `SKILL.md`.

---

## Install

```bash
npm install -g bailian-cli
npx skills add modelstudioai/cli --all -g
```

Verify: `bl --version` (prints `bl X.Y.Z`).

---

## Authentication

| Auth          | How                                                                   | Used by                                  |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| API key       | `export DASHSCOPE_API_KEY=sk-...` or `bl auth login --api-key sk-...` | Most DashScope API commands              |
| Console token | `bl auth login --console`                                             | `app list`, `usage free`, `console call` |

```bash
bl auth status            # check current auth
bl auth logout            # clear credentials
bl auth logout --console  # clear console token only
```

Get an API key: https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key

---

## DashScope endpoint

Default: `https://dashscope.aliyuncs.com` (China). Override with any of:

- `--base-url https://dashscope-us.aliyuncs.com` (per command)
- `bl config set --key base_url --value https://dashscope-us.aliyuncs.com` (US, persisted)
- `DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com` (international, env)

---

## Configuration

- **Config file:** `~/.bailian/config.json`
- **Env:** `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DASHSCOPE_OUTPUT`

```bash
bl config show
bl config set --key default-text-model --value qwen3.7-max
bl config set --key output_dir --value ~/bailian-output
```

Valid config keys and the export-schema for agent tool definitions:
see [`reference/config.md`](../reference/config.md).

```bash
bl config export-schema                          # all commands as JSON tool schemas
bl config export-schema --command "image generate"
```
