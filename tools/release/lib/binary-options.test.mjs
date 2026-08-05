import { describe, expect, test } from "vite-plus/test";
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
  test("keeps sync-release and latest constants", () => {
    expect(SYNC_RELEASE_CHANNEL).toBe("sync-release");
    expect(STABLE_ROLLING_CHANNEL).toBe("latest");
  });

  test("channel mode always rolls sync-release.json regardless of npm dist-tag", () => {
    const { mode, channel } = normalizeModeChannel("channel", "mcp");
    expect(mode).toBe("channel");
    expect(channel).toBe("mcp");
    expect(rollingManifestFileName(mode)).toBe("sync-release.json");
    expect(rollingManifestChannelId(mode)).toBe("sync-release");
    expect(rollingChannelReleaseTag(mode)).toBe("channel-sync-release");
  });

  test("stable mode rolls latest.json for maintainReleaseManifest input", () => {
    const { mode, channel } = normalizeModeChannel("stable", null);
    expect(mode).toBe("stable");
    expect(channel).toBeNull();
    expect(rollingManifestFileName(mode)).toBe("latest.json");
    expect(rollingManifestChannelId(mode)).toBe("latest");
  });

  test("channelManifestFileName still formats arbitrary names for helpers", () => {
    expect(channelManifestFileName("release-test")).toBe("release-test.json");
    expect(channelManifestFileName(SYNC_RELEASE_CHANNEL)).toBe("sync-release.json");
  });
});
