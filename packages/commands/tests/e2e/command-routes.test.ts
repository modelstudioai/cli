import { expect, test } from "vite-plus/test";
import { loadRouteCommands } from "./harness/routes.ts";
import * as topicRoutes from "./topic-routes.ts";
import * as commandExports from "../../src/index.ts";

const fixtureIndex = new URL("./fixtures/route-loader/index.ts", import.meta.url);

test("loads a declared command without evaluating an unrelated broken export", async () => {
  const commands = await loadRouteCommands({ "probe run": "probe" }, fixtureIndex);
  expect(commands["probe run"].description).toBe("fixture probe");
  expect(await commands["probe run"].run({} as never)).toBe("probe result");
});

test("aliases retain the same command instance", async () => {
  const commands = await loadRouteCommands(
    { "probe run": "probe", "probe alias": "probeAlias" },
    fixtureIndex,
  );
  expect(commands["probe run"]).toBe(commands["probe alias"]);
});

test("rejects unknown exports and declared non-command defaults", async () => {
  await expect(loadRouteCommands({ invalid: "missing" }, fixtureIndex)).rejects.toThrow(
    "Unknown bailian-cli-commands export: missing",
  );
  await expect(loadRouteCommands({ invalid: "notACommand" }, fixtureIndex)).rejects.toThrow(
    "Unknown bailian-cli-commands export: notACommand",
  );
});

test("every topic route resolves to the same public command exported by the library", async () => {
  const library = commandExports as Record<string, unknown>;
  for (const routes of Object.values(topicRoutes)) {
    const commands = await loadRouteCommands(routes);
    for (const [path, exportName] of Object.entries(routes))
      expect(commands[path]).toBe(library[exportName]);
  }
});

test("supports named aliases and preserves route declaration order", async () => {
  const routes = { "named first": "namedProbe", "default second": "probe" };
  const commands = await loadRouteCommands(routes, fixtureIndex);
  expect(Object.keys(commands)).toEqual(Object.keys(routes));
  expect(await commands["named first"].run({} as never)).toBe("named result");
});
