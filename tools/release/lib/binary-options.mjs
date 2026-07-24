/**
 * Shared mode / channel / manifest naming for binary-build and binary-release.
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

/** Manifest basename written to dist-bin / uploaded to Releases. */
export function manifestFileName(mode, channel) {
  return mode === "stable" ? "latest.json" : `${channel}.json`;
}
