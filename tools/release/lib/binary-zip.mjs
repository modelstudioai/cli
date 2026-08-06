/**
 * Pack a Bun-compiled binary into a per-platform `.zip` Release asset.
 *
 * Called by binary-build.mjs after compile + smoke test.
 * Naming (`bl-<ver>-<os>-<arch>.zip`) stays in binary-build (contract source).
 */
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function defaultLog(message = "") {
  process.stdout.write(`${message}\n`);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureZip() {
  const result = spawnSync("zip", ["-h"], { encoding: "utf-8" });
  if (result.error?.code === "ENOENT") {
    throw new Error("zip not found on PATH. Install zip (e.g. apt-get install zip).");
  }
}

/**
 * Pack compiled binary into `zipFileName` under `outdir` and remove the raw file.
 *
 * @param {{ innerName: string, innerPath: string, os: string, arch: string }} compiled
 * @param {{ outdir: string, zipFileName: string, log?: (message?: string) => void }} options
 */
export function zipOne(compiled, { outdir, zipFileName, log = defaultLog }) {
  const zipPath = join(outdir, zipFileName);
  log(`zip ${compiled.innerName} → ${zipFileName}`);

  // -j: store basename only (no directory path inside the archive)
  const result = spawnSync("zip", ["-j", "-q", zipFileName, compiled.innerName], {
    cwd: outdir,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`zip failed for ${compiled.innerName}`);
  }
  unlinkSync(compiled.innerPath);
  return {
    fileName: zipFileName,
    outfile: zipPath,
    innerName: compiled.innerName,
    os: compiled.os,
    arch: compiled.arch,
    sha256: sha256File(zipPath),
  };
}
