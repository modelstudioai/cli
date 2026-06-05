import { readFileSync } from "fs";
import { join } from "path";

import { PACKAGES, ROOT, readPackageJson } from "./packages.mjs";

const README_FILES = ["README.md", "README_CN.md"];

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
  const jsonByKey = new Map();
  for (const pkg of PACKAGES) {
    const json = readPackageJson(pkg);
    if (json.name !== pkg.name) {
      throw new Error(`${pkg.dir} name must be ${pkg.name}, got ${json.name}`);
    }
    jsonByKey.set(pkg.key, json);
  }

  const coreJson = jsonByKey.get("core");
  const cliJson = jsonByKey.get("cli");

  if (cliJson.version !== coreJson.version) {
    throw new Error(
      `core and cli versions must match, got ${coreJson.version} and ${cliJson.version}.`,
    );
  }

  const cliCoreDep = cliJson.dependencies?.["bailian-cli-core"];
  if (cliCoreDep !== "workspace:*") {
    throw new Error(
      `packages/cli source dependency on bailian-cli-core must be "workspace:*", got ${cliCoreDep}.`,
    );
  }

  return { coreJson, cliJson };
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
