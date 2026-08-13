import { expect, test } from "vite-plus/test";
import {
  buildAsrFlashRequest,
  buildAsyncAsrLanguageFields,
  collectAsrTranscriptionItems,
  extractAsrFlashText,
  inferAudioFormatHint,
  resolveAsrApi,
} from "../src/client/asr-routes.ts";

test("resolveAsrApi routes model families correctly", () => {
  const cases = [
    {
      model: "fun-asr",
      expected: {
        kind: "async-filetrans",
        useSync: false,
        path: "/api/v1/services/audio/asr/transcription",
        asyncInputStyle: "file_urls",
      },
    },
    {
      model: "qwen3-asr-flash-filetrans-2025-11-17",
      expected: {
        kind: "async-filetrans",
        useSync: false,
        path: "/api/v1/services/audio/asr/transcription",
        asyncInputStyle: "file_url",
        asyncLanguageStyle: "language",
      },
    },
    {
      model: "qwen-audio-3.0-asr-flash-filetrans",
      expected: {
        kind: "async-filetrans",
        useSync: false,
        asyncInputStyle: "file_urls",
        asyncLanguageStyle: "language_hints",
      },
    },
    {
      model: "qwen3-asr-flash-us",
      expected: {
        kind: "sync-flash",
        useSync: true,
        flashFamily: "qwen3",
        path: "/api/v1/services/aigc/multimodal-generation/generation",
      },
    },
    {
      model: "qwen-audio-3.0-asr-flash",
      expected: {
        kind: "sync-flash",
        useSync: true,
        flashFamily: "input-audio",
      },
    },
    {
      model: "qwen3-asr-flash-realtime",
      expected: {
        kind: "unsupported",
      },
    },
    {
      model: "foo-asr-flash",
      expected: {
        kind: "async-filetrans",
        useSync: false,
        path: "/api/v1/services/audio/asr/transcription",
        asyncInputStyle: "file_urls",
      },
    },
  ] as const;

  for (const { model, expected } of cases) {
    const route = resolveAsrApi(model);
    expect(route, model).toMatchObject(expected);
    if (expected.kind === "unsupported") {
      expect(route.unsupportedReason, model).toMatch(/realtime|streaming|WebSocket/i);
    }
  }
});

test("unknown models default to async-filetrans for backward compatibility", () => {
  expect(resolveAsrApi("custom-asr-model")).toMatchObject({
    kind: "async-filetrans",
    useSync: false,
  });
});

test("inferAudioFormatHint reads extension from url", () => {
  expect(inferAudioFormatHint("https://example.com/a.mp3")).toBe("mp3");
  expect(inferAudioFormatHint("oss://bucket/path/file.WAV")).toBe("wav");
  expect(inferAudioFormatHint("https://example.com/a.mpeg?x=1")).toBe("mp3");
  expect(inferAudioFormatHint("https://example.com/noext")).toBe("wav");
  expect(inferAudioFormatHint("data:audio/mpeg;base64,AAA")).toBe("mp3");
  expect(inferAudioFormatHint("data:audio/x-wav;base64,AAA")).toBe("wav");
  expect(inferAudioFormatHint("data:audio/ogg;codecs=opus;base64,AAA")).toBe("ogg");
});

test("buildAsrFlashRequest shapes qwen3 and input-audio bodies", () => {
  expect(
    buildAsrFlashRequest({
      model: "qwen3-asr-flash",
      audioUrl: "https://example.com/a.mp3",
      language: "en",
      flashFamily: "qwen3",
    }),
  ).toEqual({
    model: "qwen3-asr-flash",
    input: {
      messages: [{ role: "user", content: [{ audio: "https://example.com/a.mp3" }] }],
    },
    parameters: { asr_options: { language: "en" } },
  });

  expect(
    buildAsrFlashRequest({
      model: "qwen-audio-3.0-asr-flash",
      audioUrl: "https://example.com/a.wav",
      language: "en",
      vocabularyId: "vocab-abc",
      flashFamily: "input-audio",
    }),
  ).toEqual({
    model: "qwen-audio-3.0-asr-flash",
    input: {
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: "https://example.com/a.wav" } }],
        },
      ],
    },
    parameters: {
      format: "wav",
      sample_rate: "16000",
      language_hints: ["en"],
      vocabulary_id: "vocab-abc",
    },
  });
});

test("buildAsyncAsrLanguageFields maps language by async style", () => {
  expect(buildAsyncAsrLanguageFields("language_hints", "zh")).toEqual({
    language_hints: ["zh"],
  });
  expect(buildAsyncAsrLanguageFields("language", "zh")).toEqual({ language: "zh" });
  expect(buildAsyncAsrLanguageFields("language", undefined)).toEqual({});
});

test("extractAsrFlashText reads qwen3 choices and input-audio text fields", () => {
  expect(
    extractAsrFlashText(
      {
        output: {
          choices: [{ message: { content: [{ text: "你好" }] } }],
        },
      },
      "qwen3",
    ),
  ).toBe("你好");

  expect(
    extractAsrFlashText(
      {
        output: {
          text: "Hello World",
          output: { sentence: { text: "ignored when text present" } },
        },
      },
      "input-audio",
    ),
  ).toBe("Hello World");

  expect(
    extractAsrFlashText(
      {
        output: {
          sentence: { text: "top-level sentence" },
        },
      },
      "input-audio",
    ),
  ).toBe("top-level sentence");

  expect(
    extractAsrFlashText(
      {
        output: {
          output: { sentence: { text: "nested sentence" } },
        },
      },
      "input-audio",
    ),
  ).toBe("nested sentence");
});

test("collectAsrTranscriptionItems prefers results[] then singular result", () => {
  expect(
    collectAsrTranscriptionItems({
      results: [{ transcription_url: "https://example.com/a.json", file_url: "https://a.wav" }],
    }),
  ).toEqual([{ transcription_url: "https://example.com/a.json", file_url: "https://a.wav" }]);

  expect(
    collectAsrTranscriptionItems({
      result: { transcription_url: "https://example.com/qwen3.json" },
    }),
  ).toEqual([{ transcription_url: "https://example.com/qwen3.json", subtask_status: "SUCCEEDED" }]);

  expect(collectAsrTranscriptionItems({})).toEqual([]);
});
