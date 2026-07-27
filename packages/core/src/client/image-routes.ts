import { image2ImagePath, imagePath, imageSyncPath, imageText2ImagePath } from "./endpoints.ts";

/**
 * DashScope image APIs differ by model family:
 *
 * Generate (T2I):
 * - sync multimodal + messages: qwen-image*, wan2.7-image*, z-image*
 * - async image-generation + messages: wan2.6-t2i*, wan2.6-image*
 *   (wan2.6-image sync multimodal requires 1–4 images, so pure T2I must be async)
 * - async text2image + prompt: wan2.5/2.2/2.1-t2i*, wanx*-t2i*
 *
 * Edit (I2I):
 * - sync multimodal + messages(+images): qwen-image-*, wan2.6-image*, wan2.7-image*, z-image*
 * - async image2image + prompt/images: wan2.5-i2i*, *imageedit*
 * - async image-generation + messages(+images): other async fallbacks
 */

export type ImageApiKind =
  | "sync-multimodal"
  | "async-image-generation"
  | "async-text2image"
  | "async-image2image";

export interface ImageApiRoute {
  kind: ImageApiKind;
  path: string;
  /** True when the call is synchronous (no X-DashScope-Async / task poll). */
  useSync: boolean;
  /** How to shape `input` in the request body. */
  inputStyle: "messages" | "prompt" | "prompt-images";
}

/** Models that accept text-only sync multimodal for generate. */
const SYNC_GENERATE_PREFIXES = ["qwen-image", "wan2.7-image", "z-image"] as const;

/**
 * Extra models that use sync multimodal only for edit (messages must include images).
 * wan2.6-image generate is async image-generation instead.
 */
const SYNC_EDIT_ONLY_PREFIXES = ["wan2.6-image"] as const;

function startsWithAny(model: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => model.startsWith(prefix));
}

/** True when the model family can use sync multimodal (generate and/or edit). */
export function isSyncMultimodalImageModel(model: string): boolean {
  return (
    startsWithAny(model, SYNC_GENERATE_PREFIXES) || startsWithAny(model, SYNC_EDIT_ONLY_PREFIXES)
  );
}

function isSyncGenerateModel(model: string): boolean {
  return startsWithAny(model, SYNC_GENERATE_PREFIXES);
}

function isSyncEditModel(model: string): boolean {
  return isSyncMultimodalImageModel(model);
}

/** wan2.5 / wan2.2 / wan2.1 / wanx text-to-image models use the legacy prompt API. */
export function isLegacyText2ImageModel(model: string): boolean {
  if (model.startsWith("wan2.6-t2i") || model.startsWith("wan2.6-image")) return false;
  if (isSyncGenerateModel(model)) return false;
  if (/^wan2\.[0-5][^-]*-t2i/i.test(model)) return true;
  if (/^wanx-v1$/i.test(model)) return true;
  if (/^wanx/i.test(model) && /t2i|text2image/i.test(model)) return true;
  return false;
}

/** wan2.5-i2i / *imageedit* use the legacy image2image prompt+images API. */
export function isLegacyImage2ImageModel(model: string): boolean {
  return /wan2\.5-i2i/i.test(model) || /imageedit/i.test(model);
}

export function resolveImageGenerateApi(model: string): ImageApiRoute {
  if (isSyncGenerateModel(model)) {
    return {
      kind: "sync-multimodal",
      path: imageSyncPath(),
      useSync: true,
      inputStyle: "messages",
    };
  }
  if (isLegacyText2ImageModel(model)) {
    return {
      kind: "async-text2image",
      path: imageText2ImagePath(),
      useSync: false,
      inputStyle: "prompt",
    };
  }
  // Includes wan2.6-t2i* and wan2.6-image* (text-only generate).
  return {
    kind: "async-image-generation",
    path: imagePath(),
    useSync: false,
    inputStyle: "messages",
  };
}

export function resolveImageEditApi(model: string): ImageApiRoute {
  if (isSyncEditModel(model)) {
    return {
      kind: "sync-multimodal",
      path: imageSyncPath(),
      useSync: true,
      inputStyle: "messages",
    };
  }
  if (isLegacyImage2ImageModel(model)) {
    return {
      kind: "async-image2image",
      path: image2ImagePath(),
      useSync: false,
      inputStyle: "prompt-images",
    };
  }
  return {
    kind: "async-image-generation",
    path: imagePath(),
    useSync: false,
    inputStyle: "messages",
  };
}
