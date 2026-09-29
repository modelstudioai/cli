import {
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
  bin: string;
  version: string;
  scope: readonly string[];
  exitCodes: typeof ExitCode;
  globalFlags: Record<string, FlagDef>;
  credentialFlags: Record<AuthRequirement, Record<string, FlagDef>>;
  commands: readonly CommandSchemaNode[];
}

function flagsSchema(definitions: FlagsDef): Record<string, FlagDef> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      `--${camelToKebab(name)}`,
      definition.type === "switch"
        ? { type: definition.type, description: definition.description }
        : {
            type: definition.type,
            description: definition.description,
            valueHint: definition.valueHint,
            ...(definition.required !== undefined ? { required: definition.required } : {}),
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
  return {
    schema_version: 1,
    bin: identity.binName,
    version: identity.version,
    scope: [...path],
    exitCodes: ExitCode,
    globalFlags: flagsSchema(GLOBAL_FLAGS),
    credentialFlags: {
      apiKey: flagsSchema(MODEL_AUTH_FLAGS),
      console: flagsSchema(CONSOLE_AUTH_FLAGS),
      openapi: flagsSchema(OPENAPI_AUTH_FLAGS),
      none: {},
    },
    commands: registry
      .entries(path)
      .map(({ path: commandPath, command }): CommandSchemaNode => {
        const prefix = [identity.binName, ...commandPath].join(" ");
        return {
          path: commandPath,
          description: command.description,
          auth: command.auth,
          usage: `${prefix}${command.usageArgs ? ` ${command.usageArgs}` : ""}`,
          flags: flagsSchema({ ...command.flags, ...confirmationFlagDefs(command) }),
          notes: command.notes ?? [],
          examples: (command.exampleArgs ?? []).map((example) =>
            exampleWithPrefix(example, prefix),
          ),
          ...(command.risk
            ? {
                risk: {
                  level: command.risk.level,
                  message: command.risk.message,
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
