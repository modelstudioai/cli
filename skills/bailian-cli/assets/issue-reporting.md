# Report a CLI bug (GitHub Issue)

> Hand-maintained. Lives in `assets/` (not auto-generated from `catalog.ts`).
> Entry point: [SKILL.md → CLI errors: report an issue](../SKILL.md#cli-errors-report-an-issue).

When `bl` fails, the agent first helps the user fix the problem. If the failure looks like a **CLI bug** (not usage, auth, quota, or other user/service-side errors), ask whether to open a GitHub Issue for the Bailian CLI team.

**Issue tracker:** [https://github.com/modelstudioai/cli/issues](https://github.com/modelstudioai/cli/issues)

---

## Decision flow

```pseudocode
function shouldOfferIssueReport(exitCode, apiCode, message, hint):

  # Step 1: Unambiguous EXCLUDE by exit code
  if exitCode in [2 (USAGE), 3 (AUTH), 4 (QUOTA), 10 (CONTENT_FILTER)]:
    return EXCLUDE  # help user fix; never offer reporting

  # Step 2: NETWORK / TIMEOUT — exclude if hint is actionable
  if exitCode in [5 (TIMEOUT), 6 (NETWORK)] AND hint is actionable:
    return EXCLUDE  # user can self-service (DNS, proxy, --timeout, base_url)

  # Step 3: GENERAL (exit code 1) — shared by CLI bugs AND service passthrough
  #          MUST inspect api_code / message to disambiguate
  if exitCode == 1 (GENERAL):
    if matchesExcludePatterns(apiCode, message):  # see § Message patterns
      return EXCLUDE  # service-side error, not a CLI bug

  # Step 4: Check INCLUDE criteria
  if matchesIncludeCriteria(exitCode, apiCode, message):
    return INCLUDE  # ask user once → collect → submit

  # Step 5: Ambiguous — default to EXCLUDE
  return EXCLUDE  # unless strong evidence of a CLI bug


function matchesExcludePatterns(apiCode, message):
  # Case-insensitive match on api_code or error.message
  EXCLUDE_PATTERNS = [
    /ModelNotFound|model not found|does not exist/i,
    /InvalidParameter|invalid_request_error/i,
    /InvalidApiKey|Unauthorized|Access denied/i,
    /QuotaExceeded|insufficient quota|free tier|rate limit/i,
    /ContentFilter|content filter|inappropriate content/i,
    /File not found|Permission denied/i,
  ]
  return any(pattern.test(apiCode or message) for pattern in EXCLUDE_PATTERNS)


function matchesIncludeCriteria(exitCode, apiCode, message):
  return any of:
    - exitCode == 1 AND NOT explained by service error (e.g. "no images returned", SSE parse failure)
    - non-BailianError with stack trace (unhandled crash)
    - same request works via curl / OpenAI SDK (CLI-specific failure)
    - regression after `bl update`
    - `--output json` produces malformed / incomplete output
    - `--dry-run` passes but real run fails (not AUTH/QUOTA)
    - message vs hint vs exit code contradict each other
    - exitCode 5/6 persists after env fixes + 3 retries
```

> **Key point:** Exit code **1** (GENERAL) is shared by both CLI bugs and service-passthrough errors (all HTTP 4xx/5xx from `mapApiError` map to GENERAL). You **must** run `matchesExcludePatterns` on `api_code` and `error.message` before considering INCLUDE — see [EXCLUDE message patterns](#message-patterns-that-usually-mean-exclude).

---

## EXCLUDE — do not offer issue reporting

These are **user**, **environment**, or **service business** errors. Give fix hints; do not ask to file an issue.

| Category                   | Signal                                 | Examples                                                                        |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **Usage / args**           | Exit code **2** (USAGE)                | Missing flag, invalid path, unknown subcommand, local file not found            |
| **Auth**                   | Exit code **3** (AUTH)                 | No API key, invalid key, expired console token                                  |
| **Quota**                  | Exit code **4** (QUOTA)                | Free tier exhausted, rate limit / quota messages                                |
| **Content filter**         | Exit code **10** (CONTENT_FILTER)      | Content moderation blocked the request                                          |
| **Model not found**        | Message or `api_code`                  | `ModelNotFound`, `invalid_request_error` naming a bad model, HTTP 404 for model |
| **Invalid API params**     | USAGE or service validation            | `InvalidParameter`, `invalid_request_error` for bad `--size`, `--format`, etc.  |
| **Free quota query**       | `bl usage free` business result        | Quota used up — not a CLI defect                                                |
| **Obvious local env**      | Hint is sufficient                     | `ENOENT` / `EACCES`, wrong file path, disk full                                 |
| **Network (self-service)** | Exit code **6** (NETWORK) + clear hint | DNS, proxy, TLS — user fixes `DASHSCOPE_BASE_URL`, proxy, or network            |
| **Timeout (self-service)** | Exit code **5** (TIMEOUT) + hint works | Increase `--timeout`, check `base_url` with `bl auth status`                    |

**Rule:** If the authoritative source of the error is the **service response** or **user input**, treat it as non-reportable (same boundary as the CLI repo’s error-handling docs).

### Message patterns that usually mean EXCLUDE

Match case-insensitively on `Error:` line, `api_code`, or JSON `error.message`:

- `ModelNotFound`, `model not found`, `does not exist` (model name)
- `InvalidParameter`, `invalid_request_error` (parameter validation)
- `InvalidApiKey`, `Unauthorized`, `Access denied` (auth — also exit 3)
- `QuotaExceeded`, `insufficient quota`, `free tier`, `rate limit`
- `ContentFilter`, `content filter`, `inappropriate content`
- `File not found:`, `Permission denied` (USAGE / local FS)

---

## INCLUDE — offer issue reporting

Offer reporting when **none** of EXCLUDE applies **and** any of the following holds:

| Category                       | Signal                                                             | Examples                                                                                       |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **CLI internal logic**         | Exit code **1** (GENERAL), not explained by service business error | Task succeeded but “no images returned”, SSE parse failure, missing download URL after success |
| **Unhandled crash**            | Non-`BailianError`, stack trace                                    | Unexpected `TypeError`, uncaught exception                                                     |
| **API works, `bl` fails**      | Same request via curl/OpenAI SDK succeeds                          | Request body, upload, polling, or response parsing bug                                         |
| **Regression**                 | After `bl update` or skill version bump                            | Worked on prior version, breaks on current                                                     |
| **Output format bug**          | `--output json` malformed or missing fields                        | Breaks agent/CI integration                                                                    |
| **dry-run mismatch**           | `--dry-run` passes, real run fails (not AUTH/QUOTA)                | Validation path ≠ execution path                                                               |
| **Contradictory CLI output**   | Message vs hint vs exit code disagree                              | Misleading auth or usage signal from CLI itself                                                |
| **Persistent NETWORK/TIMEOUT** | Exit 5/6 after env fixes and repro on multiple tries               | Possible CLI or gateway defect                                                                 |

### Before offering to report

1. Align versions: [SKILL.md → Version & updates](../SKILL.md#version--updates-agent--do-first) — run `bl update` and `npx skills add modelstudioai/cli --all -g -y` if mismatched.
2. Confirm `bl auth status` is healthy (for commands that need auth).
3. Retry once with `--verbose` if stderr was thin.

If it still fails with INCLUDE signals → offer reporting.

---

## Agent constraints

| Situation                     | Behavior                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| **CI / non-TTY automation**   | Do **not** ask proactively. Only report if the user explicitly requests it.      |
| **Same error in one session** | Ask **at most once** per distinct failure.                                       |
| **User declines**             | Stop asking; continue troubleshooting or alternate tools.                        |
| **Secrets**                   | Never paste raw API keys or tokens into the issue (see [Redaction](#redaction)). |

---

## User prompt (ask once)

When INCLUDE matches, ask in **Chinese** (adjust if the user prefers English):

> The `bl` command hit what looks like a CLI bug.
> Would you like help gathering details to file a GitHub Issue with the Bailian CLI team?
> API Keys will be redacted automatically before submission; you can also copy the template and submit yourself.

If the user agrees → [Collect information](#collect-information) → [Submit](#submit).

---

## Collect information

Run these commands and paste results into the issue template (redact first).

| Field               | How to obtain                                              |
| ------------------- | ---------------------------------------------------------- |
| CLI version         | `bl --version`                                             |
| Skill version       | `metadata.version` in installed `SKILL.md` frontmatter     |
| Node version        | `node --version`                                           |
| OS                  | `uname -a` (Linux/macOS) or `sw_vers` (macOS)              |
| Region              | `bl auth status` or `bl config show` (redacted)            |
| Command             | Exact command the user ran (redacted)                      |
| stderr / text error | Original failure output; re-run with `--verbose` if needed |
| Structured error    | Re-run with `--output json` on the same command            |
| Repro steps         | Numbered 1-2-3                                             |
| Expected vs actual  | One sentence each                                          |
| Frequency           | Always / sometimes / once                                  |

### Redaction

Before any paste or `gh issue create`:

- Replace `sk-...`, `--api-key ...`, `DASHSCOPE_API_KEY=...`, console tokens → `[REDACTED]`
- Replace `DASHSCOPE_BASE_URL` values that point to internal/VPC endpoints → `[REDACTED_URL]`
- Replace `Authorization: Bearer ...` headers in verbose output → `Authorization: Bearer [REDACTED]`
- Redact `--prompt` / `--message` / `--biz-params` contents if they contain user business data → summarize as `[user prompt about <topic>]`
- Redact `account`, `uid`, `aliuid` from `bl auth status` output → `[REDACTED]`
- Redact sensitive fields from `bl config show` (keep non-secret keys like `base_url`, model defaults)
- **Keep** `Request ID` / `request_id` — helps the team trace logs
- Local paths may stay or be generalized (`~/path/to/file.png`)

**Principle:** Anything that could identify the user's account, credentials, internal infrastructure, or business content must be redacted. When in doubt, redact.

### Optional verbose re-run

```bash
# Same command as the user. --verbose prints HTTP request/response details;
# DASHSCOPE_VERBOSE=1 adds the stack trace for uncaught errors.
DASHSCOPE_VERBOSE=1 bl <...original args...> --verbose --output json 2>verbose-stderr.txt
```

Capture full stderr (`verbose-stderr.txt`) and JSON `error` object from stdout.

**Note for async/paid commands** (e.g. `bl video generate`, `bl image generate`): re-running consumes quota. Prefer adding only `--dry-run --output json` to capture the request payload without actually invoking the API. If the error occurs during polling/download (not request building), a full re-run is needed — warn the user about quota cost first.

---

## Issue template

Copy into the GitHub issue body (or pass to `gh issue create --body-file`).

**Title format:** `[bug] <command> <short symptom>`

Example: `[bug] video generate no download URL after task SUCCEEDED`

Prefer the GitHub form when submitting via browser: [bug_report.yml](https://github.com/modelstudioai/cli/issues/new?template=bug_report.yml)

For `gh issue create --body-file` or manual paste, use:

````markdown
## Environment

- CLI: bl X.Y.Z
- Skill: X.Y.Z
- Node: vXX.X.X
- OS: ...
- Region: cn | us | intl

## Reproduce

```bash
bl ... --verbose   # API key redacted
```

## Expected

What should have happened.

## Actual

What happened instead.

## Full output

```
Error: ...
Hint: ...
Status: HTTP ... (...)
Request ID: ...
Exit code: ...
```

## JSON error (if any)

```json
{
  "error": {
    "code": 1,
    "message": "...",
    "http_status": ...,
    "api_code": "...",
    "request_id": "..."
  }
}
```

## Already tried

- `bl update` and skill version aligned with CLI
- `bl auth status` OK for this command
- Different network / region — still reproduces

## Notes

- Frequency: always / intermittent / once
- Invoked via: terminal / agent (Cursor, etc.)
````

---

## Check for duplicates

Before submitting, search existing issues to avoid duplicates:

```bash
# If gh is available:
gh issue list --repo modelstudioai/cli --search "<error keyword or command name>" --state open --limit 10
```

Or search manually: [open issues](https://github.com/modelstudioai/cli/issues?q=is%3Aissue+is%3Aopen)

If a matching open issue exists:

- Tell the user the existing issue URL
- Offer to add a comment with their reproduction details (new environment/version info helps the team)
- Do **not** create a duplicate issue

---

## Submit

### Pre-submit confirmation

Before submitting, **always show the redacted issue body to the user** and ask for confirmation:

> Below is the redacted Issue content to be submitted—confirm submission?
> show body

Only proceed after the user confirms.

### Option A — GitHub CLI (`gh`)

Preferred when `gh` is installed and authenticated (`gh auth status` succeeds).

```bash
gh issue create \
  --repo modelstudioai/cli \
  --title "[bug] <command> <short symptom>" \
  --body-file /path/to/redacted-issue.md
```

Or use the form template directly:

```bash
gh issue create --repo modelstudioai/cli --template bug_report.yml
```

Tell the user the issue URL returned by `gh`.

> Do not pass `--label` unless you have confirmed the label exists in the repo (`gh label list --repo modelstudioai/cli`); `gh issue create` fails if the label is unknown.

### Option B — Browser

1. Open [https://github.com/modelstudioai/cli/issues/new?template=bug_report.yml](https://github.com/modelstudioai/cli/issues/new?template=bug_report.yml)
2. Fill in the **Bug Report** form (fields match the template above)
3. Submit

### Fallback — `gh` not available

If `gh` is not installed or not authenticated:

1. Write the complete redacted issue body to a local file (e.g. `./cli-bug-report.md`)
2. Print the file content to the user
3. Provide the direct URL: [https://github.com/modelstudioai/cli/issues/new?template=bug_report.yml](https://github.com/modelstudioai/cli/issues/new?template=bug_report.yml)
4. Instruct: "Open the link above in your browser and paste the content into the issue body to submit."

Do **not** block on `gh` — always provide a manual path.

---

## Exit codes (reference)

| Code | Name           | Usually reportable?                             |
| ---- | -------------- | ----------------------------------------------- |
| 0    | SUCCESS        | —                                               |
| 1    | GENERAL        | Sometimes (if CLI bug, not service passthrough) |
| 2    | USAGE          | No                                              |
| 3    | AUTH           | No                                              |
| 4    | QUOTA          | No                                              |
| 5    | TIMEOUT        | Rarely (after user fixes env)                   |
| 6    | NETWORK        | Rarely (after user fixes env)                   |
| 10   | CONTENT_FILTER | No                                              |

JSON errors use the same numeric `error.code` field when `--output json` is set.
