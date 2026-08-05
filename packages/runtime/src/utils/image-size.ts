import type { ImageSizeProfile } from "bailian-cli-core";

/**
 * Resolve image `--size` for generate/edit by model-family profile.
 *
 * Users may pass a ratio (e.g. "1:1") or pixels (e.g. "2048*2048").
 * Pixel input is passed through; ratios are mapped per model profile.
 * Do not infer size from sync/async — that mismatches model constraints.
 */

/** qwen-image-2.0 / qwen-image-edit recommended high-res presets（3.0 经 profile 复用此表）. */
export const QWEN_IMAGE_20_RATIO_MAP: Record<string, string> = {
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "1:1": "2048*2048",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
};

/** qwen-image-plus / qwen-image-max fixed resolution presets. */
export const QWEN_IMAGE_FIXED_RATIO_MAP: Record<string, string> = {
  "16:9": "1664*928",
  "4:3": "1472*1104",
  "1:1": "1328*1328",
  "3:4": "1104*1472",
  "9:16": "928*1664",
};

/** wan2.7-image* — default 2K square for 1:1. */
export const WAN27_RATIO_MAP: Record<string, string> = {
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "1:1": "2048*2048",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
};

/** z-image* recommended ~1K presets. */
export const Z_IMAGE_RATIO_MAP: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1152*864",
  "3:4": "864*1152",
  "3:2": "1248*832",
  "2:3": "832*1248",
};

/** wan2.6-t2i / wan2.6-image / wan2.5-t2i — total pixels ≥ 1280*1280. */
export const WAN26_RATIO_MAP: Record<string, string> = {
  "1:1": "1280*1280",
  "16:9": "1696*960",
  "9:16": "960*1696",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
};

/** wan2.2 and earlier t2i / wanx*-t2i — 1024 class. */
export const WAN_LEGACY_RATIO_MAP: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "3:4": "768*1152",
  "4:3": "1152*768",
};

/** wanx-v1 only documents these discrete sizes. */
export const WANX_V1_RATIO_MAP: Record<string, string> = {
  "1:1": "1024*1024",
  "9:16": "720*1280",
  "3:4": "768*1152",
  "16:9": "1280*720",
};

/** wan2.5-i2i — total pixels up to ~1280*1280. */
export const WAN25_I2I_RATIO_MAP: Record<string, string> = {
  "1:1": "1280*1280",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1152*864",
  "3:4": "864*1152",
};

/** @deprecated Prefer profile maps; kept for callers that still think in sync/async. */
export const SYNC_RATIO_MAP = QWEN_IMAGE_20_RATIO_MAP;
/** @deprecated Prefer profile maps; kept as qwen-image-plus/max fixed presets. */
export const ASYNC_RATIO_MAP = QWEN_IMAGE_FIXED_RATIO_MAP;

const PROFILE_RATIO_MAPS: Record<ImageSizeProfile, Record<string, string>> = {
  "qwen-image-2.0": QWEN_IMAGE_20_RATIO_MAP,
  "qwen-image-fixed": QWEN_IMAGE_FIXED_RATIO_MAP,
  wan27: WAN27_RATIO_MAP,
  "z-image": Z_IMAGE_RATIO_MAP,
  wan26: WAN26_RATIO_MAP,
  "wan-legacy": WAN_LEGACY_RATIO_MAP,
  "wanx-v1": WANX_V1_RATIO_MAP,
  "wan25-i2i": WAN25_I2I_RATIO_MAP,
};

/** Resolve `--size` with an explicit model size profile. */
export function resolveImageSize(input: string, sizeProfile: ImageSizeProfile): string;
export function resolveImageSize(
  input: string | undefined,
  sizeProfile: ImageSizeProfile,
): string | undefined;
/** @deprecated Prefer `ImageSizeProfile`; boolean maps sync→qwen-image-2.0 / async→qwen-image-fixed. */
export function resolveImageSize(input: string, useSync: boolean): string;
export function resolveImageSize(input: string | undefined, useSync: boolean): string | undefined;
export function resolveImageSize(
  input: string | undefined,
  sizeProfileOrUseSync: ImageSizeProfile | boolean,
): string | undefined {
  if (!input) return undefined;
  const profile: ImageSizeProfile =
    typeof sizeProfileOrUseSync === "boolean"
      ? sizeProfileOrUseSync
        ? "qwen-image-2.0"
        : "qwen-image-fixed"
      : sizeProfileOrUseSync;
  const map = PROFILE_RATIO_MAPS[profile];
  return map[input] ?? input;
}
