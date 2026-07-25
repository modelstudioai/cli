/**
 * Shared mode / channel / manifest naming for binary-build and binary-release.
 *
 * Every mode writes a rolling channel manifest: stable writes `latest.json`
 * (uploaded to the OSS prefix root only, never attached to the GitHub Release),
 * channel writes `<channel>.json` (attached to the rolling `channel-<name>`
 * GitHub Release and uploaded to the OSS prefix root).
 */
import { assertChannel } from "./validate.mjs";

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

/** Rolling-manifest basename: `latest.json` for stable, `<channel>.json` otherwise. */
export function channelManifestFileName(channel) {
  if (!channel) throw new Error("channelManifestFileName requires a channel name");
  return `${channel}.json`;
}
