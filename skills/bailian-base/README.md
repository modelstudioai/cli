# bailian-base

Shared execution protocol for the **bailian-\*** Agent Skill family (consent, versioning, setup/auth, issue reporting).

Business skills (`bailian-cli`, `bailian-gen`, `bailian-finetune`, `bailian-managed-agent`) depend on this skill as a **companion**. Prefer:

```bash
npx skills add modelstudioai/cli --all -g
```

Or install a subset with `bailian-base` included, e.g.:

```bash
npx skills add modelstudioai/cli -g -s bailian-base -s bailian-gen
```

For CLI installation and command examples, see the [main README](../../README.md).

## License

Apache-2.0
