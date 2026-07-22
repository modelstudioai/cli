import { join } from "node:path";
import { getConfigDir, type Identity } from "bailian-cli-core";

export function getCommandPacksDir(identity: Identity): string {
  return join(getConfigDir(), "plugins", identity.npmPackage);
}

export function getCommandPacksManifestPath(identity: Identity): string {
  return join(getCommandPacksDir(identity), "package.json");
}

export function getCommandPackRoot(identity: Identity, name: string): string {
  return join(getCommandPacksDir(identity), "node_modules", ...name.split("/"));
}
