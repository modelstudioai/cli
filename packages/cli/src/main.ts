import { createCli } from "bailian-cli-runtime";
import { commands } from "./commands.ts";
import pkg from "../package.json" with { type: "json" };

createCli(commands, {
  binName: "bl",
  version: pkg.version,
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
}).run();
