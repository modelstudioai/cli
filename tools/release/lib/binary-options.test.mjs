import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelManifestFileName,
  normalizeModeChannel,
  rollingChannelReleaseTag,
  rollingManifestChannelId,
  rollingManifestFileName,
  STABLE_ROLLING_CHANNEL,
  SYNC_RELEASE_CHANNEL,
} from "./binary-options.mjs";

describe("rolling CDN manifest naming", () => {
  it("keeps sync-release and latest constants", () => {
    assert.equal(SYNC_RELEASE_CHANNEL, "sync-release");
    assert.equal(STABLE_ROLLING_CHANNEL, "latest");
  });

  it("channel mode always rolls sync-release.json regardless of npm dist-tag", () => {
    const { mode, channel } = normalizeModeChannel("channel", "mcp");
    assert.equal(mode, "channel");
    assert.equal(channel, "mcp");
    assert.equal(rollingManifestFileName(mode), "sync-release.json");
    assert.equal(rollingManifestChannelId(mode), "sync-release");
    assert.equal(rollingChannelReleaseTag(mode), "channel-sync-release");
  });

  it("stable mode rolls latest.json for maintainReleaseManifest input", () => {
    const { mode, channel } = normalizeModeChannel("stable", null);
    assert.equal(mode, "stable");
    assert.equal(channel, null);
    assert.equal(rollingManifestFileName(mode), "latest.json");
    assert.equal(rollingManifestChannelId(mode), "latest");
  });

  it("channelManifestFileName still formats arbitrary names for helpers", () => {
    assert.equal(channelManifestFileName("release-test"), "release-test.json");
    assert.equal(channelManifestFileName(SYNC_RELEASE_CHANNEL), "sync-release.json");
  });
});
