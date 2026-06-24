import { join } from "path";
import { fileURLToPath } from "url";
import { createCliRunner, type RunCliFn } from "../../../commands/tests/e2e/core/index.ts";

const cliRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const mainTs = join(cliRoot, "src", "main.ts");

const runner = createCliRunner({
  entry: mainTs,
  cwd: cliRoot,
  binName: "bl",
});

export const runCli: RunCliFn = runner.runCli;
