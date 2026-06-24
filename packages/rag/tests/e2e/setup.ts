import { join } from "path";
import { fileURLToPath } from "url";
import { createCliRunner, type RunCliFn } from "../../../commands/tests/e2e/core/index.ts";

const ragRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const mainTs = join(ragRoot, "src", "main.ts");

const runner = createCliRunner({
  entry: mainTs,
  cwd: ragRoot,
  binName: "rag",
});

export const runCli: RunCliFn = runner.runCli;
