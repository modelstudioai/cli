/**
 * Shared mode / channel / manifest naming for binary-build and binary-release.
 *
 * Rolling CDN pointers (bailian-cli binary):
 *   - stable  → build writes `latest.json`; OSS maintains `manifest.json` (+ `latest.json`)
 *   - channel → always `sync-release.json` on OSS / GH rolling release `channel-sync-release`
 *
 * The workflow `--channel` value remains the npm dist-tag (and versioned GH release notes).
 * It does not choose the CDN rolling filename.
 */
import { assertChannel } from "./validate.mjs";

/** Official bailian-cli channel/verify rolling manifest name on CDN. */
export const SYNC_RELEASE_CHANNEL = "sync-release";

/** Stable build-local rolling manifest (fed into maintainReleaseManifest). */
export const STABLE_ROLLING_CHANNEL = "latest";

/**
 * @param {string} mode
 * @param {string | null | undefined} channel
 * @returns {{ mode: "stable" | "channel", channel: string | null }}
 */
export function normalizeModeChannel(mode = "stable", channel = null) {
  if (mode !== "stable" && mode !== "channel") {
    throw new Error(`--mode must be stable or channel, got: ${mode}`);
  }
  if (mode === "channel") {
    if (!channel) throw new Error("--mode channel requires --channel <name>");
    assertChannel(channel);
    if (channel === "stable") {
      throw new Error(`--channel cannot be "stable"; use --mode stable`);
    }
    return { mode, channel };
  }
  return { mode: "stable", channel: null };
}

/**
 * Rolling-manifest basename for a logical channel id inside a build artifact.
 * Prefer {@link rollingManifestFileName} for mode-aware naming.
 */
export function channelManifestFileName(channel) {
  if (!channel) throw new Error("channelManifestFileName requires a channel name");
  return `${channel}.json`;
}

/**
 * Rolling manifest basename written by binary-build / uploaded to OSS root.
 * - stable → `latest.json`
 * - channel → always `sync-release.json` (ignores npm dist-tag name)
 *
 * @param {"stable" | "channel"} mode
 * @returns {string}
 */
export function rollingManifestFileName(mode) {
  if (mode === "stable") return channelManifestFileName(STABLE_ROLLING_CHANNEL);
  if (mode === "channel") return channelManifestFileName(SYNC_RELEASE_CHANNEL);
  throw new Error(`rollingManifestFileName: unknown mode ${mode}`);
}

/** Channel id embedded in the rolling manifest JSON body. */
export function rollingManifestChannelId(mode) {
  if (mode === "stable") return STABLE_ROLLING_CHANNEL;
  if (mode === "channel") return SYNC_RELEASE_CHANNEL;
  throw new Error(`rollingManifestChannelId: unknown mode ${mode}`);
}

/** GitHub rolling prerelease tag that holds only the CDN channel pointer. */
export function rollingChannelReleaseTag(mode) {
  if (mode !== "channel") {
    throw new Error("rollingChannelReleaseTag is only valid for mode=channel");
  }
  return `channel-${SYNC_RELEASE_CHANNEL}`;
}
