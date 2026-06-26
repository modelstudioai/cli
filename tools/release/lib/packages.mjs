import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Dependency order: core ← runtime ← commands ← cli.
// Consumers rely on this ordering for build/publish (dependencies first).
export const PACKAGES = [
  { key: "core", dir: "packages/core", name: "bailian-cli-core" },
  { key: "runtime", dir: "packages/runtime", name: "bailian-cli-runtime" },
  { key: "commands", dir: "packages/commands", name: "bailian-cli-commands" },
  { key: "cli", dir: "packages/cli", name: "bailian-cli" },
];

// knowledge-studio-cli shares the same library deps as bailian-cli.
// Published via a separate workflow (publish-knowledge.yml) with --knowledge flag.
export const KSCLI_PACKAGE = { key: "kscli", dir: "packages/kscli", name: "knowledge-studio-cli" };
export const ALL_PACKAGES = [...PACKAGES, KSCLI_PACKAGE];

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
