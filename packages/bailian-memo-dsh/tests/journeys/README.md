# Memo J6–J8 real-cloud journeys

These tests exercise production hooks and tools inside a **controlled host harness** against real Memory APIs. They do not certify a running dsh application, Settings UI, native Storage Domain, or a real Skill agent session.

Run sequentially after CLI J1–J5:

```sh
BAILIAN_MEMORY_JOURNEYS=1 BAILIAN_MEMORY_CURATOR_MODEL=qwen3.8-max pnpm exec vp test packages/bailian-memo-dsh/tests/journeys --maxWorkers=1
```

Repository test setup loads `.env`; required keys are `DASHSCOPE_API_KEY` and `BAILIAN_WORKSPACE_ID`. Values are never printed. J8 requires an explicit `BAILIAN_MEMORY_CURATOR_MODEL`. Without one it writes BLOCKED evidence and skips instead of counting deterministic output as live curation.

- J6: isolated personal file, pause, recreate lifecycle/hooks, no recall/model/write requests while paused, resume same identity, new fact without paused-period backfill.
- J7: actual test schema, v2 shared file, plugin migration/pause/resume preserves Skill metadata, direct API write visible in plugin search and plugin write visible in direct list, mismatched binding fails before HTTP. This simulates Skill/CLI contracts, not actual Skill execution.
- J8: actual curator hook using real DashScope completion adapted to dsh chunks, reopen filesystem-backed test TaskStore, production poller reaches terminal success, cloud readback, actual remember/forget tools with synthetic approval, same fact remembered after forgetting, same-turn explicit-remember suppression.

Every test uses a UUID user and temporary home; no real personal config is touched. Cleanup settles tracked events, paginates all nodes, deletes only synthetic-user nodes and test schemas, and checks empty readback. Failed cleanup fails the test. Service/model response bodies, credentials and conversations are excluded from reports.

Evidence JSON lives under `test/output/memory-plugin-journeys/`. Preserve its layer and blockers in summaries. Filesystem TaskStore and model adapter are harness components. Native dsh loading, provider routing, UI, approval integration and Storage Domain restart remain separate host acceptance work.

Cleanup also deletes node IDs learned from terminal event results, even if list indexing has not exposed them yet. Every schema create records its synthetic name before HTTP; a missing receipt remains an explicit incomplete-cleanup entry requiring reconciliation. Only confirmed node deletion or HTTP 404 marks a node deleted.
