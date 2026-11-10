import {
  formatCommand,
  buildCommandInvocation,
  renderCommandText,
  GLOBAL_FLAGS,
  MODEL_AUTH_FLAGS,
  CONSOLE_AUTH_FLAGS,
  OPENAPI_AUTH_FLAGS,
  ExitCode,
  type AuthRequirement,
  type CommandRisk,
  type FlagDef,
  type FlagsDef,
  type Identity,
  type LocalizedText,
} from "bailian-cli-core";
import type { CommandRegistry } from "./registry.ts";
import { camelToKebab } from "./args.ts";
import { confirmationFlagDefs } from "./confirm.ts";

export interface CommandSchemaNode {
  /** Complete subcommand chain after CommandSchema.bin, including fixed host subcommands. */
  path: readonly string[];
  description: LocalizedText;
  auth: AuthRequirement;
  usage: string;
  flags: Record<string, FlagDef>;
  notes: readonly LocalizedText[];
  examples: readonly LocalizedText[];
  risk?: CommandRisk;
  preparation: "none" | "read-only";
  constraints: { crossFlagValidation: "not-exported" };
}

export interface CommandSchema {
  schema_version: 1;
  /** Actual executable; combine with a command's path without splitting display text. */
  bin: string;
  version: string;
  /** Executable path of the inspected root, group, or leaf. */
  scope: readonly string[];
  exitCodes: typeof ExitCode;
  globalFlags: Record<string, FlagDef>;
  credentialFlags: Record<AuthRequirement, Record<string, FlagDef>>;
  commands: readonly CommandSchemaNode[];
}

function localizedCommandText(text: LocalizedText, identity: Identity): LocalizedText {
  return typeof text === "string"
    ? renderCommandText(text, identity)
    : {
        "en-US": renderCommandText(text["en-US"], identity),
        "zh-CN": renderCommandText(text["zh-CN"], identity),
      };
}

function flagsSchema(definitions: FlagsDef, identity: Identity): Record<string, FlagDef> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      `--${camelToKebab(name)}`,
      definition.type === "switch"
        ? {
            type: definition.type,
            description: localizedCommandText(definition.description, identity),
          }
        : {
            type: definition.type,
            description: localizedCommandText(definition.description, identity),
            valueHint: definition.valueHint,
            ...(definition.required !== undefined ? { required: definition.required } : {}),
            ...(definition.implicitValue !== undefined
              ? { implicitValue: definition.implicitValue }
              : {}),
            ...(definition.choices ? { choices: [...definition.choices] } : {}),
          },
    ]),
  );
}

function exampleWithPrefix(example: LocalizedText, prefix: string): LocalizedText {
  const qualify = (text: string) =>
    text.trimStart().startsWith("#") ? text : `${prefix}${text ? ` ${text}` : ""}`;
  return typeof example === "string"
    ? qualify(example)
    : {
        "en-US": qualify(example["en-US"]),
        "zh-CN": qualify(example["zh-CN"]),
      };
}

/** Only declarative metadata is exported. Never read settings, credentials, or execute callbacks. */
export function buildCommandSchema(
  registry: CommandRegistry,
  identity: Identity,
  path: readonly string[] = [],
): CommandSchema {
  const invocation = buildCommandInvocation(identity, path);
  return {
    schema_version: 1,
    bin: invocation.bin,
    version: identity.version,
    scope: invocation.path,
    exitCodes: ExitCode,
    globalFlags: flagsSchema(GLOBAL_FLAGS, identity),
    credentialFlags: {
      apiKey: flagsSchema(MODEL_AUTH_FLAGS, identity),
      console: flagsSchema(CONSOLE_AUTH_FLAGS, identity),
      openapi: flagsSchema(OPENAPI_AUTH_FLAGS, identity),
      none: {},
    },
    commands: registry
      .entries(path)
      .map(({ path: commandPath, command }): CommandSchemaNode => {
        const prefix = formatCommand(identity, commandPath.join(" "));
        return {
          path: buildCommandInvocation(identity, commandPath).path,
          description: localizedCommandText(command.description, identity),
          auth: command.auth,
          usage: `${prefix}${command.usageArgs ? ` ${command.usageArgs}` : ""}`,
          flags: flagsSchema({ ...command.flags, ...confirmationFlagDefs(command) }, identity),
          notes: (command.notes ?? []).map((note) => localizedCommandText(note, identity)),
          examples: (command.exampleArgs ?? []).map((example) =>
            localizedCommandText(exampleWithPrefix(example, prefix), identity),
          ),
          ...(command.risk
            ? {
                risk: {
                  level: command.risk.level,
                  message: localizedCommandText(command.risk.message, identity),
                  ...(command.risk.reason ? { reason: command.risk.reason } : {}),
                },
              }
            : {}),
          preparation: command.prepare ? "read-only" : "none",
          constraints: { crossFlagValidation: "not-exported" },
        };
      })
      .sort((left, right) => {
        const leftPath = left.path.join(" ");
        const rightPath = right.path.join(" ");
        return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
      }),
  };
}

/** Recursively sort object keys, preserving semantically ordered arrays. */
export function serializeCommandSchema(schema: CommandSchema): string {
  return (
    JSON.stringify(
      schema,
      (_key, value: unknown) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const record = value as Record<string, unknown>;
          return Object.fromEntries(
            Object.keys(record)
              .sort()
              .map((key) => [key, record[key]]),
          );
        }
        return value;
      },
      2,
    ) + "\n"
  );
}
