# `bl plugin` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `bl plugin install` | Install or upgrade an allowlisted Command Pack         |
| `bl plugin link`    | Link an allowlisted local Command Pack for development |
| `bl plugin list`    | List installed Command Packs and their load status     |
| `bl plugin remove`  | Remove an installed Command Pack                       |

## Command details

### `bl plugin install`

| Field           | Value                                          |
| --------------- | ---------------------------------------------- |
| **Name**        | `plugin install`                               |
| **Description** | Install or upgrade an allowlisted Command Pack |
| **Usage**       | `bl plugin install --package <name[@version]>` |

#### Flags

| Flag                         | Type   | Required | Description                                                  |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------ |
| `--package <name[@version]>` | string | yes      | Allowlisted Command Pack package and optional version or tag |

#### Examples

```bash
bl plugin install --package @ali/bailian-plugin-agent
```

```bash
bl plugin install --package @ali/bailian-plugin-agent@beta
```

### `bl plugin link`

| Field           | Value                                                  |
| --------------- | ------------------------------------------------------ |
| **Name**        | `plugin link`                                          |
| **Description** | Link an allowlisted local Command Pack for development |
| **Usage**       | `bl plugin link --path <directory>`                    |

#### Flags

| Flag                 | Type   | Required | Description                          |
| -------------------- | ------ | -------- | ------------------------------------ |
| `--path <directory>` | string | yes      | Local Command Pack package directory |

#### Examples

```bash
bl plugin link --path ../bailian-plugin-agent
```

### `bl plugin list`

| Field           | Value                                              |
| --------------- | -------------------------------------------------- |
| **Name**        | `plugin list`                                      |
| **Description** | List installed Command Packs and their load status |
| **Usage**       | `bl plugin list`                                   |

#### Flags

_No command-specific flags._

#### Examples

```bash
bl plugin list
```

```bash
bl plugin list --output json
```

### `bl plugin remove`

| Field           | Value                               |
| --------------- | ----------------------------------- |
| **Name**        | `plugin remove`                     |
| **Description** | Remove an installed Command Pack    |
| **Usage**       | `bl plugin remove --name <package>` |

#### Flags

| Flag               | Type   | Required | Description                           |
| ------------------ | ------ | -------- | ------------------------------------- |
| `--name <package>` | string | yes      | Allowlisted Command Pack package name |

#### Examples

```bash
bl plugin remove --name @ali/bailian-plugin-agent
```
