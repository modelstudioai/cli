import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  e2eLabelFromMetaUrl,
  isConsoleAuthFailure,
  makeE2eOutputDir,
  parseStdoutJson,
} from "e2e/output";
import { runNodeMain, type RunCliResult } from "e2e/runner";
import {
  isBailianE2EEnabled,
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isChatE2EReady,
  isConsoleE2EReady,
  isDashScopeE2EReady,
  isSearchE2EReady,
} from "e2e/gating";
import { monorepoRoot } from "e2e/monorepo-root";

export {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  e2eLabelFromMetaUrl,
  isBailianE2EEnabled,
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isChatE2EReady,
  isConsoleAuthFailure,
  isConsoleE2EReady,
  isDashScopeE2EReady,
  isSearchE2EReady,
  makeE2eOutputDir,
  monorepoRoot,
  parseStdoutJson,
};
export type { RunCliResult };

/** `packages/cli` 根目录 */
export const cliPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const mainTs = join(cliPackageRoot, "src", "main.ts");

/** 子进程执行 bl CLI */
export async function runCli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  return runNodeMain(mainTs, args, { cwd: cliPackageRoot, env: envOverrides });
}
