---
name: your-skill-name
metadata:
  version: "0.1.0"
description: >-
  Replace this with WHAT the skill does, WHEN to use it, and WHEN not to use it.
  Avoid overlapping the same intents already owned by bailian-* family skills
  (media → bailian-gen, fine-tune → bailian-finetune, agents.yaml → bailian-managed-agent,
  sandbox → bailian-sandbox, knowledge → bailian-knowledge, web search routing → bailian-web-search,
  hub resource commands → bailian-cli).
---

# Your skill title

Replace the placeholders below. Keep the "Bailian skills by name" section as an execution checklist.

## Bailian skills by name (keep this section)

Before running any `bl` command:

1. Look up the installed skill named `bailian-protocol` (shared consent, version preflight, auth, call attribution, error reporting). If it is installed, Read it and follow it. If it is missing, stop and tell the user to run:

   ```sh
   bl skill add --name bailian-protocol,your-skill-name
   ```

   Do not treat a relative path such as `../bailian-protocol/SKILL.md` as a hard requirement for continuing.

2. When the task needs a Bailian domain skill (for example image/video → `bailian-gen`, fine-tune → `bailian-finetune`), look it up **by skill name**. If installed, Read it; if missing, suggest `bl skill add --name <skill>` or fall back to `bl <command> --help`. Do not require `../bailian-*/SKILL.md` paths to exist.

3. Do not auto-append `--yes` for high-risk commands. Ask the user to confirm when the CLI requires confirmation.

**Install (supported for this skill):**

```sh
bl skill add --name bailian-protocol,your-skill-name
```

This skill does **not** need to be listed in the hub skill `bailian-cli` to work after install.

## When to use

- …

## When not to use

- Ordinary Q&A / coding / writing the host agent can do without Bailian → do not trigger
- …

## Workflow

See [references/workflow.md](references/workflow.md).

## Quick examples

Keep examples scoped to this skill. Prefer bare `bl …` in docs; wrap with call attribution only when actually executing (see `bailian-protocol` if installed).

```sh
bl <command> --help
```
