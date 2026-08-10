import { describe, expect, test } from "vite-plus/test";
import { defineCommand, type Identity } from "bailian-cli-core";
import { emitResult } from "../src/output/output.ts";
import { invokeCommandForMcp } from "../src/mcp-server/invoke.ts";
import { createCommandPackManager } from "../src/command-packs/manager.ts";

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
};

const commandPacks = createCommandPackManager(identity, { supported: {} });

describe("mcp-server invoke", () => {
  test("captures emitResult JSON without writing business output as protocol noise", async () => {
    const command = defineCommand({
      description: "Echo",
      auth: "none",
      flags: {
        prompt: {
          type: "string",
          valueHint: "<text>",
          description: "Prompt",
          required: true,
        },
      },
      async run(ctx) {
        emitResult({ echoed: ctx.flags.prompt }, "json");
      },
    });

    const result = await invokeCommandForMcp({
      identity,
      path: ["text", "chat"],
      command,
      args: { prompt: "hello" },
      commandPacks,
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(result.text)).toEqual({ echoed: "hello" });
  });

  test("returns usage error when required flag missing", async () => {
    const command = defineCommand({
      description: "Echo",
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

    const result = await invokeCommandForMcp({
      identity,
      path: ["text", "chat"],
      command,
      args: {},
      commandPacks,
    });

    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/Missing required flag/);
  });
});
