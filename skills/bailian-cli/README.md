# bailian-cli

> [中文版 / Chinese →](README.zh.md)

Agent skill for **Alibaba Cloud Model Studio CLI** (`bl`) resource hub — apps, memory, RAG, usage/quota, MCP, and hub `reference/`.

- Companion (required): `bailian-protocol` (`requires.bins: ["bl"]`, `companions: ["bailian-protocol"]`)
- Soft hand-offs (optional skills): `bailian-gen` · `bailian-finetune` · `bailian-managed-agent`

```bash
npx skills add modelstudioai/cli --all -g
# or: npx skills add modelstudioai/cli -g -s bailian-protocol -s bailian-cli
```

For CLI installation, authentication, and examples, see the [main README](../../README.md).

## License

Apache-2.0
