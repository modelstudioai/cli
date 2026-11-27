# `bl auth` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                         | Authentication | Description                                                                                  |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `bl auth`                       | No Auth        | Authenticate with Aliyun OAuth                                                               |
| `bl auth generate-access-token` | AK/SK          | Generate a CLI access token using OpenAPI credentials                                        |
| `bl auth login`                 | No Auth        | Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist) |
| `bl auth logout`                | No Auth        | Clear stored credentials; full logout also clears the model Base URL                         |
| `bl auth status`                | No Auth        | Show current authentication state                                                            |

## Command details

### `bl auth`

| Field              | Value                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | `auth`                                                                                                                               |
| **Description**    | Authenticate with Aliyun OAuth                                                                                                       |
| **Authentication** | No Auth                                                                                                                              |
| **Usage**          | `bl auth --login aliyun [--client-id <id>] [--authorization-url <url>] [--modelstudio-host <hostname>] [--console-gateway <origin>]` |

#### Flags

| Flag                               | Type   | Required | Description                                                                                  |
| ---------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `--login <aliyun>`                 | string | yes      | Login method: aliyun                                                                         |
| `--client-id <id>`                 | string | no       | OAuth client ID; required for the first login outside pre-release                            |
| `--scope <scope>`                  | string | no       | OAuth scope (default: openid /internal/bailian/cli)                                          |
| `--oauth-base-url <origin>`        | string | no       | OAuth token service origin (production default: https://oauth.aliyun.com)                    |
| `--authorization-url <url>`        | string | no       | Explicit authorization URL; required for the first login outside pre-release                 |
| `--modelstudio-host <hostname>`    | string | no       | Model Studio POP hostname override (production default: modelstudio.cn-beijing.aliyuncs.com) |
| `--console-gateway <origin>`       | string | no       | Console gateway origin override (production default: https://bailian-cs.console.aliyun.com)  |
| `--bailiancontrol-host <hostname>` | string | no       | Optional Bailian Control OpenAPI hostname                                                    |
| `--console-region <cn-beijing>`    | string | no       | Console region (only cn-beijing; default: cn-beijing)                                        |
| `--no-browser`                     | switch | no       | Do not open the browser automatically; still wait for the local callback                     |

#### Notes

- Outside pre-release, first login requires an explicit client ID and a confirmed authorization URL. In pre-release, endpoint overrides must match the trusted endpoints, and the CLI gateway must be configured. No device flow or remote callback import is supported.
- Register http://127.0.0.1:12345/oauth/callback as the IAM redirect URI. NativeApp loopback ports may vary; scheme, host and path must match.

#### Examples

```bash
bl auth --login aliyun --client-id <id> --authorization-url <url>
```

```bash
bl auth --login aliyun --client-id <id> --authorization-url <url> --modelstudio-host <hostname> --console-gateway <origin>
```

### `bl auth generate-access-token`

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Name**           | `auth generate-access-token`                          |
| **Description**    | Generate a CLI access token using OpenAPI credentials |
| **Authentication** | AK/SK                                                 |
| **Usage**          | `bl auth generate-access-token [flags]`               |

#### Flags

| Flag                        | Type   | Required | Description                                                            |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `--access-key-id <key>`     | string | no       | Alibaba Cloud Access Key ID (env: ALIBABA_CLOUD_ACCESS_KEY_ID)         |
| `--access-key-secret <key>` | string | no       | Alibaba Cloud Access Key Secret (env: ALIBABA_CLOUD_ACCESS_KEY_SECRET) |
| `--security-token <token>`  | string | no       | Alibaba Cloud STS Security Token (env: ALIBABA_CLOUD_SECURITY_TOKEN)   |

#### Examples

```bash
bl auth generate-access-token
```

```bash
bl auth generate-access-token --access-key-id LTAIxxxxx --access-key-secret xxxxx --security-token <token>
```

### `bl auth login`

| Field              | Value                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `auth login`                                                                                                                                                           |
| **Description**    | Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist)                                                                           |
| **Authentication** | No Auth                                                                                                                                                                |
| **Usage**          | `bl auth login --api-key <key> \| --console [--no-browser \| --token-stdin --console-region <region>] \| --open-api --access-key-id <id> --access-key-secret <secret>` |

#### Flags

| Flag                                            | Type   | Required | Description                                                                                                                                                                                           |
| ----------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--api-key <key>`                               | string | no       | Model API key to validate and store                                                                                                                                                                   |
| `--base-url <url>`                              | string | no       | Model API base URL to validate and store with --api-key                                                                                                                                               |
| `--console`                                     | switch | no       | Sign in via browser (China by default; use --console-site international for the international site). Outside pre-release, creates an ordinary API key if needed; subscription plans require --api-key |
| `--no-browser`                                  | switch | no       | With --console, print the login URL without opening a browser                                                                                                                                         |
| `--token-stdin`                                 | switch | no       | With --console, read one raw access token from piped stdin and validate before saving; requires --console-region, no browser or local server                                                          |
| `--console-region <cn-beijing\|ap-southeast-1>` | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                                                                              |
| `--console-site <domestic\|international>`      | string | no       | Console site: domestic, international                                                                                                                                                                 |
| `--open-api`                                    | switch | no       | Store Alibaba Cloud OpenAPI AK/SK credentials                                                                                                                                                         |
| `--access-key-id <id>`                          | string | no       | Alibaba Cloud Access Key ID to store                                                                                                                                                                  |
| `--access-key-secret <secret>`                  | string | no       | Alibaba Cloud Access Key Secret to store                                                                                                                                                              |

#### Examples

```bash
bl auth login --console
```

```bash
bl auth login --console --no-browser --console-site international
```

```bash
bl auth login --console --token-stdin --console-site international --console-region ap-southeast-1
```

```bash
bl auth login --api-key sk-xxxxx
```

```bash
bl auth login --open-api --access-key-id LTAIxxxxx --access-key-secret xxxxx
```

### `bl auth logout`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `auth logout`                                                        |
| **Description**    | Clear stored credentials; full logout also clears the model Base URL |
| **Authentication** | No Auth                                                              |
| **Usage**          | `bl auth logout [--console \| --open-api \| --aliyun] [--dry-run]`   |

#### Flags

| Flag         | Type   | Required | Description                                                             |
| ------------ | ------ | -------- | ----------------------------------------------------------------------- |
| `--aliyun`   | switch | no       | Revoke and remove only the Aliyun OAuth session                         |
| `--console`  | switch | no       | Only clear the console access_token, keep api_key intact                |
| `--open-api` | switch | no       | Only clear OpenAPI AK/SK/STS credentials, keep other credentials intact |

#### Notes

- Full logout or --aliyun revokes the OAuth refresh token. Partial Console/OpenAPI logout disables only that domain. Pre-release logout leaves model and production credentials intact.

#### Examples

```bash
bl auth logout
```

```bash
bl auth logout --console
```

```bash
bl auth logout --open-api
```

```bash
bl auth logout --aliyun
```

```bash
bl auth logout --dry-run
```

### `bl auth status`

| Field              | Value                             |
| ------------------ | --------------------------------- |
| **Name**           | `auth status`                     |
| **Description**    | Show current authentication state |
| **Authentication** | No Auth                           |
| **Usage**          | `bl auth status`                  |

#### Flags

_No command-specific flags._

#### Examples

```bash
bl auth status
```

```bash
bl auth status --output json
```
