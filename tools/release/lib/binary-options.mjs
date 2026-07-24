/**
 * Shared mode / channel / manifest naming for binary-build and binary-release.
 *
 * Stable releases no longer write `latest.json` (OSS `channels/latest.json` is
 * maintained outside this repo / by FC). Channel mode still writes `<channel>.json`
 * onto the rolling `channel-<name>` GitHub Release.
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

/** Channel rolling-manifest basename (`mcp.json`, …). Stable has none. */
export function channelManifestFileName(channel) {
  if (!channel) throw new Error("channelManifestFileName requires a channel name");
  return `${channel}.json`;
}
