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
 * - sync multimodal + messages(+images): qwen-image-3.0*, qwen-image-2.0*, qwen-image-edit*, wan2.6-image*, wan2.7-image*
 *   (pure T2I models such as z-image / qwen-image-plus / qwen-image-max are NOT edit models)
 * - async image2image + prompt/images: wan2.5-i2i*
 * - async image2image + function/base_image_url: *imageedit* (e.g. wanx2.1-imageedit)
 * - async image-generation + messages(+images): other async fallbacks
 */

export type ImageApiKind =
  | "sync-multimodal"
  | "async-image-generation"
  | "async-text2image"
  | "async-image2image";

/** Model-family size presets — not inferred from sync/async. */
export type ImageSizeProfile =
  | "qwen-image-2.0"
  | "qwen-image-fixed"
  | "wan27"
  | "z-image"
  | "wan26"
  | "wan-legacy"
  | "wanx-v1"
  | "wan25-i2i";

export type ImageInputStyle = "messages" | "prompt" | "prompt-images" | "function-base-image";

export interface ImageApiRoute {
  kind: ImageApiKind;
  path: string;
  /** True when the call is synchronous (no X-DashScope-Async / task poll). */
  useSync: boolean;
  /** How to shape `input` in the request body. */
  inputStyle: ImageInputStyle;
  /** Ratio → pixel map family for `--size`. */
  sizeProfile: ImageSizeProfile;
  /**
   * CLI default when `--prompt-extend` is omitted.
   * `undefined` means omit the parameter (leave to DashScope default).
   */
  promptExtendDefault?: boolean;
}

/** Models that accept text-only sync multimodal for generate. */
const SYNC_GENERATE_PREFIXES = ["qwen-image", "wan2.7-image", "z-image"] as const;

/**
 * Models that support sync multimodal edit (messages must include images).
 * Pure T2I models (z-image / qwen-image-plus / qwen-image-max) are excluded.
 */
const SYNC_EDIT_PREFIXES = [
  "qwen-image-3.0",
  "qwen-image-2.0",
  "qwen-image-edit",
  "wan2.7-image",
  "wan2.6-image",
] as const;

function startsWithAny(model: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => model.startsWith(prefix));
}

/** True when the model family can use sync multimodal for generate. */
export function isSyncMultimodalImageModel(model: string): boolean {
  return startsWithAny(model, SYNC_GENERATE_PREFIXES) || model.startsWith("wan2.6-image");
}

function isSyncGenerateModel(model: string): boolean {
  return startsWithAny(model, SYNC_GENERATE_PREFIXES);
}

function isSyncEditModel(model: string): boolean {
  return startsWithAny(model, SYNC_EDIT_PREFIXES);
}

/** wanx-v1 and dated aliases (e.g. wanx-v1-0521) use the legacy text2image API. */
function isWanxV1Model(model: string): boolean {
  return /^wanx-v1(?:-|$)/i.test(model);
}

/** wan2.5 / wan2.2 / wan2.1 / wanx text-to-image models use the legacy prompt API. */
export function isLegacyText2ImageModel(model: string): boolean {
  if (model.startsWith("wan2.6-t2i") || model.startsWith("wan2.6-image")) return false;
  if (isSyncGenerateModel(model)) return false;
  if (/^wan2\.[0-5][^-]*-t2i/i.test(model)) return true;
  if (isWanxV1Model(model)) return true;
  if (/^wanx/i.test(model) && /t2i|text2image/i.test(model)) return true;
  return false;
}

/** wan2.5-i2i uses the legacy image2image prompt+images API. */
export function isLegacyImage2ImageModel(model: string): boolean {
  return /wan2\.5-i2i/i.test(model);
}

/** wanx*-imageedit uses function + base_image_url (not prompt+images). */
export function isWanxFunctionImageEditModel(model: string): boolean {
  return /imageedit/i.test(model);
}

export function resolveImageSizeProfile(model: string): ImageSizeProfile {
  // 3.0 暂复用 2.0 高分比例表（CLI ratio→像素便捷映射）；不做独立 3.0 profile。
  if (
    model.startsWith("qwen-image-3.0") ||
    model.startsWith("qwen-image-2.0") ||
    model.startsWith("qwen-image-edit")
  ) {
    return "qwen-image-2.0";
  }
  // Remaining qwen-image* (plus / max / bare qwen-image) share the fixed table.
  if (model.startsWith("qwen-image")) {
    return "qwen-image-fixed";
  }
  if (model.startsWith("wan2.7-image")) return "wan27";
  if (model.startsWith("z-image")) return "z-image";
  if (
    model.startsWith("wan2.6-t2i") ||
    model.startsWith("wan2.6-image") ||
    model.startsWith("wan2.5-t2i")
  ) {
    return "wan26";
  }
  if (isWanxV1Model(model)) return "wanx-v1";
  if (/wan2\.5-i2i/i.test(model)) return "wan25-i2i";
  if (isLegacyText2ImageModel(model)) return "wan-legacy";
  return "wan26";
}

/** Official / CLI defaults for prompt_extend when the flag is omitted. */
export function resolvePromptExtendDefault(model: string): boolean | undefined {
  if (
    model.startsWith("qwen-image-3.0") ||
    model.startsWith("qwen-image-2.0") ||
    model.startsWith("qwen-image-max")
  ) {
    return true;
  }
  // Z-Image docs default prompt_extend to false.
  if (model.startsWith("z-image")) return false;
  return undefined;
}

function buildRoute(
  partial: Omit<ImageApiRoute, "sizeProfile" | "promptExtendDefault">,
  model: string,
): ImageApiRoute {
  return {
    ...partial,
    sizeProfile: resolveImageSizeProfile(model),
    promptExtendDefault: resolvePromptExtendDefault(model),
  };
}

export function resolveImageGenerateApi(model: string): ImageApiRoute {
  if (isSyncGenerateModel(model)) {
    return buildRoute(
      {
        kind: "sync-multimodal",
        path: imageSyncPath(),
        useSync: true,
        inputStyle: "messages",
      },
      model,
    );
  }
  if (isLegacyText2ImageModel(model)) {
    return buildRoute(
      {
        kind: "async-text2image",
        path: imageText2ImagePath(),
        useSync: false,
        inputStyle: "prompt",
      },
      model,
    );
  }
  // Includes wan2.6-t2i* and wan2.6-image* (text-only generate).
  return buildRoute(
    {
      kind: "async-image-generation",
      path: imagePath(),
      useSync: false,
      inputStyle: "messages",
    },
    model,
  );
}

export function resolveImageEditApi(model: string): ImageApiRoute {
  if (isSyncEditModel(model)) {
    return buildRoute(
      {
        kind: "sync-multimodal",
        path: imageSyncPath(),
        useSync: true,
        inputStyle: "messages",
      },
      model,
    );
  }
  if (isWanxFunctionImageEditModel(model)) {
    return buildRoute(
      {
        kind: "async-image2image",
        path: image2ImagePath(),
        useSync: false,
        inputStyle: "function-base-image",
      },
      model,
    );
  }
  if (isLegacyImage2ImageModel(model)) {
    return buildRoute(
      {
        kind: "async-image2image",
        path: image2ImagePath(),
        useSync: false,
        inputStyle: "prompt-images",
      },
      model,
    );
  }
  return buildRoute(
    {
      kind: "async-image-generation",
      path: imagePath(),
      useSync: false,
      inputStyle: "messages",
    },
    model,
  );
}
