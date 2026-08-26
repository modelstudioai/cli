# Setup, authentication & configuration

> Hand-maintained. Lives in `bailian-protocol/assets/` (not auto-generated from command metadata).
> Entry point: [SKILL.md → Setup & auth](../SKILL.md#setup--auth).

Read this only when you need to install `bl`, change credentials/endpoint, or
inspect config keys. Day-to-day command routing lives in the business skills
(`bailian-cli` / `bailian-gen` / …).

---

## Install

**prefer npm** (Node.js **≥ 18.17.0**); use the binary installer only when Node/npm is unavailable.

### 1. Recommended: npm

```bash
# node -v ≥ 18.17.0; global install via npm only (do not use pnpm/yarn)
npm install -g bailian-cli
bl skill init
```

### 2. Fallback: binary (no Node)

When there is no usable Node/npm, or Node is too old for the npm path:

```bash
curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash
# The script runs bl skill init after installing the CLI; if that fails, run it manually
```

Windows PowerShell: `irm https://bailian.aliyun.com/cli/install.ps1 | iex`

### Skills

- **Supported:** `bl skill init` (installs every `bailian-*`, including `bailian-protocol`)
- **Advanced / subset** (include protocol when needed):

```bash
# bl skill add --name bailian-protocol,bailian-gen
# bl skill add --name bailian-protocol,bailian-finetune
# bl skill add --name bailian-protocol,bailian-managed-agent
# bl skill add --name bailian-protocol,bailian-cli
```

Verify: `bl --version` (prints `bl X.Y.Z`).

---

## Authentication

For the exact command-to-auth mapping, read the owning skill's `reference/index.md` or run `bl <command> --help`.

| Auth               | How                                                                                              | Used by                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| API key            | `export DASHSCOPE_API_KEY=sk-...` or `bl auth login --api-key sk-...`                            | Most DashScope API commands                   |
| Token Plan API key | `bl auth login --config token-plan --api-key sk-sp-...`                                          | Token Plan text, image, and video consumption |
| Console            | `bl auth login --console --console-site domestic` or `... international`                         | `app list`, `usage free`, `console call`      |
| OpenAPI AK/SK      | `bl auth login --open-api --access-key-id <id> --access-key-secret <secret>` or Alibaba env vars | Token Plan management commands (`token-plan`) |

```bash
bl auth status            # check current auth
bl auth logout            # clear credentials and the model Base URL
bl auth logout --console  # clear console token only
bl auth logout --open-api # clear OpenAPI AK/SK only
```

- Get a DashScope API key: https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key
- Get a Token Plan API key: https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview
- Get an Alibaba Cloud AccessKey for OpenAPI AK/SK: https://ram.console.aliyun.com/manage/ak
- Console login: China site https://bailian.console.aliyun.com or international site https://modelstudio.console.alibabacloud.com

### Token Plan model consumption

Get or copy the Token Plan API key from the [subscription overview](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview). A `PlainApiKey` returned by `bl token-plan create-key` is the same credential type. It is separate from the OpenAPI AK/SK used by Token Plan management commands.

```bash
bl auth login --config token-plan --api-key sk-sp-xxx
bl text chat --message "Hello"
bl image generate --prompt "A cat"
bl video generate --prompt "A horse running through a field"
```

The built-in Profile supplies the Token Plan Base URL. `auth login` tests the key first, then saves
and activates the Profile only when validation succeeds; do not ask the user to configure the Base
URL or run a duplicate smoke test.

### API Key capability fallback

A named Profile can limit the API Key commands it supports through `api_key_capabilities`.

- Supported commands use the selected Profile's API Key configuration.
- Unsupported commands read `api_key` and `base_url` from `default`; other settings remain on the
  selected Profile.
- An explicit API Key or Base URL from flags or environment variables disables fallback for that
  command.
- Unless `--quiet` is used, the CLI reports fallback on stderr. With `--output json`, it emits a
  structured warning.

Custom Profiles opt in only by defining `api_key_capabilities`. A missing field disables fallback,
while `[]` makes every API Key command fall back to `default`.

The built-in `token-plan` Profile is the compatibility exception: older configs without the field
use the current built-in preset. A successful API Key login appends missing preset capabilities
without removing existing entries.

```bash
bl config set --config company-plan --key api-key-capabilities \
  --value text.chat,image.generate,video.generate
```

Capability IDs are leaf command paths joined with dots, such as `video.task.get`.

Successful login automatically activates the explicitly selected Profile. Use `bl config list` to
inspect it, and switch back when needed:

```bash
bl config list
bl config use --name default
```

`auth login --config token-plan` creates or updates that Profile and activates it only after the
credential is validated and saved. Failed login and `--dry-run` do not switch Profiles. Use
`--config default` for a one-command override. Config selection follows explicit `--config` >
persisted `active_config` > `default`; credential and endpoint fields inside the selected Profile
still follow flag > environment > config.

Activation selects the entire Config for every credential domain, not only model consumption. The only exception is the API Key capability fallback described above. After activating `token-plan`, Token Plan management and Console commands still read their OpenAPI or Console credentials from that Profile. If those credentials remain in `default`, invoke the command with `--config default` or log the corresponding credential domain into `token-plan`.

The built-in `token-plan` profile defaults to:

- Base URL: `https://token-plan.cn-beijing.maas.aliyuncs.com`
- Text model: `qwen3.8-max`
- Image model: `wan2.7-image`
- Text-to-video model (`default_video_model`): `happyhorse-1.1-t2v`
- Image-to-video model (`default_image_to_video_model`): `happyhorse-1.1-i2v`
- Reference-to-video model (`default_reference_to_video_model`): `happyhorse-1.1-r2v`
- Speech synthesis model (`default_speech_model`): `qwen-audio-3.0-tts-plus`
- Speech recognition model (`default_speech_recognition_model`): `qwen-audio-3.0-asr-flash`
- API Key capabilities: `text.chat`, `vision.describe`, `image.generate`, `image.edit`, `speech.recognize`, `speech.synthesize`, `video.generate`, `video.ref`, `video.task.get`, `video.download`

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
bl config set --key default-text-model --value qwen3.8-max
bl config set --key output_dir --value ~/bailian-output
```

Valid config keys: run `bl config set --help`, or if `bailian-cli` is installed read its `reference/config.md`.
Do not assume sibling skill paths exist.
