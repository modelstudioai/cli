import type { AnyCommand, FlagDef, FlagsDef } from "bailian-cli-core";
import { z } from "zod";

/** JSON Schema object shape (used in unit tests / descriptor snapshots). */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Zod object schema for `McpServer.registerTool({ inputSchema })`. */
export function flagsToZodObject(flags: FlagsDef | undefined) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const key of Object.keys(flags ?? {})) {
    const def: FlagDef = flags![key]!;
    let schema: z.ZodTypeAny;

    if (def.type === "switch" || def.type === "boolean") {
      schema = z.boolean();
    } else if (def.type === "number") {
      schema = z.number();
    } else if (def.type === "array") {
      const item =
        def.choices && def.choices.length > 0
          ? z.enum(def.choices as [string, ...string[]])
          : z.string();
      schema = z.array(item);
    } else if (def.choices && def.choices.length > 0) {
      schema = z.enum(def.choices as [string, ...string[]]);
    } else {
      schema = z.string();
    }

    schema = schema.describe(def.description);
    const required = def.type !== "switch" && "required" in def && !!def.required;
    shape[key] = required ? schema : schema.optional();
  }

  return z.object(shape);
}

/** Stable MCP tool name from a space-separated command path, e.g. `text chat` → `bailian_text_chat`. */
export function pathToToolName(path: string, prefix = "bailian"): string {
  const slug = path
    .trim()
    .split(/\s+/)
    .join("_")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix}_${slug}`;
}

function flagToProperty(def: FlagDef): Record<string, unknown> {
  if (def.type === "switch") {
    return { type: "boolean", description: def.description };
  }
  if (def.type === "number") {
    const property: Record<string, unknown> = { type: "number", description: def.description };
    if (def.choices?.length) property.enum = def.choices.map((choice) => Number(choice));
    return property;
  }
  if (def.type === "boolean") {
    return { type: "boolean", description: def.description };
  }
  if (def.type === "array") {
    const items: Record<string, unknown> = { type: "string" };
    if (def.choices?.length) items.enum = [...def.choices];
    return { type: "array", items, description: def.description };
  }
  const property: Record<string, unknown> = { type: "string", description: def.description };
  if (def.choices?.length) property.enum = [...def.choices];
  return property;
}

/** Build MCP `inputSchema` from a command's own flags (no global / credential flags). */
export function flagsToInputSchema(flags: FlagsDef | undefined): JsonSchemaObject {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [key, def] of Object.entries(flags ?? {})) {
    properties[key] = flagToProperty(def);
    if (def.type !== "switch" && "required" in def && def.required) {
      required.push(key);
    }
  }

  const schema: JsonSchemaObject = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  /** Original CLI path, e.g. `text chat`. */
  path: string;
  command: AnyCommand;
}

/** Map leaf commands to MCP tool descriptors. */
export function buildToolDescriptors(
  leaves: Array<{ path: string; command: AnyCommand }>,
  options?: { toolNamePrefix?: string; skipPaths?: ReadonlySet<string> },
): McpToolDescriptor[] {
  const prefix = options?.toolNamePrefix ?? "bailian";
  const skipPaths = options?.skipPaths ?? new Set<string>();
  const tools: McpToolDescriptor[] = [];

  for (const leaf of leaves) {
    if (skipPaths.has(leaf.path)) continue;
    const name = pathToToolName(leaf.path, prefix);
    const usage = leaf.command.usageArgs ? ` Usage: ${leaf.command.usageArgs}` : "";
    tools.push({
      name,
      description: `${leaf.command.description} (bl ${leaf.path}).${usage}`,
      inputSchema: flagsToInputSchema(leaf.command.flags),
      path: leaf.path,
      command: leaf.command,
    });
  }

  return tools;
}
