# ParseX CLI

ParseX exposes asynchronous document/media parsing and structured field extraction. The CLI calls the four public REST endpoints with the ordinary API key resolved by the existing authentication system.

Sources: [integration overview](https://docs.agent.bailian.aliyun.com/zh/parse/integration/overview), [API overview](https://docs.agent.bailian.aliyun.com/zh/api/parsex/overview), [parse submit](https://docs.agent.bailian.aliyun.com/zh/api/parsex/parse-submit), [parse result](https://docs.agent.bailian.aliyun.com/zh/api/parsex/parse-result), [extract submit](https://docs.agent.bailian.aliyun.com/zh/api/parsex/extract-submit), [extract result](https://docs.agent.bailian.aliyun.com/zh/api/parsex/extract-result), [OSS integration](https://docs.agent.bailian.aliyun.com/zh/parse/integration/parse-x-oss-integration).

## Setup

- Supply an ordinary API key through the existing profile or `DASHSCOPE_API_KEY`. Token Plan subscription keys are not ParseX credentials.
- Workspace resolution: `--workspace-id` → `BAILIAN_WORKSPACE_ID` → profile `workspace_id`.
- Default origin: `https://<workspace-id>.cn-beijing.maas.aliyuncs.com`; prefix: `/api/v2/apps/parse-x`.
- An explicit `--base-url`, `DASHSCOPE_BASE_URL`, or profile `base_url` overrides the origin. The shared CLI resolver discards any URL path. Workspace origins under `cn-beijing.pre-maas.aliyuncs.com` select `/api/v2/apps/pre-parse-x`. Use the environment assigned to your workspace.
- The integration overview still labels production rollout as pending. Actual availability depends on the workspace/environment; service errors pass through unchanged.
- Inputs must be accessible HTTP(S) URLs, including signed OSS URLs. No local upload endpoint is documented for ParseX; these commands do not upload local files or create storage resources.

命令复用现有百炼鉴权和 Profile，默认使用北京业务空间域名。输入使用可访问 URL；本地文件需先由调用方存放到可访问的位置。

## Parse documents and media

```bash
bl parsex parse submit --workspace-id ws-example \
  --file-url "https://example.com/document.pdf" --file-name document.pdf \
  --output-file-format markdown --output json

# Use data.biz_id from the submission response.
bl parsex parse result --workspace-id ws-example \
  --biz-id parse-example --follow --poll-timeout 600 --output json
```

`--file-name-extension pdf` is an alternative to `--file-name`. Use `--config-id` for saved settings or `--processing-file processing.json` for the contents of the API `processing` field. Inline processing takes precedence over saved settings when both are provided. Optional booleans preserve explicit `false`; omitted values retain service defaults.

Document `processing.json`:

```json
{
  "doc_processing_config": {
    "page_index": "1-10",
    "head_foot": false,
    "layout_position": true,
    "image_caption": true
  }
}
```

Media `processing.json` (use the same command with a media URL):

```json
{
  "media_processing_config": {
    "enable_diarization": true,
    "enable_synopsis_parse": true,
    "enable_synopsis_segments": true,
    "enable_synopsis_summary": true,
    "frame_extraction": { "mode": "auto", "output_image_width": 1024 }
  }
}
```

The alternative `frame_rate` mode requires `frame_rate` from 0.2 to 5. Frame dimensions, when set, must be integers from 32 to 4096. Media segments and synopsis fields are preserved in JSON output. `--layout-table-format html` selects HTML tables inside Markdown output.

## Extract fields

Save a JSON Schema **object** to `schema.json`:

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "Document title" }
  }
}
```

```bash
bl parsex extract submit --workspace-id ws-example \
  --parsed-file-biz-id parse-example --schema-file schema.json \
  --citation-required true --allow-inference false --output json

bl parsex extract result --workspace-id ws-example \
  --biz-id extract-example --follow --output json
```

Alternatively, supply `--file-url "https://example.com/document.pdf"` instead of `--parsed-file-biz-id`. Exactly one source is required. Extraction does not support audio/video; reused parsing results must still exist and be reusable. No retention duration is hard-coded because the published pages differ on that limit.

`--schema-file` constructs `processing.extract_processing_config.extract_schema`. `--user-prompt`, `--citation-required` and `--allow-inference` are available with this shortcut. For a full inline configuration, use `--processing-file` instead:

```json
{
  "user_prompt": "Extract the document title",
  "extract_processing_config": {
    "extract_schema": {
      "type": "object",
      "properties": { "title": { "type": "string" } }
    },
    "citation_required": true,
    "allow_inference": false
  }
}
```

Or use `--config-id` for a saved Extract configuration. Schema is sent as an object, consistent with the API field definition and examples; the conflicting sentence describing a JSON string is not used. Results retain `extract_result_json`, `fields`, citations and `request_id` without flattening.

## OSS output

`--oss-config-file /secure/path/oss.json` reads an object containing `bucket`, `endpoint`, `access_key_id`, `access_key_secret`, and optional `security_token`. Keep the file outside source control, restrict its permissions, and use fresh STS credentials when appropriate.

- Submit maps the object to `output.oss_config`; `bucket` and `endpoint` are required.
- Result maps credential fields to **top-level** `oss_config`, following the individual endpoint parameter tables. The same file can be reused; `bucket` and `endpoint` are not sent on queries.
- The CLI does not persist these credentials. Dry-run redacts all three credential fields and source URL query strings. Verbose HTTP logging does not print the request body.

The individual result parameter tables take precedence over the general OSS page's conflicting nesting description. OSS policies, credential issuance and bucket creation remain caller responsibilities.

## Polling and output

| Behavior                   | Contract                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `submit`                   | One POST; immediately returns `data.biz_id`; never automatically retries                          |
| `result`                   | One POST; preserves the response; successfully querying a `failed` task exits 0                   |
| `result --follow`          | Polls until `success` or `failed`; unknown nonterminal states do not imply completion             |
| `ResultNotReady`           | Continues polling only with `--follow`; other service errors pass through                         |
| `--interval`               | Integer seconds, 1–3600; default 2; requires `--follow`                                           |
| `--poll-timeout`           | Total deadline including in-flight HTTP requests, 1–86400 seconds; default 600                    |
| `--timeout`                | Existing per-request HTTP timeout                                                                 |
| Exit codes with `--follow` | Success 0; failed task/service error 1; invalid arguments 2; client deadline 5; Ctrl-C 130        |
| `--output json`            | One final response on stdout; progress on stderr                                                  |
| `--quiet`                  | Submit prints only biz_id; result prints only status                                              |
| `--dry-run`                | Validates local input and prints a redacted request; no business requests or business file writes |

Ctrl-C or timeout stops local polling without cancelling the task. Keep `biz_id` and use `result` to resume. A lost submit response does not prove that no task was created; check before resubmitting. Framework telemetry/update checks follow their existing settings.

Parsing queries support `--step-start` and `--step-size` (nonnegative integers). They request one slice of document `layouts` or media `segments`. `--follow` waits for completion for that slice; it does not aggregate or automatically advance slices. Advance the offset explicitly for further results. Output file URLs may appear only after all result slices have been fetched. URLs are returned as provided, without downloading or overwriting files.

单次查询保留服务端完整响应。持续查询的 stdout 只输出最终结果，进度写入 stderr；超时或中断后可用原 `biz_id` 继续查询。分片需显式推进，CLI 不将首个分片当作完整文档，也不自动下载结果 URL。

## Verification

Offline tests exercise the real CLI parser, auth middleware and HTTP client against local fixtures:

```bash
pnpm exec vp test packages/commands/tests/e2e/parsex.e2e.test.ts
```

The live parse/extract chain in the same file is opt-in: set `DASHSCOPE_API_KEY`, `BAILIAN_WORKSPACE_ID` and `BAILIAN_E2E_PARSEX_FILE_URL` (an accessible PDF URL). It submits real jobs and may incur normal service charges. Offline fixture success alone is not evidence of service acceptance.
