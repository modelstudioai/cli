import { afterEach, expect, test, vi } from "vite-plus/test";
import command from "../../src/commands/knowledge/doc-sync.ts";
import * as execution from "../../src/commands/knowledge/sync/execute.ts";
import * as recovery from "../../src/commands/knowledge/sync/recovery-run.ts";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";
import { syncBillingNotice } from "../../src/commands/knowledge/sync/prepare.ts";
import { commands as bl } from "../../../cli/src/commands.ts";
import { commands as kscli } from "../../../kscli/src/commands.ts";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const plan = planSync({ local: [], managed: [], deleteEnabled: false });
  const context = {
    flags: { dir: "docs", indexId: "index" },
    settings: { output: "json", quiet: true },
    prepared: {
      stateFile: "state.json",
      stateRevision: null,
      state: { entries: {}, pending: [] },
      target: {},
      scan: { files: [] },
      remote: {},
      plan,
      orphans: [],
      notices: [syncBillingNotice],
    },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
  } as unknown as Parameters<typeof command.run>[0];
  return { context, stdout };
}
test("both product routes point to the same prepared command", () => {
  expect(bl["knowledge doc sync"]).toBe(command);
  expect(kscli["doc sync"]).toBe(command);
  expect(command.prepare).toBeTypeOf("function");
  expect(command.flags!.delete.type).toBe("switch");
});
test("empty and nonpositive options are rejected", () => {
  expect(command.validate?.({ dir: "", indexId: "index", delete: false })).toBeTruthy();
  expect(
    command.validate?.({ dir: "docs", indexId: "index", pollInterval: 0, delete: false }),
  ).toBeTruthy();
});
test("successful ordinary execution returns one JSON result with model billing notice", async () => {
  const { context, stdout } = fixture();
  const execute = vi
    .spyOn(execution, "executeSyncPlan")
    .mockResolvedValue({ state: context.prepared!.state, completed: [] });
  await command.run(context);
  const result = JSON.parse(stdout.mock.calls.map(([text]) => text).join(""));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.requiresReplan).toBe(false);
  expect(result.notices[0].message).toContain("model charges");
});
test("blocked plan cannot reach execution", async () => {
  const { context } = fixture();
  context.prepared!.plan.blocked = true;
  const execute = vi.spyOn(execution, "executeSyncPlan");
  await expect(command.run(context)).rejects.toThrow("conflicts");
  expect(execute).not.toHaveBeenCalled();
});
test("recovery plan never invokes ordinary execution in the same run", async () => {
  const { context, stdout } = fixture();
  context.prepared!.plan.requiresReplan = true;
  const recover = vi
    .spyOn(recovery, "runSyncRecovery")
    .mockResolvedValue({ state: context.prepared!.state, completed: [], requiresReplan: true });
  const execute = vi.spyOn(execution, "executeSyncPlan");
  await command.run(context);
  expect(recover).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
  expect(JSON.parse(stdout.mock.calls.map(([text]) => text).join("")).requiresReplan).toBe(true);
});
