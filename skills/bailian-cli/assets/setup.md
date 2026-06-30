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

| Auth          | How                                                                      | Used by                                  |
| ------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| API key       | `export DASHSCOPE_API_KEY=sk-...` or `bl auth login --api-key sk-...`    | Most DashScope API commands              |
| Console token | `bl auth login --console --console-site domestic` or `... international` | `app list`, `usage free`, `console call` |

```bash
bl auth status            # check current auth
bl auth logout            # clear credentials
bl auth logout --console  # clear console token only
```

Get an API key: https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key

### Console site selection

Console login and console-gateway commands (`app list`, `usage *`, `quota *`, `workspace list`, `console call`) target one of two Bailian consoles:

| Site              | Value           | Login URL                                      |
| ----------------- | --------------- | ---------------------------------------------- |
| Domestic (中国站) | `domestic`      | `https://bailian.console.aliyun.com`           |
| International     | `international` | `https://modelstudio.console.alibabacloud.com` |

**Do not run bare `bl auth login --console`** — the CLI defaults to `domestic`. Always pass `--console-site` explicitly (or rely on a saved `console_site` in config).

**Before console login**, run `bl config show --output json` and check `console_site`.

**How to choose the site** (first match wins):

1. **`console_site` in `~/.bailian/config.json`** — use it; no need to ask again.
2. **User explicitly says** 国际站 / 全球站 / international / `modelstudio.console.alibabacloud.com` → `international`.
3. **User explicitly says** 国内站 / 中国站 / domestic / `bailian.console.aliyun.com` → `domestic`.
4. **Infer from DashScope endpoint** (`base_url` or `DASHSCOPE_BASE_URL` from `bl config show`):
   - `https://dashscope-intl.aliyuncs.com` → `international`
   - `https://dashscope.aliyuncs.com` or `https://dashscope-us.aliyuncs.com` → `domestic`
5. **Still unclear** — ask the user which console they use; do not assume domestic.

```bash
# Domestic
bl auth login --console --console-site domestic

# International
bl auth login --console --console-site international
```

After a successful console login, the callback may persist `console_site` in `~/.bailian/config.json`. You can also set it manually:

```json
{ "console_site": "international" }
```

Use the same `--console-site` on console-gateway commands when it differs from the saved default, e.g. `bl app list --console-site international`.

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
