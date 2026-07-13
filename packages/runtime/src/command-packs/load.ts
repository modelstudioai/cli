import type { AnyCommand, CommandPackReport, Identity } from "bailian-cli-core";
import { readCommandPackPackageJson, readCommandPacksManifest } from "./package-json.ts";
import { loadAndValidateCommandPack } from "./validate.ts";
import type { CommandPackPolicy } from "./types.ts";

export interface LoadedCommandPacks {
  commands: Record<string, AnyCommand>;
  reports: CommandPackReport[];
}

function sourceFromSpec(spec: string): "installed" | "linked" {
  return spec.startsWith("file:") ? "linked" : "installed";
}

export async function loadCommandPacks(
  builtins: Record<string, AnyCommand>,
  identity: Identity,
  policy: CommandPackPolicy,
): Promise<LoadedCommandPacks> {
  const commandsWithPacks = { ...builtins };
  const reports: CommandPackReport[] = [];
  let manifest;
  try {
    manifest = await readCommandPacksManifest(identity);
  } catch (error) {
    return {
      commands: commandsWithPacks,
      reports: [
        {
          name: "(plugin sandbox)",
          source: "installed",
          status: "failed",
          commands: [],
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  for (const [name, spec] of Object.entries(manifest.dependencies ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const source = sourceFromSpec(spec);
    const definition = policy.supported[name];
    if (!definition) {
      reports.push({
        name,
        source,
        status: "failed",
        commands: [],
        error: `Command Pack "${name}" is not supported by ${identity.binName}.`,
      });
      continue;
    }

    try {
      const pjson = await readCommandPackPackageJson(identity, name);
      const packCommands = await loadAndValidateCommandPack(name, pjson, definition, identity);
      const conflicts = Object.keys(packCommands).filter((path) => path in commandsWithPacks);
      if (conflicts.length > 0) {
        throw new Error(`Command conflicts: ${conflicts.join(", ")}.`);
      }
      Object.assign(commandsWithPacks, packCommands);
      reports.push({
        name,
        version: pjson.version,
        source,
        status: "loaded",
        commands: Object.keys(packCommands).sort(),
      });
    } catch (error) {
      reports.push({
        name,
        source,
        status: "failed",
        commands: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { commands: commandsWithPacks, reports };
}
