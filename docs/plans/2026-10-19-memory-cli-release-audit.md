# Memory CLI release audit implementation plan

> Execution: subagent-driven-development for isolated async fixes and independent review; parent owns CLI contract matrix and packaged installation smoke. No publishing or commits requested.

**Goal:** Decide release readiness from command contracts, risk coverage and installed package evidence, excluding actual dsh/Skill hosts.

**Architecture:** Audit the 13 registered Memory commands against their help, transport and tests. Reproduce confirmed defects before minimal fixes. Build and pack local core/runtime/commands/cli, install tarballs in an isolated temporary prefix, and test the installed executable rather than a source harness.

**Tech Stack:** TypeScript, Vite+, Node test runner, pnpm pack/npm install, real Memory APIs for synthetic-data smoke.

- [x] Inventory every command, defaults, scope, output and destructive behavior in `docs/memory/2026-10-19-cli-release-audit.md`; map risk to exact test files.
- [x] Reproduce empty async event success / unbounded polling using `memory-poll-event.test.ts`; fix and test deadlines, partial failures and missing receipt semantics in add/poll only.
- [x] Audit parameter shapes, scope and destructive guards; add focused regression cases for confirmed high-risk gaps before fixing them.
- [x] Run Memory-only offline E2E and units with live gating explicitly disabled; run any necessary new live scenarios using synthetic resources with tracked cleanup.
- [x] Build and pack CLI dependency closure; install local tarballs into temporary prefix and isolated HOME. Verify version/all Memory help, dry-run, missing args/auth, delete confirmation, and live save/read/update/delete through installed bin.
- [x] Review final patches for contract compliance and implementation quality. Run check/targeted tests and document PASS/FAIL/BLOCKED evidence and release recommendation without claiming out-of-scope coverage.

Release decision correction: the user clarified that min_score only applies to pro. The former lite blocker was an incorrect test expectation, now corrected in help, examples, guide and live tests. Focused live revalidation passed for lite/pro/default (3 tests), offline search/parameter regression passed (132 tests), and rebuilt installed package live smoke passed (33 checks, cleanup complete). Final decision: GO within the agreed Memory CLI scope; actual publication remains a separate CI action. See the audit report for evidence.
