import { join } from "path";
import { fileURLToPath } from "url";
import { createCliRunner } from "bailian-cli-commands/e2e";

const ragRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const mainTs = join(ragRoot, "src", "main.ts");

const runner = createCliRunner({
  entry: mainTs,
  cwd: ragRoot,
  binName: "rag",
});

export const runCli = runner.runCli;
