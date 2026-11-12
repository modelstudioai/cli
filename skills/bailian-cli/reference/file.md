# `bl file` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command          | Authentication | Description                                              |
| ---------------- | -------------- | -------------------------------------------------------- |
| `bl file upload` | API Key        | Upload a local file to DashScope temporary storage (48h) |
| `bl file url`    | Console        | Resolve a Console business file key to a file URL        |

## Command details

### `bl file upload`

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Name**           | `file upload`                                            |
| **Description**    | Upload a local file to DashScope temporary storage (48h) |
| **Authentication** | API Key                                                  |
| **Usage**          | `bl file upload --file <path> --model <model>`           |

#### Flags

| Flag               | Type   | Required | Description                                     |
| ------------------ | ------ | -------- | ----------------------------------------------- |
| `--file <path>`    | string | yes      | Local file to upload (image, video, audio)      |
| `--model <model>`  | string | yes      | Target model name (file is bound to this model) |
| `--api-key <key>`  | string | no       | API key                                         |
| `--base-url <url>` | string | no       | API base URL                                    |

#### Examples

```bash
bl file upload --file photo.jpg --model qwen3-vl-plus
```

```bash
bl file upload --file video.mp4 --model wan2.1-t2v-plus
```

```bash
bl file upload --file audio.wav --model qwen3-asr-flash
```

```bash
bl file upload --file cat.png --model qwen-image-3.0
```

### `bl file url`

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| **Name**           | `file url`                                        |
| **Description**    | Resolve a Console business file key to a file URL |
| **Authentication** | Console                                           |
| **Usage**          | `bl file url --file-key <key>`                    |

#### Flags

| Flag                           | Type   | Required | Description                                                  |
| ------------------------------ | ------ | -------- | ------------------------------------------------------------ |
| `--file-key <key>`             | string | yes      | Console business file key, not an existing URL or oss:// URI |
| `--console-region <region>`    | string | no       | Console gateway region (e.g. cn-beijing, ap-southeast-1)     |
| `--console-site <site>`        | string | no       | Console site: domestic, international                        |
| `--console-switch-agent <uid>` | number | no       | Switch agent UID for delegated access                        |
| `--workspace-id <id>`          | string | no       | Workspace ID (env: BAILIAN_WORKSPACE_ID)                     |

#### Notes

- Uses Console-domain authentication and the selected Console scope.
- The business file key is not the DashScope temporary oss:// URI returned by file upload.
- If you already have a file URL, use it directly; this command is unnecessary.
- Only resolves the address and returns the service fields; it does not download files, write local files, or calculate a fixed expiry time.
- A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.

#### Examples

```bash
bl file url --file-key example-file-key
```

```bash
bl file url --file-key example-file-key --dry-run
```
