import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vite-plus/test";
import {
  BINARY_TARGETS,
  binaryTarAssetName,
  matrixAssetNames,
  unixTarTarget,
} from "./binary-build.mjs";
import { tarOne } from "./binary-tar.mjs";

describe("binary archive matrix", () => {
  test("unix targets ship zip and tar.gz; windows is zip-only", () => {
    const names = matrixAssetNames("1.2.3");
    expect(names).toEqual([
      "bl-1.2.3-darwin-arm64.zip",
      "bl-1.2.3-darwin-arm64.tar.gz",
      "bl-1.2.3-darwin-x64.zip",
      "bl-1.2.3-darwin-x64.tar.gz",
      "bl-1.2.3-linux-x64.zip",
      "bl-1.2.3-linux-x64.tar.gz",
      "bl-1.2.3-windows-x64.zip",
    ]);
    expect(BINARY_TARGETS.filter((target) => unixTarTarget(target))).toHaveLength(3);
    expect(binaryTarAssetName("1.2.3", { os: "linux", arch: "x64" })).toBe(
      "bl-1.2.3-linux-x64.tar.gz",
    );
  });
});

describe("tarOne", () => {
  test("tar.gz stores basename only and round-trips bytes", () => {
    const outdir = mkdtempSync(join(tmpdir(), "bl-bin-tar-"));
    try {
      const innerName = "bl-9.9.9-linux-x64";
      const innerPath = join(outdir, innerName);
      writeFileSync(innerPath, "fake-binary-payload\n");
      chmodSync(innerPath, 0o755);
      const packed = tarOne(
        { innerName, innerPath, os: "linux", arch: "x64" },
        { outdir, tarFileName: "bl-9.9.9-linux-x64.tar.gz" },
      );
      expect(packed.fileName).toBe("bl-9.9.9-linux-x64.tar.gz");
      expect(packed.sha256).toMatch(/^[a-f0-9]{64}$/);

      const extractDir = join(outdir, "out");
      mkdirSync(extractDir);
      const extract = spawnSync("tar", ["-C", extractDir, "-xzf", packed.outfile, innerName], {
        encoding: "utf-8",
      });
      expect(extract.status).toBe(0);
      expect(readFileSync(join(extractDir, innerName), "utf-8")).toBe("fake-binary-payload\n");
    } finally {
      rmSync(outdir, { recursive: true, force: true });
    }
  });
});
