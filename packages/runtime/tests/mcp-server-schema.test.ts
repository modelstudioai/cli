import { describe, expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import {
  buildToolDescriptors,
  flagsToInputSchema,
  flagsToZodObject,
  pathToToolName,
} from "../src/mcp-server/schema.ts";

describe("mcp-server schema", () => {
  test("pathToToolName maps space path to bailian_*", () => {
    expect(pathToToolName("text chat")).toBe("bailian_text_chat");
    expect(pathToToolName("memory profile get")).toBe("bailian_memory_profile_get");
  });

  test("flagsToInputSchema marks required strings and switch booleans", () => {
    const schema = flagsToInputSchema({
      prompt: {
        type: "string",
        valueHint: "<text>",
        description: "User prompt",
        required: true,
      },
      quiet: { type: "switch", description: "Quiet" },
      n: { type: "number", valueHint: "<n>", description: "Count" },
      tags: { type: "array", valueHint: "<tag>", description: "Tags" },
    });

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["prompt"]);
    expect(schema.properties.prompt).toMatchObject({ type: "string" });
    expect(schema.properties.quiet).toMatchObject({ type: "boolean" });
    expect(schema.properties.n).toMatchObject({ type: "number" });
    expect(schema.properties.tags).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });

  test("flagsToZodObject marks required fields", () => {
    const schema = flagsToZodObject({
      prompt: {
        type: "string",
        valueHint: "<text>",
        description: "User prompt",
        required: true,
      },
      n: { type: "number", valueHint: "<n>", description: "Count" },
    });

    expect(schema.parse({ prompt: "hi" })).toEqual({ prompt: "hi" });
    expect(() => schema.parse({})).toThrow();
  });

  test("buildToolDescriptors maps leaf paths", () => {
    const sample = defineCommand({
      description: "Sample",
      auth: "none",
      flags: {
        prompt: {
          type: "string",
          valueHint: "<text>",
          description: "Prompt",
          required: true,
        },
      },
      async run() {},
    });

    const tools = buildToolDescriptors([{ path: "text chat", command: sample }]);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("bailian_text_chat");
    expect(tools[0]?.path).toBe("text chat");
    expect(tools[0]?.inputSchema.required).toEqual(["prompt"]);
  });
});
