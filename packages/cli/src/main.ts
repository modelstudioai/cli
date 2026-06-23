import { createCli } from "bailian-cli-runtime";
import { commands } from "bailian-cli-commands";
import pkg from "../package.json" with { type: "json" };

// Full bailian-cli product: every command, exposed under the `bl` binary.
createCli(commands, {
  binName: "bl",
  version: pkg.version,
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
}).run();
