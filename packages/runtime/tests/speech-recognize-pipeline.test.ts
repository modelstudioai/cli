import { expect, test } from "vite-plus/test";
import type { Client } from "bailian-cli-core";
import { PipelineError } from "../src/pipeline/errors.ts";
import type { PipelineEnv } from "../src/pipeline/bl-config.ts";
import { speechRecognize } from "../src/pipeline/steps/bl-api.ts";
import type { StepContext } from "../src/pipeline/types.ts";

type CapturedRequest = {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  async?: boolean;
};

function makeEnv(requestJsonImpl?: (opts: CapturedRequest) => Promise<unknown>): {
  env: PipelineEnv;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const client = {
    uploadFile: async (source: string) => source,
    requestJson: async (opts: CapturedRequest) => {
      captured.push(opts);
      if (requestJsonImpl) return requestJsonImpl(opts);
      return { output: { text: "ok" } };
    },
  } as unknown as Client;

  return {
    env: {
      client,
      settings: { quiet: true, output: "json" } as PipelineEnv["settings"],
    },
    captured,
  };
}

function makeCtx(): StepContext {
  return { dryRun: false, signal: new AbortController().signal };
}

test("pipeline speechRecognize routes input-audio flash to sync multimodal endpoint", async () => {
  const { env, captured } = makeEnv();
  const result = (await speechRecognize(
    env,
    {
      url: "https://example.com/a.wav",
      model: "qwen-audio-3.0-asr-flash",
      language: "en",
      "vocabulary-id": "vocab-1",
    },
    makeCtx(),
  )) as { mode?: string; text?: string };

  expect(result.mode).toBe("sync");
  expect(result.text).toBe("ok");
  expect(captured).toHaveLength(1);
  expect(captured[0]?.path).toBe("/api/v1/services/aigc/multimodal-generation/generation");
  expect(captured[0]?.headers?.["X-DashScope-SSE"]).toBe("disable");
  expect(captured[0]?.body).toMatchObject({
    model: "qwen-audio-3.0-asr-flash",
    parameters: {
      format: "wav",
      language_hints: ["en"],
      vocabulary_id: "vocab-1",
    },
  });
});

test("pipeline speechRecognize maps qwen3-filetrans language to parameters.language", async () => {
  const { env, captured } = makeEnv(async (opts) => {
    if (opts.async || opts.method === "POST") {
      return { output: { task_id: "task-1", task_status: "PENDING" } };
    }
    return {
      output: { task_id: "task-1", task_status: "SUCCEEDED", results: [] },
      request_id: "r1",
    };
  });

  await speechRecognize(
    env,
    {
      url: "https://example.com/a.wav",
      model: "qwen3-asr-flash-filetrans",
      language: "zh",
      "poll-interval": 0,
    },
    makeCtx(),
  );

  expect(captured[0]?.path).toBe("/api/v1/services/audio/asr/transcription");
  expect(captured[0]?.async).toBe(true);
  expect(captured[0]?.body).toMatchObject({
    model: "qwen3-asr-flash-filetrans",
    input: { file_url: "https://example.com/a.wav" },
    parameters: { language: "zh" },
  });
  expect(
    (captured[0]?.body?.parameters as Record<string, unknown> | undefined)?.language_hints,
  ).toBeUndefined();
});

test("pipeline speechRecognize rejects realtime models before requesting", async () => {
  const { env, captured } = makeEnv();
  await expect(
    speechRecognize(
      env,
      { url: "https://example.com/a.wav", model: "qwen3-asr-flash-realtime" },
      makeCtx(),
    ),
  ).rejects.toBeInstanceOf(PipelineError);
  expect(captured).toHaveLength(0);
});

test("pipeline speechRecognize rejects multiple urls for sync flash", async () => {
  const { env, captured } = makeEnv();
  await expect(
    speechRecognize(
      env,
      {
        url: ["https://example.com/a.wav", "https://example.com/b.wav"],
        model: "fun-asr-flash-2026-06-15",
      },
      makeCtx(),
    ),
  ).rejects.toBeInstanceOf(PipelineError);
  expect(captured).toHaveLength(0);
});

test("pipeline speechRecognize downloads qwen3 singular result.transcription_url", async () => {
  const originalFetch = globalThis.fetch;
  const transcriptionUrl = "https://example.com/transcription.json";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(url).toBe(transcriptionUrl);
    return new Response(
      JSON.stringify({
        transcripts: [{ text: "pipeline hello", sentences: [{ text: "pipeline hello" }] }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const { env, captured } = makeEnv(async (opts) => {
      if (opts.async || opts.method === "POST") {
        return { output: { task_id: "task-1", task_status: "PENDING" } };
      }
      return {
        output: {
          task_id: "task-1",
          task_status: "SUCCEEDED",
          result: { transcription_url: transcriptionUrl },
        },
        request_id: "r1",
      };
    });

    const result = (await speechRecognize(
      env,
      {
        url: "https://example.com/a.wav",
        model: "qwen3-asr-flash-filetrans",
        "poll-interval": 0,
      },
      makeCtx(),
    )) as {
      mode?: string;
      text?: string;
      transcription_url?: string;
      result?: { transcription_url?: string };
    };

    expect(captured[0]?.async).toBe(true);
    expect(result.mode).toBe("async");
    expect(result.text).toBe("pipeline hello");
    expect(result.transcription_url).toBe(transcriptionUrl);
    expect(result.result?.transcription_url).toBe(transcriptionUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
