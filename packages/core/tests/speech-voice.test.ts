import { describe, expect, test } from "vite-plus/test";
import {
  VOICE_ENROLLMENT_MODEL,
  buildVoiceRequest,
  type CreateCloneVoiceInput,
  type CreateDesignVoiceInput,
} from "../src/index.ts";

describe("buildVoiceRequest", () => {
  test("create_voice clone body keeps audio and string volume normalize", () => {
    const input: CreateCloneVoiceInput = {
      target_model: "cosyvoice-v3-flash",
      prefix: "Demo01",
      audio: "https://example.com/ref.wav",
      enable_volume_normalization: "false",
      enable_preprocess: false,
      language_hints: ["zh"],
      max_prompt_audio_length: 10,
    };
    const request = buildVoiceRequest("create_voice", { ...input });
    expect(request.model).toBe(VOICE_ENROLLMENT_MODEL);
    expect(request.input).toEqual({
      action: "create_voice",
      target_model: "cosyvoice-v3-flash",
      prefix: "Demo01",
      audio: "https://example.com/ref.wav",
      enable_volume_normalization: "false",
      enable_preprocess: false,
      language_hints: ["zh"],
      max_prompt_audio_length: 10,
    });
    expect(request.parameters).toBeUndefined();
  });

  test("create_voice design body has voice_prompt/preview_text without audio", () => {
    const input: CreateDesignVoiceInput = {
      target_model: "cosyvoice-v3.5-plus",
      prefix: "demo",
      voice_prompt: "沉稳温暖的中文播音员",
      preview_text: "各位听众朋友们大家好，欢迎收听今天的节目。",
      language_hints: ["zh"],
    };
    const request = buildVoiceRequest(
      "create_voice",
      { ...input },
      { sample_rate: 24000, response_format: "wav" },
    );
    expect(request.input.action).toBe("create_voice");
    expect(request.input).not.toHaveProperty("audio");
    expect(request.input.voice_prompt).toBe("沉稳温暖的中文播音员");
    expect(request.input.preview_text).toBe("各位听众朋友们大家好，欢迎收听今天的节目。");
    expect(request.parameters).toEqual({
      sample_rate: 24000,
      response_format: "wav",
    });
  });

  test("list_voice maps page_index / page_size", () => {
    const request = buildVoiceRequest("list_voice", {
      prefix: "demo",
      page_index: 1,
      page_size: 20,
    });
    expect(request.input).toEqual({
      action: "list_voice",
      prefix: "demo",
      page_index: 1,
      page_size: 20,
    });
  });

  test("query_voice / update_voice / delete_voice use voice_id", () => {
    expect(buildVoiceRequest("query_voice", { voice_id: "v1" }).input).toEqual({
      action: "query_voice",
      voice_id: "v1",
    });
    expect(
      buildVoiceRequest("update_voice", {
        voice_id: "v1",
        audio: "https://example.com/a.wav",
      }).input,
    ).toEqual({
      action: "update_voice",
      voice_id: "v1",
      audio: "https://example.com/a.wav",
    });
    expect(buildVoiceRequest("delete_voice", { voice_id: "v1" }).input).toEqual({
      action: "delete_voice",
      voice_id: "v1",
    });
  });

  test("optional false values are preserved when provided", () => {
    const withFalse = buildVoiceRequest("create_voice", {
      target_model: "cosyvoice-v3-flash",
      prefix: "demo",
      audio: "https://example.com/a.wav",
      enable_preprocess: false,
      enable_volume_normalization: "false",
    });
    expect(withFalse.input.enable_preprocess).toBe(false);
    expect(withFalse.input.enable_volume_normalization).toBe("false");

    const withoutOptional = buildVoiceRequest("create_voice", {
      target_model: "cosyvoice-v3-flash",
      prefix: "demo",
      audio: "https://example.com/a.wav",
    });
    expect(withoutOptional.input).not.toHaveProperty("enable_preprocess");
    expect(withoutOptional.input).not.toHaveProperty("enable_volume_normalization");
  });

  test("empty parameters object is omitted", () => {
    const request = buildVoiceRequest("create_voice", { prefix: "demo" }, {});
    expect(request.parameters).toBeUndefined();
  });
});
