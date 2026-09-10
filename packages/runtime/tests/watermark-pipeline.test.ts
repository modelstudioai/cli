import { expect, test } from "vite-plus/test";
import type { Client } from "bailian-cli-core";
import { applyProfileWatermarkToStepInput, type PipelineEnv } from "../src/pipeline/bl-config.ts";
import { imageEdit, imageGenerate, videoGenerate } from "../src/pipeline/steps/bl-api.ts";
import type { StepContext } from "../src/pipeline/types.ts";

type CapturedRequest = {
  path?: string;
  method?: string;
  body?: {
    parameters?: { watermark?: boolean };
  };
  async?: boolean;
};

function makeEnv(watermark: boolean): {
  env: PipelineEnv;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const client = {
    uploadFile: async (source: string) => source,
    requestJson: async (opts: CapturedRequest) => {
      captured.push(opts);
      if (opts.async) {
        return { output: { task_id: "task-wm", task_status: "PENDING" } };
      }
      // Sync image response shape (qwen-image / wan2.7-image).
      return {
        request_id: "req-wm",
        output: {
          choices: [{ message: { content: [{ image: "https://example.com/out.png" }] } }],
        },
      };
    },
  } as unknown as Client;

  return {
    env: {
      client,
      settings: {
        quiet: true,
        output: "json",
        outputExplicit: true,
        timeout: 300,
        watermark,
        verbose: false,
        dryRun: false,
        telemetry: false,
      } as PipelineEnv["settings"],
    },
    captured,
  };
}

function makeCtx(): StepContext {
  return { dryRun: false, signal: new AbortController().signal, timeoutSeconds: 1 };
}

test("pipeline imageGenerate inherits Profile watermark=false when step omits it", async () => {
  const { env, captured } = makeEnv(false);
  await imageGenerate(env, { prompt: "A cat" }, makeCtx());
  expect(captured[0]?.body?.parameters?.watermark).toBe(false);
});

test("pipeline imageGenerate keeps step watermark over Profile", async () => {
  const { env, captured } = makeEnv(false);
  await imageGenerate(env, { prompt: "A cat", watermark: true }, makeCtx());
  expect(captured[0]?.body?.parameters?.watermark).toBe(true);
});

test("pipeline imageEdit inherits Profile watermark=false when step omits it", async () => {
  const { env, captured } = makeEnv(false);
  await imageEdit(env, { prompt: "Blue sky", image: "https://example.com/in.png" }, makeCtx());
  expect(captured[0]?.body?.parameters?.watermark).toBe(false);
});

test("pipeline videoGenerate inherits Profile watermark=false when step omits it", async () => {
  const { env, captured } = makeEnv(false);
  // First call submits async task; pollTaskWithOptions will keep polling — mock SUCCEEDED quickly.
  const client = env.client as unknown as {
    requestJson: (opts: CapturedRequest) => Promise<unknown>;
  };
  let calls = 0;
  client.requestJson = async (opts: CapturedRequest) => {
    captured.push(opts);
    calls += 1;
    if (calls === 1) {
      return { output: { task_id: "task-wm", task_status: "PENDING" } };
    }
    return {
      output: {
        task_id: "task-wm",
        task_status: "SUCCEEDED",
        video_url: "https://example.com/out.mp4",
      },
    };
  };

  await videoGenerate(
    env,
    { prompt: "A cat walks", "poll-interval": 0 },
    { ...makeCtx(), timeoutSeconds: 5 },
  );
  expect(captured[0]?.body?.parameters?.watermark).toBe(false);
});

test("pipeline defaults watermark to true when Profile leaves the compliance default", async () => {
  const { env, captured } = makeEnv(true);
  await imageGenerate(env, { prompt: "A cat" }, makeCtx());
  expect(captured[0]?.body?.parameters?.watermark).toBe(true);
});

test("applyProfileWatermarkToStepInput fills omitted watermark from Settings", () => {
  const settings = { watermark: false } as PipelineEnv["settings"];
  expect(
    applyProfileWatermarkToStepInput("image/generate", { prompt: "A cat" }, settings).watermark,
  ).toBe(false);
  expect(
    applyProfileWatermarkToStepInput(
      "image/generate",
      { prompt: "A cat", watermark: true },
      settings,
    ).watermark,
  ).toBe(true);
  expect(
    applyProfileWatermarkToStepInput("text/chat", { message: "hi" }, settings).watermark,
  ).toBeUndefined();
});
