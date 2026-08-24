import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const PACKAGES = [
  { key: "core", dir: "packages/core", name: "bailian-cli-core" },
  { key: "runtime", dir: "packages/runtime", name: "bailian-cli-runtime" },
  { key: "commands", dir: "packages/commands", name: "bailian-cli-commands" },
  { key: "cli", dir: "packages/cli", name: "bailian-cli" },
];

// knowledge-studio-cli shares the same library deps as bailian-cli.
// Published via publish.yml with package=knowledge-studio-cli (passes --knowledge flag).
export const KSCLI_PACKAGE = { key: "kscli", dir: "packages/kscli", name: "knowledge-studio-cli" };
export const ALL_PACKAGES = [...PACKAGES, KSCLI_PACKAGE];

// Deliberately absent from every list above: packages/bailian-kb-dsh (bailian-kb-dsh).
// It is a dsh plugin — a downstream host adapter, not part of the bl release closure:
// its version tracks the dsh rc cadence instead of the locked core/runtime/commands/cli/kscli
// version, and it ships through .github/workflows/publish-kb-dsh.yml. So it is exempt from
// loadAndValidatePackages' version-consistency check and from packAndScan. Not an oversight;
// see docs/agents/dsh-plugin.md before adding it here.

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function packageJsonPath(pkg) {
  return join(ROOT, pkg.dir, "package.json");
}

export function readPackageJson(pkg) {
  return readJson(packageJsonPath(pkg));
}

export function writePackageJson(pkg, json) {
  writeFileSync(packageJsonPath(pkg), `${JSON.stringify(json, null, 2)}\n`);
}

export function tarballFileName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

export function findPackage(key) {
  const pkg = PACKAGES.find((p) => p.key === key);
  if (!pkg) throw new Error(`unknown package key: ${key}`);
  return pkg;
}
