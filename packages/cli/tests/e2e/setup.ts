import { join } from "path";
import { fileURLToPath } from "url";
import { createCliRunner } from "bailian-cli-commands/e2e";

const cliRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const mainTs = join(cliRoot, "src", "main.ts");

const runner = createCliRunner({
  entry: mainTs,
  cwd: cliRoot,
  binName: "bl",
});

export const runCli = runner.runCli;
