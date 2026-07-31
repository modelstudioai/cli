import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  ensureBinaryPathEntries,
  getBinaryBinRoot,
  getBinaryCurrentPath,
  getBinaryShareRoot,
  getBinaryVersionsDir,
  normalizeBinaryVersion,
  pruneBinaryVersions,
  readCurrentVersionDir,
  resolveBinaryDownloadSpec,
  switchCurrentToVersion,
} from "../src/utils/binary-update.ts";
import { binaryAssetFileName, releaseAssetUrl } from "bailian-cli-core";

function withTempBinaryRoots(run: () => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "bl-binary-layout-"));
  const previousShare = process.env.BAILIAN_SHARE_DIR;
  const previousBin = process.env.BAILIAN_BIN_DIR;
  process.env.BAILIAN_SHARE_DIR = root;
  process.env.BAILIAN_BIN_DIR = join(root, "path-bin");
  return run().finally(() => {
    if (previousShare === undefined) delete process.env.BAILIAN_SHARE_DIR;
    else process.env.BAILIAN_SHARE_DIR = previousShare;
    if (previousBin === undefined) delete process.env.BAILIAN_BIN_DIR;
    else process.env.BAILIAN_BIN_DIR = previousBin;
    rmSync(root, { recursive: true, force: true });
  });
}

function seedVersion(version: string): string {
  const versionDir = join(getBinaryVersionsDir(), version);
  mkdirSync(versionDir, { recursive: true });
  const binaryName = process.platform === "win32" ? "bl.exe" : "bl";
  writeFileSync(join(versionDir, binaryName), "fake-binary");
  if (process.platform === "win32") {
    writeFileSync(join(versionDir, "bailian.exe"), "fake-binary");
  }
  return versionDir;
}

test("share/bin roots respect BAILIAN_* overrides", async () => {
  await withTempBinaryRoots(async () => {
    expect(getBinaryShareRoot()).toContain("bl-binary-layout-");
    expect(getBinaryBinRoot()).toBe(join(getBinaryShareRoot(), "path-bin"));
    expect(getBinaryCurrentPath()).toBe(join(getBinaryShareRoot(), "current"));
  });
});

test("switchCurrentToVersion retargets current pointer", async () => {
  await withTempBinaryRoots(async () => {
    const firstDir = seedVersion("1.0.0");
    await switchCurrentToVersion("1.0.0");
    expect(await readCurrentVersionDir()).toBe(firstDir);

    const secondDir = seedVersion("1.1.0");
    await switchCurrentToVersion("1.1.0");
    expect(await readCurrentVersionDir()).toBe(secondDir);
  });
});

test("pruneBinaryVersions keeps current and requested previous only", async () => {
  await withTempBinaryRoots(async () => {
    seedVersion("1.0.0");
    seedVersion("1.1.0");
    seedVersion("1.2.0");
    await switchCurrentToVersion("1.2.0");
    await pruneBinaryVersions(["1.2.0", "1.1.0"]);

    expect(existsSync(join(getBinaryVersionsDir(), "1.2.0"))).toBe(true);
    expect(existsSync(join(getBinaryVersionsDir(), "1.1.0"))).toBe(true);
    expect(existsSync(join(getBinaryVersionsDir(), "1.0.0"))).toBe(false);
  });
});

test("normalizeBinaryVersion strips release-style v prefix", () => {
  expect(normalizeBinaryVersion("v1.2.3")).toBe("1.2.3");
  expect(normalizeBinaryVersion("1.2.3")).toBe("1.2.3");
  expect(normalizeBinaryVersion(" 0.1.14-channel.1 ")).toBe("0.1.14-channel.1");
});

test("resolveBinaryDownloadSpec targets version assets, not latest manifest url", async () => {
  const version = "0.1.14-channel.1";
  const { detectBinaryPlatform } = await import("bailian-cli-core");
  const { os, arch } = detectBinaryPlatform();
  const zipName = binaryAssetFileName(version, os, arch);
  const sumsSha = "deadbeef".repeat(8);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/SHA256SUMS")) {
      return new Response(`${sumsSha}  ${zipName}\n`, { status: 200 });
    }
    if (url.endsWith("/manifest.json")) {
      return new Response(
        JSON.stringify({
          version: "9.9.9",
          assets: {
            [`${os}-${arch}`]: {
              file: `bl-9.9.9-${os}-${arch}.zip`,
              sha256: "aa".repeat(32),
              url: "https://example.invalid/wrong.zip",
            },
          },
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const spec = await resolveBinaryDownloadSpec(`v${version}`);
    expect(spec.zipName).toBe(zipName);
    expect(spec.url).toBe(releaseAssetUrl(version, zipName));
    expect(spec.url).not.toContain("wrong.zip");
    expect(spec.expectedSha).toBe(sumsSha);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ensureBinaryPathEntries wires PATH entries through current", async () => {
  await withTempBinaryRoots(async () => {
    seedVersion("2.0.0");
    await switchCurrentToVersion("2.0.0");
    await ensureBinaryPathEntries("2.0.0");

    if (process.platform === "win32") {
      const binRoot = getBinaryBinRoot();
      const target = readlinkSync(binRoot);
      expect(target.replaceAll("/", "\\").toLowerCase()).toBe(
        getBinaryCurrentPath().replaceAll("/", "\\").toLowerCase(),
      );
    } else {
      const blLink = readlinkSync(join(getBinaryBinRoot(), "bl"));
      const bailianLink = readlinkSync(join(getBinaryBinRoot(), "bailian"));
      expect(blLink).toBe(join(getBinaryCurrentPath(), "bl"));
      expect(bailianLink).toBe(join(getBinaryCurrentPath(), "bl"));
    }
  });
});
