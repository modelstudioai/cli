import { expect, test } from "vite-plus/test";
import {
  isLegacyImage2ImageModel,
  isLegacyText2ImageModel,
  isSyncMultimodalImageModel,
  isWanxFunctionImageEditModel,
  resolveImageEditApi,
  resolveImageGenerateApi,
  resolveImageSizeProfile,
  resolvePromptExtendDefault,
} from "../src/client/image-routes.ts";

test("sync multimodal family covers qwen-image, wan2.6/2.7 image, and z-image", () => {
  expect(isSyncMultimodalImageModel("qwen-image-3.0")).toBe(true);
  expect(isSyncMultimodalImageModel("qwen-image-2.0")).toBe(true);
  expect(isSyncMultimodalImageModel("qwen-image-2.0-pro")).toBe(true);
  expect(isSyncMultimodalImageModel("qwen-image-plus")).toBe(true);
  expect(isSyncMultimodalImageModel("qwen-image-max")).toBe(true);
  expect(isSyncMultimodalImageModel("wan2.7-image")).toBe(true);
  expect(isSyncMultimodalImageModel("wan2.6-image")).toBe(true);
  expect(isSyncMultimodalImageModel("z-image-turbo")).toBe(true);
  expect(isSyncMultimodalImageModel("wan2.6-t2i")).toBe(false);
});

test("legacy text2image covers wan2.5/2.2/2.1 t2i and wanx but not wan2.6-t2i/image", () => {
  expect(isLegacyText2ImageModel("wan2.2-t2i-plus")).toBe(true);
  expect(isLegacyText2ImageModel("wan2.5-t2i-preview")).toBe(true);
  expect(isLegacyText2ImageModel("wan2.1-t2i-turbo")).toBe(true);
  expect(isLegacyText2ImageModel("wanx2.0-t2i-turbo")).toBe(true);
  expect(isLegacyText2ImageModel("wanx-v1")).toBe(true);
  expect(isLegacyText2ImageModel("wanx-v1-0521")).toBe(true);
  expect(isLegacyText2ImageModel("wan2.6-t2i")).toBe(false);
  expect(isLegacyText2ImageModel("wan2.6-image")).toBe(false);
  expect(isLegacyText2ImageModel("wan2.7-image")).toBe(false);
});

test("legacy image2image is wan2.5-i2i only; wanx imageedit uses function protocol", () => {
  expect(isLegacyImage2ImageModel("wan2.5-i2i-preview")).toBe(true);
  expect(isLegacyImage2ImageModel("wanx2.1-imageedit")).toBe(false);
  expect(isWanxFunctionImageEditModel("wanx2.1-imageedit")).toBe(true);
  expect(isWanxFunctionImageEditModel("wan2.5-i2i-preview")).toBe(false);
});

test("size profiles are model-specific, not sync/async", () => {
  expect(resolveImageSizeProfile("qwen-image-3.0")).toBe("qwen-image-2.0");
  expect(resolveImageSizeProfile("qwen-image-2.0")).toBe("qwen-image-2.0");
  expect(resolveImageSizeProfile("qwen-image")).toBe("qwen-image-fixed");
  expect(resolveImageSizeProfile("qwen-image-plus")).toBe("qwen-image-fixed");
  expect(resolveImageSizeProfile("qwen-image-max")).toBe("qwen-image-fixed");
  expect(resolveImageSizeProfile("wan2.7-image")).toBe("wan27");
  expect(resolveImageSizeProfile("z-image-turbo")).toBe("z-image");
  expect(resolveImageSizeProfile("wan2.6-t2i")).toBe("wan26");
  expect(resolveImageSizeProfile("wanx-v1")).toBe("wanx-v1");
  expect(resolveImageSizeProfile("wanx-v1-0521")).toBe("wanx-v1");
  expect(resolveImageSizeProfile("wan2.5-i2i-preview")).toBe("wan25-i2i");
  expect(resolveImageSizeProfile("wan2.2-t2i-plus")).toBe("wan-legacy");
});

test("prompt_extend defaults follow model docs", () => {
  expect(resolvePromptExtendDefault("qwen-image-3.0")).toBe(true);
  expect(resolvePromptExtendDefault("qwen-image-2.0")).toBe(true);
  expect(resolvePromptExtendDefault("qwen-image-max")).toBe(true);
  expect(resolvePromptExtendDefault("z-image-turbo")).toBe(false);
  expect(resolvePromptExtendDefault("wan2.7-image")).toBeUndefined();
  expect(resolvePromptExtendDefault("qwen-image-plus")).toBeUndefined();
});

test("resolveImageGenerateApi picks path, input style, and size profile", () => {
  expect(resolveImageGenerateApi("wanx2.0-t2i-turbo")).toMatchObject({
    kind: "async-text2image",
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    inputStyle: "prompt",
    useSync: false,
    sizeProfile: "wan-legacy",
  });
  expect(resolveImageGenerateApi("wanx-v1")).toMatchObject({
    sizeProfile: "wanx-v1",
    inputStyle: "prompt",
  });
  expect(resolveImageGenerateApi("wanx-v1-0521")).toMatchObject({
    kind: "async-text2image",
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    inputStyle: "prompt",
    useSync: false,
    sizeProfile: "wanx-v1",
  });
  expect(resolveImageGenerateApi("wan2.6-t2i")).toMatchObject({
    kind: "async-image-generation",
    sizeProfile: "wan26",
  });
  expect(resolveImageGenerateApi("qwen-image-3.0")).toMatchObject({
    kind: "sync-multimodal",
    sizeProfile: "qwen-image-2.0",
    promptExtendDefault: true,
  });
  expect(resolveImageGenerateApi("qwen-image-2.0")).toMatchObject({
    kind: "sync-multimodal",
    sizeProfile: "qwen-image-2.0",
    promptExtendDefault: true,
  });
  expect(resolveImageGenerateApi("qwen-image-plus")).toMatchObject({
    kind: "sync-multimodal",
    sizeProfile: "qwen-image-fixed",
  });
  expect(resolveImageGenerateApi("qwen-image")).toMatchObject({
    kind: "sync-multimodal",
    sizeProfile: "qwen-image-fixed",
  });
  expect(resolveImageGenerateApi("z-image-turbo")).toMatchObject({
    kind: "sync-multimodal",
    sizeProfile: "z-image",
    promptExtendDefault: false,
  });
});

test("resolveImageEditApi excludes pure T2I models from sync edit", () => {
  expect(resolveImageEditApi("wan2.7-image")).toMatchObject({
    kind: "sync-multimodal",
    inputStyle: "messages",
    useSync: true,
  });
  expect(resolveImageEditApi("wan2.6-image")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
  expect(resolveImageEditApi("qwen-image-3.0")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
  expect(resolveImageEditApi("qwen-image-2.0")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
  // Pure T2I models fall through to async image-generation, not sync edit.
  expect(resolveImageEditApi("z-image-turbo")).toMatchObject({
    kind: "async-image-generation",
    useSync: false,
  });
  expect(resolveImageEditApi("qwen-image-plus")).toMatchObject({
    kind: "async-image-generation",
    useSync: false,
  });
  expect(resolveImageEditApi("qwen-image-max")).toMatchObject({
    kind: "async-image-generation",
    useSync: false,
  });
  expect(resolveImageEditApi("wan2.5-i2i-preview")).toMatchObject({
    kind: "async-image2image",
    inputStyle: "prompt-images",
    sizeProfile: "wan25-i2i",
  });
  expect(resolveImageEditApi("wanx2.1-imageedit")).toMatchObject({
    kind: "async-image2image",
    inputStyle: "function-base-image",
    path: "/api/v1/services/aigc/image2image/image-synthesis",
  });
});
