# `bl permission` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                | Authentication | Description                                                              |
| ---------------------- | -------------- | ------------------------------------------------------------------------ |
| `bl permission grant`  | API Key        | Grant model permissions (inference / finetune / deploy)                  |
| `bl permission list`   | API Key        | List model permissions (inference / fine-tune / deploy) in the workspace |
| `bl permission revoke` | API Key        | Revoke model permissions (inference / finetune / deploy)                 |

## Command details

### `bl permission grant`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `permission grant`                                                   |
| **Description**    | Grant model permissions (inference / finetune / deploy)              |
| **Authentication** | API Key                                                              |
| **Usage**          | `bl permission grant --model <models> [--action <actions>] \| --all` |

#### Flags

| Flag                 | Type   | Required | Description                                                                             |
| -------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `--model <models>`   | string | no       | Model ID(s), comma-separated (max 20)                                                   |
| `--action <actions>` | string | no       | Permission action(s), comma-separated: inference, finetune, deploy (default: inference) |
| `--all`              | switch | no       | One-key grant inference for all models in the workspace (including future ones)         |
| `--api-key <key>`    | string | no       | API key                                                                                 |
| `--base-url <url>`   | string | no       | API base URL                                                                            |

#### Notes

- Grants apply to the business workspace your API key belongs to.
- --all maps to the server one-key switch (access_all_entities: OPEN) and only covers inference.
- Actions you omit keep their current grants (server-side tri-state patch).

#### Examples

```bash
bl permission grant --model qwen-plus
```

```bash
bl permission grant --model qwen-plus,qwen3-max --action inference,finetune
```

```bash
bl permission grant --all
```

```bash
bl permission grant --model qwen-plus --dry-run --output json
```

### `bl permission list`

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Name**           | `permission list`                                                                                       |
| **Description**    | List model permissions (inference / fine-tune / deploy) in the workspace                                |
| **Authentication** | API Key                                                                                                 |
| **Usage**          | `bl permission list [--scope <scope>] [--model <model>] [--name <name>] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                                 | Type   | Required | Description                                                           |
| ------------------------------------ | ------ | -------- | --------------------------------------------------------------------- |
| `--scope <authorized\|authorizable>` | string | no       | Authorization scope: authorizable (default, full catalog), authorized |
| `--model <model>`                    | string | no       | Model ID (exact match)                                                |
| `--name <name>`                      | string | no       | Fuzzy search by model name or ID                                      |
| `--page <n>`                         | number | no       | Page number (default: 1)                                              |
| `--page-size <n>`                    | number | no       | Results per page (default: 20)                                        |
| `--api-key <key>`                    | string | no       | API key                                                               |
| `--base-url <url>`                   | string | no       | API base URL                                                          |

#### Notes

- Default scope is `authorizable` (the full grantable catalog); use `--scope authorized` to see only models already granted.
- Output defaults to JSON; pass `--output text` for a table. Permission values are tri-state: true / false / null (never set).
- Values mirror the server's grant records as-is for the workspace bound to your API key. A model reporting false/null can still be callable (access may come from other channels); see the Model Studio authorization docs for the exact semantics.

#### Examples

```bash
bl permission list
```

```bash
bl permission list --model qwen-plus
```

```bash
bl permission list --scope authorized
```

```bash
bl permission list --name qwen --page-size 50
```

```bash
bl permission list --output text
```

### `bl permission revoke`

| Field              | Value                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `permission revoke`                                                                                                                                           |
| **Description**    | Revoke model permissions (inference / finetune / deploy)                                                                                                      |
| **Authentication** | API Key                                                                                                                                                       |
| **Usage**          | `bl permission revoke --model <models> [--action <actions>] \| --all [flags]`                                                                                 |
| **Risk**           | `high`                                                                                                                                                        |
| **Risk message**   | This revokes model permissions and may interrupt inference, fine-tuning, or deployment workloads. With --all, it also clears all historical inference grants. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                 | Type   | Required | Description                                                                             |
| -------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `--model <models>`   | string | no       | Model ID(s), comma-separated (max 20)                                                   |
| `--action <actions>` | string | no       | Permission action(s), comma-separated: inference, finetune, deploy (default: inference) |
| `--all`              | switch | no       | Close one-key authorization and clear ALL historical inference grants                   |
| `--yes`              | switch | no       | Confirm this high-risk operation                                                        |
| `--api-key <key>`    | string | no       | API key                                                                                 |
| `--base-url <url>`   | string | no       | API base URL                                                                            |

#### Notes

- Grants apply to the business workspace your API key belongs to.
- All revoke operations require --yes; use --dry-run to preview the request without confirmation.
- --all maps to the server one-key switch (access_all_entities: CLOSE): it clears every historical inference grant and cannot be undone, so it requires --yes.
- Actions you omit keep their current grants (server-side tri-state patch).

#### Examples

```bash
# Only after explicit user confirmation:
bl permission revoke --model qwen-plus --yes
```

```bash
# Only after explicit user confirmation:
bl permission revoke --model qwen-plus,qwen3-max --action inference,finetune --yes
```

```bash
# Only after explicit user confirmation:
bl permission revoke --all --yes
```

```bash
bl permission revoke --model qwen-plus --dry-run --output json
```
