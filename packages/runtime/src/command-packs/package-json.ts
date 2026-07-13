import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BailianError, ExitCode, type Identity } from "bailian-cli-core";
import { getCommandPackRoot, getCommandPacksManifestPath } from "./paths.ts";
import type { CommandPackPackageJson, CommandPackSandboxManifest } from "./types.ts";

export async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    throw new BailianError(
      `Could not parse JSON file: ${path}`,
      ExitCode.GENERAL,
      "Repair or remove the invalid file and try again.",
      { cause: error },
    );
  }
}

export async function readCommandPacksManifest(
  identity: Identity,
): Promise<CommandPackSandboxManifest> {
  const path = getCommandPacksManifestPath(identity);
  if (!existsSync(path)) return { dependencies: {} };
  return readJson<CommandPackSandboxManifest>(path);
}

export async function readCommandPackPackageJson(
  identity: Identity,
  name: string,
): Promise<CommandPackPackageJson> {
  return readCommandPackPackageJsonAt(getCommandPackRoot(identity, name));
}

export async function readCommandPackPackageJsonAt(
  packageRoot: string,
): Promise<CommandPackPackageJson> {
  return readJson<CommandPackPackageJson>(join(packageRoot, "package.json"));
}
