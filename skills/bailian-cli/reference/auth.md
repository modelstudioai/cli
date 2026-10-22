# `bl auth` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                         | Authentication | Description                                                                                  |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `bl auth generate-access-token` | No Auth        | Generate a CLI access token using OpenAPI AK/SK                                              |
| `bl auth login`                 | No Auth        | Authenticate with API key, console browser login, or OpenAPI AK/SK (credentials can coexist) |
| `bl auth logout`                | No Auth        | Clear stored credentials; full logout also clears the model Base URL                         |
| `bl auth status`                | No Auth        | Show current authentication state                                                            |

## Command details

### `bl auth generate-access-token`

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Name**           | `auth generate-access-token`                                                                               |
| **Description**    | Generate a CLI access token using OpenAPI AK/SK                                                            |
| **Authentication** | No Auth                                                                                                    |
| **Usage**          | `bl auth generate-access-token --access-key-id <id> --access-key-secret <secret> --security-token <token>` |

#### Flags

| Flag                           | Type   | Required | Description                                          |
| ------------------------------ | ------ | -------- | ---------------------------------------------------- |
| `--access-key-id <id>`         | string | yes      | Alibaba Cloud Access Key ID                          |
| `--access-key-secret <secret>` | string | yes      | Alibaba Cloud Access Key Secret                      |
| `--security-token <token>`     | string | no       | Alibaba Cloud STS Security Token to store (optional) |

#### Examples

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

| Flag                                            | Type   | Required | Description                                                                                                                                                                      |
| ----------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--api-key <key>`                               | string | no       | Model API key to validate and store                                                                                                                                              |
| `--base-url <url>`                              | string | no       | Model API base URL to validate and store with --api-key                                                                                                                          |
| `--console`                                     | switch | no       | Sign in via browser (China by default; use --console-site international for the international site). Creates an ordinary API key if needed; subscription plans require --api-key |
| `--no-browser`                                  | switch | no       | With --console, print the login URL without opening a browser                                                                                                                    |
| `--token-stdin`                                 | switch | no       | With --console, read one raw access token from piped stdin and validate before saving; requires --console-region, no browser or local server                                     |
| `--console-region <cn-beijing\|ap-southeast-1>` | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)                                                                                                                         |
| `--console-site <domestic\|international>`      | string | no       | Console site: domestic, international                                                                                                                                            |
| `--open-api`                                    | switch | no       | Store Alibaba Cloud OpenAPI AK/SK credentials                                                                                                                                    |
| `--access-key-id <id>`                          | string | no       | Alibaba Cloud Access Key ID to store                                                                                                                                             |
| `--access-key-secret <secret>`                  | string | no       | Alibaba Cloud Access Key Secret to store                                                                                                                                         |

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
| **Usage**          | `bl auth logout [--console \| --open-api] [--dry-run]`               |

#### Flags

| Flag         | Type   | Required | Description                                                             |
| ------------ | ------ | -------- | ----------------------------------------------------------------------- |
| `--console`  | switch | no       | Only clear the console access_token, keep api_key intact                |
| `--open-api` | switch | no       | Only clear OpenAPI AK/SK/STS credentials, keep other credentials intact |

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
