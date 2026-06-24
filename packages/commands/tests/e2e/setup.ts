import { join } from "path";
import { fileURLToPath } from "url";
import { createCliRunner } from "./core/cli-runner.ts";

export {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  commandsPackageRoot,
  e2eLabelFromMetaUrl,
  makeE2eOutputDir,
  monorepoRoot,
  parseStdoutJson,
  isBailianE2EEnabled,
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  isKnowledgeAkSkReady,
  isKnowledgeE2EReady,
  createCliRunner,
} from "./core/index.ts";

const commandsRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const testCliEntry = join(commandsRoot, "tests", "fixtures", "test-cli.ts");

const runner = createCliRunner({
  entry: testCliEntry,
  cwd: commandsRoot,
  binName: "bl",
});

export const runCli = runner.runCli;
