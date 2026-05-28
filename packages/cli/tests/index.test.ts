import { expect, test } from "vite-plus/test";
import { createStepDispatcher } from "../src/pipeline/dispatcher.ts";
import { executePipeline } from "../src/pipeline/executor.ts";
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
