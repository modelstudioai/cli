import { createCli } from "bailian-cli-runtime";
import { E2E_HARNESS_IDENTITY } from "./identity.ts";
import { loadRouteCommands } from "./routes.ts";
import { withHarnessUpdateFixture } from "./update-fixture.ts";

interface RouteSpec {
  path: string;
  export: string;
}

async function main(): Promise<void> {
  const raw = process.env.BAILIAN_E2E_ROUTES;
  if (!raw?.trim()) throw new Error("BAILIAN_E2E_ROUTES is required for commands E2E harness");
  const spec = JSON.parse(raw) as RouteSpec[];
  const routes = Object.fromEntries(spec.map(({ path, export: exportName }) => [path, exportName]));
  const commands = await loadRouteCommands(routes);
  await withHarnessUpdateFixture(() => createCli(commands, E2E_HARNESS_IDENTITY).run());
}

void main();
