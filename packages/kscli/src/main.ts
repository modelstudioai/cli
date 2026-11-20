import { createCli, runToExit } from "bailian-cli-runtime";
import { commands } from "./commands.ts";
import pkg from "../package.json" with { type: "json" };

const cli = createCli(commands, {
  binName: "kscli",
  version: pkg.version,
  clientName: "knowledge-studio-cli",
  npmPackage: "knowledge-studio-cli",
});

void runToExit(cli);
