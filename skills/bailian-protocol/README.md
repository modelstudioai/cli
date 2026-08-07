# bailian-protocol

Shared execution protocol for the **bailian-\*** Agent Skill family (consent, versioning, setup/auth, issue reporting).

Business skills (`bailian-cli`, `bailian-gen`, `bailian-finetune`, `bailian-managed-agent`) read this skill before running `bl`. **Supported install** is the full family:

```bash
npx skills add modelstudioai/cli --all -g
```

The Agent Skills / `npx skills` installer does **not** auto-resolve skill dependencies. Prefer `--all -g` over subset `-s` installs.

For CLI installation and command examples, see the [main README](../../README.md).

## License

Apache-2.0

<!-- sync pipeline verification -->
