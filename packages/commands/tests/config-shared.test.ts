import { expect, test } from "vite-plus/test";
import { resolveKey, validateAndCoerce } from "../src/commands/config/shared.ts";

test("api-key-capabilities alias accepts comma-separated leaf capabilities", () => {
  expect(resolveKey("api-key-capabilities")).toBe("api_key_capabilities");
  expect(
    validateAndCoerce(
      "api-key-capabilities",
      " text.chat, image.generate, text.chat, video.task.get ",
    ),
  ).toEqual(["text.chat", "image.generate", "video.task.get"]);
});

test("api_key_capabilities accepts JSON arrays and preserves an explicit empty allowlist", () => {
  expect(
    validateAndCoerce("api_key_capabilities", '["text.chat", "image.generate", "text.chat"]'),
  ).toEqual(["text.chat", "image.generate"]);
  expect(validateAndCoerce("api_key_capabilities", "[]")).toEqual([]);
});

test("api_key_capabilities rejects malformed identifiers and non-string JSON entries", () => {
  expect(() => validateAndCoerce("api_key_capabilities", "Video Generate")).toThrow(
    /Invalid API Key capability/,
  );
  expect(() => validateAndCoerce("api_key_capabilities", '["text.chat", 42]')).toThrow(
    /Invalid API Key capability/,
  );
});

test("default-speech-recognition-model alias accepts an ASR model ID", () => {
  expect(resolveKey("default-speech-recognition-model")).toBe("default_speech_recognition_model");
  expect(validateAndCoerce("default-speech-recognition-model", "qwen-audio-3.0-asr-flash")).toBe(
    "qwen-audio-3.0-asr-flash",
  );
});
