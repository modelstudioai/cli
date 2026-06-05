import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const PACKAGES = [
  { key: "core", dir: "packages/core", name: "bailian-cli-core" },
  { key: "cli", dir: "packages/cli", name: "bailian-cli" },
];

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
