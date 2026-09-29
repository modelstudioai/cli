import { describe, expect, test, vi } from "vite-plus/test";
import { defineCommand, type Identity } from "bailian-cli-core";
import * as runtime from "../src/index.ts";

const identity: Identity = {
  binName: "kscli",
  version: "2.0.1",
  npmPackage: "knowledge-studio-cli",
  clientName: "fixture",
};
const command = defineCommand({
  auth: "apiKey",
  description: { "en-US": "Synchronize", "zh-CN": "同步" },
  flags: {
    indexId: { type: "string", required: true, valueHint: "<id>", description: "Index" },
    mode: {
      type: "string",
      valueHint: "<mode>",
      choices: ["append", "replace"],
      description: "Mode",
    },
  },
  usageArgs: "--index-id <id>",
  exampleArgs: ["--index-id example", { "en-US": "# confirm first", "zh-CN": "# 先确认" }],
  risk: { level: "high", message: "Replaces existing data" },
  notes: [{ "en-US": "Read only preview", "zh-CN": "只读预览" }],
  validate: vi.fn(),
  run: vi.fn(async () => {}),
});
const other = defineCommand({ auth: "none", description: "Other", async run() {} });
const registry = new runtime.CommandRegistry({ "doc sync": command, "kb list": other }, "kscli");

describe("introspection routing", () => {
  test.each([[], ["doc"], ["doc", "sync"]])(
    "resolves scope %j without required flags",
    (...path) => {
      expect(runtime.resolve([...path, "--introspect"], registry)).toEqual({
        kind: "introspect",
        path,
      });
      expect(command.validate).not.toHaveBeenCalled();
      expect(command.run).not.toHaveBeenCalled();
    },
  );
  test("keeps unknown paths as usage errors and version priority", () => {
    expect(runtime.resolve(["missing", "--introspect"], registry).kind).toBe("usageError");
    expect(runtime.resolve(["doc", "--help", "--introspect"], registry).kind).toBe("introspect");
    expect(runtime.resolve(["--introspect", "--version"], registry).kind).toBe("version");
  });
  test("reserves introspect globally without reserving business schema", () => {
    expect(
      () =>
        new runtime.CommandRegistry(
          {
            invalid: {
              ...other,
              flags: { introspect: { type: "switch", description: "invalid" } },
            },
          },
          "fixture",
        ),
    ).toThrow();
    expect(
      () =>
        new runtime.CommandRegistry(
          {
            valid: {
              ...other,
              flags: { schema: { type: "string", valueHint: "<file>", description: "schema" } },
            },
          },
          "fixture",
        ),
    ).not.toThrow();
  });
});

test("schema contains actual flags, bilingual metadata, credential definitions and runtime yes", () => {
  const schema = runtime.buildCommandSchema(registry, identity, ["doc"]);
  expect(schema).toMatchObject({
    schema_version: 1,
    bin: "kscli",
    version: "2.0.1",
    scope: ["doc"],
    exitCodes: { CONFIRMATION_REQUIRED: 7 },
  });
  expect(schema.commands).toHaveLength(1);
  expect(schema.commands[0]).toMatchObject({
    path: ["doc", "sync"],
    description: command.description,
    usage: "kscli doc sync --index-id <id>",
    flags: {
      "--index-id": { required: true, type: "string" },
      "--mode": { choices: ["append", "replace"] },
      "--yes": { type: "switch" },
    },
    notes: command.notes,
    examples: [
      "kscli doc sync --index-id example",
      { "en-US": "# confirm first", "zh-CN": "# 先确认" },
    ],
    constraints: { crossFlagValidation: "not-exported" },
  });
  expect(schema.globalFlags).toHaveProperty("--introspect");
  expect(schema.credentialFlags.apiKey).toHaveProperty("--api-key");
  expect(schema.commands[0]?.flags).not.toHaveProperty("--api-key");
});

test("schema is byte deterministic across registration order and never serializes executable code", () => {
  const reversed = new runtime.CommandRegistry({ "kb list": other, "doc sync": command }, "kscli");
  const actual = runtime.serializeCommandSchema(runtime.buildCommandSchema(registry, identity, []));
  expect(actual).toBe(
    runtime.serializeCommandSchema(runtime.buildCommandSchema(reversed, identity, [])),
  );
  expect(actual.endsWith("\n")).toBe(true);
  expect(actual).not.toContain('"run"');
  expect(actual).not.toContain('"validate"');
  expect(
    JSON.parse(actual).commands.map((entry: { path: string[] }) => entry.path.join(" ")),
  ).toEqual(["doc sync", "kb list"]);
});

test("product paths are supplied by the real registry", () => {
  const blRegistry = new runtime.CommandRegistry({ "knowledge doc sync": command }, "bl");
  const schema = runtime.buildCommandSchema(blRegistry, { ...identity, binName: "bl" }, [
    "knowledge",
    "doc",
    "sync",
  ]);
  expect(schema.commands[0]?.usage).toBe("bl knowledge doc sync --index-id <id>");
});
