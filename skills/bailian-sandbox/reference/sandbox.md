# `bl sandbox` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                            | Authentication | Description                                                     |
| ---------------------------------- | -------------- | --------------------------------------------------------------- |
| `bl sandbox connect`               | API Key        | Connect to a Sandbox instance and return connection information |
| `bl sandbox create`                | API Key        | Create a Sandbox instance                                       |
| `bl sandbox delete`                | API Key        | Release a Sandbox instance                                      |
| `bl sandbox file upload`           | API Key        | Upload a workspace file for Sandbox template mounts             |
| `bl sandbox get`                   | API Key        | Get Sandbox instance details                                    |
| `bl sandbox list`                  | API Key        | List Sandbox instances                                          |
| `bl sandbox official-images`       | No Auth        | List the built-in Sandbox base images (offline)                 |
| `bl sandbox pause`                 | API Key        | Pause a Sandbox instance                                        |
| `bl sandbox resume`                | API Key        | Resume a Sandbox instance and return connection information     |
| `bl sandbox template build-status` | API Key        | Get Sandbox template build status                               |
| `bl sandbox template create`       | API Key        | Create a Sandbox template                                       |
| `bl sandbox template delete`       | API Key        | Delete a Sandbox template                                       |
| `bl sandbox template get`          | API Key        | Get Sandbox template details                                    |
| `bl sandbox template list`         | API Key        | List Sandbox templates                                          |
| `bl sandbox template update`       | API Key        | Update a Sandbox template                                       |

## Command details

### `bl sandbox connect`

| Field              | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Name**           | `sandbox connect`                                                                          |
| **Description**    | Connect to a Sandbox instance and return connection information                            |
| **Authentication** | API Key                                                                                    |
| **Usage**          | `bl sandbox connect --sandbox-id <id> [--instance-timeout <seconds>] [--show-credentials]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                        |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`          | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--sandbox-id <id>`            | string | yes      | Sandbox instance ID                                                                |
| `--body <json\|@path>`         | string | no       | JSON request body, inline or loaded from an @file path; explicit flags override it |
| `--instance-timeout <seconds>` | number | no       | Sandbox lifetime after this operation (300-604800 seconds)                         |
| `--show-credentials`           | switch | no       | Print envd and traffic access tokens instead of redacting them                     |
| `--api-key <key>`              | string | no       | API key                                                                            |
| `--base-url <url>`             | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox connect --sandbox-id sbx-xxx --instance-timeout 3600
```

```bash
bl sandbox connect --sandbox-id sbx-xxx --show-credentials --output json
```

### `bl sandbox create`

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Name**           | `sandbox create`                                                         |
| **Description**    | Create a Sandbox instance                                                |
| **Authentication** | API Key                                                                  |
| **Usage**          | `bl sandbox create (--template-id <id> \| --body <json\|@path>) [flags]` |

#### Flags

| Flag                             | Type    | Required | Description                                                                        |
| -------------------------------- | ------- | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`            | string  | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--body <json\|@path>`           | string  | no       | JSON request body, inline or loaded from an @file path; explicit flags override it |
| `--template-id <id>`             | string  | no       | Ready template ID; may alternatively be supplied as templateID in --body           |
| `--instance-timeout <seconds>`   | number  | no       | Sandbox lifetime after this operation (300-604800 seconds)                         |
| `--allow-internet-access <bool>` | boolean | no       | Allow public internet access                                                       |
| `--metadata <key=value>`         | array   | no       | Instance metadata entry; repeat for multiple values                                |
| `--env <key=value>`              | array   | no       | Instance environment variable; repeat for multiple values                          |
| `--auto-pause <bool>`            | boolean | no       | Pause the instance when its timeout expires                                        |
| `--auto-resume <bool>`           | boolean | no       | Automatically resume a paused instance when connecting                             |
| `--allow-out <address>`          | array   | no       | Outbound allow-list entry; repeat for multiple values                              |
| `--deny-out <address>`           | array   | no       | Outbound deny-list entry; repeat for multiple values                               |
| `--mask-request-host <host>`     | string  | no       | Override the outbound request Host header                                          |
| `--show-credentials`             | switch  | no       | Print envd and traffic access tokens instead of redacting them                     |
| `--api-key <key>`                | string  | no       | API key                                                                            |
| `--base-url <url>`               | string  | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox create --template-id tpl-xxx --instance-timeout 3600
```

```bash
bl sandbox create --template-id tpl-xxx --base-url https://workspace.cn-beijing.maas.aliyuncs.com
```

```bash
bl sandbox create --body @sandbox.json --dry-run --output json
```

```bash
bl sandbox create --template-id tpl-xxx --show-credentials --output json
```

### `bl sandbox delete`

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Name**           | `sandbox delete`                                                     |
| **Description**    | Release a Sandbox instance                                           |
| **Authentication** | API Key                                                              |
| **Usage**          | `bl sandbox delete --sandbox-id <id>`                                |
| **Risk**           | `high`                                                               |
| **Risk message**   | This permanently releases the Sandbox instance and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--sandbox-id <id>`   | string | yes      | Sandbox instance ID                                                                |
| `--yes`               | switch | no       | Confirm this high-risk operation                                                   |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox delete --sandbox-id sbx-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl sandbox delete --sandbox-id sbx-xxx --yes
```

### `bl sandbox file upload`

| Field              | Value                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| **Name**           | `sandbox file upload`                                                           |
| **Description**    | Upload a workspace file for Sandbox template mounts                             |
| **Authentication** | API Key                                                                         |
| **Usage**          | `bl sandbox file upload --path <path> [--filename <name>] [--mime-type <type>]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--path <path>`       | string | yes      | Local file path                                                                    |
| `--filename <name>`   | string | no       | Remote filename override                                                           |
| `--mime-type <type>`  | string | no       | Multipart file MIME type (default: application/octet-stream)                       |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- POST /api/v1/agentstudio/files with multipart fields file and source=sandbox_template. Uses a Bailian Bearer API Key, not Console authentication or an E2B key; no agents.yaml is needed.
- Base URL follows Sandbox: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. Without one, --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id selects the cn-beijing origin. The upload path has no /sandbox prefix.
- Returns the upload response immediately; --quiet prints only its id. Upload does not wait for security review: status=checking is not ready to mount. Use an available file's id as mntConfig[].originFileId in template create/update --body, together with mountPath and optional originFileName, in the same workspace. This does not transfer files into a running instance.
- --dry-run previews the endpoint, source, and local path without reading or uploading the file. The service detects the MIME type and enforces upload limits.

#### Examples

```bash
bl sandbox file upload --path ./config.json --output json
```

```bash
bl sandbox file upload --path ./config.json --quiet
```

```bash
bl sandbox file upload --path ./notes.txt --filename notes.txt --mime-type text/plain --dry-run --output json
```

### `bl sandbox get`

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Name**           | `sandbox get`                                           |
| **Description**    | Get Sandbox instance details                            |
| **Authentication** | API Key                                                 |
| **Usage**          | `bl sandbox get --sandbox-id <id> [--show-credentials]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--sandbox-id <id>`   | string | yes      | Sandbox instance ID                                                                |
| `--show-credentials`  | switch | no       | Print envd and traffic access tokens instead of redacting them                     |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox get --sandbox-id sbx-xxx
```

```bash
bl sandbox get --sandbox-id sbx-xxx --show-credentials --output json
```

### `bl sandbox list`

| Field              | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Name**           | `sandbox list`                                                                             |
| **Description**    | List Sandbox instances                                                                     |
| **Authentication** | API Key                                                                                    |
| **Usage**          | `bl sandbox list [--template-id <id>] [--sandbox-id <id>] [--state <state>] [--limit <n>]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--template-id <id>`  | string | no       | Filter by template ID                                                              |
| `--sandbox-id <id>`   | string | no       | Filter by sandbox ID                                                               |
| `--state <state>`     | string | no       | Filter by state, for example running or paused                                     |
| `--limit <n>`         | number | no       | Maximum results (1-50)                                                             |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox list
```

```bash
bl sandbox list --state running --limit 20
```

```bash
bl sandbox list --template-id tpl-xxx --output json
```

### `bl sandbox official-images`

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Name**           | `sandbox official-images`                       |
| **Description**    | List the built-in Sandbox base images (offline) |
| **Authentication** | No Auth                                         |
| **Usage**          | `bl sandbox official-images`                    |

#### Flags

_No command-specific flags._

#### Notes

- Use a preset ID or Chinese name with template create/update --image. These are pinned cn-beijing images; other environments may differ. Use --from-image for a custom image.
- code-interpreter (代码解释器): Python / Node.js runtimes with common data-processing libraries. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/code-interpreter-v1:v0.0.44
- browser (浏览器): Chromium and a visual desktop for clicking, filling forms, and screenshots. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44
- all-in-one (全能型): Code execution and browser capabilities together. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/all-in-one:v0.0.44

#### Examples

```bash
bl sandbox official-images
```

```bash
bl sandbox official-images --output json
```

```bash
bl sandbox official-images --quiet
```

### `bl sandbox pause`

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Name**           | `sandbox pause`                      |
| **Description**    | Pause a Sandbox instance             |
| **Authentication** | API Key                              |
| **Usage**          | `bl sandbox pause --sandbox-id <id>` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--sandbox-id <id>`   | string | yes      | Sandbox instance ID                                                                |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox pause --sandbox-id sbx-xxx
```

```bash
bl sandbox pause --sandbox-id sbx-xxx --dry-run --output json
```

### `bl sandbox resume`

| Field              | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Name**           | `sandbox resume`                                                                          |
| **Description**    | Resume a Sandbox instance and return connection information                               |
| **Authentication** | API Key                                                                                   |
| **Usage**          | `bl sandbox resume --sandbox-id <id> [--instance-timeout <seconds>] [--show-credentials]` |

#### Flags

| Flag                           | Type   | Required | Description                                                                        |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`          | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--sandbox-id <id>`            | string | yes      | Sandbox instance ID                                                                |
| `--body <json\|@path>`         | string | no       | JSON request body, inline or loaded from an @file path; explicit flags override it |
| `--instance-timeout <seconds>` | number | no       | Sandbox lifetime after this operation (300-604800 seconds)                         |
| `--show-credentials`           | switch | no       | Print envd and traffic access tokens instead of redacting them                     |
| `--api-key <key>`              | string | no       | API key                                                                            |
| `--base-url <url>`             | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox resume --sandbox-id sbx-xxx --instance-timeout 3600
```

```bash
bl sandbox resume --sandbox-id sbx-xxx --show-credentials --output json
```

### `bl sandbox template build-status`

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| **Name**           | `sandbox template build-status`                                       |
| **Description**    | Get Sandbox template build status                                     |
| **Authentication** | API Key                                                               |
| **Usage**          | `bl sandbox template build-status --template-id <id> --build-id <id>` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--template-id <id>`  | string | yes      | Sandbox template ID                                                                |
| `--build-id <id>`     | string | yes      | Template build ID                                                                  |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox template build-status --template-id tpl-xxx --build-id build-xxx
```

```bash
bl sandbox template build-status --template-id tpl-xxx --build-id build-xxx --output json
```

### `bl sandbox template create`

| Field              | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Name**           | `sandbox template create`                                                                                         |
| **Description**    | Create a Sandbox template                                                                                         |
| **Authentication** | API Key                                                                                                           |
| **Usage**          | `bl sandbox template create (--name <name> --cpu-count <cores> --memory-mb <mb> \| --body <json\|@path>) [flags]` |

#### Flags

| Flag                                                                          | Type   | Required | Description                                                                        |
| ----------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`                                                         | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--body <json\|@path>`                                                        | string | no       | JSON request body, inline or loaded from an @file path; explicit flags override it |
| `--image <code-interpreter\|代码解释器\|browser\|浏览器\|all-in-one\|全能型>` | string | no       | Built-in image ID or Chinese name; fills fromImage and imageName                   |
| `--name <name>`                                                               | string | no       | Template name                                                                      |
| `--cpu-count <cores>`                                                         | number | no       | vCPU count                                                                         |
| `--memory-mb <mb>`                                                            | number | no       | Memory in MB                                                                       |
| `--from-image <image>`                                                        | string | no       | Base image identifier                                                              |
| `--image-name <name>`                                                         | string | no       | Base image display name                                                            |
| `--env <key=value>`                                                           | array  | no       | Template environment variable; repeat for multiple values                          |
| `--allow-out <address>`                                                       | array  | no       | Outbound allow-list entry; repeat for multiple values                              |
| `--deny-out <address>`                                                        | array  | no       | Outbound deny-list entry; repeat for multiple values                               |
| `--auto-pause-time <seconds>`                                                 | number | no       | Automatically pause after 300-604800 seconds                                       |
| `--max-running-time <seconds>`                                                | number | no       | Maximum running lifetime in seconds (300-604800)                                   |
| `--description <text>`                                                        | string | no       | Template description                                                               |
| `--tag <tag>`                                                                 | array  | no       | E2B tag; repeat for multiple values                                                |
| `--alias <alias>`                                                             | string | no       | E2B template alias                                                                 |
| `--async`                                                                     | switch | no       | Return the submitted templateID/buildID immediately without polling                |
| `--poll-interval <seconds>`                                                   | number | no       | Template build polling interval (default: 5 seconds)                               |
| `--api-key <key>`                                                             | string | no       | API key                                                                            |
| `--base-url <url>`                                                            | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.
- code-interpreter (代码解释器): Python / Node.js runtimes with common data-processing libraries. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/code-interpreter-v1:v0.0.44
- browser (浏览器): Chromium and a visual desktop for clicking, filling forms, and screenshots. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44
- all-in-one (全能型): Code execution and browser capabilities together. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/all-in-one:v0.0.44
- --image overrides body fromImage/imageName; explicit --from-image/--image-name override the corresponding preset fields. Without --image, image behavior is unchanged.
- For local file mounts, use sandbox file upload first; put the available file's id into --body mntConfig[].originFileId with mountPath and optional originFileName. Upload and template must use the same workspace. Other complete nested structures can also be supplied through --body.
- By default the command waits for build status ready; --async returns the submitted build immediately.

#### Examples

```bash
bl sandbox template create --name browser --image browser --cpu-count 1 --memory-mb 2048
```

```bash
bl sandbox template create --name python --cpu-count 1 --memory-mb 2048
```

```bash
bl sandbox template create --body @template.json --async --output json
```

```bash
bl sandbox template create --name browser --cpu-count 4 --memory-mb 8192 --dry-run --output json
```

### `bl sandbox template delete`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Name**           | `sandbox template delete`                                           |
| **Description**    | Delete a Sandbox template                                           |
| **Authentication** | API Key                                                             |
| **Usage**          | `bl sandbox template delete --template-id <id>`                     |
| **Risk**           | `high`                                                              |
| **Risk message**   | This permanently deletes the Sandbox template and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--template-id <id>`  | string | yes      | Sandbox template ID                                                                |
| `--yes`               | switch | no       | Confirm this high-risk operation                                                   |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.
- The server rejects deletion while running or paused instances still use the template.

#### Examples

```bash
bl sandbox template delete --template-id tpl-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl sandbox template delete --template-id tpl-xxx --yes
```

### `bl sandbox template get`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `sandbox template get`                       |
| **Description**    | Get Sandbox template details                 |
| **Authentication** | API Key                                      |
| **Usage**          | `bl sandbox template get --template-id <id>` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--template-id <id>`  | string | yes      | Sandbox template ID                                                                |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.

#### Examples

```bash
bl sandbox template get --template-id tpl-xxx
```

```bash
bl sandbox template get --template-id tpl-xxx --output json
```

### `bl sandbox template list`

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Name**           | `sandbox template list`                                      |
| **Description**    | List Sandbox templates                                       |
| **Authentication** | API Key                                                      |
| **Usage**          | `bl sandbox template list [--limit <n>] [--cursor <cursor>]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                        |
| --------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>` | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--limit <n>`         | number | no       | Maximum results (1-100)                                                            |
| `--cursor <cursor>`   | string | no       | Server-side pagination cursor                                                      |
| `--api-key <key>`     | string | no       | API key                                                                            |
| `--base-url <url>`    | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.
- The API response does not expose a next cursor, so automatic --all pagination is unavailable.

#### Examples

```bash
bl sandbox template list
```

```bash
bl sandbox template list --limit 100 --output json
```

### `bl sandbox template update`

| Field              | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| **Name**           | `sandbox template update`                                                          |
| **Description**    | Update a Sandbox template                                                          |
| **Authentication** | API Key                                                                            |
| **Usage**          | `bl sandbox template update --template-id <id> (--body <json\|@path> \| [fields])` |

#### Flags

| Flag                                                                          | Type   | Required | Description                                                                        |
| ----------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| `--workspace-id <id>`                                                         | string | no       | Workspace ID for the default Sandbox endpoint; optional with a configured base URL |
| `--template-id <id>`                                                          | string | yes      | Sandbox template ID                                                                |
| `--body <json\|@path>`                                                        | string | no       | JSON request body, inline or loaded from an @file path; explicit flags override it |
| `--image <code-interpreter\|代码解释器\|browser\|浏览器\|all-in-one\|全能型>` | string | no       | Built-in image ID or Chinese name; fills fromImage and imageName                   |
| `--name <name>`                                                               | string | no       | Template name                                                                      |
| `--cpu-count <cores>`                                                         | number | no       | vCPU count                                                                         |
| `--memory-mb <mb>`                                                            | number | no       | Memory in MB                                                                       |
| `--from-image <image>`                                                        | string | no       | Base image identifier                                                              |
| `--image-name <name>`                                                         | string | no       | Base image display name                                                            |
| `--env <key=value>`                                                           | array  | no       | Template environment variable; repeat for multiple values                          |
| `--allow-out <address>`                                                       | array  | no       | Outbound allow-list entry; repeat for multiple values                              |
| `--deny-out <address>`                                                        | array  | no       | Outbound deny-list entry; repeat for multiple values                               |
| `--auto-pause-time <seconds>`                                                 | number | no       | Automatically pause after 300-604800 seconds                                       |
| `--max-running-time <seconds>`                                                | number | no       | Maximum running lifetime in seconds (300-604800)                                   |
| `--description <text>`                                                        | string | no       | Template description                                                               |
| `--async`                                                                     | switch | no       | Return the submitted templateID/buildID immediately without polling                |
| `--poll-interval <seconds>`                                                   | number | no       | Template build polling interval (default: 5 seconds)                               |
| `--api-key <key>`                                                             | string | no       | API key                                                                            |
| `--base-url <url>`                                                            | string | no       | API base URL                                                                       |

#### Notes

- Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.
- Base URL: --base-url > DASHSCOPE_BASE_URL > login/profile base_url. The CLI uses its origin and appends /api/v1/agentstudio/sandbox; otherwise it uses the workspace-scoped cn-beijing endpoint.
- Without a configured base URL, workspace is required: --workspace-id > BAILIAN_WORKSPACE_ID > config workspace_id.
- Sandbox is currently available in cn-beijing only and requires prior SLR authorization.
- Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.
- code-interpreter (代码解释器): Python / Node.js runtimes with common data-processing libraries. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/code-interpreter-v1:v0.0.44
- browser (浏览器): Chromium and a visual desktop for clicking, filling forms, and screenshots. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44
- all-in-one (全能型): Code execution and browser capabilities together. fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/all-in-one:v0.0.44
- --image overrides body fromImage/imageName; explicit --from-image/--image-name override the corresponding preset fields. Without --image, image behavior is unchanged.
- Supplying envConfig or --env replaces the template's complete environment map.
- Use sandbox file upload for local mount files. In --body mntConfig[], set originFileId to the available file's id and supply mountPath; upload and template must use the same workspace.
- By default the command waits for build status ready; --async returns the submitted build immediately.

#### Examples

```bash
bl sandbox template update --template-id tpl-xxx --image all-in-one
```

```bash
bl sandbox template update --template-id tpl-xxx --cpu-count 4 --memory-mb 8192
```

```bash
bl sandbox template update --template-id tpl-xxx --body @template-update.json --async --output json
```

```bash
bl sandbox template update --template-id tpl-xxx --description updated --dry-run --output json
```
