import * as cmd from "bailian-cli-commands";
import type { AnyCommand } from "bailian-cli-core";
import { createCli } from "bailian-cli-runtime";
import { E2E_HARNESS_IDENTITY } from "./identity.ts";

interface RouteSpec {
  path: string;
  export: string;
}

function buildRoutesFromEnv(): Record<string, AnyCommand> {
  const raw = process.env.BAILIAN_E2E_ROUTES;
  if (!raw?.trim()) {
    throw new Error("BAILIAN_E2E_ROUTES is required for commands E2E harness");
  }
  const spec = JSON.parse(raw) as RouteSpec[];
  const routes: Record<string, AnyCommand> = {};
  const lib = cmd as Record<string, unknown>;
  for (const { path, export: exportName } of spec) {
    const command = lib[exportName];
    if (typeof command !== "object" || command === null || !("run" in command)) {
      throw new Error(`Unknown bailian-cli-commands export: ${exportName}`);
    }
    routes[path] = command as AnyCommand;
  }
  return routes;
}

void createCli(buildRoutesFromEnv(), E2E_HARNESS_IDENTITY).run();
