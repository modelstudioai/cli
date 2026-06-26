import { readFileSync } from "fs";
import { join } from "path";

import { PACKAGES, ROOT, readPackageJson } from "./packages.mjs";

const README_FILES = ["README.md", "README.zh.md"];

export function assertReadmeSync() {
  for (const file of README_FILES) {
    const rootBuf = readFileSync(join(ROOT, file));
    const cliBuf = readFileSync(join(ROOT, "packages/cli", file));
    if (!rootBuf.equals(cliBuf)) {
      throw new Error(
        `${file} differs between root and packages/cli. ` +
          `Sync them manually (e.g. \`cp ${file} packages/cli/${file}\`).`,
      );
    }
  }
}

export function loadAndValidatePackages() {
  const internalNames = new Set(PACKAGES.map((p) => p.name));
  const jsonByKey = new Map();
  for (const pkg of PACKAGES) {
    const json = readPackageJson(pkg);
    if (json.name !== pkg.name) {
      throw new Error(`${pkg.dir} name must be ${pkg.name}, got ${json.name}`);
    }
    jsonByKey.set(pkg.key, json);
  }

  const coreJson = jsonByKey.get("core");
  const version = coreJson.version;

  for (const pkg of PACKAGES) {
    const json = jsonByKey.get(pkg.key);
    // All packages release in lockstep, so every version must match.
    if (json.version !== version) {
      throw new Error(
        `all package versions must match ${version} (bailian-cli-core), ` +
          `but ${pkg.name} is ${json.version}.`,
      );
    }
    // Any runtime dependency on a sibling workspace package must be "workspace:*"
    // so `pnpm publish` rewrites it to the concrete release version.
    for (const [dep, range] of Object.entries(json.dependencies ?? {})) {
      if (internalNames.has(dep) && range !== "workspace:*") {
        throw new Error(`${pkg.name} dependency on ${dep} must be "workspace:*", got ${range}.`);
      }
    }
  }

  return { coreJson, cliJson: jsonByKey.get("cli") };
}

const RESERVED_CHANNELS = new Set(["latest", "beta", "alpha", "next", "rc", "canary", "dev"]);
const CHANNEL_FORMAT = /^[a-z][a-z0-9-]{1,30}$/;

export function assertChannel(channel) {
  if (!channel || typeof channel !== "string") {
    throw new Error("channel is required");
  }
  if (!CHANNEL_FORMAT.test(channel)) {
    throw new Error(
      `channel "${channel}" must match ${CHANNEL_FORMAT} (lowercase letters/digits/dashes, start with a letter, 2-31 chars).`,
    );
  }
  if (RESERVED_CHANNELS.has(channel)) {
    throw new Error(
      `channel "${channel}" is reserved (${[...RESERVED_CHANNELS].join(", ")}); pick a different name.`,
    );
  }
}
