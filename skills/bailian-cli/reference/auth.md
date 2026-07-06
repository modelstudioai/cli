# `bl auth` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `bl auth login`  | Authenticate with API key or console browser login (credentials can coexist) |
| `bl auth logout` | Clear stored credentials                                                     |
| `bl auth status` | Show current authentication state                                            |

## Command details

### `bl auth login`

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| **Name**        | `auth login`                                                                 |
| **Description** | Authenticate with API key or console browser login (credentials can coexist) |
| **Usage**       | `bl auth login --api-key <key> \| --console`                                 |

#### Flags

| Flag                    | Type   | Required | Description                                                                           |
| ----------------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `--api-key <key>`       | string | no       | DashScope API key to store                                                            |
| `--base-url <url>`      | string | no       | DashScope API base URL (used with --api-key for validation)                           |
| `--console`             | switch | no       | Sign in via browser; use --console-site to choose domestic (default) or international |
| `--console-site <site>` | string | no       | Console site: domestic, international                                                 |

#### Examples

```bash
bl auth login --api-key sk-xxxxx
```

```bash
bl auth login --console
```

### `bl auth logout`

| Field           | Value                                    |
| --------------- | ---------------------------------------- |
| **Name**        | `auth logout`                            |
| **Description** | Clear stored credentials                 |
| **Usage**       | `bl auth logout [--console] [--dry-run]` |

#### Flags

| Flag        | Type   | Required | Description                                              |
| ----------- | ------ | -------- | -------------------------------------------------------- |
| `--console` | switch | no       | Only clear the console access_token, keep api_key intact |

#### Examples

```bash
bl auth logout
```

```bash
bl auth logout --console
```

```bash
bl auth logout --dry-run
```

### `bl auth status`

| Field           | Value                             |
| --------------- | --------------------------------- |
| **Name**        | `auth status`                     |
| **Description** | Show current authentication state |
| **Usage**       | `bl auth status`                  |

#### Flags

_No command-specific flags._

#### Examples

```bash
bl auth status
```

```bash
bl auth status --output json
```
