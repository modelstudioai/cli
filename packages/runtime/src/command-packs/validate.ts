import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BailianError,
  COMMAND_PACK_API_VERSION,
  ExitCode,
  SUPPORTED_LANGUAGES,
  UsageError,
  formatOutput,
  type AnyCommand,
  type CommandPack,
  type CommandPackCommand,
  type CommandPackMeta,
  type Identity,
  type LocalizedText,
} from "bailian-cli-core";
import { CommandRegistry } from "../registry.ts";
import { compareVersion } from "../utils/update-checker.ts";
import { getCommandPackRoot } from "./paths.ts";
import type { CommandPackDefinition, CommandPackPackageJson } from "./types.ts";

const AUTH_REQUIREMENTS = new Set(["none", "apiKey", "console", "openapi"]);
const COMMAND_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

function assertMeta(
  name: string,
  pjson: CommandPackPackageJson,
  identity: Identity,
): CommandPackMeta {
  if (pjson.name !== name) {
    throw new Error(`Package name mismatch: expected "${name}", received "${pjson.name ?? ""}".`);
  }
  const meta = pjson.bailianCli;
  if (!meta || meta.type !== "command-pack") {
    throw new Error(`Package "${name}" is missing bailianCli.type="command-pack".`);
  }
  if (meta.apiVersion !== COMMAND_PACK_API_VERSION) {
    throw new Error(
      `Command Pack API ${meta.apiVersion} is not supported; this CLI supports API ${COMMAND_PACK_API_VERSION}.`,
    );
  }
  if (meta.minCliVersion && compareVersion(identity.version, meta.minCliVersion) < 0) {
    throw new Error(
      `Command Pack requires ${identity.npmPackage} ${meta.minCliVersion} or newer; current version is ${identity.version}.`,
    );
  }
  if (!meta.entry || isAbsolute(meta.entry)) {
    throw new Error(`Command Pack "${name}" must declare a relative bailianCli.entry.`);
  }
  return meta;
}

function assertCommandPath(path: string, definition: CommandPackDefinition): void {
  const normalized = path.split(/\s+/).filter(Boolean).join(" ");
  if (!path || path !== normalized) {
    throw new Error(`Invalid command path "${path}".`);
  }
  if (!path.split(" ").every((segment) => COMMAND_SEGMENT.test(segment))) {
    throw new Error(`Invalid command path "${path}".`);
  }
  const allowed = definition.commandPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix} `),
  );
  if (!allowed) {
    throw new Error(
      `Command "${path}" is outside the allowed prefixes: ${definition.commandPrefixes.join(", ")}.`,
    );
  }
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === "string") return value.length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const localizedText = value as Record<string, unknown>;
  return SUPPORTED_LANGUAGES.every(
    (language) => typeof localizedText[language] === "string" && localizedText[language].length > 0,
  );
}

function isCommandRisk(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const risk = value as Record<string, unknown>;
  return risk.level === "high" && isLocalizedText(risk.message);
}

function assertCommand(path: string, value: unknown): asserts value is CommandPackCommand<any> {
  if (!value || typeof value !== "object") {
    throw new Error(`Command "${path}" must export an object.`);
  }
  const command = value as Partial<CommandPackCommand<any>>;
  if (!isLocalizedText(command.description)) {
    throw new Error(`Command "${path}" is missing a description.`);
  }
  if (!command.auth || !AUTH_REQUIREMENTS.has(command.auth)) {
    throw new Error(`Command "${path}" has an invalid auth requirement.`);
  }
  if (command.risk !== undefined && !isCommandRisk(command.risk)) {
    throw new Error(`Command "${path}" has invalid risk metadata.`);
  }
  if (typeof command.run !== "function") {
    throw new Error(`Command "${path}" is missing run(ctx).`);
  }
}

function adaptCommandPack(
  name: string,
  pack: CommandPack,
  definition: CommandPackDefinition,
): Record<string, AnyCommand> {
  return Object.fromEntries(
    Object.entries(pack).map(([path, command]) => [
      path,
      {
        description: command.description,
        auth: command.auth,
        risk: command.risk,
        usageArgs: command.usageArgs,
        exampleArgs: command.exampleArgs,
        notes: command.notes,
        flags: command.flags,
        validate: command.validate,
        run: (ctx) => {
          const packContext = {
            identity: ctx.identity,
            settings: ctx.settings,
            flags: ctx.flags,
            client: ctx.client,
            output: {
              result(data: unknown, options?: { text?: string }) {
                const rendered =
                  ctx.settings.output === "text" && options?.text !== undefined
                    ? options.text
                    : formatOutput(data, ctx.settings.output);
                process.stdout.write(`${rendered}\n`);
              },
              line(value: string) {
                process.stdout.write(`${value}\n`);
              },
              write(chunk: string) {
                process.stdout.write(chunk);
              },
            },
            errors: {
              general(message: string, options?: { hint?: string; cause?: unknown }) {
                return new BailianError(message, ExitCode.GENERAL, options?.hint, {
                  cause: options?.cause,
                });
              },
              usage(message: string, hint?: string) {
                return new UsageError(message, hint);
              },
              timeout(
                message = "Request timed out.",
                options?: { hint?: string; cause?: unknown },
              ) {
                return new BailianError(message, ExitCode.TIMEOUT, options?.hint, {
                  cause: options?.cause,
                });
              },
            },
            credentials: {
              apiKey() {
                if (!definition.credentialAccess?.includes("apiKey")) {
                  throw new BailianError(
                    `Command Pack "${name}" is not allowed to access API-key credentials.`,
                    ExitCode.GENERAL,
                  );
                }
                if (command.auth !== "apiKey") {
                  throw new BailianError(
                    `Command "${path}" must declare auth="apiKey" before accessing API-key credentials.`,
                    ExitCode.GENERAL,
                  );
                }
                const credential = ctx.authStore.describe().apiKey;
                if (!credential) {
                  throw new BailianError(
                    "No API key available to the Command Pack.",
                    ExitCode.AUTH,
                  );
                }
                return credential;
              },
            },
          };
          return command.run(packContext);
        },
      } satisfies AnyCommand,
    ]),
  );
}

export async function loadAndValidateCommandPack(
  name: string,
  pjson: CommandPackPackageJson,
  definition: CommandPackDefinition,
  identity: Identity,
  unresolvedPackageRoot: string = getCommandPackRoot(identity, name),
): Promise<Record<string, AnyCommand>> {
  const meta = assertMeta(name, pjson, identity);
  const packageRoot = await realpath(unresolvedPackageRoot);
  const entry = await realpath(resolve(packageRoot, meta.entry));
  const relativeEntry = relative(packageRoot, entry);
  if (!relativeEntry || relativeEntry.startsWith("..") || isAbsolute(relativeEntry)) {
    throw new Error(`Command Pack entry must stay inside the package root: ${meta.entry}`);
  }

  const imported = (await import(pathToFileURL(entry).href)) as { default?: unknown };
  const exported = imported.default;
  if (!exported || typeof exported !== "object" || Array.isArray(exported)) {
    throw new Error(`Command Pack "${name}" must default-export a command map.`);
  }

  const entries = Object.entries(exported);
  if (entries.length === 0) {
    throw new Error(`Command Pack "${name}" does not export any commands.`);
  }
  for (const [path, command] of entries) {
    assertCommandPath(path, definition);
    assertCommand(path, command);
  }

  const adapted = adaptCommandPack(name, exported as CommandPack, definition);
  // Reuse the runtime's reserved-flag guard without duplicating its policy here.
  new CommandRegistry(adapted, identity.binName);
  return adapted;
}
