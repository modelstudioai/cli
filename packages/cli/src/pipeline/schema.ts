import AjvModule, { type ErrorObject } from "ajv";
import { isRecord } from "./utils.ts";
import type { JsonSchema, JsonSchemaPrimitiveType } from "./types.ts";

interface AjvConstructor {
  new (opts?: object): {
    validateSchema(schema: object): boolean;
    errors?: ErrorObject[] | null;
  };
}

const Ajv = AjvModule as unknown as AjvConstructor;

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "items",
  "required",
  "enum",
  "default",
  "description",
  "format",
  "additionalProperties",
]);

const SUPPORTED_TYPES = new Set<JsonSchemaPrimitiveType>([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
]);

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: false,
  strict: false,
  useDefaults: false,
});

export function validateJsonSchema(schema: unknown, path = "schema"): string[] {
  const issues: string[] = [];
  validateJsonSchemaInto(schema, path, issues);
  if (issues.length === 0 && !ajv.validateSchema(schema as object)) {
    issues.push(...formatAjvErrors(ajv.errors, path));
  }
  return issues;
}

export function validateInputAgainstSchema(
  schema: JsonSchema,
  rawInput: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; issues: string[] } {
  const result = coerceAgainstSchema(rawInput, schema, "input");
  if (!result.ok) return { ok: false, issues: result.issues };
  return isRecord(result.value)
    ? { ok: true, value: result.value }
    : { ok: false, issues: ["input must be an object"] };
}

export interface JsonPointerParseResult {
  ok: boolean;
  segments: string[];
  issue?: string;
}

export function parseJsonPointer(pointer: string): JsonPointerParseResult {
  if (pointer === "") return { ok: true, segments: [] };
  if (!pointer.startsWith("/")) return { ok: false, segments: [], issue: "must start with /" };
  const segments = pointer.slice(1).split("/");
  const decoded: string[] = [];
  for (const segment of segments) {
    const invalidEscape = segment.match(/~(?![01])/);
    if (invalidEscape)
      return { ok: false, segments: [], issue: "contains invalid escape sequence" };
    decoded.push(segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  }
  return { ok: true, segments: decoded };
}

export function getByJsonPointer(value: unknown, pointer: string): unknown {
  const parsed = parseJsonPointer(pointer);
  if (!parsed.ok) return undefined;
  let current = value;
  for (const segment of parsed.segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (isRecord(current)) {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

export function isValidJsonPointer(pointer: string): boolean {
  return parseJsonPointer(pointer).ok;
}

function validateJsonSchemaInto(schema: unknown, path: string, issues: string[]): void {
  if (!isRecord(schema)) {
    issues.push(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) issues.push(`${path} has unsupported keyword "${key}"`);
  }
  if ("type" in schema) validateType(schema.type, `${path}.type`, issues);
  if ("properties" in schema) {
    if (!isRecord(schema.properties)) {
      issues.push(`${path}.properties must be an object`);
    } else {
      for (const [name, child] of Object.entries(schema.properties)) {
        validateJsonSchemaInto(child, `${path}.properties.${name}`, issues);
      }
    }
  }
  if ("items" in schema) validateJsonSchemaInto(schema.items, `${path}.items`, issues);
  if (
    "required" in schema &&
    (!Array.isArray(schema.required) || !schema.required.every((item) => typeof item === "string"))
  ) {
    issues.push(`${path}.required must be an array of strings`);
  }
  if ("enum" in schema && !Array.isArray(schema.enum)) issues.push(`${path}.enum must be an array`);
  if ("description" in schema && typeof schema.description !== "string")
    issues.push(`${path}.description must be a string`);
  if ("format" in schema && typeof schema.format !== "string")
    issues.push(`${path}.format must be a string`);
  if ("additionalProperties" in schema) {
    const additional = schema.additionalProperties;
    if (additional !== true && additional !== false && !isRecord(additional)) {
      issues.push(`${path}.additionalProperties must be a boolean or schema object`);
    } else if (isRecord(additional)) {
      validateJsonSchemaInto(additional, `${path}.additionalProperties`, issues);
    }
  }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined, path: string): string[] {
  if (!errors || errors.length === 0) return [`${path} is invalid`];
  return errors.map((error) => {
    const location = error.instancePath ? `${path}${error.instancePath.replace(/\//g, ".")}` : path;
    const detail = error.message ?? "is invalid";
    const keyword = error.keyword ? ` (${error.keyword})` : "";
    return `${location} ${detail}${keyword}`;
  });
}

function validateType(type: unknown, path: string, issues: string[]): void {
  const values = Array.isArray(type) ? type : [type];
  if (values.length === 0) {
    issues.push(`${path} must not be empty`);
    return;
  }
  for (const value of values) {
    if (!SUPPORTED_TYPES.has(value as JsonSchemaPrimitiveType)) {
      issues.push(`${path} has unsupported type "${String(value)}"`);
    }
  }
}

function coerceAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path: string,
): { ok: true; value: unknown } | { ok: false; issues: string[] } {
  if ((value === undefined || value === null || value === "") && schema.default !== undefined) {
    value = schema.default;
  }

  if (schema.enum && value !== undefined) {
    const enumStrs = schema.enum.map(stringifyEnumValue);
    if (!enumStrs.includes(stringifyEnumValue(value))) {
      return { ok: false, issues: [`${path} must be one of: ${enumStrs.join(", ")}`] };
    }
  }

  const types = schemaTypes(schema);
  if (types.size === 0) return { ok: true, value };

  if (types.size > 1) {
    if (Array.isArray(value) && types.has("array")) {
      if (!schema.items) return { ok: true, value };
      const normalized: unknown[] = [];
      const issues: string[] = [];
      value.forEach((item, index) => {
        const result = coerceAgainstSchema(item, schema.items!, `${path}.${index}`);
        if (result.ok) normalized[index] = result.value;
        else issues.push(...result.issues);
      });
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: normalized };
    }
    if (isRecord(value) && types.has("object")) {
      // fall through to the existing object branch below
    } else if (types.has("string") && !Array.isArray(value) && !isRecord(value)) {
      return { ok: true, value: String(value) };
    }
  }

  if (types.has("object")) {
    if (!isRecord(value)) return { ok: false, issues: [`${path} must be an object`] };
    const normalized: Record<string, unknown> = { ...value };
    const issues: string[] = [];
    for (const name of schema.required ?? []) {
      const child = normalized[name];
      if (child === undefined || child === null || child === "")
        issues.push(`Missing required input "${name}"`);
    }
    for (const [name, childSchema] of Object.entries(schema.properties ?? {})) {
      const child = normalized[name];
      if (
        (child === undefined || child === null || child === "") &&
        childSchema.default === undefined
      )
        continue;
      const result = coerceAgainstSchema(child, childSchema, `${path}.${name}`);
      if (result.ok) normalized[name] = result.value;
      else issues.push(...result.issues);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(normalized)) {
        if (!schema.properties?.[key]) issues.push(`Unknown input "${key}"`);
      }
    }
    return issues.length > 0 ? { ok: false, issues } : { ok: true, value: normalized };
  }

  if (types.has("array")) {
    if (!Array.isArray(value)) return { ok: false, issues: [`${path} must be an array`] };
    if (!schema.items) return { ok: true, value };
    const normalized: unknown[] = [];
    const issues: string[] = [];
    value.forEach((item, index) => {
      const result = coerceAgainstSchema(item, schema.items!, `${path}.${index}`);
      if (result.ok) normalized[index] = result.value;
      else issues.push(...result.issues);
    });
    return issues.length > 0 ? { ok: false, issues } : { ok: true, value: normalized };
  }

  if (types.has("string")) return { ok: true, value: String(value) };
  if (types.has("number") || types.has("integer")) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return { ok: false, issues: [`${path} must be a number`] };
    if (types.has("integer") && !Number.isInteger(num))
      return { ok: false, issues: [`${path} must be an integer`] };
    return { ok: true, value: num };
  }
  if (types.has("boolean")) {
    if (typeof value === "boolean") return { ok: true, value };
    if (value === "true" || value === "1") return { ok: true, value: true };
    if (value === "false" || value === "0") return { ok: true, value: false };
    return { ok: false, issues: [`${path} must be a boolean`] };
  }
  if (types.has("null")) {
    return value === null ? { ok: true, value } : { ok: false, issues: [`${path} must be null`] };
  }
  return { ok: true, value };
}

function schemaTypes(schema: JsonSchema): Set<JsonSchemaPrimitiveType> {
  const raw =
    schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  return new Set(raw);
}

function stringifyEnumValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value) ?? "";
  return String(value as string | number | boolean | bigint | symbol);
}
