# bailian-protocol

Shared execution protocol for the **bailian-\*** Agent Skill family (consent, versioning, setup/auth, issue reporting).

Business skills (`bailian-cli`, `bailian-gen`, `bailian-finetune`, `bailian-managed-agent`) read this skill before running `bl`. **Supported install** is the full family:

```bash
bl skill init
```

Use `bl skill init`. Subset installs should explicitly include `bailian-protocol` when needed.

For CLI installation and command examples, see the [main README](../../README.md).

## License

Apache-2.0
