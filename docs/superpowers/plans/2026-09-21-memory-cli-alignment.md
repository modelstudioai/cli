# Memory CLI 0921 Alignment Implementation Plan

> Execute inline against the existing working tree. The reviewed 0921 contract and the user's instruction to align the current CLI define the accepted scope. Preserve all pre-existing changes.

**Goal:** Align existing memory CLI requests, types, help and regression coverage with the 0921 verified contract.

**Architecture:** Keep workspace routing and the async add workflow. Preserve existing CLI spelling for repeated project/type flags. Keep update/delete --user-id as an optional compatibility input, omit it from wire requests. Add public profile_only and schema extract_scene options. Internal/project/entity APIs are not new CLI commands in this change.

**Tech Stack:** TypeScript command definitions, shared core interfaces, vite-plus tests, generated skill reference.

## 1. Regression tests

- [x] Add offline process-level cases in `packages/commands/tests/e2e/memory/memory-alignment.e2e.test.ts`: custom content uses project_id, messages uses project_ids (max five), custom content rejects multiple projects, profile_only requires schema/messages and rejects content, update/delete need no user_id, schema extract_scene serializes, long descriptions pass local validation, empty description clears it.
- [x] Change stale assertions in memory-add/update/delete/profile-create tests to the verified behavior. Keep compatibility-flag coverage and deletion confirmation coverage.
- [x] Add a replayed user_profile response test in `packages/commands/tests/memory-output.test.ts` and exercise RUNNING in the existing poll test.
- [x] Run targeted tests and verify failures identify the known drift before implementation.

## 2. Commands and core types

- [x] `add.ts`: set `body.project_id = flags.projectId[0]` for content; otherwise `body.project_ids = flags.projectId`. Validate one/five project limits. Serialize `extract_mode` and render `user_profile` with attribute names.
- [x] `update.ts` / `delete.ts`: optional compatibility userId, remove from request, describe omitted timestamp and delete status accurately; preserve high-risk gate.
- [x] `profile-create.ts` / `profile-update.ts` / `shared.ts`: add extractScene; remove fixed schema description limit; preserve empty description on PATCH; clarify scope/default billing help.
- [x] `api.ts`: project_id, extract_mode, RUNNING, resource_type, memory_type/name, skill export metadata, profile extract_scene/immutable, optional response fields; remove stale camelCase/need_evidence claims.
- [x] Preserve JSON response passthrough and service errors. Do not add unverified internal controls or change gateway defaults.

## 3. Validation and reference

- [x] Run memory offline and existing scoped live tests; inspect resource cleanup and raw output.
- [x] Regenerate references through `pnpm --filter bailian-cli run generate:reference`.
- [x] Run `pnpm exec vp check` and relevant registry/core/command tests; identify unrelated baseline failures separately.
- [x] Review final diff against this turn's snapshot, record changes/tests/limits in the user-facing outputs directory. No commit or publish requested.

## Result

Memory live suite: 166/167 passed; the remaining skill search fixture omitted its project scope. After adding the project ID, the live skill chain passed on targeted rerun. Final affected regressions: 19 passed, 1 live case skipped in that offline run (previously passed live). Core/registry expansion: 529 passed, 11 environment-dependent agent detection failures in unchanged files. No code commit or publishing performed.
