# Memory fixes and live acceptance

Approved scope: fix the six review findings, implement J1–J8, run available live paths, and explicitly report unavailable host/service capabilities. Preserve the existing release-workflow working-tree changes.

## Execution checklist

- [x] Fix memo startup pause handling, bounded/cancellable recall, shared v2/v3 profile binding, and per-operation deduplication. Add failing regression tests before fixes in `packages/bailian-memo-dsh/tests`, then run the package tests and build.
- [x] Fix `kb_manage` service refresh in `packages/bailian-kb-dsh/src/index.ts`, with a regression covering the callback and persisted cache. Run plugin tests/build.
- [x] Run the existing failing `packages/cli/tests/skill-memory-reference.test.ts`, synchronize skill assets, and rerun it.
- [x] Implement CLI live journeys under `packages/commands/tests/e2e/memory/journeys`: initial save, fresh reader, correction, forget/re-remember, and profile evolution. Use real subprocess CLI, fresh user IDs, explicit terminal/readback assertions, bounded eventual-consistency polling, and tracked cleanup.
- [x] Implement memo lifecycle journeys for pause/restart/resume, shared identity roundtrip, automatic curation and task recovery. Distinguish real cloud requests with a controlled host harness from full real-host conversation acceptance. Record host prerequisites and an executable/manual protocol for parts needing a running dsh/Skill host; never count mocked host behavior as live host acceptance.
- [x] Add strict acceptance entry and reporting: missing prerequisite is blocked/nonzero rather than silently passing all skipped tests; normal test runs remain opt-in. Default-library journeys require workspace/key, not an explicit library ID.
- [x] Execute available live journeys with synthetic data only. Record PASS/FAIL/BLOCKED, request/event evidence, cleanup status and blockers. No credential values in output or artifacts.
- [x] Run `pnpm exec vp check`, targeted unit/regression tests, plugin builds; review spec compliance and code quality. Do not stage/commit unrelated work.

## Journey requirements

| ID  | Scenario                     | Hard closure                                                                                                                              |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | Consent/first save           | No pre-consent upload in host; terminal async result plus node/search readback                                                            |
| J2  | Fresh conversation/reader    | Recall stored fact without providing answer; second user cannot recall owner node                                                         |
| J3  | Correct preference           | New fact readable/searchable; host answer uses current rather than superseded preference                                                  |
| J4  | Forget then remember         | Deleted node inactive/absent from list/search; control fact retained; independent new submission restores fact                            |
| J5  | Profile evolution            | Dedicated test schema, actual extracted values, correction readback, schema cleanup                                                       |
| J6  | Pause/restart/resume         | Restart preserves pause, no automatic requests while paused, identity stable, no backfill                                                 |
| J7  | Skill/plugin shared identity | Profile binding survives migration/state changes, both sides read/write same identity; mismatch rejected                                  |
| J8  | Auto-curation/task recovery  | Durable fact submitted, temporary fact skipped, submitted task survives storage reopen, same-turn explicit remember suppresses auto write |

## Validation contract

Use API-key/workspace from configured test environment without printing values. Default library scopes are independent of optional explicit-library/skill-project fixtures. CLI and host evidence are separate. Test labels must say whether host is controlled or real. Poll reads, never blindly retry an ambiguous write. Register nodes/schemas immediately, await pending writes before cleanup, preserve resource IDs when cleanup is incomplete. Only synthetic conversation contents may be recorded. Missing live credentials, unavailable permissions, missing dsh executable/model route, and unavailable exact profile-value deletion are distinct blockers.
