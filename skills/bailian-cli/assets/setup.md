# Setup, authentication & configuration

> Hand-maintained. Lives in `assets/` (not auto-generated from command metadata).
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

| Auth               | How                                                                                              | Used by                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| API key            | `export DASHSCOPE_API_KEY=sk-...` or `bl auth login --api-key sk-...`                            | Most DashScope API commands                   |
| Token Plan API key | `bl auth login --config token-plan --api-key sk-sp-...`                                          | Token Plan text and image model consumption   |
| Console            | `bl auth login --console --console-site domestic` or `... international`                         | `app list`, `usage free`, `console call`      |
| OpenAPI AK         | `bl auth login --open-api --access-key-id <id> --access-key-secret <secret>` or Alibaba env vars | Token Plan management commands (`token-plan`) |

```bash
bl auth status            # check current auth
bl auth logout            # clear credentials
bl auth logout --console  # clear console token only
bl auth logout --open-api # clear OpenAPI AK/SK only
```

Get an API key: https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key

### Token Plan model consumption

Use the `PlainApiKey` returned by `bl token-plan create-key` as a model API key. It is separate from the OpenAPI AK/SK used by Token Plan management commands.

```bash
bl auth login --config token-plan --api-key sk-sp-xxx
bl text chat --config token-plan --message "Hello"
bl image generate --config token-plan --prompt "A cat"
```

To make Token Plan the default Profile for commands that omit `--config`, activate it explicitly after login:

```bash
bl config use --name token-plan
bl text chat --message "Hello"
bl image generate --prompt "A cat"
```

`auth login --config token-plan` saves that Profile but does not activate it. Use `bl config list` to inspect the active Profile, `bl config use --name default` to switch back, or `--config default` for a one-command override. Config selection follows explicit `--config` > persisted `active_config` > `default`; credential and endpoint fields inside the selected Profile still follow flag > environment > config.

Activation selects the entire Config for every credential domain, not only model consumption. After activating `token-plan`, Token Plan management and Console commands also read their OpenAPI or Console credentials from that Profile. If those credentials remain in `default`, invoke the command with `--config default` or log the corresponding credential domain into `token-plan`.

The built-in `token-plan` profile defaults to:

- Base URL: `https://token-plan.cn-beijing.maas.aliyuncs.com`
- Text model: `qwen3.7-max`
- Image model: `qwen-image-2.0`

The usual priority applies to this profile too: per-command `--api-key` / `--base-url`, then `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL`, then the selected profile. Unset environment overrides when you want to use the credentials saved in `token-plan`.

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
- **Env:** `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DASHSCOPE_OUTPUT`, `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, `BAILIAN_WORKSPACE_ID`

```bash
bl config show
bl config list
bl config use --name <existing-profile>
bl config use --name default
bl config set --key default-text-model --value qwen3.7-max
bl config set --key output_dir --value ~/bailian-output
```

Valid config keys are listed in [`reference/config.md`](../reference/config.md)
and `bl config set --help`.
