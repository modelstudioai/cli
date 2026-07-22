import { createCli } from "bailian-cli-runtime";
import { commands } from "./commands.ts";
import pkg from "../package.json" with { type: "json" };

void createCli(commands, {
  binName: "kscli",
  version: pkg.version,
  clientName: "knowledge-studio-cli",
  npmPackage: "knowledge-studio-cli",
}).run();
