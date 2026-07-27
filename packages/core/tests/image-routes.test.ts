import { expect, test } from "vite-plus/test";
import {
  isLegacyImage2ImageModel,
  isLegacyText2ImageModel,
  isSyncMultimodalImageModel,
  resolveImageEditApi,
  resolveImageGenerateApi,
} from "../src/client/image-routes.ts";

test("sync multimodal family covers qwen-image, wan2.6/2.7 image, and z-image", () => {
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
  expect(isLegacyText2ImageModel("wan2.6-t2i")).toBe(false);
  expect(isLegacyText2ImageModel("wan2.6-image")).toBe(false);
  expect(isLegacyText2ImageModel("wan2.7-image")).toBe(false);
});

test("legacy image2image covers wan2.5-i2i and imageedit models", () => {
  expect(isLegacyImage2ImageModel("wan2.5-i2i-preview")).toBe(true);
  expect(isLegacyImage2ImageModel("wanx2.1-imageedit")).toBe(true);
  expect(isLegacyImage2ImageModel("wan2.6-image")).toBe(false);
});

test("resolveImageGenerateApi picks path and input style by model family", () => {
  expect(resolveImageGenerateApi("wanx2.0-t2i-turbo")).toMatchObject({
    kind: "async-text2image",
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    inputStyle: "prompt",
    useSync: false,
  });
  expect(resolveImageGenerateApi("wan2.2-t2i-plus")).toMatchObject({
    kind: "async-text2image",
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    inputStyle: "prompt",
    useSync: false,
  });
  expect(resolveImageGenerateApi("wan2.6-t2i")).toMatchObject({
    kind: "async-image-generation",
    path: "/api/v1/services/aigc/image-generation/generation",
    inputStyle: "messages",
    useSync: false,
  });
  expect(resolveImageGenerateApi("wan2.6-image")).toMatchObject({
    kind: "async-image-generation",
    path: "/api/v1/services/aigc/image-generation/generation",
    inputStyle: "messages",
    useSync: false,
  });
  expect(resolveImageGenerateApi("qwen-image-2.0")).toMatchObject({
    kind: "sync-multimodal",
    path: "/api/v1/services/aigc/multimodal-generation/generation",
    inputStyle: "messages",
    useSync: true,
  });
  expect(resolveImageGenerateApi("z-image-turbo")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
  expect(resolveImageGenerateApi("qwen-image-plus")).toMatchObject({
    kind: "sync-multimodal",
    path: "/api/v1/services/aigc/multimodal-generation/generation",
    inputStyle: "messages",
    useSync: true,
  });
  expect(resolveImageGenerateApi("wan2.7-image")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
});

test("resolveImageEditApi picks path and input style by model family", () => {
  expect(resolveImageEditApi("wan2.5-i2i-preview")).toMatchObject({
    kind: "async-image2image",
    path: "/api/v1/services/aigc/image2image/image-synthesis",
    inputStyle: "prompt-images",
    useSync: false,
  });
  expect(resolveImageEditApi("wan2.6-image")).toMatchObject({
    kind: "sync-multimodal",
    path: "/api/v1/services/aigc/multimodal-generation/generation",
    inputStyle: "messages",
    useSync: true,
  });
  expect(resolveImageEditApi("wan2.7-image")).toMatchObject({
    kind: "sync-multimodal",
    useSync: true,
  });
});
