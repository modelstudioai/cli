import { expect, test } from "vite-plus/test";
import {
  detectInstallMethod,
  isCompiledBinary,
  binaryAssetFileName,
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

test("binaryAssetFileName formats windows exe", () => {
  expect(binaryAssetFileName("1.2.3", "windows", "x64", true)).toBe("bl-1.2.3-windows-x64.exe");
  expect(binaryAssetFileName("1.2.3", "darwin", "arm64", false)).toBe("bl-1.2.3-darwin-arm64");
});
