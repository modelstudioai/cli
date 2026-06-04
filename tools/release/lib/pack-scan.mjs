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

/**
 * pnpm pack each package, then run publint / attw / gitleaks on the tarball
 * or the extracted directory. attw only runs on packages that declare types.
 */
export function packAndScan({ log }) {
  const tempDir = mkdtempSync(join(tmpdir(), "bailian-release-"));
  try {
    for (const pkg of PACKAGES) {
      const json = readPackageJson(pkg);
      log(`packing ${pkg.name}@${json.version}`);
      const tarball = pnpmPack(pkg, tempDir, json);
      const extractDir = extractTarball(tarball, tempDir, pkg.key);

      log(`publint ${pkg.name}`);
      run("npx", ["--yes", "publint", extractDir]);

      if (json.types) {
        log(`attw ${pkg.name}`);
        run("npx", ["--yes", "@arethetypeswrong/cli", "--pack", extractDir]);
      }

      log(`gitleaks ${pkg.name}`);
      run("gitleaks", ["detect", "--source", extractDir, "--no-git", "--redact"]);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
