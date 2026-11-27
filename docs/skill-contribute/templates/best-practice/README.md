# your-skill-name

Scene-oriented Bailian usage skill (best practice). Copy this folder to `skills/<name>/` and replace placeholders.

## Install

```sh
bl skill add --name bailian-protocol,your-skill-name
```

`bl skill init` installs official `bailian-*` skills only; this skill is installed on demand with the command above.

## Notes

- Keep `name` in `SKILL.md` identical to the directory name.
- `metadata.version` is yours to maintain; it is not locked to the CLI package version and is not the registry publish marker.
- Do not edit `skills/bailian-cli` in the same PR; if the hub should mention this skill, the Bailian team opens a separate PR.
