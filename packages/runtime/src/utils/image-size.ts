import { UsageError } from "bailian-cli-core";

/**
 * Resolve image `size` flag for image generate/edit.
 *
 * Users may pass either a ratio (e.g. "1:1", "3:4", "16:9") or a pixel size
 * (e.g. "2048*2048" / 1024×1024). The DashScope API only accepts the pixel format, so we
 * map known ratios to the recommended pixel size for each model family.
 *
 * Sync models (qwen-image-2.0 / qwen-image-max / qwen-image-edit-2.0):
 * higher-resolution presets.
 *
 * Async models (wanx2.x): smaller presets.
 *
 * Pixel-format input is passed through unchanged.
 */

export const SYNC_RATIO_MAP: Record<string, string> = {
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "1:1": "2048*2048",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
};

export const ASYNC_RATIO_MAP: Record<string, string> = {
  "16:9": "1664*928",
  "4:3": "1472*1104",
  "1:1": "1328*1328",
  "3:4": "1104*1472",
  "9:16": "928*1664",
};

/** Match pixel sizes: 1024*1024 / 1024x1024 / 1024×1024. */
const PIXEL_SIZE_PATTERN = /^(\d+)\s*[x×*]\s*(\d+)$/i;

/** Resolve `--size`: map known ratios, or normalize pixels to W*H. */
export function resolveImageSize(input: string, useSync: boolean): string;
export function resolveImageSize(input: string | undefined, useSync: boolean): string | undefined;
export function resolveImageSize(input: string | undefined, useSync: boolean): string | undefined {
  if (!input) return undefined;

  const trimmed = input.trim();
  const map = useSync ? SYNC_RATIO_MAP : ASYNC_RATIO_MAP;

  const mappedRatio = map[trimmed];
  if (mappedRatio) return mappedRatio;

  const pixelMatch = trimmed.match(PIXEL_SIZE_PATTERN);
  if (pixelMatch) {
    return `${pixelMatch[1]}*${pixelMatch[2]}`;
  }

  const knownRatios = Object.keys(map).join(", ");
  throw new UsageError(
    `Invalid --size "${input}". Use pixels (1024*1024 or 1024x1024) or a known ratio (${knownRatios}).`,
  );
}
