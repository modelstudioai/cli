# Contributing to bailian-cli

Developer guide for `bailian-cli` — the official CLI for Aliyun Model Studio (DashScope). For end-user usage, see [README.md](README.md).

[中文版](CONTRIBUTING.zh.md) · [README](README.md) · [Changelog](CHANGELOG.md)

## Prerequisites

- Node.js ≥ 22.12 (required for developing this repo)
- End users installing the published CLI only need Node.js >= 18.17
- pnpm 10.33.2 (`npm i -g pnpm@10.33.2`)
- A DashScope API key for running e2e tests

## Repository layout

```
bailian-cli/
├── packages/
│   ├── core/           # `bailian-cli-core` — auth, config, HTTP client, errors, types
│   ├── runtime/        # `bailian-cli-runtime` — CLI framework: parsing, help, middleware, output
│   ├── commands/       # `bailian-cli-commands` — reusable command implementations
│   ├── cli/            # `bailian-cli` — the full `bl` product entry
│   ├── kscli/          # `knowledge-studio-cli` — `kscli` entry, reuses commands/
│   ├── e2e/            # Shared e2e harness utilities (private)
│   └── bailian-kb-dsh/ # `bailian-kb-dsh` — DeepSeek Harness plugin (independent version & release)
├── skills/             # Agent skills installed by `bl skill init`
├── docs/agents/        # Scenario-based maintenance guides
├── tools/              # Release automation & reference generation
├── AGENTS.md           # Contract for AI agents
└── README.md
```

## Local setup

```bash
git clone https://github.com/modelstudioai/cli.git bailian-cli
cd bailian-cli
pnpm install
```

### Running the CLI from source

```bash
pnpm bl auth login --api-key sk-xxxxx
pnpm bl text chat --message "hello"
pnpm bl video generate --prompt "a cat walking"
```

## Common scripts

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm bl <args>` | Run the CLI from source                    |
| `pnpm dev`       | Watch-build `bailian-cli-core`             |
| `pnpm check`     | Format + lint + type check                 |
| `pnpm test`      | Unit + e2e (e2e needs `DASHSCOPE_API_KEY`) |
| `pnpm ready`     | Full pre-PR verification                   |

## AI Native engineering

This project treats AI agents as first-class maintainers. Three pieces of infrastructure make that work, and they're worth knowing about whether you're a human contributor or an agent:

- **[AGENTS.md](AGENTS.md) + [docs/agents/](docs/agents/)** — A contract for working in this repo. `AGENTS.md` gives the project map and a scenario index; each `docs/agents/<scenario>.md` breaks a recurring task (add a command, change a flag, add a model, change an error hint, …) into a checklist that can be followed end-to-end without prior exploration. New scenarios get sedimented back as they emerge — the docs grow with the project, not from a one-off design phase.

- **E2E test suite** — Cases under [packages/cli/tests/e2e/](packages/cli/tests/e2e/) cover the main flows across text / image / video / speech / understanding / knowledge / memory. They exercise the CLI as a black box against the live DashScope service, so behavior changes (yours or an agent's) are caught the way real users would experience them.

- **Main-flow stress tests** (`pnpm test:stress`) — Concurrent runs against all model capabilities to verify they stay stable under heavy request volume. Catches rate-limit edge cases, race conditions, and silent regressions that single-shot e2e can miss. Run before each release.

**If you are an AI agent working on this repo, read [AGENTS.md](AGENTS.md) first** — it's the entry point that routes you to the right scenario doc.

## Branching & PRs

- Branch from `main`. Name: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Run `pnpm check` before opening the PR.
- Keep PRs focused — one logical change per PR.
- Commit messages: imperative and scoped. Examples: `feat(image): add --negative-prompt`, `fix(auth): handle expired console token`.
- Do not bump `packages/*/package.json` versions in feature PRs.

## Reporting issues

Bug reports and feature requests both go to https://github.com/modelstudioai/cli/issues. For bugs, please include:

- CLI version (`bl --version`)
- Node version (`node --version`)
- Exact command that failed
- Full output (redact API keys)

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
