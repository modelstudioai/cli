import { statSync } from "fs";
import { join } from "path";

import { ROOT, tarballFileName } from "./packages.mjs";
import { run, tryRun } from "./proc.mjs";

/** Returns true if the exact name@version already exists on the registry. */
export function npmViewExists(name, version) {
  const result = tryRun("npm", ["view", `${name}@${version}`, "version"]);
  if (result.status === 0 && result.stdout.includes(version)) return true;
  // npm view returns non-zero ("E404") for unknown versions; treat as "does not exist"
  if (result.stderr.includes("E404") || result.stderr.includes("404")) return false;
  if (result.status !== 0) {
    throw new Error(`npm view ${name}@${version} failed: ${result.stderr || result.stdout}`);
  }
  return false;
}

export function pnpmPack(pkg, destDir, json) {
  run("pnpm", ["--filter", pkg.name, "pack", "--pack-destination", destDir], { cwd: ROOT });
  const tarball = join(destDir, tarballFileName(pkg.name, json.version));
  statSync(tarball);
  return tarball;
}

export function pnpmPublish(pkg, { tag, provenance = true, dryRun = false } = {}) {
  const args = ["--filter", pkg.name, "publish", "--no-git-checks"];
  if (tag) args.push("--tag", tag);
  // --provenance requires OIDC; suppress in dry-run so local devs can test
  // the pipeline without GitHub Actions credentials.
  if (provenance && !dryRun) args.push("--provenance");
  if (dryRun) args.push("--dry-run");
  run("pnpm", args, { cwd: ROOT });
}
