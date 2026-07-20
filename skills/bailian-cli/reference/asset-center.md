# `bl asset-center` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                             | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `bl asset-center delete`            | Delete assets (soft delete to recycle bin by default)          |
| `bl asset-center download`          | Get a signed download URL for an asset by ID                   |
| `bl asset-center favorite`          | Add assets to favorites                                        |
| `bl asset-center get`               | Get full details of a model-generated asset                    |
| `bl asset-center list`              | List model-generated assets with filters and cursor pagination |
| `bl asset-center oss bind`          | Create OSS transfer policy (bind bucket for asset transfer)    |
| `bl asset-center oss show`          | View current OSS transfer policy                               |
| `bl asset-center oss slr authorize` | Authorize OSS service-linked role (one-click)                  |
| `bl asset-center oss unbind`        | Delete OSS transfer policy (unbind)                            |
| `bl asset-center oss update`        | Update an existing OSS transfer policy                         |
| `bl asset-center stats`             | Count model-generated assets by type                           |
| `bl asset-center storage`           | View storage quota, usage, and overage pricing                 |
| `bl asset-center transfer list`     | List asset OSS transfer records (filtered by sync status)      |
| `bl asset-center unfavorite`        | Remove assets from favorites                                   |

## Command details

### `bl asset-center delete`

| Field           | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| **Name**        | `asset-center delete`                                                 |
| **Description** | Delete assets (soft delete to recycle bin by default)                 |
| **Usage**       | `bl asset-center delete --id <asset-id> [--id <asset-id>...] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--id <asset-id>`              | array  | yes      | Asset ID(s) to operate on (repeatable, max 100)          |
| `--permanent`                  | switch | no       | Permanently delete assets (cannot be restored)           |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center delete --id asset-001
```

```bash
bl asset-center delete --id asset-001 --id asset-002
```

```bash
bl asset-center delete --id asset-001 --permanent
```

### `bl asset-center download`

| Field           | Value                                        |
| --------------- | -------------------------------------------- |
| **Name**        | `asset-center download`                      |
| **Description** | Get a signed download URL for an asset by ID |
| **Usage**       | `bl asset-center download --id <asset-id>`   |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--id <asset-id>`              | string | yes      | Asset ID to get download URL for                         |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center download --id asset-001
```

```bash
bl asset-center download --id asset-001 --output json
```

```bash
bl asset-center download --id asset-001 --quiet
```

### `bl asset-center favorite`

| Field           | Value                                                           |
| --------------- | --------------------------------------------------------------- |
| **Name**        | `asset-center favorite`                                         |
| **Description** | Add assets to favorites                                         |
| **Usage**       | `bl asset-center favorite --id <asset-id> [--id <asset-id>...]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--id <asset-id>`              | array  | yes      | Asset ID(s) to operate on (repeatable, max 100)          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center favorite --id asset-001
```

```bash
bl asset-center favorite --id asset-001 --id asset-002
```

### `bl asset-center get`

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| **Name**        | `asset-center get`                            |
| **Description** | Get full details of a model-generated asset   |
| **Usage**       | `bl asset-center get --asset-id <id> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--asset-id <id>`              | string | yes      | Asset ID to query                                        |
| `--include-download-url`       | switch | no       | Include signed download URL                              |
| `--include-thumbnail`          | switch | no       | Include thumbnail URL                                    |
| `--thumbnail-width <px>`       | number | no       | Thumbnail width in pixels                                |
| `--thumbnail-height <px>`      | number | no       | Thumbnail height in pixels                               |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center get --asset-id asset-001
```

```bash
bl asset-center get --asset-id asset-001 --include-download-url --output json
```

### `bl asset-center list`

| Field           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| **Name**        | `asset-center list`                                            |
| **Description** | List model-generated assets with filters and cursor pagination |
| **Usage**       | `bl asset-center list [flags]`                                 |

#### Flags

| Flag                                                                | Type   | Required | Description                                              |
| ------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------- |
| `--type <IMAGE\|VIDEO\|AUDIO>`                                      | string | no       | Asset type: IMAGE, VIDEO, or AUDIO                       |
| `--model <name>`                                                    | string | no       | Filter by model name                                     |
| `--keyword <text>`                                                  | string | no       | Filter by asset name (substring match)                   |
| `--favorited`                                                       | switch | no       | Show or count only favorited assets                      |
| `--recycle-bin`                                                     | switch | no       | Show or count soft-deleted assets (recycle bin)          |
| `--sync-status <NOT_SYNCED\|IN_SYNCING\|SYNC_SUCCESS\|SYNC_FAILED>` | string | no       | OSS sync status filter                                   |
| `--begin-time <datetime>`                                           | string | no       | Filter by generate time start (ISO_LOCAL_DATE_TIME)      |
| `--end-time <datetime>`                                             | string | no       | Filter by generate time end (ISO_LOCAL_DATE_TIME)        |
| `--include-download-url`                                            | switch | no       | Include signed download URLs in the response             |
| `--include-thumbnail`                                               | switch | no       | Include thumbnail URLs in the response                   |
| `--thumbnail-width <px>`                                            | number | no       | Thumbnail width in pixels                                |
| `--thumbnail-height <px>`                                           | number | no       | Thumbnail height in pixels                               |
| `--page-size <n>`                                                   | number | no       | Results per page (default: 10, max: 100)                 |
| `--next-token <token>`                                              | number | no       | Cursor for the next page                                 |
| `--pre-token <token>`                                               | number | no       | Cursor for the previous page                             |
| `--console-region <region>`                                         | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`                                             | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`                                      | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`                                               | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center list
```

```bash
bl asset-center list --type IMAGE --model qwen-image-3.0
```

```bash
bl asset-center list --favorited --page-size 20
```

```bash
bl asset-center list --recycle-bin
```

```bash
bl asset-center list --keyword landscape --output json
```

### `bl asset-center oss bind`

| Field           | Value                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| **Name**        | `asset-center oss bind`                                                                                       |
| **Description** | Create OSS transfer policy (bind bucket for asset transfer)                                                   |
| **Usage**       | `bl asset-center oss bind --bucket <name> --region <region> --path-prefix <prefix> --policy <policy> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                                          |
| ------------------------------ | ------ | -------- | -------------------------------------------------------------------- |
| `--bucket <name>`              | string | yes      | OSS bucket name                                                      |
| `--region <region>`            | string | yes      | OSS bucket region (e.g. cn-hangzhou)                                 |
| `--path-prefix <prefix>`       | string | yes      | OSS path prefix (must not start with /)                              |
| `--policy <ALL\|BEFORE_DAYS>`  | string | yes      | Transfer policy: ALL or BEFORE_DAYS                                  |
| `--before-days <n>`            | number | no       | Transfer assets older than N days (required when policy=BEFORE_DAYS) |
| `--delete-after-transfer`      | switch | no       | Delete from platform after transfer completes                        |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)             |
| `--console-site <site>`        | string | no       | Console site: domestic, international                                |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                                |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                             |

#### Examples

```bash
bl asset-center oss bind --bucket my-bucket --region cn-hangzhou --path-prefix bailian-assets/ --policy ALL
```

```bash
bl asset-center oss bind --bucket my-bucket --region cn-hangzhou --path-prefix bailian/ --policy BEFORE_DAYS --before-days 30
```

### `bl asset-center oss show`

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Name**        | `asset-center oss show`                               |
| **Description** | View current OSS transfer policy                      |
| **Usage**       | `bl asset-center oss show [--policy-id <id>] [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--policy-id <id>`             | string | no       | Policy ID (optional; omit to query by workspace)         |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center oss show
```

```bash
bl asset-center oss show --policy-id policy-abc123 --output json
```

### `bl asset-center oss slr authorize`

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| **Name**        | `asset-center oss slr authorize`              |
| **Description** | Authorize OSS service-linked role (one-click) |
| **Usage**       | `bl asset-center oss slr authorize [flags]`   |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center oss slr authorize
```

```bash
bl asset-center oss slr authorize --output json
```

### `bl asset-center oss unbind`

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| **Name**        | `asset-center oss unbind`                     |
| **Description** | Delete OSS transfer policy (unbind)           |
| **Usage**       | `bl asset-center oss unbind --policy-id <id>` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--policy-id <id>`             | string | yes      | Transfer policy ID                                       |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center oss unbind --policy-id policy-abc123
```

### `bl asset-center oss update`

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Name**        | `asset-center oss update`                             |
| **Description** | Update an existing OSS transfer policy                |
| **Usage**       | `bl asset-center oss update --policy-id <id> [flags]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--policy-id <id>`             | string | yes      | Transfer policy ID                                       |
| `--bucket <name>`              | string | no       | OSS bucket name                                          |
| `--region <region>`            | string | no       | OSS bucket region                                        |
| `--path-prefix <prefix>`       | string | no       | OSS path prefix (must not start with /)                  |
| `--policy <ALL\|BEFORE_DAYS>`  | string | no       | Transfer policy: ALL or BEFORE_DAYS                      |
| `--before-days <n>`            | number | no       | Transfer days threshold                                  |
| `--delete-after-transfer`      | switch | no       | Delete from platform after transfer completes            |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center oss update --policy-id policy-abc123 --policy ALL
```

```bash
bl asset-center oss update --policy-id policy-abc123 --delete-after-transfer
```

### `bl asset-center stats`

| Field           | Value                                |
| --------------- | ------------------------------------ |
| **Name**        | `asset-center stats`                 |
| **Description** | Count model-generated assets by type |
| **Usage**       | `bl asset-center stats [flags]`      |

#### Flags

| Flag                                                                | Type   | Required | Description                                              |
| ------------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------- |
| `--type <IMAGE\|VIDEO\|AUDIO>`                                      | string | no       | Asset type: IMAGE, VIDEO, or AUDIO                       |
| `--model <name>`                                                    | string | no       | Filter by model name                                     |
| `--keyword <text>`                                                  | string | no       | Filter by asset name (substring match)                   |
| `--favorited`                                                       | switch | no       | Show or count only favorited assets                      |
| `--recycle-bin`                                                     | switch | no       | Show or count soft-deleted assets (recycle bin)          |
| `--sync-status <NOT_SYNCED\|IN_SYNCING\|SYNC_SUCCESS\|SYNC_FAILED>` | string | no       | OSS sync status filter                                   |
| `--begin-time <datetime>`                                           | string | no       | Filter by generate time start (ISO_LOCAL_DATE_TIME)      |
| `--end-time <datetime>`                                             | string | no       | Filter by generate time end (ISO_LOCAL_DATE_TIME)        |
| `--sync-failed`                                                     | switch | no       | Also count assets with failed OSS sync                   |
| `--console-region <region>`                                         | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`                                             | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`                                      | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`                                               | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center stats
```

```bash
bl asset-center stats --sync-failed
```

```bash
bl asset-center stats --type IMAGE --output json
```

### `bl asset-center storage`

| Field           | Value                                          |
| --------------- | ---------------------------------------------- |
| **Name**        | `asset-center storage`                         |
| **Description** | View storage quota, usage, and overage pricing |
| **Usage**       | `bl asset-center storage [flags]`              |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center storage
```

```bash
bl asset-center storage --output json
```

### `bl asset-center transfer list`

| Field           | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| **Name**        | `asset-center transfer list`                                |
| **Description** | List asset OSS transfer records (filtered by sync status)   |
| **Usage**       | `bl asset-center transfer list [--status <status>] [flags]` |

#### Flags

| Flag                                                           | Type   | Required | Description                                              |
| -------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------- |
| `--status <NOT_SYNCED\|IN_SYNCING\|SYNC_SUCCESS\|SYNC_FAILED>` | string | no       | OSS sync status filter                                   |
| `--page-size <n>`                                              | number | no       | Results per page (default: 10, max: 100)                 |
| `--next-token <token>`                                         | number | no       | Cursor for the next page                                 |
| `--console-region <region>`                                    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`                                        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>`                                 | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`                                          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center transfer list
```

```bash
bl asset-center transfer list --status SYNC_FAILED
```

```bash
bl asset-center transfer list --status IN_SYNCING --page-size 20 --output json
```

### `bl asset-center unfavorite`

| Field           | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| **Name**        | `asset-center unfavorite`                                         |
| **Description** | Remove assets from favorites                                      |
| **Usage**       | `bl asset-center unfavorite --id <asset-id> [--id <asset-id>...]` |

#### Flags

| Flag                           | Type   | Required | Description                                              |
| ------------------------------ | ------ | -------- | -------------------------------------------------------- |
| `--id <asset-id>`              | array  | yes      | Asset ID(s) to operate on (repeatable, max 100)          |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1) |
| `--console-site <site>`        | string | no       | Console site: domestic, international                    |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                    |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                 |

#### Examples

```bash
bl asset-center unfavorite --id asset-001
```

```bash
bl asset-center unfavorite --id asset-001 --id asset-002
```
