import { createCli } from "bailian-cli-runtime";
import pkg from "../../../../cli/package.json" with { type: "json" };
import { e2eCommandMap } from "./e2e-command-map.ts";

void createCli(e2eCommandMap, {
  binName: "bl",
  version: pkg.version,
  clientName: "commands-e2e",
  npmPackage: "bailian-cli-commands",
}).run();
