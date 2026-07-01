import { expect, test } from "vite-plus/test";
import { createStepDispatcher } from "../src/pipeline/dispatcher.ts";
import { executePipeline } from "../src/pipeline/executor.ts";
import { collectPipelineIssues } from "../src/pipeline/validation.ts";
import { getByJsonPointer } from "../src/pipeline/schema.ts";
import { normalizeConcurrency } from "../src/pipeline/scheduler.ts";
import { WORKFLOW_VERSION, type PipelineDefinition } from "../src/pipeline/types.ts";

test("cli package skeleton", () => {
  expect(true).toBe(true);
});

test("pipeline execution can use an isolated step dispatcher", async () => {
  const dispatcher = createStepDispatcher();
  dispatcher.registerStep("test/echo", (input, ctx) => ({
    data: { input, hasSignal: !!ctx.signal },
  }));

  const controller = new AbortController();
  const pipeline: PipelineDefinition = {
    version: WORKFLOW_VERSION,
    steps: [{ id: "echo", type: "test/echo", input: { message: "hello" } }],
  };

  const report = await executePipeline(
    pipeline,
    {},
    {
      stepDispatcher: dispatcher,
      signal: controller.signal,
    },
  );

  expect(report.status).toBe("succeeded");
  expect(report.steps[0]?.output?.data).toEqual({
    input: { message: "hello" },
    hasSignal: true,
  });
});

test("dry-run never executes $js expressions (preview must not run code)", async () => {
  const dispatcher = createStepDispatcher();
  dispatcher.registerStep("test/echo", (input) => ({ data: input }));
  const flag = "__bailian_dryrun_should_not_run__";
  delete (globalThis as Record<string, unknown>)[flag];

  const pipeline: PipelineDefinition = {
    version: WORKFLOW_VERSION,
    steps: [
      {
        id: "s1",
        type: "test/echo",
        input: { probe: { $js: `(globalThis[${JSON.stringify(flag)}] = true), 1` } },
      },
    ],
  };

  const report = await executePipeline(pipeline, {}, { stepDispatcher: dispatcher, dryRun: true });
  expect(report.status).toBe("planned");
  expect((globalThis as Record<string, unknown>)[flag]).toBeUndefined();
});

test("script/js rejects non-literal code sourced from another step ($from)", () => {
  const dispatcher = createStepDispatcher();
  dispatcher.registerStep("test/echo", (input) => ({ data: input }));
  dispatcher.registerStep("script/js", () => ({ data: {} }));

  const pipeline: PipelineDefinition = {
    version: WORKFLOW_VERSION,
    steps: [
      { id: "gen", type: "test/echo", input: { message: "x" } },
      {
        id: "run",
        type: "script/js",
        input: { code: { $from: "gen", path: "/data/message" } as never },
      },
    ],
  };

  const issues = collectPipelineIssues(pipeline, dispatcher);
  expect(issues.some((issue) => issue.includes('literal string "code"'))).toBe(true);
});

test("script/js accepts a literal string code", () => {
  const dispatcher = createStepDispatcher();
  dispatcher.registerStep("script/js", () => ({ data: {} }));

  const pipeline: PipelineDefinition = {
    version: WORKFLOW_VERSION,
    steps: [{ id: "run", type: "script/js", input: { code: "return 1" } }],
  };

  expect(collectPipelineIssues(pipeline, dispatcher)).toEqual([]);
});

test("getByJsonPointer refuses prototype keys and inherited properties", () => {
  const obj = { a: { b: 1 } };
  expect(getByJsonPointer(obj, "/a/b")).toBe(1);
  expect(getByJsonPointer(obj, "/__proto__")).toBeUndefined();
  expect(getByJsonPointer(obj, "/constructor")).toBeUndefined();
  expect(getByJsonPointer(obj, "/a/constructor/constructor")).toBeUndefined();
  expect(getByJsonPointer(obj, "/toString")).toBeUndefined();
});

test("normalizeConcurrency clamps to a safe maximum", () => {
  expect(normalizeConcurrency(undefined)).toBe(1);
  expect(normalizeConcurrency(4)).toBe(4);
  expect(normalizeConcurrency(100000)).toBe(64);
});
