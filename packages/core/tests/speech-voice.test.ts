import { describe, expect, test } from "vite-plus/test";
import {
  VOICE_ENROLLMENT_MODEL,
  QWEN_VOICE_ENROLLMENT_MODEL,
  buildOmniVoiceRequest,
  buildVoiceRequest,
  isCliOmniVoiceCloneTarget,
  isDocumentedOmniVoiceTargetModel,
  isOmniRealtimeTargetModel,
  isOmniVoiceTargetModel,
  isQwen38OmniTargetModel,
  looksLikeOmniClonedVoiceId,
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

describe("omni voice enrollment", () => {
  test("detects Omni-looking, documented, CLI clone, and Realtime targets", () => {
    expect(isOmniVoiceTargetModel("qwen3.5-omni-flash")).toBe(true);
    expect(isOmniVoiceTargetModel("qwen3.8-omni-flash")).toBe(true);
    expect(isOmniVoiceTargetModel("qwen3.8-omni-flash-realtime")).toBe(true);
    expect(isOmniVoiceTargetModel("cosyvoice-v3-flash")).toBe(false);

    expect(isDocumentedOmniVoiceTargetModel("qwen3.5-omni-flash")).toBe(true);
    expect(isDocumentedOmniVoiceTargetModel("qwen3.5-omni-flash-2025-06-15")).toBe(true);
    expect(isDocumentedOmniVoiceTargetModel("qwen3.8-omni-flash-realtime")).toBe(true);
    expect(isDocumentedOmniVoiceTargetModel("qwen3.8-omni-flash")).toBe(false);
    expect(isDocumentedOmniVoiceTargetModel("qwen3.5-omni-flash-realtime")).toBe(true);

    expect(isCliOmniVoiceCloneTarget("qwen3.5-omni-flash")).toBe(true);
    expect(isCliOmniVoiceCloneTarget("qwen3.5-omni-plus-2025-06-15")).toBe(true);
    expect(isCliOmniVoiceCloneTarget("qwen3.5-omni-flash-realtime")).toBe(false);
    expect(isCliOmniVoiceCloneTarget("qwen3.8-omni-flash-realtime")).toBe(false);
    expect(isCliOmniVoiceCloneTarget("qwen3.8-omni-flash")).toBe(false);

    expect(isOmniRealtimeTargetModel("qwen3.5-omni-flash-realtime")).toBe(true);
    expect(isOmniRealtimeTargetModel("qwen3.5-omni-flash")).toBe(false);

    expect(isQwen38OmniTargetModel("qwen3.8-omni-flash-realtime")).toBe(true);
    expect(isQwen38OmniTargetModel("qwen3.5-omni-flash")).toBe(false);
    expect(looksLikeOmniClonedVoiceId("qwen-omni-vc-guanyu-voice-20250812105009984-838b")).toBe(
      true,
    );
    expect(looksLikeOmniClonedVoiceId("cosyvoice-v3-flash-demo-xxxx")).toBe(false);
  });

  test("create body uses qwen-voice-enrollment, action create, audio.data", () => {
    const request = buildOmniVoiceRequest(
      "create",
      {
        target_model: "qwen3.5-omni-flash",
        preferred_name: "guanyu",
        audio: { data: "https://example.com/ref.wav" },
        language: "zh",
      },
      undefined,
    );
    expect(request.model).toBe(QWEN_VOICE_ENROLLMENT_MODEL);
    expect(request.input).toEqual({
      action: "create",
      target_model: "qwen3.5-omni-flash",
      preferred_name: "guanyu",
      audio: { data: "https://example.com/ref.wav" },
      language: "zh",
    });
    expect(request.parameters).toBeUndefined();
  });

  test("qwen3.8 create includes voice_clone_mode parameters", () => {
    const request = buildOmniVoiceRequest(
      "create",
      {
        target_model: "qwen3.8-omni-flash-realtime",
        preferred_name: "chinese",
        audio: { data: "https://example.com/a.wav" },
      },
      { voice_clone_mode: "normal", skip_audio_process: false },
    );
    expect(request.model).toBe(QWEN_VOICE_ENROLLMENT_MODEL);
    expect(request.input.action).toBe("create");
    expect(request.parameters).toEqual({
      voice_clone_mode: "normal",
      skip_audio_process: false,
    });
  });

  test("list and delete actions match official Omni shapes", () => {
    expect(buildOmniVoiceRequest("list", { page_index: 0, page_size: 10 }).input).toEqual({
      action: "list",
      page_index: 0,
      page_size: 10,
    });
    expect(buildOmniVoiceRequest("delete", { voice: "qwen-omni-vc-x" }).input).toEqual({
      action: "delete",
      voice: "qwen-omni-vc-x",
    });
  });
});
