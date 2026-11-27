# `bl skill` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command           | Authentication                  | Description                                                                         |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `bl skill add`    | API Key when required by source | Install skills from the Bailian skill registry into local agents                    |
| `bl skill get`    | API Key when required by source | Get skill details, installed versions and paths from the public registry or OpenAPI |
| `bl skill init`   | No Auth                         | Install all bailian-* skills (one-shot bootstrap for new environments)              |
| `bl skill list`   | API Key when required by source | List registry skills and local installations by agent, scope and status             |
| `bl skill remove` | No Auth                         | Remove locally installed skills (registry is untouched)                             |
| `bl skill search` | API Key                         | Search cloud skills and show their local installations                              |
| `bl skill update` | API Key when required by source | Update installed skills to the latest registry versions                             |

## Command details

### `bl skill add`

| Field              | Value                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `skill add`                                                                                                                                                     |
| **Description**    | Install skills from the Bailian skill registry into local agents                                                                                                |
| **Authentication** | API Key when required by source                                                                                                                                 |
| **Usage**          | `bl skill add (--name <name,...> \| --code <code,...> \| --all) [--agent <agent\|all>] [--scope user\|project] [--skill-version <version>] [--with-mcp <bool>]` |

#### Flags

| Flag                        | Type    | Required | Description                                                                                                     |
| --------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `--workspace-id <id>`       | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                                 |
| `--source <oss\|cloud>`     | string  | no       | Skill catalog. Use oss for the public registry or cloud for the workspace OpenAPI.                              |
| `--agent <agent\|all>`      | string  | no       | Target agent ID, or all detected agents                                                                         |
| `--scope <user\|project>`   | string  | no       | Installation scope (default user)                                                                               |
| `--skill-version <version>` | string  | no       | Install and pin this exact version                                                                              |
| `--with-mcp <bool>`         | boolean | no       | Read serverCode entries from mcp-config.json beside SKILL.md and activate inactive dependencies (default true). |
| `--all`                     | switch  | no       | Install all skills from the public OSS registry                                                                 |
| `--name <name,...>`         | string  | no       | Public OSS registry skill names, separated by commas                                                            |
| `--code <code,...>`         | string  | no       | Cloud OpenAPI skill codes returned by skill search, separated by commas                                         |
| `--api-key <key>`           | string  | no       | API key                                                                                                         |
| `--base-url <url>`          | string  | no       | API base URL                                                                                                    |

#### Notes

- Use --dry-run to inspect the selected package versions and preview MCP activation. Installation activates inactive dependencies and may incur charges. Public OSS packages install without a key. Checking their declared MCP services requires a Bailian API key. Use --with-mcp false to install only.

#### Examples

```bash
bl skill add --all
```

```bash
bl skill add --name spark-video,bailian-model-recommend
```

```bash
bl skill add --code skill_example --agent cursor --scope project --skill-version 1.0 --dry-run
```

### `bl skill get`

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Name**           | `skill get`                                                                         |
| **Description**    | Get skill details, installed versions and paths from the public registry or OpenAPI |
| **Authentication** | API Key when required by source                                                     |
| **Usage**          | `bl skill get (--name <name> \| --code <code>) [--with-mcp <bool>]`                 |

#### Flags

| Flag                  | Type    | Required | Description                                                                                                   |
| --------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string  | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                                               |
| `--with-mcp <bool>`   | boolean | no       | Read declared MCP server codes from the latest version package (default true, null if the manifest is absent) |
| `--name <name>`       | string  | no       | Skill name in the public OSS registry                                                                         |
| `--code <code>`       | string  | no       | OpenAPI skill_code returned by skill search                                                                   |
| `--api-key <key>`     | string  | no       | API key                                                                                                       |
| `--base-url <url>`    | string  | no       | API base URL                                                                                                  |

#### Examples

```bash
bl skill get --name bailian-cli
```

```bash
bl skill get --code skill_example --with-mcp false
```

### `bl skill init`

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| **Name**           | `skill init`                                                           |
| **Description**    | Install all bailian-* skills (one-shot bootstrap for new environments) |
| **Authentication** | No Auth                                                                |
| **Usage**          | `bl skill init`                                                        |

#### Flags

_No command-specific flags._

#### Notes

- Fetches the registry index and installs every skill whose name starts with `bailian-`.
- Installs the `bailian-*` subset of `bl skill add --all`.

#### Examples

```bash
bl skill init
```

### `bl skill list`

| Field              | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `skill list`                                                                                                                                      |
| **Description**    | List registry skills and local installations by agent, scope and status                                                                           |
| **Authentication** | API Key when required by source                                                                                                                   |
| **Usage**          | `bl skill list [--name <name,...> \| --code <code,...> \| --source oss\|cloud] [--agent <agent\|all>] [--scope user\|project] [--status <s,...>]` |

#### Flags

| Flag                      | Type   | Required | Description                                                                        |
| ------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`     | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                    |
| `--source <oss\|cloud>`   | string | no       | Skill catalog. Use oss for the public registry or cloud for the workspace OpenAPI. |
| `--name <name,...>`       | string | no       | Public OSS registry skill names, separated by commas                               |
| `--code <code,...>`       | string | no       | Cloud OpenAPI skill codes returned by skill search, separated by commas            |
| `--agent <agent\|all>`    | string | no       | Target agent ID, or all detected agents                                            |
| `--scope <user\|project>` | string | no       | Installation scope (default user)                                                  |
| `--status <s,...>`        | string | no       | Comma-separated installation states                                                |
| `--api-key <key>`         | string | no       | API key                                                                            |
| `--base-url <url>`        | string | no       | API base URL                                                                       |

#### Notes

- States: installed, outdated, not-installed, missing (tracked path absent), untracked (local files without a lock record).

#### Examples

```bash
bl skill list
```

```bash
bl skill list --source oss --status not-installed
```

```bash
bl skill list --name spark-video
```

```bash
bl skill list --code skill_example
```

```bash
bl skill list --agent cursor --scope project --status installed,outdated
```

### `bl skill remove`

| Field              | Value                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Name**           | `skill remove`                                                                                                 |
| **Description**    | Remove locally installed skills (registry is untouched)                                                        |
| **Authentication** | No Auth                                                                                                        |
| **Usage**          | `bl skill remove (--name <all\|name,...> \| --code <code,...>) [--agent <agent\|all>] [--scope user\|project]` |

#### Flags

| Flag                      | Type   | Required | Description                                                                        |
| ------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--source <oss\|cloud>`   | string | no       | Skill catalog. Use oss for the public registry or cloud for the workspace OpenAPI. |
| `--agent <agent\|all>`    | string | no       | Target agent ID, or all detected agents                                            |
| `--scope <user\|project>` | string | no       | Installation scope (default user)                                                  |
| `--name <name,...>`       | string | no       | Public OSS registry skill names, separated by commas                               |
| `--code <code,...>`       | string | no       | Cloud OpenAPI skill codes returned by skill search, separated by commas            |

#### Examples

```bash
bl skill remove --name spark-video
```

```bash
bl skill remove --name all
```

```bash
bl skill remove --code skill_example --agent cursor --scope project --dry-run
```

### `bl skill search`

| Field              | Value                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Name**           | `skill search`                                                                                               |
| **Description**    | Search cloud skills and show their local installations                                                       |
| **Authentication** | API Key                                                                                                      |
| **Usage**          | `bl skill search [--keyword <text>] [--type official\|private] [--page <n>] [--page-size <n>] [--limit <n>]` |

#### Flags

| Flag                         | Type   | Required | Description                                                     |
| ---------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `--workspace-id <id>`        | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID) |
| `--keyword <text>`           | string | no       | Search skill names and descriptions                             |
| `--type <official\|private>` | string | no       | Filter by source (default: both, case-insensitive)              |
| `--page <n>`                 | number | no       | Starting page (default 1)                                       |
| `--page-size <n>`            | number | no       | Results per request (1–100, default 30)                         |
| `--limit <n>`                | number | no       | Maximum results across pages (default one page)                 |
| `--api-key <key>`            | string | no       | API key                                                         |
| `--base-url <url>`           | string | no       | API base URL                                                    |

#### Notes

- Search uses the cloud catalog and a Bailian API key. page_start and page_end identify the requested pages within the API's 10000-record window. installations lists managed, missing and untracked locations.

#### Examples

```bash
bl skill search --keyword pdf --type official
```

```bash
bl skill search --page 2 --page-size 10 --limit 25
```

### `bl skill update`

| Field              | Value                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `skill update`                                                                                                              |
| **Description**    | Update installed skills to the latest registry versions                                                                     |
| **Authentication** | API Key when required by source                                                                                             |
| **Usage**          | `bl skill update [--name <name,...> \| --code <code,...> \| --all] [--agent <agent\|all>] [--scope user\|project] [--diff]` |

#### Flags

| Flag                      | Type   | Required | Description                                                                        |
| ------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`     | string | no       | Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)                    |
| `--source <oss\|cloud>`   | string | no       | Skill catalog. Use oss for the public registry or cloud for the workspace OpenAPI. |
| `--agent <agent\|all>`    | string | no       | Target agent ID, or all detected agents                                            |
| `--scope <user\|project>` | string | no       | Installation scope (default user)                                                  |
| `--diff`                  | switch | no       | Show changed files, or the required download in a preview                          |
| `--all`                   | switch | no       | Update all installed public OSS skills in the selected scope                       |
| `--name <name,...>`       | string | no       | Public OSS registry skill names, separated by commas                               |
| `--code <code,...>`       | string | no       | Cloud OpenAPI skill codes returned by skill search, separated by commas            |
| `--api-key <key>`         | string | no       | API key                                                                            |
| `--base-url <url>`        | string | no       | API base URL                                                                       |

#### Notes

- --name all is an alias for --all. With no selector, update installed cloud skills in the selected scope.
- Other Skill commands check for updates to unpinned installations from the selected source. Available updates appear on stderr. Removal uses the cached check offline.

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

```bash
bl skill update --code skill_example --agent cursor --scope project --diff --dry-run
```
