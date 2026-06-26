import { mkdtempSync, renameSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { PACKAGES, readPackageJson } from "./packages.mjs";
import { pnpmPack } from "./npm.mjs";
import { run } from "./proc.mjs";

function extractTarball(tarball, tempDir, key) {
  run("tar", ["-xzf", tarball, "-C", tempDir], { stdio: "pipe" });
  const extractDir = join(tempDir, `extract-${key}`);
  renameSync(join(tempDir, "package"), extractDir);
  return extractDir;
}

export function packAndScan({ log, packages }) {
  const pkgs = packages ?? PACKAGES;
  const tempDir = mkdtempSync(join(tmpdir(), "bailian-release-"));
  try {
    for (const pkg of pkgs) {
      const json = readPackageJson(pkg);
      log(`packing ${pkg.name}@${json.version}`);
      const tarball = pnpmPack(pkg, tempDir, json);
      const extractDir = extractTarball(tarball, tempDir, pkg.key);

      log(`publint ${pkg.name}`);
      run("npx", ["--yes", "publint", extractDir]);

      log(`gitleaks ${pkg.name}`);
      run("gitleaks", ["detect", "--source", extractDir, "--no-git", "--redact"]);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
