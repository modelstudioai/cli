# Version alignment & auto-update (agent)

> Hand-maintained. Lives in `bailian-protocol/assets/` (not auto-generated from command metadata).
> Entry point: [SKILL.md → Version & updates](../SKILL.md#version--updates-after-provider-selection-before-the-first-bl-command).

## Agent pre-flight checklist (MANDATORY)

**Do NOT run any `bl` command until you complete this checklist.** Run it **once per session**, before the first `bl` command. Cache the result — do not re-check before every command.

1. Read `metadata.version` from the installed `bailian-protocol/SKILL.md` frontmatter (all `bailian-*` skills share the same version).
2. Check the installed CLI version:
   ```bash
   bl --version
   ```
   If this fails, see [Missing `bl`](#missing-bl) below.
3. Compare the two versions (ignore the `bl` prefix; compare only `X.Y.Z`):
   - If `metadata.version` ≠ `bl --version`, refresh skills before doing anything else:
     ```bash
     npx skills add modelstudioai/cli --all -g -y
     ```
   - Do not trust a stale `reference/` when versions mismatch — flags may be wrong.
4. Check the latest published CLI version:
   ```bash
   npm view bailian-cli version
   ```
5. If the installed `bl` is **older** than the latest npm version, **STOP** the current task and **ask the user** (report skill version, installed CLI version, and npm latest):
   > A newer version of bl is available (current: X.Y.Z, latest: A.B.C). Upgrade before continuing?
   - **Do NOT auto-upgrade silently** — the user decides.
   - If the user agrees: run `bl update`, then continue. (`bl update` upgrades `bailian-cli` via npm and, on success, also runs `npx skills add modelstudioai/cli --all -g -y` to keep skills in lockstep across all agent apps.)
   - If the user declines: continue with the current version and note it in the summary.
   - If `npm view` / `bl update` fails (offline, registry blocked, permission): continue with the current `bl` and tell the user it could not be updated.
6. Only proceed with the user's actual task after the above is resolved.

---

## Missing `bl`

If `bl --version` fails, install the CLI and skills:

```bash
npm install -g bailian-cli
npx skills add modelstudioai/cli --all -g
```

Do not install a single business skill alone — use `--all -g` so `bailian-protocol` is present.

## Mention it in the task summary

If you ran `bl update`, include it in your end-of-task summary (see
[SKILL.md → Summarize what you did](../SKILL.md#summarize-what-you-did)), e.g.
"After upgrading bl from 1.3.2 to 1.3.3, I continued the task."。
