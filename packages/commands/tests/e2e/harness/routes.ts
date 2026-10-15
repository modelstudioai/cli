import { readFileSync } from "node:fs";
import type { AnyCommand } from "bailian-cli-core";
import type { E2eRouteExports } from "../topic-routes.ts";

const libraryIndex = new URL("../../../src/index.ts", import.meta.url);
interface ExportTarget {
  moduleUrl: URL;
  importedName: string;
}
const exportMaps = new Map<string, Map<string, ExportTarget>>();

function declaredExports(index: URL): Map<string, ExportTarget> {
  const cached = exportMaps.get(index.href);
  if (cached) return cached;
  const source = readFileSync(index, "utf8");
  const exports = new Map<string, ExportTarget>();
  const declaration = /export\s*\{([^}]+)\}\s*from\s*(["'])([^"']+)\2/g;
  for (const match of source.matchAll(declaration)) {
    for (const entry of match[1]!.split(",")) {
      const alias = /^\s*([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(entry);
      if (alias)
        exports.set(alias[2] ?? alias[1]!, {
          importedName: alias[1]!,
          moduleUrl: new URL(match[3]!, index),
        });
    }
  }
  exportMaps.set(index.href, exports);
  return exports;
}

/** Resolve public export names without evaluating the complete command barrel. */
export async function loadRouteCommands(
  routes: E2eRouteExports,
  index: URL = libraryIndex,
): Promise<Record<string, AnyCommand>> {
  const exports = declaredExports(index);
  const entries = await Promise.all(
    Object.entries(routes).map(async ([path, exportName]) => {
      const target = exports.get(exportName);
      if (!target) throw new Error(`Unknown bailian-cli-commands export: ${exportName}`);
      const command: unknown = (await import(target.moduleUrl.href))[target.importedName];
      if (typeof command !== "object" || command === null || !("run" in command))
        throw new Error(`Unknown bailian-cli-commands export: ${exportName}`);
      return [path, command as AnyCommand] as const;
    }),
  );
  return Object.fromEntries(entries);
}
