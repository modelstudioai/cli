import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  BINARY_PRODUCT_CLIENT_NAME,
  detectInstallMethod,
  getInstallMethod,
  getUpdateInstallMethod,
  isCompiledBinary,
  binaryAssetFileName,
  binaryInnerFileName,
  writeInstallMethodSync,
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

test("getInstallMethod isolates products from shared legacy binary marker", () => {
  const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const savedInstallMethod = process.env.BAILIAN_INSTALL_METHOD;
  const dir = mkdtempSync(join(tmpdir(), "bl-install-method-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  delete process.env.BAILIAN_INSTALL_METHOD;

  try {
    writeFileSync(join(dir, "install-method"), "binary\n", { mode: 0o600 });

    expect(getInstallMethod({ clientName: BINARY_PRODUCT_CLIENT_NAME })).toBe("binary");
    expect(getInstallMethod({ clientName: "knowledge-studio-cli" })).toBe("npm");
    expect(
      getUpdateInstallMethod({
        clientName: "knowledge-studio-cli",
        npmPackage: "knowledge-studio-cli",
      }),
    ).toBe("npm");
  } finally {
    if (savedConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = savedConfigDir;
    if (savedInstallMethod === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
    else process.env.BAILIAN_INSTALL_METHOD = savedInstallMethod;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeInstallMethodSync writes product marker and legacy for bailian-cli", () => {
  const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const savedInstallMethod = process.env.BAILIAN_INSTALL_METHOD;
  const dir = mkdtempSync(join(tmpdir(), "bl-install-method-write-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  delete process.env.BAILIAN_INSTALL_METHOD;

  try {
    writeInstallMethodSync("binary", { clientName: BINARY_PRODUCT_CLIENT_NAME });
    expect(getInstallMethod({ clientName: BINARY_PRODUCT_CLIENT_NAME })).toBe("binary");
    expect(getInstallMethod()).toBe("binary");
    expect(getInstallMethod({ clientName: "knowledge-studio-cli" })).toBe("npm");
  } finally {
    if (savedConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = savedConfigDir;
    if (savedInstallMethod === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
    else process.env.BAILIAN_INSTALL_METHOD = savedInstallMethod;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getUpdateInstallMethod forces npm for non-bailian products even with binary env", () => {
  const previous = process.env.BAILIAN_INSTALL_METHOD;
  process.env.BAILIAN_INSTALL_METHOD = "binary";
  expect(
    getUpdateInstallMethod({
      clientName: "knowledge-studio-cli",
      npmPackage: "knowledge-studio-cli",
    }),
  ).toBe("npm");
  expect(
    getUpdateInstallMethod({
      clientName: BINARY_PRODUCT_CLIENT_NAME,
      npmPackage: BINARY_PRODUCT_CLIENT_NAME,
    }),
  ).toBe("binary");
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
