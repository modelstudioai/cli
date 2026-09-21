/**
 * Pack a Bun-compiled Unix binary into a per-platform `.tar.gz` Release asset.
 * Windows stays zip-only (install.ps1 / Expand-Archive).
 *
 * Called by binary-build.mjs after compile + smoke test, before zipOne removes
 * the inner file. Naming (`bl-<ver>-<os>-<arch>.tar.gz`) stays in binary-build.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function defaultLog(message = "") {
  process.stdout.write(`${message}\n`);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureTar() {
  const result = spawnSync("tar", ["--help"], { encoding: "utf-8" });
  if (result.error?.code === "ENOENT") {
    throw new Error("tar not found on PATH. A POSIX tar is required to pack unix .tar.gz assets.");
  }
}

/**
 * Pack compiled binary into `tarFileName` under `outdir`. Does not delete the inner file.
 *
 * @param {{ innerName: string, innerPath: string, os: string, arch: string }} compiled
 * @param {{ outdir: string, tarFileName: string, log?: (message?: string) => void }} options
 */
export function tarOne(compiled, { outdir, tarFileName, log = defaultLog }) {
  const tarPath = join(outdir, tarFileName);
  log(`tar ${compiled.innerName} → ${tarFileName}`);

  // Store basename only (no directory path). GNU / BSD / BusyBox: tar -czf archive file
  const result = spawnSync("tar", ["-czf", tarFileName, compiled.innerName], {
    cwd: outdir,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`tar failed for ${compiled.innerName}`);
  }
  return {
    fileName: tarFileName,
    outfile: tarPath,
    innerName: compiled.innerName,
    os: compiled.os,
    arch: compiled.arch,
    sha256: sha256File(tarPath),
  };
}
