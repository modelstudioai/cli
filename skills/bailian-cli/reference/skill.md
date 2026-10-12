# `bl skill` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Authentication | Description                                                             |
| ----------------- | -------------- | ----------------------------------------------------------------------- |
| `bl skill add`    | No Auth        | Install skills from the Bailian skill registry into local agents        |
| `bl skill init`   | No Auth        | Install all bailian-\* skills (one-shot bootstrap for new environments) |
| `bl skill list`   | No Auth        | List registry skills and diff against local installs                    |
| `bl skill remove` | No Auth        | Remove locally installed skills (registry is untouched)                 |
| `bl skill update` | No Auth        | Update installed skills to the latest registry versions                 |

## Command details

### `bl skill add`

| Field              | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Name**           | `skill add`                                                      |
| **Description**    | Install skills from the Bailian skill registry into local agents |
| **Authentication** | No Auth                                                          |
| **Usage**          | `bl skill add --all \| --name <name,...>`                        |

#### Flags

| Flag                | Type   | Required | Description                            |
| ------------------- | ------ | -------- | -------------------------------------- |
| `--all`             | switch | no       | Install all skills from the registry   |
| `--name <name,...>` | string | no       | Comma-separated skill names to install |

#### Examples

```bash
bl skill add --all
```

```bash
bl skill add --name spark-video,bailian-model-recommend
```

### `bl skill init`

| Field              | Value                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| **Name**           | `skill init`                                                            |
| **Description**    | Install all bailian-\* skills (one-shot bootstrap for new environments) |
| **Authentication** | No Auth                                                                 |
| **Usage**          | `bl skill init`                                                         |

#### Flags

_No command-specific flags._

#### Notes

- Fetches the registry index and installs every skill whose name starts with `bailian-`.
- Equivalent to: `bl skill add --all` (filtered to `bailian-*` skills).

#### Examples

```bash
bl skill init
```

### `bl skill list`

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Name**           | `skill list`                                         |
| **Description**    | List registry skills and diff against local installs |
| **Authentication** | No Auth                                              |
| **Usage**          | `bl skill list`                                      |

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

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `skill remove`                                          |
| **Description**    | Remove locally installed skills (registry is untouched) |
| **Authentication** | No Auth                                                 |
| **Usage**          | `bl skill remove --name <all\|name,...>`                |

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

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `skill update`                                          |
| **Description**    | Update installed skills to the latest registry versions |
| **Authentication** | No Auth                                                 |
| **Usage**          | `bl skill update [--all] [--name <name,...>]`           |

#### Flags

| Flag                | Type   | Required | Description                                                                  |
| ------------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `--all`             | switch | no       | Update all installed skills (default when neither --all nor --name is given) |
| `--name <name,...>` | string | no       | Comma-separated skill names to update (must be already installed)            |

#### Examples

```bash
bl skill update
```

```bash
bl skill update --all
```

```bash
bl skill update --name spark-video
```
