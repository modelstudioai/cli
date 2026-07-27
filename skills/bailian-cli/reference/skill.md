# `bl skill` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `bl skill add`    | Install skills from the Bailian skill registry into local agents |
| `bl skill list`   | List registry skills and diff against local installs             |
| `bl skill remove` | Remove locally installed skills (registry is untouched)          |
| `bl skill update` | Update installed skills to the latest registry versions          |

## Command details

### `bl skill add`

| Field           | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| **Name**        | `skill add`                                                      |
| **Description** | Install skills from the Bailian skill registry into local agents |
| **Usage**       | `bl skill add --name <all\|name,...>`                            |

#### Flags

| Flag                     | Type   | Required | Description                                           |
| ------------------------ | ------ | -------- | ----------------------------------------------------- |
| `--name <all\|name,...>` | string | yes      | Skills to install: all or comma-separated skill names |

#### Examples

```bash
bl skill add --name all
```

```bash
bl skill add --name spark-video,bailian-model-recommend
```

### `bl skill list`

| Field           | Value                                                |
| --------------- | ---------------------------------------------------- |
| **Name**        | `skill list`                                         |
| **Description** | List registry skills and diff against local installs |
| **Usage**       | `bl skill list`                                      |

#### Flags

_No command-specific flags._

#### Notes

- STATUS: installed | outdated | not-installed | missing (lock has it, dir deleted) | untracked (dir exists, not managed)

#### Examples

```bash
bl skill list
```

```bash
bl skill list --output json
```

### `bl skill remove`

| Field           | Value                                                   |
| --------------- | ------------------------------------------------------- |
| **Name**        | `skill remove`                                          |
| **Description** | Remove locally installed skills (registry is untouched) |
| **Usage**       | `bl skill remove --name <all\|name,...>`                |

#### Flags

| Flag                     | Type   | Required | Description                                          |
| ------------------------ | ------ | -------- | ---------------------------------------------------- |
| `--name <all\|name,...>` | string | yes      | Skills to remove: all or comma-separated skill names |

#### Examples

```bash
bl skill remove --name spark-video
```

```bash
bl skill remove --name all
```

### `bl skill update`

| Field           | Value                                                   |
| --------------- | ------------------------------------------------------- |
| **Name**        | `skill update`                                          |
| **Description** | Update installed skills to the latest registry versions |
| **Usage**       | `bl skill update [--name <all\|name,...>]`              |

#### Flags

| Flag                     | Type   | Required | Description                                                                                   |
| ------------------------ | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `--name <all\|name,...>` | string | no       | Skills to update: all (default, only changed ones) or comma-separated names (force reinstall) |

#### Examples

```bash
bl skill update
```

```bash
bl skill update --name spark-video
```
