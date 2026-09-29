# Init sample search output implementation plan

**Goal:** Display the sample query and retrieved content after successful initialization; expose the complete successful response as `sampleSearch: { query, response }` in JSON.

**Architecture:** Return the successful search response from the existing polling loop. Preserve existing result fields, checkpoint format, error propagation and resource handling. Text output shows the matched sample document and a bounded excerpt with English/Chinese labels. No additional search request or new flags.

**Tech stack:** TypeScript, existing command/runtime output helpers, Vitest.

User approved this design in the current task. Execute inline in the current checkout.

- [x] Extend workflow tests to assert response preservation, including request ID, and exactly one search per successful first/reuse run. Extend command tests for JSON and bilingual text, and runtime E2E for the serialized field. Run the targeted tests and observe missing-output failures.
- [x] In `init-workflow.ts`, make `waitForSample` return a successful checked value. Return `sampleSearch` alongside `sampleMatched`. In `init.ts`, render the query, document name and a 400-character content excerpt from a node matching the sample; keep full JSON response unchanged.
- [x] Document output fields in `docs/knowledge/knowledge-cli-guide.md`. Run targeted init tests and `pnpm exec vp check`, inspect the diff and record results. No new cloud resources are needed for this output-only change; historical live transcripts remain unchanged.

Validation: the initial targeted run failed on four missing-output assertions; implementation then passed 69 tests across seven init test files. `vp check --fix` passed with three unrelated pre-existing warnings. Skill assets were regenerated without changes. No new live resources were created.
