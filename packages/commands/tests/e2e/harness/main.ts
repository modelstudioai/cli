import { createCli } from "bailian-cli-runtime";
import { e2eCommandMap } from "./e2e-command-map.ts";

void createCli(e2eCommandMap, {
  binName: "bl",
  version: "0.0.0-e2e",
  clientName: "commands-e2e",
  npmPackage: "bailian-cli-commands",
}).run();
