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

export {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  e2eLabelFromMetaUrl,
  isConsoleAuthFailure,
  makeE2eOutputDir,
  parseStdoutJson,
};
export type { RunCliResult };

export {
  isBailianE2EEnabled,
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isChatE2EReady,
  isConsoleE2EReady,
  isDashScopeE2EReady,
  isSearchE2EReady,
} from "e2e/gating";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const harnessMainTs = join(e2eDir, "harness", "main.ts");

/** `packages/commands` 根目录 */
export const commandsPackageRoot = join(e2eDir, "..", "..");

/** E2E fixtures 目录 */
export const e2eFixturesDir = join(e2eDir, "fixtures");

/** 通过 harness 子进程执行 E2E 命令 */
export async function runCommandE2e(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  return runNodeMain(harnessMainTs, args, {
    cwd: commandsPackageRoot,
    env: envOverrides,
  });
}
