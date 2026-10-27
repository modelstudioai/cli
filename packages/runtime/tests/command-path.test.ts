import { expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { CommandRegistry } from "../src/registry.ts";

const command = defineCommand({ auth: "none", description: "Fixture", async run() {} });
test("reverse lookup uses each product's actual command path", () => {
  expect(new CommandRegistry({ "knowledge delete": command }, "bl").commandPath(command)).toEqual([
    "knowledge",
    "delete",
  ]);
  expect(new CommandRegistry({ "kb delete": command }, "kscli").commandPath(command)).toEqual([
    "kb",
    "delete",
  ]);
});
test("missing and ambiguous command paths have no guessed fallback", () => {
  expect(new CommandRegistry({}, "fixture").commandPath(command)).toBeUndefined();
  expect(
    new CommandRegistry({ first: command, second: command }, "fixture").commandPath(command),
  ).toBeUndefined();
});
test("editing a returned path cannot change registry routes", () => {
  const registry = new CommandRegistry({ "kb delete": command }, "fixture");
  const path = registry.commandPath(command)!;
  path[0] = "changed";
  expect(registry.commandPath(command)).toEqual(["kb", "delete"]);
});
