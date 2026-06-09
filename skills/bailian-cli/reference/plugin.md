# `bl plugin` commands

> Auto-generated from `packages/cli/src/commands/catalog.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command             | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `bl plugin install` | Install a bailian-cli plugin package into ~/.bailian/plugins |
| `bl plugin link`    | Link a local bailian-cli plugin directory                    |
| `bl plugin list`    | List installed and discovered bailian-cli plugins            |
| `bl plugin remove`  | Remove an installed bailian-cli plugin                       |

## Command details

### `bl plugin install`

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| **Name**        | `plugin install`                                             |
| **Description** | Install a bailian-cli plugin package into ~/.bailian/plugins |
| **Usage**       | `bl plugin install <package>`                                |

#### Options

_No command-specific options._

#### Examples

```bash
bl plugin install @ali/bailian-plugin-agent
```

```bash
bl plugin install bailian-plugin-agent
```

### `bl plugin link`

| Field           | Value                                     |
| --------------- | ----------------------------------------- |
| **Name**        | `plugin link`                             |
| **Description** | Link a local bailian-cli plugin directory |
| **Usage**       | `bl plugin link <path>`                   |

#### Options

_No command-specific options._

#### Examples

```bash
bl plugin link ../bailian-plugin-agent
```

### `bl plugin list`

| Field           | Value                                             |
| --------------- | ------------------------------------------------- |
| **Name**        | `plugin list`                                     |
| **Description** | List installed and discovered bailian-cli plugins |
| **Usage**       | `bl plugin list`                                  |

#### Options

_No command-specific options._

#### Examples

```bash
bl plugin list
```

### `bl plugin remove`

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| **Name**        | `plugin remove`                        |
| **Description** | Remove an installed bailian-cli plugin |
| **Usage**       | `bl plugin remove <name>`              |

#### Options

_No command-specific options._

#### Examples

```bash
bl plugin remove bailian-plugin-agent
```
