import { expect, test } from "vite-plus/test";
import {
  detectInstallMethod,
  isCompiledBinary,
  binaryAssetFileName,
  binaryInnerFileName,
} from "../src/install/index.ts";

test("isCompiledBinary respects BAILIAN_COMPILED", () => {
  const previous = process.env.BAILIAN_COMPILED;
  process.env.BAILIAN_COMPILED = "1";
  expect(isCompiledBinary()).toBe(true);
  if (previous === undefined) delete process.env.BAILIAN_COMPILED;
  else process.env.BAILIAN_COMPILED = previous;
});

test("detectInstallMethod respects BAILIAN_INSTALL_METHOD", () => {
  const previous = process.env.BAILIAN_INSTALL_METHOD;
  process.env.BAILIAN_INSTALL_METHOD = "binary";
  expect(detectInstallMethod()).toBe("binary");
  process.env.BAILIAN_INSTALL_METHOD = "npm";
  expect(detectInstallMethod()).toBe("npm");
  if (previous === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
  else process.env.BAILIAN_INSTALL_METHOD = previous;
});

test("binaryAssetFileName uses per-platform zip", () => {
  expect(binaryAssetFileName("1.2.3", "windows", "x64", true)).toBe("bl-1.2.3-windows-x64.zip");
  expect(binaryAssetFileName("1.2.3", "darwin", "arm64", false)).toBe("bl-1.2.3-darwin-arm64.zip");
});

test("binaryInnerFileName keeps exe suffix inside zip", () => {
  expect(binaryInnerFileName("1.2.3", "windows", "x64", true)).toBe("bl-1.2.3-windows-x64.exe");
  expect(binaryInnerFileName("1.2.3", "darwin", "arm64", false)).toBe("bl-1.2.3-darwin-arm64");
});

test("channelManifestUrl maps stable to manifest.json", async () => {
  const { channelManifestUrl } = await import("../src/install/cdn.ts");
  const previous = process.env.BAILIAN_CLI_CDN;
  delete process.env.BAILIAN_CLI_CDN;
  expect(channelManifestUrl()).toBe(
    "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release/manifest.json",
  );
  expect(channelManifestUrl("latest")).toBe(
    "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release/manifest.json",
  );
  expect(channelManifestUrl("sync-release")).toBe(
    "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release/sync-release.json",
  );
  if (previous === undefined) delete process.env.BAILIAN_CLI_CDN;
  else process.env.BAILIAN_CLI_CDN = previous;
});
