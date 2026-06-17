# Version alignment & auto-update (agent)

> Hand-maintained. Lives in `assets/` (not auto-generated from `catalog.ts`).
> Entry point: [SKILL.md → Version & updates](../SKILL.md#version--updates-agent--do-first).

**Why this matters for agents:** when `bl` runs interactively it prints an
`Update available` banner. That banner is **suppressed when `bl` is piped by an
agent** (non-TTY stderr), so the user never learns their `bl` is outdated. The
agent must take over that responsibility.

Run this flow **once per session**, before the first `bl` command.

---

## 1. Align the skill with the installed CLI

1. **Skill version** — `metadata.version` in this skill's `SKILL.md` frontmatter.
2. **CLI version** — `bl --version` (output `bl X.Y.Z`; compare only `X.Y.Z`).
3. If the two strings **differ**, refresh the skill first:
   ```bash
   npx skills update bailian-cli -g -y
   ```

Do not trust a stale `reference/` when versions mismatch — flags may be wrong.

## 2. Check the CLI against the latest published release

```bash
npm view bailian-cli version    # latest on npm
```

Compare with `bl --version`. If the installed `bl` is **older** than the latest:

```bash
bl update
```

`bl update` upgrades `bailian-cli` via npm and, on success, also runs
`npx skills update bailian-cli -g -y` to keep the skill in lockstep.

## 3. Auto-update policy

- When `bl` is older than the latest release, **run `bl update` automatically**,
  then continue the user's task with the upgraded binary.
- Do this **at most once per session** (cache the result; do not re-check before
  every command).
- If `npm view` / `bl update` fails (offline, registry blocked, permission), do
  **not** block the task — continue with the current `bl` and tell the user it
  could not be updated.
- After re-check, confirm `bl --version` matches the updated skill's
  `metadata.version`.

## 4. Missing `bl`

If `bl --version` fails, install the CLI and skill:

```bash
npm install -g bailian-cli
npx skills add modelstudioai/cli --all -g
```

## 5. Mention it in the task summary

If you ran `bl update`, include it in your end-of-task summary (see
[SKILL.md → Summarize what you did](../SKILL.md#summarize-what-you-did)), e.g.
"After upgrading bl from 1.3.2 to 1.3.3, I continued the task."。
